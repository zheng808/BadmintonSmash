import { z } from 'zod';
import { Cents, EventId, IsoDateTime, PaymentStatus, SignupStatus, UserId } from './common';
import { Event } from './event';
import { PaymentHandles } from './profile';

export const Signup = z.object({
  eventId: EventId,
  userId: UserId,
  displayName: z.string(),
  status: SignupStatus,
  /** Monotonic per event; waitlist order. */
  seq: z.number().int().min(1),
  partySize: z.number().int().min(1),
  note: z.string().optional(),
  lateCancel: z.boolean().optional(),
  /** Undefined means "attended" (default). */
  attended: z.boolean().optional(),
  amountOwedCents: Cents.optional(),
  paymentStatus: PaymentStatus.optional(),
  claimedPaidAt: IsoDateTime.optional(),
  paidAt: IsoDateTime.optional(),
  joinedAt: IsoDateTime,
  updatedAt: IsoDateTime,
  /** Host view only. */
  email: z.email().optional(),
  phone: z.string().optional(),
});
export type Signup = z.infer<typeof Signup>;

/** What non-hosts see about other players. */
export const SignupPublic = Signup.pick({
  eventId: true, userId: true, displayName: true, status: true, seq: true, joinedAt: true,
});
export type SignupPublic = z.infer<typeof SignupPublic>;

export const JoinInput = z.strictObject({ note: z.string().trim().max(200).optional() });
export type JoinInput = z.infer<typeof JoinInput>;

export const UpdateMySignupInput = z.strictObject({
  note: z.string().trim().max(200).optional(),
  claimedPaid: z.literal(true).optional(),
});
export type UpdateMySignupInput = z.infer<typeof UpdateMySignupInput>;

export const HostUpdateSignupInput = z.strictObject({
  attended: z.boolean().optional(),
  paymentStatus: PaymentStatus.optional(),
  amountOwedCents: Cents.optional(),
});
export type HostUpdateSignupInput = z.infer<typeof HostUpdateSignupInput>;

export const RemoveSignupInput = z.strictObject({ reason: z.string().trim().max(200).optional() });
export type RemoveSignupInput = z.infer<typeof RemoveSignupInput>;

export const AddSignupInput = z.strictObject({ email: z.email() });
export type AddSignupInput = z.infer<typeof AddSignupInput>;

export const JoinResult = z.object({ signup: Signup, position: z.number().int().min(1).optional() });
export type JoinResult = z.infer<typeof JoinResult>;

export const EventMe = z.object({
  isHost: z.boolean(),
  signup: Signup.optional(),
  /** 1-based waitlist position when waitlisted. */
  position: z.number().int().min(1).optional(),
  canJoin: z.boolean(),
  cannotJoinReason: z.string().optional(),
});
export type EventMe = z.infer<typeof EventMe>;

/** Host card shown to signed-in viewers: how to pay the host. Never in the public view. */
export const EventHost = z.object({
  userId: UserId,
  displayName: z.string(),
  paymentHandles: PaymentHandles,
});
export type EventHost = z.infer<typeof EventHost>;

export const EventDetail = z.object({
  event: Event,
  host: EventHost,
  roster: z.array(z.union([Signup, SignupPublic])),
  me: EventMe,
});
export type EventDetail = z.infer<typeof EventDetail>;
