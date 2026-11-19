import type { HostUpdateSignupInput, JoinResult, Signup, UpdateMySignupInput } from '@badmintonsmash/shared';
import { Signup as SignupSchema } from '@badmintonsmash/shared';
import type { Deps } from '../deps';
import { conflict, notFound } from '../errors';
import { domainEvent } from '../notify/publisher';
import { cond } from '../repo/store';
import { joinEvent } from './join';
import { removeFromEvent } from './leave';
import { ensureProfile } from './me';
import { assertHost } from './permissions';

export const toSignupDto = (s: unknown): Signup => SignupSchema.parse(s);

export async function hostUpdateSignup(deps: Deps, eventId: string, hostId: string, targetUserId: string, input: HostUpdateSignupInput): Promise<Signup> {
  const event = await deps.events.get(eventId, true);
  if (!event) throw notFound('Event');
  assertHost(event, hostId);
  const signup = await deps.signups.get(eventId, targetUserId, true);
  if (!signup) throw notFound('Signup');
  const now = deps.now();
  const nowIso = now.toISOString();
  const set: Record<string, unknown> = { updatedAt: nowIso };
  if (input.attended !== undefined) {
    if (signup.status !== 'confirmed') throw conflict('Only confirmed players have attendance');
    set.attended = input.attended;
  }
  if (input.amountOwedCents !== undefined) {
    set.amountOwedCents = input.amountOwedCents;
    if (!signup.paymentStatus && input.paymentStatus === undefined) set.paymentStatus = 'unpaid';
  }
  if (input.paymentStatus !== undefined) {
    if (signup.amountOwedCents === undefined && input.amountOwedCents === undefined) throw conflict('This player has no amount owed yet');
    set.paymentStatus = input.paymentStatus;
    set.paidAt = input.paymentStatus === 'paid' ? nowIso : undefined;
  }
  const updated = await deps.signups.update(eventId, targetUserId, { set }, cond.exists('PK'));
  if (input.paymentStatus === 'paid' && signup.paymentStatus !== 'paid') {
    await deps.publisher.publish(
      domainEvent({
        type: 'payment.recorded', eventId, userIds: [targetUserId], eventVersion: event.version, dedupeSuffix: nowIso,
        payload: { amountOwedCents: updated.amountOwedCents ?? 0 }, now,
      }),
    );
  }
  return toSignupDto(updated);
}

export async function updateMySignup(deps: Deps, eventId: string, userId: string, input: UpdateMySignupInput): Promise<Signup> {
  const signup = await deps.signups.get(eventId, userId, true);
  if (!signup) throw notFound('Signup');
  const set: Record<string, unknown> = { updatedAt: deps.now().toISOString() };
  if ('note' in input) set.note = input.note;
  if (input.claimedPaid) {
    if (!(signup.amountOwedCents && signup.amountOwedCents > 0) || signup.paymentStatus !== 'unpaid') {
      throw conflict('Nothing to mark as paid');
    }
    set.claimedPaidAt = deps.now().toISOString();
  }
  return toSignupDto(await deps.signups.update(eventId, userId, { set }, cond.exists('PK')));
}

export async function hostRemoveSignup(deps: Deps, eventId: string, hostId: string, targetUserId: string, reason?: string): Promise<Signup> {
  const event = await deps.events.get(eventId, true);
  if (!event) throw notFound('Event');
  assertHost(event, hostId);
  return toSignupDto(await removeFromEvent(deps, eventId, targetUserId, reason));
}

export async function hostAddSignupByEmail(deps: Deps, eventId: string, hostId: string, email: string): Promise<JoinResult> {
  const event = await deps.events.get(eventId, true);
  if (!event) throw notFound('Event');
  assertHost(event, hostId);
  const targetId = await deps.userDirectory.findUserIdByEmail(email);
  if (!targetId) throw notFound('No account with that email');
  await ensureProfile(deps, targetId);
  const out = await joinEvent(deps, eventId, targetId, { force: true });
  return { signup: toSignupDto(out.signup), ...(out.position !== undefined ? { position: out.position } : {}) };
}
