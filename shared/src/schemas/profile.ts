import { z } from 'zod';
import { Cents, Currency, IsoDateTime, Timezone, UserId } from './common';

const handle = z.string().trim().max(120);

export const PaymentHandles = z.strictObject({
  etransfer: handle.optional(),
  /** WeChat ID for WeChat Pay transfers. */
  wechat: handle.optional(),
  alipay: handle.optional(),
  venmo: handle.optional(),
  zelle: handle.optional(),
  paypal: handle.optional(),
  other: z.string().trim().max(200).optional(),
});
export type PaymentHandles = z.infer<typeof PaymentHandles>;

export const NotificationPrefs = z.strictObject({
  /** Non-essential emails (reminders, digests). Essential ones cannot be disabled. */
  emailNonEssential: z.boolean(),
});
export type NotificationPrefs = z.infer<typeof NotificationPrefs>;

export const Locale = z.enum(['en', 'zh-CN']);
export type Locale = z.infer<typeof Locale>;

export const EventDefaults = z.strictObject({
  currency: Currency.optional(),
  shuttleUnitCostCents: Cents.optional(),
  timezone: Timezone.optional(),
});
export type EventDefaults = z.infer<typeof EventDefaults>;

export const Profile = z.object({
  userId: UserId,
  email: z.email(),
  displayName: z.string(),
  phone: z.string().optional(),
  locale: Locale.optional(),
  paymentHandles: PaymentHandles,
  notificationPrefs: NotificationPrefs,
  eventDefaults: EventDefaults,
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Profile = z.infer<typeof Profile>;

export const UpdateProfileInput = z.strictObject({
  displayName: z.string().trim().min(2).max(40),
  phone: z.string().trim().max(30).optional(),
  locale: Locale.optional(),
  paymentHandles: PaymentHandles.optional(),
  notificationPrefs: NotificationPrefs.partial().optional(),
  eventDefaults: EventDefaults.optional(),
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;
