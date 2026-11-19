import { describe, expect, it } from 'vitest';
import { computeSettlement, selectPayers } from '../src/settlement';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `u${i + 1}`);

describe('computeSettlement', () => {
  it('splits the spec worked example (AC-7): $96 court + 9 shuttles at $3.20 over 12 payers', () => {
    const r = computeSettlement({ courtCostCents: 9600, shuttleCount: 9, shuttleUnitCostCents: 320, payerIds: ids(12) });
    expect(r.totalCents).toBe(12480);
    expect(r.perPlayerCents).toBe(1040);
    expect(r.surplusCents).toBe(0);
    expect(Object.keys(r.amounts)).toHaveLength(12);
    expect(r.amounts.u1).toBe(1040);
  });

  it('rounds up and reports the surplus (AC-8): 11 payers owe $11.35 each', () => {
    const r = computeSettlement({ courtCostCents: 9600, shuttleCount: 9, shuttleUnitCostCents: 320, payerIds: ids(11) });
    expect(r.perPlayerCents).toBe(1135);
    expect(r.surplusCents).toBe(1135 * 11 - 12480);
  });

  it('applies per-user overrides and a per-player override', () => {
    const r = computeSettlement({
      courtCostCents: 10000, shuttleCount: 0, shuttleUnitCostCents: 0, otherCostCents: 0,
      payerIds: ids(4), overrides: { u1: 0 },
    });
    expect(r.perPlayerCents).toBe(2500);
    expect(r.amounts.u1).toBe(0);
    expect(r.surplusCents).toBe(-2500);
    const r2 = computeSettlement({ courtCostCents: 10000, shuttleCount: 0, shuttleUnitCostCents: 0, payerIds: ids(4), perPlayerOverrideCents: 3000 });
    expect(r2.amounts.u4).toBe(3000);
    expect(r2.surplusCents).toBe(2000);
  });

  it('handles no payers and duplicate ids', () => {
    expect(computeSettlement({ courtCostCents: 100, shuttleCount: 1, shuttleUnitCostCents: 50, payerIds: [] })).toEqual({
      totalCents: 150, payerCount: 0, perPlayerCents: 0, surplusCents: 0, amounts: {},
    });
    const r = computeSettlement({ courtCostCents: 300, shuttleCount: 0, shuttleUnitCostCents: 0, payerIds: ['a', 'a', 'b'] });
    expect(r.payerCount).toBe(2);
    expect(r.perPlayerCents).toBe(150);
  });
});

describe('selectPayers', () => {
  const roster = [
    { userId: 'a', status: 'confirmed' as const },
    { userId: 'b', status: 'confirmed' as const, attended: false },
    { userId: 'c', status: 'waitlisted' as const },
    { userId: 'd', status: 'cancelled' as const, lateCancel: true },
    { userId: 'e', status: 'cancelled' as const },
    { userId: 'f', status: 'removed' as const },
  ];
  it('attended rule excludes no-shows, waitlist, cancelled', () => {
    expect(selectPayers(roster, 'attended')).toEqual(['a']);
  });
  it('confirmed rule includes no-shows', () => {
    expect(selectPayers(roster, 'confirmed')).toEqual(['a', 'b']);
  });
  it('includes late cancels only when asked, never plain cancels', () => {
    expect(selectPayers(roster, 'attended', ['d', 'e'])).toEqual(['a', 'd']);
  });
});
