import { z } from 'zod';
import {
  Cents, Currency, EventId, EventStatus, FeeMode, IsoDateTime, MAX_CAPACITY,
  PaymentStatus, SignupStatus, Timezone, UserId, Visibility,
} from './common';
import { Settlement } from './settlement';

export const Venue = z.strictObject({
  name: z.string().trim().min(1).max(80),
  address: z.string().trim().max(200).optional(),
  mapUrl: z.url().max(500).optional(),
  /** Google Places id, lat/lng: filled by the venue picker (P0 on web). */
  placeId: z.string().trim().max(300).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type Venue = z.infer<typeof Venue>;

const feeShape = {
  mode: FeeMode,
  currency: Currency,
  /** Required when mode = fixed. */
  fixedAmountCents: Cents.optional(),
  /** Optional host estimate shown before settlement when mode = settle_after. */
  estimateCents: Cents.optional(),
};
const feeRefine = (f: { mode: FeeMode; fixedAmountCents?: number | undefined }) =>
  f.mode !== 'fixed' || f.fixedAmountCents !== undefined;
const feeRefineOpts = { message: 'fixedAmountCents is required when mode is fixed', path: ['fixedAmountCents'] };

export const Fee = z.object(feeShape).refine(feeRefine, feeRefineOpts);
export type Fee = z.infer<typeof Fee>;
export const FeeInput = z.strictObject(feeShape).refine(feeRefine, feeRefineOpts);

const eventCore = {
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().max(2000).optional(),
  venue: Venue,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  timezone: Timezone,
  capacity: z.number().int().min(1).max(MAX_CAPACITY),
  courts: z.number().int().min(1).max(50).optional(),
  signupOpensAt: IsoDateTime.optional(),
  signupClosesAt: IsoDateTime.optional(),
  /** Leaving later than this many hours before start is flagged as a late cancel. */
  cancelDeadlineHours: z.number().int().min(0).max(168).optional(),
};

type Window = { startsAt?: string | null; endsAt?: string | null; signupOpensAt?: string | null; signupClosesAt?: string | null };
const endsAfterStarts = (e: Window) => !e.startsAt || !e.endsAt || Date.parse(e.endsAt) > Date.parse(e.startsAt);
const windowOrdered = (e: Window) =>
  !e.signupOpensAt || !e.signupClosesAt || Date.parse(e.signupClosesAt) > Date.parse(e.signupOpensAt);

export const CreateEventInput = z
  .strictObject({
    ...eventCore,
    fee: FeeInput,
    visibility: Visibility.default('link'),
    hostIsPlaying: z.boolean().default(true),
    draft: z.boolean().default(false),
  })
  .refine(endsAfterStarts, { message: 'endsAt must be after startsAt', path: ['endsAt'] })
  .refine(windowOrdered, { message: 'signupClosesAt must be after signupOpensAt', path: ['signupClosesAt'] });
export type CreateEventInput = z.infer<typeof CreateEventInput>;
export type CreateEventForm = z.input<typeof CreateEventInput>;

/** PATCH body. `null` clears an optional field; `venue` and `fee` are replaced as a whole. */
export const UpdateEventInput = z
  .strictObject({
    ...eventCore,
    description: eventCore.description.nullable(),
    courts: eventCore.courts.nullable(),
    signupOpensAt: eventCore.signupOpensAt.nullable(),
    signupClosesAt: eventCore.signupClosesAt.nullable(),
    cancelDeadlineHours: eventCore.cancelDeadlineHours.nullable(),
    fee: FeeInput,
    visibility: Visibility,
  })
  .partial()
  .refine(endsAfterStarts, { message: 'endsAt must be after startsAt', path: ['endsAt'] })
  .refine(windowOrdered, { message: 'signupClosesAt must be after signupOpensAt', path: ['signupClosesAt'] });
export type UpdateEventInput = z.infer<typeof UpdateEventInput>;

export const Event = z.object({
  eventId: EventId,
  hostId: UserId,
  hostDisplayName: z.string(),
  ...eventCore,
  fee: Fee,
  visibility: Visibility,
  status: EventStatus,
  settlement: Settlement.optional(),
  confirmedCount: z.number().int().min(0),
  waitlistCount: z.number().int().min(0),
  version: z.number().int().min(1),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
});
export type Event = z.infer<typeof Event>;

/** Unauthenticated view: same fields minus settlement. Roster is never included. */
export const EventPublic = Event.omit({ settlement: true });
export type EventPublic = z.infer<typeof EventPublic>;

export const EventSummary = Event.pick({
  eventId: true, hostId: true, hostDisplayName: true, title: true, venue: true,
  startsAt: true, endsAt: true, timezone: true, capacity: true, visibility: true,
  status: true, fee: true, confirmedCount: true, waitlistCount: true,
}).extend({
  mySignupStatus: SignupStatus.optional(),
  myAmountOwedCents: Cents.optional(),
  myPaymentStatus: PaymentStatus.optional(),
});
export type EventSummary = z.infer<typeof EventSummary>;

export const CancelEventInput = z.strictObject({ reason: z.string().trim().max(300).optional() });
export type CancelEventInput = z.infer<typeof CancelEventInput>;

export const DuplicateEventInput = z
  .strictObject({ startsAt: IsoDateTime, endsAt: IsoDateTime })
  .refine(endsAfterStarts, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
export type DuplicateEventInput = z.infer<typeof DuplicateEventInput>;

export const EventScope = z.enum(['upcoming', 'hosting', 'past']);
export type EventScope = z.infer<typeof EventScope>;

const limit = z.coerce.number().int().min(1).max(50).default(20);
const cursor = z.string().max(2000).optional();

export const ListEventsQuery = z.object({ scope: EventScope.default('upcoming'), limit, cursor });
export type ListEventsQuery = z.infer<typeof ListEventsQuery>;

export const PublicEventsQuery = z.object({ q: z.string().trim().max(80).optional(), limit, cursor });
export type PublicEventsQuery = z.infer<typeof PublicEventsQuery>;
