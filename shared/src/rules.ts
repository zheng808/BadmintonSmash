import type { Event } from './schemas/event';
import type { Signup, SignupPublic } from './schemas/signup';

export type JoinCheckEvent = Pick<
  Event,
  'status' | 'startsAt' | 'signupOpensAt' | 'signupClosesAt' | 'capacity' | 'confirmedCount'
>;

export interface JoinEvaluation {
  canJoin: boolean;
  /** Stable machine-readable reason when canJoin is false. */
  reason?: 'event_not_open' | 'signup_not_open_yet' | 'signup_window_closed';
  /** True when a join would land on the waitlist. */
  wouldWaitlist: boolean;
}

export function evaluateJoin(event: JoinCheckEvent, now: Date = new Date()): JoinEvaluation {
  const wouldWaitlist = event.confirmedCount >= event.capacity;
  if (event.status !== 'open') return { canJoin: false, reason: 'event_not_open', wouldWaitlist };
  const t = now.getTime();
  if (event.signupOpensAt && t < Date.parse(event.signupOpensAt)) {
    return { canJoin: false, reason: 'signup_not_open_yet', wouldWaitlist };
  }
  const closesAt = Date.parse(event.signupClosesAt ?? event.startsAt);
  if (t >= closesAt) return { canJoin: false, reason: 'signup_window_closed', wouldWaitlist };
  return { canJoin: true, wouldWaitlist };
}

export const JOIN_REASON_TEXT: Record<NonNullable<JoinEvaluation['reason']>, string> = {
  event_not_open: 'This event is not open for sign-ups.',
  signup_not_open_yet: 'Sign-ups have not opened yet.',
  signup_window_closed: 'Sign-ups are closed.',
};

export function isLateCancel(
  event: Pick<Event, 'startsAt' | 'cancelDeadlineHours'>,
  now: Date = new Date(),
): boolean {
  if (event.cancelDeadlineHours === undefined) return false;
  const deadline = Date.parse(event.startsAt) - event.cancelDeadlineHours * 3_600_000;
  return now.getTime() > deadline;
}

type RosterEntry = Pick<Signup | SignupPublic, 'userId' | 'status' | 'seq'>;

/** Confirmed first (by seq), then waitlisted (by seq). Cancelled/removed are dropped. */
export function sortRoster<T extends RosterEntry>(roster: readonly T[]): T[] {
  const rank = { confirmed: 0, waitlisted: 1 } as const;
  return roster
    .filter((s) => s.status === 'confirmed' || s.status === 'waitlisted')
    .sort((a, b) => rank[a.status as keyof typeof rank] - rank[b.status as keyof typeof rank] || a.seq - b.seq);
}

/** 1-based waitlist position for a user, or undefined when not waitlisted. */
export function waitlistPosition(roster: readonly RosterEntry[], userId: string): number | undefined {
  const me = roster.find((s) => s.userId === userId);
  if (!me || me.status !== 'waitlisted') return undefined;
  return 1 + roster.filter((s) => s.status === 'waitlisted' && s.seq < me.seq).length;
}

export function spotsLeft(event: Pick<Event, 'capacity' | 'confirmedCount'>): number {
  return Math.max(0, event.capacity - event.confirmedCount);
}
