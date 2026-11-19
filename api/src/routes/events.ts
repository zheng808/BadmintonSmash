import { CancelEventInput, CreateEventInput, DuplicateEventInput, ListEventsQuery, UpdateEventInput } from '@badmintonsmash/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import type { Deps } from '../deps';
import {
  cancelEvent, closeEvent, completeEvent, createEvent, duplicateEvent, publishEvent, reopenEvent, updateEvent,
} from '../domain/events';
import { getEventDetail, listMyEvents } from '../domain/queries';
import { parseBody, parseQuery } from '../validate';

export function eventRoutes(deps: Deps) {
  const r = new Hono<AppEnv>();
  const detail = (eventId: string, userId: string) => getEventDetail(deps, eventId, userId);

  r.get('/', async (c) => c.json(await listMyEvents(deps, c.get('userId'), parseQuery(c, ListEventsQuery))));
  r.post('/', async (c) => {
    const userId = c.get('userId');
    const event = await createEvent(deps, userId, await parseBody(c, CreateEventInput), c.get('devEmail'));
    return c.json(await detail(event.eventId, userId), 201);
  });
  r.get('/:eventId', async (c) => c.json(await detail(c.req.param('eventId'), c.get('userId'))));
  r.patch('/:eventId', async (c) => {
    const userId = c.get('userId');
    await updateEvent(deps, c.req.param('eventId'), userId, await parseBody(c, UpdateEventInput));
    return c.json(await detail(c.req.param('eventId'), userId));
  });
  const transitions = { publish: publishEvent, close: closeEvent, reopen: reopenEvent, complete: completeEvent } as const;
  for (const [name, fn] of Object.entries(transitions)) {
    r.post(`/:eventId/${name}`, async (c) => {
      const userId = c.get('userId');
      await fn(deps, c.req.param('eventId'), userId);
      return c.json(await detail(c.req.param('eventId'), userId));
    });
  }
  r.post('/:eventId/cancel', async (c) => {
    const userId = c.get('userId');
    const { reason } = await parseBody(c, CancelEventInput);
    await cancelEvent(deps, c.req.param('eventId'), userId, reason);
    return c.json(await detail(c.req.param('eventId'), userId));
  });
  r.post('/:eventId/duplicate', async (c) => {
    const userId = c.get('userId');
    const created = await duplicateEvent(deps, c.req.param('eventId'), userId, await parseBody(c, DuplicateEventInput));
    return c.json(await detail(created.eventId, userId), 201);
  });
  return r;
}
