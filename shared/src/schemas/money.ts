import { z } from 'zod';
import { Cents, Currency, EventId, IsoDateTime, PaymentStatus, Timezone, UserId } from './common';
import { PaymentHandles } from './profile';

export const OwedItem = z.object({
  eventId: EventId,
  title: z.string(),
  startsAt: IsoDateTime,
  timezone: Timezone,
  hostId: UserId,
  hostDisplayName: z.string(),
  paymentHandles: PaymentHandles,
  currency: Currency,
  amountOwedCents: Cents,
  paymentStatus: PaymentStatus,
  claimedPaidAt: IsoDateTime.optional(),
});
export type OwedItem = z.infer<typeof OwedItem>;

export const OwedToMeItem = z.object({
  eventId: EventId,
  title: z.string(),
  startsAt: IsoDateTime,
  timezone: Timezone,
  currency: Currency,
  collectedCents: Cents,
  outstandingCents: Cents,
  waivedCents: Cents,
  paidCount: z.number().int().min(0),
  unpaidCount: z.number().int().min(0),
});
export type OwedToMeItem = z.infer<typeof OwedToMeItem>;

export const MoneySummary = z.object({
  owed: z.array(OwedItem),
  owedToMe: z.array(OwedToMeItem),
});
export type MoneySummary = z.infer<typeof MoneySummary>;
