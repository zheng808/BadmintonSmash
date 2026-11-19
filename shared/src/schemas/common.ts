import { z } from 'zod';

export const MAX_CAPACITY = 200;
export const MAX_SHUTTLES = 500;

export const Currency = z.enum(['CAD', 'USD']);
export type Currency = z.infer<typeof Currency>;

export const FeeMode = z.enum(['fixed', 'settle_after']);
export type FeeMode = z.infer<typeof FeeMode>;

export const EventStatus = z.enum(['draft', 'open', 'closed', 'completed', 'cancelled']);
export type EventStatus = z.infer<typeof EventStatus>;

export const Visibility = z.enum(['link', 'public']);
export type Visibility = z.infer<typeof Visibility>;

export const SignupStatus = z.enum(['confirmed', 'waitlisted', 'cancelled', 'removed']);
export type SignupStatus = z.infer<typeof SignupStatus>;

export const PaymentStatus = z.enum(['unpaid', 'paid', 'waived']);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

/** ISO 8601 date-time with offset or Z, e.g. 2026-11-20T02:00:00Z */
export const IsoDateTime = z.iso.datetime({ offset: true });

/** Integer cents, never negative. */
export const Cents = z.number().int().min(0).max(10_000_000);

export const UserId = z.string().min(1).max(128);
export const EventId = z.string().regex(/^[A-Za-z0-9_-]{8,21}$/, 'Invalid event id');

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const Timezone = z.string().min(1).max(64).refine(isValidTimezone, 'Invalid IANA time zone');
