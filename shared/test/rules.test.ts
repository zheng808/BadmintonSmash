import { describe, expect, it } from 'vitest';
import { evaluateJoin, isLateCancel, sortRoster, waitlistPosition } from '../src/rules';

const base = {
  status: 'open' as const,
  startsAt: '2026-12-01T03:00:00Z',
  capacity: 12,
  confirmedCount: 11,
};

describe('evaluateJoin', () => {
  it('allows joining an open event before start', () => {
    expect(evaluateJoin(base, new Date('2026-11-30T00:00:00Z'))).toEqual({ canJoin: true, wouldWaitlist: false });
  });
  it('flags waitlist when full', () => {
    expect(evaluateJoin({ ...base, confirmedCount: 12 }, new Date('2026-11-30T00:00:00Z')).wouldWaitlist).toBe(true);
  });
  it('rejects non-open statuses', () => {
    for (const status of ['draft', 'closed', 'completed', 'cancelled'] as const) {
      expect(evaluateJoin({ ...base, status }, new Date('2026-11-30T00:00:00Z')).reason).toBe('event_not_open');
    }
  });
  it('closes at start by default and honours an explicit window', () => {
    expect(evaluateJoin(base, new Date('2026-12-01T03:00:00Z')).reason).toBe('signup_window_closed');
    const windowed = { ...base, signupOpensAt: '2026-11-25T00:00:00Z', signupClosesAt: '2026-11-30T12:00:00Z' };
    expect(evaluateJoin(windowed, new Date('2026-11-24T00:00:00Z')).reason).toBe('signup_not_open_yet');
    expect(evaluateJoin(windowed, new Date('2026-11-26T00:00:00Z')).canJoin).toBe(true);
    expect(evaluateJoin(windowed, new Date('2026-11-30T12:00:00Z')).reason).toBe('signup_window_closed');
  });
});

describe('isLateCancel', () => {
  it('is false without a deadline', () => {
    expect(isLateCancel({ startsAt: base.startsAt }, new Date('2026-12-01T02:59:00Z'))).toBe(false);
  });
  it('is true inside the deadline window', () => {
    const e = { startsAt: base.startsAt, cancelDeadlineHours: 24 };
    expect(isLateCancel(e, new Date('2026-11-30T02:00:00Z'))).toBe(false);
    expect(isLateCancel(e, new Date('2026-11-30T04:00:00Z'))).toBe(true);
  });
});

describe('roster helpers', () => {
  const roster = [
    { userId: 'w2', status: 'waitlisted' as const, seq: 15 },
    { userId: 'c2', status: 'confirmed' as const, seq: 3 },
    { userId: 'x', status: 'cancelled' as const, seq: 2 },
    { userId: 'w1', status: 'waitlisted' as const, seq: 14 },
    { userId: 'c1', status: 'confirmed' as const, seq: 1 },
  ];
  it('sorts confirmed by seq then waitlist by seq and drops cancelled', () => {
    expect(sortRoster(roster).map((s) => s.userId)).toEqual(['c1', 'c2', 'w1', 'w2']);
  });
  it('computes 1-based waitlist positions', () => {
    expect(waitlistPosition(roster, 'w1')).toBe(1);
    expect(waitlistPosition(roster, 'w2')).toBe(2);
    expect(waitlistPosition(roster, 'c1')).toBeUndefined();
    expect(waitlistPosition(roster, 'nobody')).toBeUndefined();
  });
});
