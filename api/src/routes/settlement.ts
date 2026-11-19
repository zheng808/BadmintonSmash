import { SettlementInput } from '@badmintonsmash/shared';
import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import type { Deps } from '../deps';
import { finalizeSettlement, getSettlement, previewSettlement } from '../domain/settlement';
import { parseBody } from '../validate';

export function settlementRoutes(deps: Deps) {
  const r = new Hono<AppEnv>();
  r.get('/:eventId/settlement', async (c) => c.json(await getSettlement(deps, c.req.param('eventId'), c.get('userId'))));
  r.post('/:eventId/settlement/preview', async (c) =>
    c.json(await previewSettlement(deps, c.req.param('eventId'), c.get('userId'), await parseBody(c, SettlementInput))),
  );
  r.post('/:eventId/settlement/finalize', async (c) =>
    c.json(await finalizeSettlement(deps, c.req.param('eventId'), c.get('userId'), await parseBody(c, SettlementInput))),
  );
  return r;
}
