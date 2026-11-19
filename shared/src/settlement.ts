import type { PayerRule, SettlementResult } from './schemas/settlement';
import type { Signup } from './schemas/signup';

export interface ComputeSettlementInput {
  courtCostCents: number;
  shuttleCount: number;
  shuttleUnitCostCents: number;
  otherCostCents?: number;
  payerIds: readonly string[];
  perPlayerOverrideCents?: number;
  overrides?: Readonly<Record<string, number>>;
}

/**
 * Pure cost split. total = court + shuttles * unit + other; share = ceil(total / payers).
 * Per-user overrides replace the share for those users. surplusCents = sum(amounts) - total.
 */
export function computeSettlement(input: ComputeSettlementInput): SettlementResult {
  const totalCents =
    input.courtCostCents + input.shuttleCount * input.shuttleUnitCostCents + (input.otherCostCents ?? 0);
  const payerIds = Array.from(new Set(input.payerIds));
  const payerCount = payerIds.length;
  if (payerCount === 0) {
    return { totalCents, payerCount: 0, perPlayerCents: 0, surplusCents: 0, amounts: {} };
  }
  const perPlayerCents = input.perPlayerOverrideCents ?? Math.ceil(totalCents / payerCount);
  const amounts: Record<string, number> = {};
  let sum = 0;
  for (const id of payerIds) {
    const amount = input.overrides?.[id] ?? perPlayerCents;
    amounts[id] = amount;
    sum += amount;
  }
  return { totalCents, payerCount, perPlayerCents, surplusCents: sum - totalCents, amounts };
}

type RosterRow = Pick<Signup, 'userId' | 'status' | 'attended' | 'lateCancel'>;

/**
 * Who pays: confirmed players (all, or only those not marked no-show), plus late-cancelled
 * players the host explicitly includes. Waitlisted and removed players never pay.
 */
export function selectPayers(
  roster: readonly RosterRow[],
  rule: PayerRule,
  includeLateCancels: readonly string[] = [],
): string[] {
  const include = new Set(includeLateCancels);
  const ids: string[] = [];
  for (const s of roster) {
    if (s.status === 'confirmed') {
      if (rule === 'confirmed' || s.attended !== false) ids.push(s.userId);
    } else if (s.status === 'cancelled' && s.lateCancel && include.has(s.userId)) {
      ids.push(s.userId);
    }
  }
  return ids;
}
