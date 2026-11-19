import { z } from 'zod';
import { EventId, IsoDateTime, UserId } from './common';

export const DomainEventType = z.enum([
  'signup.confirmed',
  'signup.waitlisted',
  'signup.promoted',
  'signup.removed',
  'event.updated',
  'event.cancelled',
  'fee.finalized',
  'payment.recorded',
]);
export type DomainEventType = z.infer<typeof DomainEventType>;

/** Message placed on the notifications queue by the API and housekeeping. */
export const DomainEvent = z.object({
  type: DomainEventType,
  eventId: EventId,
  userIds: z.array(UserId).max(400),
  eventVersion: z.number().int().min(0),
  /** `${type}:${eventId}:${userId}:${eventVersion}` style key; notifier skips repeats. */
  dedupeKey: z.string().min(1).max(300),
  payload: z.record(z.string(), z.unknown()).optional(),
  occurredAt: IsoDateTime,
});
export type DomainEvent = z.infer<typeof DomainEvent>;
