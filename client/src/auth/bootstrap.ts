import { api } from '@/api/client';
import { pendingDisplayName } from '@/auth/dev';

/** After the first sign-in, push the display name captured at sign-up to the profile. */
export async function applyPendingDisplayName(): Promise<void> {
  const name = await pendingDisplayName.get();
  if (!name) return;
  try {
    await api.get('/me');
    await api.put('/me', { displayName: name });
    await pendingDisplayName.clear();
  } catch {
    // keep it pending; the profile screen lets the user set it later
  }
}
