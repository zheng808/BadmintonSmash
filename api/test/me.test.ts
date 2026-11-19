import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, createEvent, createTestContext, detail, fillEvent, join, user, users, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.cleanup());

describe('profile', () => {
  it('creates the profile from the identity provider email on first contact', async () => {
    ctx.directory.setEmail('u1', 'jane.doe@test.dev');
    const r = await call(ctx, 'GET', '/v1/me', { user: 'u1' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ userId: 'u1', email: 'jane.doe@test.dev', displayName: 'jane doe', paymentHandles: {}, notificationPrefs: { emailNonEssential: true } });
    const again = await call(ctx, 'GET', '/v1/me', { user: 'u1' });
    expect(again.body.createdAt).toBe(r.body.createdAt);
    expect((await call(ctx, 'GET', '/v1/me', { user: 'unknown-user' })).status).toBe(404);
    const viaHint = await call(ctx, 'GET', '/v1/me', { user: 'dev-only', email: 'dev@test.dev' });
    expect(viaHint.body.email).toBe('dev@test.dev');
  });

  it('updates profile fields including locale and new payment handles, and propagates the name', async () => {
    await user(ctx, 'u2');
    await user(ctx, 'h2');
    const ev = await createEvent(ctx, 'h2', { capacity: 4 });
    await join(ctx, ev.event.eventId, 'u2');
    const r = await call(ctx, 'PUT', '/v1/me', {
      user: 'u2',
      body: { displayName: 'Wei', phone: '+1 604 555 0100', locale: 'zh-CN', paymentHandles: { wechat: 'wei-wx', alipay: 'wei-ali' }, notificationPrefs: { emailNonEssential: false }, eventDefaults: { shuttleUnitCostCents: 320 } },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body).toMatchObject({ displayName: 'Wei', locale: 'zh-CN', paymentHandles: { wechat: 'wei-wx', alipay: 'wei-ali' }, notificationPrefs: { emailNonEssential: false }, eventDefaults: { shuttleUnitCostCents: 320 } });
    const d = await detail(ctx, ev.event.eventId, 'h2');
    expect(d.roster.find((s) => s.userId === 'u2')).toMatchObject({ displayName: 'Wei', phone: '+1 604 555 0100' });
    expect((await call(ctx, 'PUT', '/v1/me', { user: 'u2', body: { displayName: 'X' } })).status).toBe(400);
    expect((await call(ctx, 'PUT', '/v1/me', { user: 'u2', body: { displayName: 'Wei', locale: 'fr' } })).status).toBe(400);
    const hostRename = await call(ctx, 'PUT', '/v1/me', { user: 'h2', body: { displayName: 'Host Two' } });
    expect(hostRename.status).toBe(200);
    expect((await detail(ctx, ev.event.eventId, 'u2')).event.hostDisplayName).toBe('Host Two');
  });

  it('creating an event remembers currency and timezone defaults', async () => {
    await user(ctx, 'u3');
    await createEvent(ctx, 'u3', { fee: { mode: 'settle_after', currency: 'USD' }, timezone: 'America/Denver' });
    const me = await call(ctx, 'GET', '/v1/me', { user: 'u3' });
    expect(me.body.eventDefaults).toMatchObject({ currency: 'USD', timezone: 'America/Denver' });
  });
});

describe('delete account', () => {
  it('frees spots, anonymises signups, cancels hosted events and removes the identity', async () => {
    await user(ctx, 'gone');
    const { eventId } = await fillEvent(ctx, 'gone', 2, 1); // gone hosts; 1 player
    const other = (await users(ctx, 'keep', 1))[0]!;
    const hostedByOther = await createEvent(ctx, other, { capacity: 1, hostIsPlaying: false });
    expect((await join(ctx, hostedByOther.event.eventId, 'gone')).body.signup.status).toBe('confirmed');
    const [w] = await users(ctx, 'wait', 1);
    expect((await join(ctx, hostedByOther.event.eventId, w!)).body.signup.status).toBe('waitlisted');

    const r = await call(ctx, 'DELETE', '/v1/me', { user: 'gone' });
    expect(r.status).toBe(204);
    const d = await detail(ctx, hostedByOther.event.eventId, other);
    expect(d.roster.map((s) => [s.userId, s.status])).toEqual([[w, 'confirmed']]);
    const rows = (await ctx.deps.signups.listByEvent(hostedByOther.event.eventId)).find((s) => s.userId === 'gone');
    expect(rows).toMatchObject({ status: 'cancelled', displayName: 'Deleted user' });
    expect((await ctx.deps.events.get(eventId))?.status).toBe('cancelled');
    expect(await ctx.directory.getEmail('gone')).toBeUndefined();
    expect((await call(ctx, 'GET', '/v1/me', { user: 'gone' })).status).toBe(404);
  });
});
