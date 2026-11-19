import { z } from 'zod';
import { Cents, IsoDateTime, MAX_SHUTTLES, UserId } from './common';

export const PayerRule = z.enum(['attended', 'confirmed']);
export type PayerRule = z.infer<typeof PayerRule>;

const inputShape = {
  courtCostCents: Cents,
  shuttleCount: z.number().int().min(0).max(MAX_SHUTTLES),
  shuttleUnitCostCents: Cents,
  otherCostCents: Cents.default(0),
  otherLabel: z.string().trim().max(80).optional(),
  payers: PayerRule.default('attended'),
  /** Late-cancelled players the host chooses to charge anyway. */
  includeLateCancels: z.array(UserId).max(200).default([]),
  /** Replaces the computed equal share for everyone (before per-user overrides). */
  perPlayerOverrideCents: Cents.optional(),
  /** Per-user amounts that replace the share for those users. */
  overrides: z.record(UserId, Cents).default({}),
};

export const SettlementInput = z.strictObject(inputShape);
export type SettlementInput = z.infer<typeof SettlementInput>;

const resultShape = {
  totalCents: Cents,
  payerCount: z.number().int().min(0),
  perPlayerCents: Cents,
  /** Sum of amounts minus total. Positive = rounding surplus, negative = host is short. */
  surplusCents: z.number().int(),
  amounts: z.record(UserId, Cents),
};

export const SettlementResult = z.object(resultShape);
export type SettlementResult = z.infer<typeof SettlementResult>;

export const Settlement = z.object({
  ...inputShape,
  ...resultShape,
  finalizedAt: IsoDateTime,
  version: z.number().int().min(1),
});
export type Settlement = z.infer<typeof Settlement>;

export const FinalizeResult = z.object({
  settlement: Settlement,
  warnings: z.array(z.string()),
});
export type FinalizeResult = z.infer<typeof FinalizeResult>;
