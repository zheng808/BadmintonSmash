import { UpdateProfileInput } from '@badmintonsmash/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import type { Deps } from '../deps';
import { deleteAccount, ensureProfile, updateProfile } from '../domain/me';
import { getMoney } from '../domain/money';
import { parseBody } from '../validate';

export function meRoutes(deps: Deps) {
  const r = new Hono<AppEnv>();
  r.get('/', async (c) => c.json(await ensureProfile(deps, c.get('userId'), c.get('devEmail'))));
  r.put('/', async (c) => c.json(await updateProfile(deps, c.get('userId'), await parseBody(c, UpdateProfileInput), c.get('devEmail'))));
  r.delete('/', async (c) => {
    await deleteAccount(deps, c.get('userId'));
    return c.body(null, 204);
  });
  r.get('/money', async (c) => c.json(await getMoney(deps, c.get('userId'))));
  return r;
}
