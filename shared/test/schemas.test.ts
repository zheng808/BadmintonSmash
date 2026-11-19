import { describe, expect, it } from 'vitest';
import { CreateEventInput, UpdateEventInput, UpdateProfileInput, SettlementInput, Timezone } from '../src';
import { parseMoneyToCents, formatCents } from '../src/money';

const valid = {
  title: 'Thursday drop-in',
  venue: { name: 'Richmond Oval' },
  startsAt: '2026-12-04T03:00:00Z',
  endsAt: '2026-12-04T05:00:00Z',
  timezone: 'America/Vancouver',
  capacity: 12,
  fee: { mode: 'settle_after', currency: 'CAD' },
};

describe('CreateEventInput', () => {
  it('applies defaults', () => {
    const r = CreateEventInput.parse(valid);
    expect(r.visibility).toBe('link');
    expect(r.hostIsPlaying).toBe(true);
    expect(r.draft).toBe(false);
  });
  it('rejects endsAt before startsAt', () => {
    const r = CreateEventInput.safeParse({ ...valid, endsAt: '2026-12-04T02:00:00Z' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['endsAt']);
  });
  it('requires fixedAmountCents for fixed fees', () => {
    expect(CreateEventInput.safeParse({ ...valid, fee: { mode: 'fixed', currency: 'CAD' } }).success).toBe(false);
    expect(CreateEventInput.safeParse({ ...valid, fee: { mode: 'fixed', currency: 'CAD', fixedAmountCents: 1000 } }).success).toBe(true);
  });
  it('rejects unknown keys, bad capacity and bad timezone', () => {
    expect(CreateEventInput.safeParse({ ...valid, hostId: 'x' }).success).toBe(false);
    expect(CreateEventInput.safeParse({ ...valid, capacity: 0 }).success).toBe(false);
    expect(CreateEventInput.safeParse({ ...valid, capacity: 201 }).success).toBe(false);
    expect(CreateEventInput.safeParse({ ...valid, timezone: 'Mars/Olympus' }).success).toBe(false);
    expect(Timezone.safeParse('UTC').success).toBe(true);
  });
  it('allows partial updates but still checks ordering', () => {
    expect(UpdateEventInput.safeParse({ capacity: 14 }).success).toBe(true);
    expect(UpdateEventInput.safeParse({ startsAt: valid.endsAt, endsAt: valid.startsAt }).success).toBe(false);
  });
});

describe('other inputs', () => {
  it('UpdateProfileInput bounds displayName', () => {
    expect(UpdateProfileInput.safeParse({ displayName: 'A' }).success).toBe(false);
    expect(UpdateProfileInput.safeParse({ displayName: ' Alex ', paymentHandles: { etransfer: 'a@b.c' } }).success).toBe(true);
  });
  it('SettlementInput defaults', () => {
    const r = SettlementInput.parse({ courtCostCents: 9600, shuttleCount: 9, shuttleUnitCostCents: 320 });
    expect(r.otherCostCents).toBe(0);
    expect(r.payers).toBe('attended');
    expect(r.includeLateCancels).toEqual([]);
    expect(r.overrides).toEqual({});
  });
  it('money helpers', () => {
    expect(parseMoneyToCents('12.5')).toBe(1250);
    expect(parseMoneyToCents('$3')).toBe(300);
    expect(parseMoneyToCents('3.456')).toBeUndefined();
    expect(parseMoneyToCents('-1')).toBeUndefined();
    expect(formatCents(1040, 'CAD')).toMatch(/10\.40/);
  });
});

describe('UpdateEventInput null semantics', () => {
  it('accepts null to clear optional fields and rejects null on required ones', () => {
    expect(UpdateEventInput.safeParse({ description: null, courts: null, cancelDeadlineHours: null }).success).toBe(true);
    expect(UpdateEventInput.safeParse({ title: null }).success).toBe(false);
    expect(UpdateEventInput.safeParse({ startsAt: null }).success).toBe(false);
  });
});

describe('Venue place fields', () => {
  it('accepts Google Places fields and rejects out-of-range coordinates', () => {
    const venue = { name: 'Richmond Oval', address: '6111 River Rd, Richmond, BC', placeId: 'ChIJ123', lat: 49.17, lng: -123.15 };
    expect(CreateEventInput.safeParse({ ...valid, venue }).success).toBe(true);
    expect(CreateEventInput.safeParse({ ...valid, venue: { ...venue, lat: 95 } }).success).toBe(false);
  });
});
