import type { Profile, UpdateProfileInput } from '@badmintonsmash/shared';
import type { Deps } from '../deps';
import { AppError, notFound } from '../errors';
import { signupIndexKeys } from '../repo/keys';
import { ConditionFailedError } from '../repo/store';
import { cancelEvent } from './events';
import { leaveEvent } from './leave';

function defaultDisplayName(email: string): string {
  const local = email.split('@')[0] ?? 'player';
  const name = local.replace(/[._-]+/g, ' ').trim().slice(0, 40);
  return name.length >= 2 ? name : 'Player';
}

/** Returns the profile, creating it on first contact from the identity provider's verified email. */
export async function ensureProfile(deps: Deps, userId: string, emailHint?: string): Promise<Profile> {
  const existing = await deps.users.get(userId);
  if (existing) return existing;
  const email = (await deps.userDirectory.getEmail(userId)) ?? emailHint;
  if (!email) throw notFound('User');
  const nowIso = deps.now().toISOString();
  const profile: Profile = {
    userId,
    email,
    displayName: defaultDisplayName(email),
    paymentHandles: {},
    notificationPrefs: { emailNonEssential: true },
    eventDefaults: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  try {
    await deps.users.create(profile);
    return profile;
  } catch (err) {
    if (err instanceof ConditionFailedError) return (await deps.users.get(userId)) ?? profile;
    throw err;
  }
}

export async function updateProfile(deps: Deps, userId: string, input: UpdateProfileInput, emailHint?: string): Promise<Profile> {
  const prev = await ensureProfile(deps, userId, emailHint);
  const nowIso = deps.now().toISOString();
  const set: Record<string, unknown> = { displayName: input.displayName, updatedAt: nowIso };
  if ('phone' in input) set.phone = input.phone;
  if (input.paymentHandles) set.paymentHandles = input.paymentHandles;
  if (input.notificationPrefs) set.notificationPrefs = { ...prev.notificationPrefs, ...input.notificationPrefs };
  if (input.eventDefaults) set.eventDefaults = { ...prev.eventDefaults, ...input.eventDefaults };
  if (input.locale) set.locale = input.locale;
  const updated = await deps.users.update(userId, { set });

  if (updated.displayName !== prev.displayName) {
    // Keep denormalised names fresh on upcoming rosters and hosted events (bounded, best effort).
    const upcoming = await deps.signups.listByUser(userId, { scope: 'upcoming', nowIso, limit: 50 });
    for (const s of upcoming.items) {
      await deps.signups.update(s.eventId, userId, { set: { displayName: updated.displayName } });
    }
    const hosted = await deps.events.listByHost(userId, { scope: 'upcoming', nowIso, limit: 50 });
    for (const e of hosted.items) {
      await deps.store.update({ PK: `EVENT#${e.eventId}`, SK: 'META' }, { set: { hostDisplayName: updated.displayName } });
    }
  }
  return updated;
}

/** Anonymises signups, frees spots, cancels upcoming hosted events, deletes the profile and the identity. */
export async function deleteAccount(deps: Deps, userId: string): Promise<void> {
  const signups = await deps.signups.listAllByUser(userId);
  for (const s of signups) {
    if (s.status === 'confirmed' || s.status === 'waitlisted') {
      const event = await deps.events.get(s.eventId);
      if (event && ['draft', 'open', 'closed'].includes(event.status)) {
        try {
          await leaveEvent(deps, s.eventId, userId);
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
        }
      }
    }
    await deps.signups.update(s.eventId, userId, { set: { displayName: 'Deleted user', note: undefined, updatedAt: deps.now().toISOString() } });
  }
  const hosted = await deps.events.listByHost(userId, { scope: 'all', nowIso: deps.now().toISOString() });
  for (const e of hosted.items) {
    if (['draft', 'open', 'closed'].includes(e.status)) await cancelEvent(deps, e.eventId, userId, 'Host account deleted');
  }
  await deps.users.delete(userId);
  await deps.userDirectory.deleteUser(userId);
}

/** Re-point a signup's user index after a profile is deleted (kept for reference). */
export const _signupIndexKeys = signupIndexKeys;
