import { isLateCancel } from '@badmintonsmash/shared';
import type { Deps } from '../deps';
import { conflict, notFound } from '../errors';
import { domainEvent } from '../notify/publisher';
import { eventKey, signupKey } from '../repo/keys';
import type { SignupRecord } from '../repo/signups';
import { ConditionFailedError, cond } from '../repo/store';
import { promote } from './promote';

interface ReleaseOptions {
  /** 'cancelled' = player left, 'removed' = host removed them. */
  to: 'cancelled' | 'removed';
  reason?: string;
}

/** Shared by leave (player) and remove (host): frees the spot and promotes the waitlist. */
async function release(deps: Deps, eventId: string, userId: string, opts: ReleaseOptions): Promise<SignupRecord> {
  const event = await deps.events.get(eventId, true);
  if (!event) throw notFound('Event');
  if (!['draft', 'open', 'closed'].includes(event.status)) throw conflict(`Event is ${event.status}; sign-ups cannot change`);
  const signup = await deps.signups.get(eventId, userId, true);
  if (!signup || (signup.status !== 'confirmed' && signup.status !== 'waitlisted')) throw conflict('Not signed up for this event');

  const now = deps.now();
  const nowIso = now.toISOString();
  const wasConfirmed = signup.status === 'confirmed';
  const late = opts.to === 'cancelled' && wasConfirmed && isLateCancel(event, now);
  const keepsDebt = signup.paymentStatus === 'paid';
  const counter = wasConfirmed ? 'confirmedCount' : 'waitlistCount';
  try {
    await deps.store.transact([
      {
        op: 'update',
        key: signupKey(eventId, userId),
        update: {
          set: {
            status: opts.to,
            updatedAt: nowIso,
            lateCancel: late ? true : undefined,
            removeReason: opts.reason,
            ...(keepsDebt ? {} : { amountOwedCents: undefined, paymentStatus: undefined, claimedPaidAt: undefined }),
          },
        },
        condition: cond.eq('status', signup.status),
      },
      {
        op: 'update',
        key: eventKey(eventId),
        update: { add: { [counter]: -1, version: 1 }, set: { updatedAt: nowIso } },
        condition: cond.gt(counter, 0),
      },
    ]);
  } catch (err) {
    if (err instanceof ConditionFailedError) throw conflict('The event changed, please try again');
    throw err;
  }
  if (wasConfirmed) await promote(deps, eventId);
  const updated = (await deps.signups.get(eventId, userId, true)) ?? { ...signup, status: opts.to, updatedAt: nowIso };
  if (opts.to === 'removed') {
    await deps.publisher.publish(
      domainEvent({
        type: 'signup.removed', eventId, userIds: [userId], eventVersion: event.version + 1, dedupeSuffix: signup.seq,
        ...(opts.reason ? { payload: { reason: opts.reason } } : {}), now,
      }),
    );
  }
  return updated;
}

export async function leaveEvent(deps: Deps, eventId: string, userId: string): Promise<SignupRecord> {
  return release(deps, eventId, userId, { to: 'cancelled' });
}

export async function removeFromEvent(deps: Deps, eventId: string, userId: string, reason?: string): Promise<SignupRecord> {
  return release(deps, eventId, userId, { to: 'removed', ...(reason ? { reason } : {}) });
}
