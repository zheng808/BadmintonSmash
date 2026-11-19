import { AddSignupInput, HostUpdateSignupInput, JoinInput, RemoveSignupInput, UpdateMySignupInput } from '@badmintonsmash/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import type { Deps } from '../deps';
import { joinEvent } from '../domain/join';
import { leaveEvent } from '../domain/leave';
import { hostAddSignupByEmail, hostRemoveSignup, hostUpdateSignup, toSignupDto, updateMySignup } from '../domain/signups';
import { parseBody } from '../validate';

export function signupRoutes(deps: Deps) {
  const r = new Hono<AppEnv>();
  r.post('/:eventId/signups', async (c) => {
    const { note } = await parseBody(c, JoinInput);
    const out = await joinEvent(deps, c.req.param('eventId'), c.get('userId'), note ? { note } : {});
    return c.json({ signup: toSignupDto(out.signup), ...(out.position !== undefined ? { position: out.position } : {}) }, 201);
  });
  r.post('/:eventId/signups/add', async (c) => {
    const { email } = await parseBody(c, AddSignupInput);
    return c.json(await hostAddSignupByEmail(deps, c.req.param('eventId'), c.get('userId'), email), 201);
  });
  r.delete('/:eventId/signups/me', async (c) =>
    c.json({ signup: toSignupDto(await leaveEvent(deps, c.req.param('eventId'), c.get('userId'))) }),
  );
  r.patch('/:eventId/signups/me', async (c) =>
    c.json({ signup: await updateMySignup(deps, c.req.param('eventId'), c.get('userId'), await parseBody(c, UpdateMySignupInput)) }),
  );
  r.patch('/:eventId/signups/:userId', async (c) =>
    c.json({
      signup: await hostUpdateSignup(deps, c.req.param('eventId'), c.get('userId'), c.req.param('userId'), await parseBody(c, HostUpdateSignupInput)),
    }),
  );
  r.delete('/:eventId/signups/:userId', async (c) => {
    const { reason } = await parseBody(c, RemoveSignupInput);
    return c.json({ signup: await hostRemoveSignup(deps, c.req.param('eventId'), c.get('userId'), c.req.param('userId'), reason) });
  });
  return r;
}
