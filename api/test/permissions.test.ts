import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createEvent, createTestContext, join, user, type TestCtx } from './helpers';

let ctx: TestCtx;
let eventId: string;
beforeAll(async () => {
  ctx = await createTestContext();
  await user(ctx, 'host');
  await user(ctx, 'player');
  await user(ctx, 'other');
  eventId = (await createEvent(ctx, 'host', { capacity: 5 })).event.eventId;
  await join(ctx, eventId, 'player');
});
afterAll(() => ctx.cleanup());

const hostOnly: Array<[string, string, unknown?]> = [
  ['PATCH', '', { title: 'Hijacked title' }],
  ['POST', '/publish'],
  ['POST', '/close'],
  ['POST', '/reopen'],
  ['POST', '/complete'],
  ['POST', '/cancel', {}],
  ['POST', '/duplicate', { startsAt: '2027-01-01T03:00:00Z', endsAt: '2027-01-01T05:00:00Z' }],
  ['POST', '/signups/add', { email: 'other@test.dev' }],
  ['PATCH', '/signups/player', { attended: false }],
  ['DELETE', '/signups/player', {}],
  ['GET', '/settlement'],
  ['POST', '/settlement/preview', { courtCostCents: 1, shuttleCount: 0, shuttleUnitCostCents: 0 }],
  ['POST', '/settlement/finalize', { courtCostCents: 1, shuttleCount: 0, shuttleUnitCostCents: 0 }],
];

describe('AC-10 host-only actions', () => {
  for (const [method, suffix, body] of hostOnly) {
    it(`${method} /events/{id}${suffix} -> 403 for a participant and for a stranger`, async () => {
      for (const who of ['player', 'other']) {
        const r = await call(ctx, method, `/v1/events/${eventId}${suffix}`, { user: who, ...(body !== undefined ? { body } : {}) });
        expect(r.status, `${who} ${method} ${suffix}: ${JSON.stringify(r.body)}`).toBe(403);
        expect(r.body.error.code).toBe('forbidden');
      }
    });
  }

  it('leaves the event untouched afterwards', async () => {
    const r = await call(ctx, 'GET', `/v1/events/${eventId}`, { user: 'host' });
    expect(r.body.event.title).toBe('Thursday drop-in');
    expect(r.body.event.status).toBe('open');
    expect(r.body.event.confirmedCount).toBe(2);
  });
});

describe('authentication', () => {
  it('rejects protected routes without identity and allows public ones', async () => {
    for (const [method, path] of [['GET', '/v1/me'], ['GET', '/v1/events'], ['POST', `/v1/events/${eventId}/signups`], ['GET', '/v1/me/money']] as const) {
      const r = await call(ctx, method, path, method === 'GET' ? {} : { body: {} });
      expect(r.status, path).toBe(401);
      expect(r.body.error.code).toBe('unauthorized');
    }
    expect((await call(ctx, 'GET', '/v1/health')).status).toBe(200);
    expect((await call(ctx, 'GET', '/v1/public/events')).status).toBe(200);
  });

  it('reads the Cognito subject from the API Gateway authorizer context', async () => {
    const res = await ctx.app.request(
      '/v1/me',
      { method: 'GET' },
      { event: { requestContext: { authorizer: { jwt: { claims: { sub: 'player' } } } } }, context: { awsRequestId: 'req-123' } },
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { userId: string }).userId).toBe('player');
    expect(res.headers.get('x-request-id')).toBe('req-123');
  });

  it('ignores x-dev-user when DEV_AUTH is off', async () => {
    const strict = await createTestContext();
    try {
      strict.deps.config.devAuth = false;
      const r = await call(strict, 'GET', '/v1/me', { user: 'player' });
      expect(r.status).toBe(401);
    } finally {
      await strict.cleanup();
    }
  });
});
