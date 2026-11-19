import {
  Event, EventPublic, EventSummary, JOIN_REASON_TEXT, Signup, SignupPublic, evaluateJoin, sortRoster, waitlistPosition,
  type EventDetail, type EventHost, type ListEventsQuery, type Paginated, type PublicEventsQuery,
} from '@badmintonsmash/shared';
import type { Deps } from '../deps';
import { notFound } from '../errors';
import { decodeCursor, encodeCursor } from '../repo/cursor';
import type { EventRecord } from '../repo/events';
import type { SignupRecord } from '../repo/signups';
import { isHost } from './permissions';

export async function getEventDetail(deps: Deps, eventId: string, userId: string): Promise<EventDetail> {
  const event = await deps.events.get(eventId);
  if (!event || (event.status === 'draft' && !isHost(event, userId))) throw notFound('Event');
  const host = isHost(event, userId);
  const roster = await deps.signups.listByEvent(eventId, host);
  const active = sortRoster(roster);
  const mine = roster.find((s) => s.userId === userId);
  const activeMine = mine && (mine.status === 'confirmed' || mine.status === 'waitlisted') ? mine : undefined;
  const ev = evaluateJoin(event, deps.now());
  const canJoin = ev.canJoin && !activeMine;
  const cannotJoinReason = activeMine ? 'You are already signed up.' : ev.reason ? JOIN_REASON_TEXT[ev.reason] : undefined;

  // Host card (name + how to pay). One batch read covers the roster and the host.
  const profiles = await deps.users.batchGet(host ? [...active.map((s) => s.userId), event.hostId] : [event.hostId]);
  const hostProfile = profiles.get(event.hostId);
  const hostCard: EventHost = {
    userId: event.hostId,
    displayName: hostProfile?.displayName ?? event.hostDisplayName,
    paymentHandles: hostProfile?.paymentHandles ?? {},
  };

  let rosterOut: EventDetail['roster'];
  if (host) {
    rosterOut = active.map((s) => {
      const p = profiles.get(s.userId);
      return Signup.parse({ ...s, ...(p?.email ? { email: p.email } : {}), ...(p?.phone ? { phone: p.phone } : {}) });
    });
  } else {
    rosterOut = active.map((s) => SignupPublic.parse(s));
  }
  const position = activeMine ? waitlistPosition(roster, userId) : undefined;
  return {
    event: Event.parse(event),
    host: hostCard,
    roster: rosterOut,
    me: {
      isHost: host,
      ...(activeMine ? { signup: Signup.parse(activeMine) } : {}),
      ...(position !== undefined ? { position } : {}),
      canJoin,
      ...(cannotJoinReason ? { cannotJoinReason } : {}),
    },
  };
}

function summary(event: EventRecord, mine?: SignupRecord) {
  return EventSummary.parse({
    ...event,
    ...(mine ? { mySignupStatus: mine.status } : {}),
    ...(mine?.amountOwedCents !== undefined ? { myAmountOwedCents: mine.amountOwedCents } : {}),
    ...(mine?.paymentStatus ? { myPaymentStatus: mine.paymentStatus } : {}),
  });
}

export async function listMyEvents(deps: Deps, userId: string, q: ListEventsQuery): Promise<Paginated<EventSummary>> {
  const nowIso = deps.now().toISOString();
  const cursor = decodeCursor(q.cursor);
  if (q.scope === 'hosting') {
    const page = await deps.events.listByHost(userId, { scope: 'all', nowIso, limit: q.limit, cursor });
    const mine = new Map<string, SignupRecord>();
    for (const e of page.items) {
      const s = await deps.signups.get(e.eventId, userId);
      if (s) mine.set(e.eventId, s);
    }
    return { items: page.items.map((e) => summary(e, mine.get(e.eventId))), ...(page.cursor ? { nextCursor: encodeCursor(page.cursor) } : {}) };
  }
  const page = await deps.signups.listByUser(userId, { scope: q.scope, nowIso, limit: q.limit, cursor });
  const relevant = page.items.filter(
    (s) => s.status === 'confirmed' || s.status === 'waitlisted' || (s.amountOwedCents ?? 0) > 0,
  );
  const events = await deps.events.batchGet(relevant.map((s) => s.eventId));
  const items: EventSummary[] = [];
  for (const s of relevant) {
    const e = events.get(s.eventId);
    if (e && e.status !== 'draft') items.push(summary(e, s));
  }
  return { items, ...(page.cursor ? { nextCursor: encodeCursor(page.cursor) } : {}) };
}

export async function listPublicEvents(deps: Deps, q: PublicEventsQuery): Promise<Paginated<EventSummary>> {
  const nowIso = deps.now().toISOString();
  const page = await deps.events.listPublicOpen(nowIso, q.limit, decodeCursor(q.cursor));
  const needle = q.q?.toLowerCase();
  const items = page.items
    .filter((e) => !needle || e.title.toLowerCase().includes(needle) || e.venue.name.toLowerCase().includes(needle))
    .map((e) => summary(e));
  return { items, ...(page.cursor ? { nextCursor: encodeCursor(page.cursor) } : {}) };
}

export async function getPublicEvent(deps: Deps, eventId: string): Promise<EventPublic> {
  const event = await deps.events.get(eventId);
  if (!event || event.status === 'draft') throw notFound('Event');
  return EventPublic.parse(event);
}
