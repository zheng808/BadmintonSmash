import type { CreateEventInput, DuplicateEventInput, EventStatus, UpdateEventInput } from '@badmintonsmash/shared';
import { nanoid } from 'nanoid';
import type { Deps } from '../deps';
import { AppError, conflict, notFound } from '../errors';
import { domainEvent } from '../notify/publisher';
import type { EventRecord } from '../repo/events';
import { signupIndexKeys } from '../repo/keys';
import { ConditionFailedError, cond } from '../repo/store';
import { joinEvent } from './join';
import { ensureProfile } from './me';
import { assertHost, assertMutable, normalizeIso } from './permissions';
import { promote } from './promote';

export const newEventId = (): string => nanoid(12);

async function loadHosted(deps: Deps, eventId: string, userId: string): Promise<EventRecord> {
  const event = await deps.events.get(eventId, true);
  if (!event) throw notFound('Event');
  assertHost(event, userId);
  return event;
}

async function transition(deps: Deps, event: EventRecord, from: EventStatus[], to: EventStatus, extra: Partial<EventRecord> = {}): Promise<EventRecord> {
  if (!from.includes(event.status)) throw conflict(`Cannot move an event from ${event.status} to ${to}`);
  try {
    return await deps.events.patch(event, { status: to, ...extra }, deps.now().toISOString(), cond.and(cond.eq('version', event.version), cond.in('status', from)));
  } catch (err) {
    if (err instanceof ConditionFailedError) throw conflict('The event changed, please try again');
    throw err;
  }
}

function activeUserIds(roster: { userId: string; status: string }[], exceptUserId?: string): string[] {
  return roster.filter((s) => (s.status === 'confirmed' || s.status === 'waitlisted') && s.userId !== exceptUserId).map((s) => s.userId);
}

export async function createEvent(deps: Deps, hostId: string, input: CreateEventInput, emailHint?: string): Promise<EventRecord> {
  const profile = await ensureProfile(deps, hostId, emailHint);
  const now = deps.now();
  const startsAt = normalizeIso(input.startsAt);
  if (Date.parse(startsAt) <= now.getTime()) throw new AppError('validation_error', 'startsAt must be in the future', [{ path: ['startsAt'] }]);
  const nowIso = now.toISOString();
  const eventId = newEventId();
  const record: EventRecord = {
    eventId,
    hostId,
    hostDisplayName: profile.displayName,
    title: input.title,
    ...(input.description ? { description: input.description } : {}),
    venue: input.venue,
    startsAt,
    endsAt: normalizeIso(input.endsAt),
    timezone: input.timezone,
    capacity: input.capacity,
    ...(input.courts !== undefined ? { courts: input.courts } : {}),
    ...(input.signupOpensAt ? { signupOpensAt: normalizeIso(input.signupOpensAt) } : {}),
    ...(input.signupClosesAt ? { signupClosesAt: normalizeIso(input.signupClosesAt) } : {}),
    ...(input.cancelDeadlineHours !== undefined ? { cancelDeadlineHours: input.cancelDeadlineHours } : {}),
    fee: input.fee,
    visibility: input.visibility,
    status: input.draft ? 'draft' : 'open',
    confirmedCount: 0,
    waitlistCount: 0,
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    hostIsPlaying: input.hostIsPlaying,
  };
  await deps.events.create(record);
  if (input.hostIsPlaying && !input.draft) await joinEvent(deps, eventId, hostId, { force: true, silent: true });
  await deps.users.update(hostId, {
    set: { eventDefaults: { ...profile.eventDefaults, currency: input.fee.currency, timezone: input.timezone } },
  });
  return (await deps.events.get(eventId, true)) ?? record;
}

export async function updateEvent(deps: Deps, eventId: string, userId: string, input: UpdateEventInput): Promise<EventRecord> {
  const event = await loadHosted(deps, eventId, userId);
  assertMutable(event);
  // `null` means "clear the field": stored as an attribute removal, never as a literal null.
  const changes: Partial<EventRecord> = {};
  for (const [key, value] of Object.entries(input)) {
    (changes as Record<string, unknown>)[key] = value === null ? undefined : value;
  }
  if (input.startsAt) changes.startsAt = normalizeIso(input.startsAt);
  if (input.endsAt) changes.endsAt = normalizeIso(input.endsAt);
  if (input.signupOpensAt) changes.signupOpensAt = normalizeIso(input.signupOpensAt);
  if (input.signupClosesAt) changes.signupClosesAt = normalizeIso(input.signupClosesAt);
  const merged = { ...event, ...changes };
  if (Date.parse(merged.endsAt) <= Date.parse(merged.startsAt)) {
    throw new AppError('validation_error', 'endsAt must be after startsAt', [{ path: ['endsAt'] }]);
  }
  if (changes.capacity !== undefined && changes.capacity < event.confirmedCount) {
    throw conflict(`Capacity cannot be below the ${event.confirmedCount} confirmed players`);
  }
  if (Object.keys(changes).length === 0) return event;

  let updated: EventRecord;
  try {
    updated = await deps.events.patch(event, changes, deps.now().toISOString());
  } catch (err) {
    if (err instanceof ConditionFailedError) throw conflict('The event changed, please try again');
    throw err;
  }

  const roster = await deps.signups.listByEvent(eventId, true);
  const nowIso = deps.now().toISOString();
  if (updated.startsAt !== event.startsAt) {
    for (const s of roster) {
      await deps.signups.update(eventId, s.userId, { set: { startsAt: updated.startsAt, ...signupIndexKeys({ ...s, startsAt: updated.startsAt }) } });
    }
  }
  const feeChanged = updated.fee.mode !== event.fee.mode || updated.fee.fixedAmountCents !== event.fee.fixedAmountCents;
  if (feeChanged && !updated.settlement) {
    for (const s of roster) {
      if (s.status !== 'confirmed' || s.paymentStatus === 'paid' || s.paymentStatus === 'waived') continue;
      const set =
        updated.fee.mode === 'fixed'
          ? { amountOwedCents: updated.fee.fixedAmountCents ?? 0, paymentStatus: 'unpaid', updatedAt: nowIso }
          : { amountOwedCents: undefined, paymentStatus: undefined, claimedPaidAt: undefined, updatedAt: nowIso };
      await deps.signups.update(eventId, s.userId, { set });
    }
  }
  if (updated.capacity > event.capacity) await promote(deps, eventId);
  const scheduleChanged =
    updated.startsAt !== event.startsAt || updated.endsAt !== event.endsAt || JSON.stringify(updated.venue) !== JSON.stringify(event.venue);
  if (scheduleChanged) {
    const userIds = activeUserIds(roster, userId);
    if (userIds.length) {
      await deps.publisher.publish(
        domainEvent({ type: 'event.updated', eventId, userIds, eventVersion: updated.version, dedupeSuffix: updated.version, now: deps.now() }),
      );
    }
  }
  return (await deps.events.get(eventId, true)) ?? updated;
}

export async function publishEvent(deps: Deps, eventId: string, userId: string): Promise<EventRecord> {
  const event = await loadHosted(deps, eventId, userId);
  const updated = await transition(deps, event, ['draft'], 'open');
  if (event.hostIsPlaying) {
    const mine = await deps.signups.get(eventId, userId, true);
    if (!mine || (mine.status !== 'confirmed' && mine.status !== 'waitlisted')) {
      await joinEvent(deps, eventId, userId, { force: true, silent: true });
    }
  }
  return (await deps.events.get(eventId, true)) ?? updated;
}

export async function closeEvent(deps: Deps, eventId: string, userId: string): Promise<EventRecord> {
  return transition(deps, await loadHosted(deps, eventId, userId), ['open'], 'closed');
}

export async function reopenEvent(deps: Deps, eventId: string, userId: string): Promise<EventRecord> {
  const event = await loadHosted(deps, eventId, userId);
  if (Date.parse(event.startsAt) <= deps.now().getTime()) throw conflict('Cannot reopen sign-ups after the event has started');
  return transition(deps, event, ['closed'], 'open');
}

export async function completeEvent(deps: Deps, eventId: string, userId: string): Promise<EventRecord> {
  return transition(deps, await loadHosted(deps, eventId, userId), ['open', 'closed'], 'completed');
}

export async function cancelEvent(deps: Deps, eventId: string, userId: string, reason?: string): Promise<EventRecord> {
  const event = await loadHosted(deps, eventId, userId);
  const updated = await transition(deps, event, ['draft', 'open', 'closed'], 'cancelled', reason ? { cancelReason: reason } : {});
  const roster = await deps.signups.listByEvent(eventId, true);
  const userIds = activeUserIds(roster, userId);
  if (userIds.length) {
    await deps.publisher.publish(
      domainEvent({
        type: 'event.cancelled', eventId, userIds, eventVersion: updated.version, dedupeSuffix: updated.version,
        ...(reason ? { payload: { reason } } : {}), now: deps.now(),
      }),
    );
  }
  return updated;
}

export async function duplicateEvent(deps: Deps, eventId: string, userId: string, input: DuplicateEventInput): Promise<EventRecord> {
  const source = await loadHosted(deps, eventId, userId);
  const now = deps.now();
  const startsAt = normalizeIso(input.startsAt);
  if (Date.parse(startsAt) <= now.getTime()) throw new AppError('validation_error', 'startsAt must be in the future', [{ path: ['startsAt'] }]);
  const nowIso = now.toISOString();
  const newId = newEventId();
  const { settlement: _settlement, cancelReason: _cancelReason, signupOpensAt: _o, signupClosesAt: _c, ...rest } = source;
  const record: EventRecord = {
    ...rest,
    eventId: newId,
    startsAt,
    endsAt: normalizeIso(input.endsAt),
    status: 'open',
    confirmedCount: 0,
    waitlistCount: 0,
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  await deps.events.create(record);
  if (source.hostIsPlaying) await joinEvent(deps, newId, userId, { force: true, silent: true });
  return (await deps.events.get(newId, true)) ?? record;
}
