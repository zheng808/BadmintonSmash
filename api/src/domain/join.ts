import { JOIN_REASON_TEXT, evaluateJoin, waitlistPosition } from '@badmintonsmash/shared';
import type { Deps } from '../deps';
import { AppError, conflict, notFound } from '../errors';
import { domainEvent } from '../notify/publisher';
import type { EventRecord } from '../repo/events';
import { eventKey, signupIndexKeys, signupKey } from '../repo/keys';
import type { SignupRecord } from '../repo/signups';
import { ConditionFailedError, cond, type WriteOp } from '../repo/store';
import { ensureProfile } from './me';

export interface JoinOptions {
  note?: string;
  /** Host-initiated: ignores the signup window and allows closed events. */
  force?: boolean;
  /** Skip the confirmation email (host joining their own event). */
  silent?: boolean;
}

export interface JoinOutcome {
  signup: SignupRecord;
  position?: number;
  event: EventRecord;
}

const MAX_ATTEMPTS = 6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function computePosition(deps: Deps, eventId: string, userId: string): Promise<number | undefined> {
  const roster = await deps.signups.listByEvent(eventId, true);
  return waitlistPosition(roster, userId);
}

/**
 * Join an event. Confirmed when a spot is free, otherwise waitlisted. Capacity is enforced by a
 * conditional transaction on the event counters (design §5.3); on contention we re-read and retry.
 */
export async function joinEvent(deps: Deps, eventId: string, userId: string, opts: JoinOptions = {}): Promise<JoinOutcome> {
  const profile = await ensureProfile(deps, userId);
  let lastEvent: EventRecord | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const event = await deps.events.get(eventId, true);
    if (!event || (event.status === 'draft' && event.hostId !== userId)) throw notFound('Event');
    lastEvent = event;
    const now = deps.now();
    const existing = await deps.signups.get(eventId, userId, true);
    if (existing && (existing.status === 'confirmed' || existing.status === 'waitlisted')) {
      throw conflict('You are already signed up for this event');
    }
    if (opts.force) {
      if (!['open', 'closed', 'draft'].includes(event.status)) throw new AppError('event_not_open', JOIN_REASON_TEXT.event_not_open);
    } else {
      const ev = evaluateJoin(event, now);
      if (!ev.canJoin) {
        const reason = ev.reason ?? 'event_not_open';
        throw new AppError(reason === 'event_not_open' ? 'event_not_open' : 'signup_window_closed', JOIN_REASON_TEXT[reason]);
      }
    }

    const target = event.confirmedCount < event.capacity ? 'confirmed' : 'waitlisted';
    const nowIso = now.toISOString();
    // Reserve a monotonic per-event sequence number (waitlist order). Gaps from failed attempts are fine.
    const reserved = await deps.store.update<{ PK: string; SK: string; signupSeq: number }>(eventKey(eventId), { add: { signupSeq: 1 } }, cond.exists('PK'));
    const seq = reserved.signupSeq;
    const fixed = target === 'confirmed' && event.fee.mode === 'fixed';
    const signup: SignupRecord = {
      eventId,
      userId,
      displayName: profile.displayName,
      status: target,
      seq,
      partySize: 1,
      ...(opts.note ? { note: opts.note } : {}),
      ...(fixed ? { amountOwedCents: event.fee.fixedAmountCents ?? 0, paymentStatus: 'unpaid' as const } : {}),
      joinedAt: nowIso,
      updatedAt: nowIso,
      startsAt: event.startsAt,
    };

    const statusCond = opts.force ? cond.in('status', ['open', 'closed', 'draft']) : cond.eq('status', 'open');
    const counter = target === 'confirmed' ? 'confirmedCount' : 'waitlistCount';
    const capacityCond = target === 'confirmed' ? cond.ltAttr('confirmedCount', 'capacity') : cond.gteAttr('confirmedCount', 'capacity');
    const eventOp: WriteOp = {
      op: 'update',
      key: eventKey(eventId),
      update: { add: { [counter]: 1, version: 1 }, set: { updatedAt: nowIso } },
      condition: cond.and(statusCond, capacityCond),
    };
    const signupOp: WriteOp = existing
      ? {
          op: 'update',
          key: signupKey(eventId, userId),
          update: {
            set: {
              ...signupIndexKeys(signup),
              status: signup.status,
              seq: signup.seq,
              displayName: signup.displayName,
              note: signup.note,
              joinedAt: nowIso,
              updatedAt: nowIso,
              startsAt: signup.startsAt,
              amountOwedCents: signup.amountOwedCents,
              paymentStatus: signup.paymentStatus,
              lateCancel: undefined,
              attended: undefined,
              claimedPaidAt: undefined,
              paidAt: undefined,
            },
          },
          condition: cond.in('status', ['cancelled', 'removed']),
        }
      : { op: 'put', item: deps.signups.toItem(signup), condition: cond.notExists('PK') };

    try {
      await deps.store.transact([eventOp, signupOp]);
    } catch (err) {
      if (err instanceof ConditionFailedError) {
        await sleep(5 + Math.random() * 25);
        continue;
      }
      throw err;
    }

    if (!opts.silent) {
      await deps.publisher.publish(
        domainEvent({
          type: target === 'confirmed' ? 'signup.confirmed' : 'signup.waitlisted',
          eventId,
          userIds: [userId],
          eventVersion: event.version + 1,
          dedupeSuffix: seq,
          now,
        }),
      );
    }
    const position = target === 'waitlisted' ? await computePosition(deps, eventId, userId) : undefined;
    const updatedEvent: EventRecord = {
      ...event,
      version: event.version + 1,
      [counter]: event[counter] + 1,
    };
    return { signup, ...(position !== undefined ? { position } : {}), event: updatedEvent };
  }
  deps.logger.warn('join contention exhausted', { eventId, userId, version: lastEvent?.version });
  throw conflict('The event is busy right now, please try again');
}
