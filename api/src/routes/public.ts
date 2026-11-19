import { PublicEventsQuery } from '@badmintonsmash/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import type { Deps } from '../deps';
import { getPublicEvent, listPublicEvents } from '../domain/queries';
import { parseQuery } from '../validate';

export function publicRoutes(deps: Deps) {
  const r = new Hono<AppEnv>();
  r.get('/events', async (c) => c.json(await listPublicEvents(deps, parseQuery(c, PublicEventsQuery))));
  r.get('/events/:eventId', async (c) => c.json(await getPublicEvent(deps, c.req.param('eventId'))));
  return r;
}
