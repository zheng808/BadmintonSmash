import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY, HOUR, call, createEvent, createTestContext, detail, eventInput, join, user, users, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
  await user(ctx, 'host', 'alex@test.dev');
  await user(ctx, 'stranger');
});
afterAll(() => ctx.cleanup());

describe('create', () => {
  it('creates an open event with the host confirmed by default', async () => {
    const d = await createEvent(ctx, 'host');
    expect(d.event.status).toBe('open');
    expect(d.event.confirmedCount).toBe(1);
    expect(d.event.hostDisplayName).toBe('alex');
    expect(d.me.isHost).toBe(true);
    expect(d.me.signup?.status).toBe('confirmed');
    expect(d.me.canJoin).toBe(false);
    expect(d.roster).toHaveLength(1);
    expect((d.roster[0] as { email?: string }).email).toBe('alex@test.dev');
    expect(d.event.eventId).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(ctx.publisher.ofType('signup.confirmed')).toHaveLength(0);
    expect(d.host).toEqual({ userId: 'host', displayName: 'alex', paymentHandles: {} });
  });

  it('includes the host card with payment handles for any signed-in viewer, never publicly', async () => {
    await user(ctx, 'payhost', 'pay@test.dev');
    await call(ctx, 'PUT', '/v1/me', { user: 'payhost', body: { displayName: 'Pay Host', paymentHandles: { etransfer: 'pay@test.dev', wechat: 'pay-wx' } } });
    const d = await createEvent(ctx, 'payhost');
    expect(d.host).toEqual({ userId: 'payhost', displayName: 'Pay Host', paymentHandles: { etransfer: 'pay@test.dev', wechat: 'pay-wx' } });
    const asStranger = await detail(ctx, d.event.eventId, 'stranger');
    expect(asStranger.host.paymentHandles.wechat).toBe('pay-wx');
    for (const action of ['close', 'reopen']) {
      const r = await call(ctx, 'POST', `/v1/events/${d.event.eventId}/${action}`, { user: 'payhost' });
      expect(r.body.host.displayName).toBe('Pay Host');
    }
    const patched = await call(ctx, 'PATCH', `/v1/events/${d.event.eventId}`, { user: 'payhost', body: { title: 'Renamed event' } });
    expect(patched.body.host.userId).toBe('payhost');
    const pub = await call(ctx, 'GET', `/v1/public/events/${d.event.eventId}`);
    expect(pub.body.host).toBeUndefined();
    expect(JSON.stringify(pub.body)).not.toContain('pay-wx');
  });

  it('respects hostIsPlaying=false and draft', async () => {
    const d = await createEvent(ctx, 'host', { hostIsPlaying: false });
    expect(d.event.confirmedCount).toBe(0);
    expect(d.me.signup).toBeUndefined();
    expect(d.me.canJoin).toBe(true);

    const draft = await createEvent(ctx, 'host', { draft: true });
    expect(draft.event.status).toBe('draft');
    expect(draft.event.confirmedCount).toBe(0);
    expect((await call(ctx, 'GET', `/v1/events/${draft.event.eventId}`, { user: 'stranger' })).status).toBe(404);
    expect((await call(ctx, 'GET', `/v1/public/events/${draft.event.eventId}`)).status).toBe(404);
    const published = await call(ctx, 'POST', `/v1/events/${draft.event.eventId}/publish`, { user: 'host' });
    expect(published.status).toBe(200);
    expect(published.body.event.status).toBe('open');
    expect(published.body.event.confirmedCount).toBe(1);
  });

  it('validates input', async () => {
    const past = await call(ctx, 'POST', '/v1/events', { user: 'host', body: eventInput(ctx, { startsAt: '2020-01-01T00:00:00Z', endsAt: '2020-01-01T02:00:00Z' }) });
    expect(past.status).toBe(400);
    expect(past.body.error.code).toBe('validation_error');
    const input = eventInput(ctx);
    const inverted = await call(ctx, 'POST', '/v1/events', { user: 'host', body: { ...input, endsAt: input.startsAt, startsAt: input.endsAt } });
    expect(inverted.status).toBe(400);
    const unknown = await call(ctx, 'POST', '/v1/events', { user: 'host', body: { ...input, hostId: 'evil' } });
    expect(unknown.status).toBe(400);
    const badJson = await ctx.app.request('/v1/events', { method: 'POST', headers: { 'x-dev-user': 'host', 'content-type': 'application/json' }, body: '{nope' });
    expect(badJson.status).toBe(400);
    const fixedNoAmount = await call(ctx, 'POST', '/v1/events', { user: 'host', body: eventInput(ctx, { fee: { mode: 'fixed', currency: 'CAD' } }) });
    expect(fixedNoAmount.status).toBe(400);
  });

  it('normalises offset timestamps to UTC', async () => {
    const d = await createEvent(ctx, 'host', { startsAt: '2026-12-05T19:00:00-08:00', endsAt: '2026-12-05T21:00:00-08:00' });
    expect(d.event.startsAt).toBe('2026-12-06T03:00:00.000Z');
  });
});

describe('update and transitions', () => {
  it('edits fields, rejects capacity below confirmed (AC-6), and notifies on schedule change', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 3 });
    const id = d.event.eventId;
    const [a, b] = await users(ctx, 'u', 2);
    expect((await join(ctx, id, a!)).status).toBe(201);
    expect((await join(ctx, id, b!)).status).toBe(201);
    const r = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { title: 'Friday drop-in', capacity: 4 } });
    expect(r.status).toBe(200);
    expect(r.body.event.title).toBe('Friday drop-in');
    expect(r.body.event.version).toBeGreaterThan(d.event.version);

    const tooSmall = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { capacity: 2 } });
    expect(tooSmall.status).toBe(409);
    expect(tooSmall.body.error.message).toContain('3 confirmed');

    ctx.publisher.clear();
    const newStart = new Date(ctx.clock.now.getTime() + 3 * DAY).toISOString();
    const moved = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { startsAt: newStart, endsAt: new Date(Date.parse(newStart) + HOUR).toISOString() } });
    expect(moved.status).toBe(200);
    const updates = ctx.publisher.ofType('event.updated');
    expect(updates).toHaveLength(1);
    expect(updates[0]!.userIds.sort()).toEqual([a, b].sort());

    const upcomingA = await call(ctx, 'GET', '/v1/events?scope=upcoming', { user: a });
    expect(upcomingA.body.items.map((e: { eventId: string }) => e.eventId)).toContain(id);
    expect(upcomingA.body.items.find((e: { eventId: string }) => e.eventId === id).startsAt).toBe(new Date(newStart).toISOString());

    const noop = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: {} });
    expect(noop.status).toBe(200);
    const nullStart = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { startsAt: null } });
    expect(nullStart.status).toBe(400);
    const badEnd = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { endsAt: newStart } });
    expect(badEnd.status).toBe(400);
  });

  it('clears optional fields with null (description, courts, deadline, signup window)', async () => {
    const start = new Date(ctx.clock.now.getTime() + 2 * DAY);
    const d = await createEvent(ctx, 'host', {
      description: 'Bring your own shuttles',
      courts: 3,
      cancelDeadlineHours: 12,
      signupClosesAt: new Date(start.getTime() - DAY).toISOString(),
    });
    const id = d.event.eventId;
    expect(d.event).toMatchObject({ description: 'Bring your own shuttles', courts: 3, cancelDeadlineHours: 12 });
    const cleared = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { description: null, courts: null, cancelDeadlineHours: null } });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    expect(cleared.body.event.description).toBeUndefined();
    expect(cleared.body.event.courts).toBeUndefined();
    expect(cleared.body.event.cancelDeadlineHours).toBeUndefined();
    expect(cleared.body.event.signupClosesAt).toBe(d.event.signupClosesAt);
    const raw = await ctx.deps.store.get({ PK: `EVENT#${id}`, SK: 'META' });
    expect(raw).toBeDefined();
    expect(Object.values(raw!)).not.toContain(null);
    expect(raw).not.toHaveProperty('description');

    // Sign-ups closed a day before start: a join 6 h before start is refused...
    await user(ctx, 'window');
    ctx.clock.set(new Date(start.getTime() - 6 * HOUR).toISOString());
    expect((await join(ctx, id, 'window')).body.error.code).toBe('signup_window_closed');
    expect((await detail(ctx, id, 'window')).me.canJoin).toBe(false);
    // ...until the explicit close time is cleared and the window falls back to startsAt.
    const reopened = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { signupClosesAt: null } });
    expect(reopened.status).toBe(200);
    expect(reopened.body.event.signupClosesAt).toBeUndefined();
    expect((await detail(ctx, id, 'window')).me.canJoin).toBe(true);
    expect((await join(ctx, id, 'window')).status).toBe(201);
    ctx.clock.set(start.toISOString());
    await user(ctx, 'window2');
    expect((await join(ctx, id, 'window2')).body.error.code).toBe('signup_window_closed');
    ctx.clock.set('2026-11-18T18:00:00Z');
  });

  it('close, reopen, complete, cancel', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 5 });
    const id = d.event.eventId;
    const [p] = await users(ctx, 't', 1);
    expect((await join(ctx, id, p!)).status).toBe(201);
    expect((await call(ctx, 'POST', `/v1/events/${id}/close`, { user: 'host' })).body.event.status).toBe('closed');
    expect((await join(ctx, id, 'stranger')).body.error.code).toBe('event_not_open');
    expect((await call(ctx, 'POST', `/v1/events/${id}/close`, { user: 'host' })).status).toBe(409);
    expect((await call(ctx, 'POST', `/v1/events/${id}/reopen`, { user: 'host' })).body.event.status).toBe('open');
    expect((await call(ctx, 'POST', `/v1/events/${id}/complete`, { user: 'host' })).body.event.status).toBe('completed');
    expect((await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { title: 'nope!' } })).status).toBe(409);
    expect((await call(ctx, 'POST', `/v1/events/${id}/cancel`, { user: 'host' })).status).toBe(409);

    const d2 = await createEvent(ctx, 'host', { capacity: 5 });
    expect((await join(ctx, d2.event.eventId, p!)).status).toBe(201);
    ctx.publisher.clear();
    const cancelled = await call(ctx, 'POST', `/v1/events/${d2.event.eventId}/cancel`, { user: 'host', body: { reason: 'Courts flooded' } });
    expect(cancelled.body.event.status).toBe('cancelled');
    const ev = ctx.publisher.ofType('event.cancelled');
    expect(ev).toHaveLength(1);
    expect(ev[0]!.userIds).toEqual([p]);
    expect(ev[0]!.payload?.reason).toBe('Courts flooded');
    expect((await join(ctx, d2.event.eventId, 'stranger')).status).toBe(409);
  });

  it('duplicates an event without roster or settlement', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 6, title: 'Weekly smash' });
    const [p] = await users(ctx, 'd', 1);
    await join(ctx, d.event.eventId, p!);
    const start = new Date(ctx.clock.now.getTime() + 9 * DAY);
    const dup = await call(ctx, 'POST', `/v1/events/${d.event.eventId}/duplicate`, {
      user: 'host', body: { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 2 * HOUR).toISOString() },
    });
    expect(dup.status).toBe(201);
    expect(dup.body.event.eventId).not.toBe(d.event.eventId);
    expect(dup.body.event.title).toBe('Weekly smash');
    expect(dup.body.event.confirmedCount).toBe(1);
    expect(dup.body.roster).toHaveLength(1);
    expect(dup.body.event.status).toBe('open');
  });
});

describe('lists', () => {
  it('scopes, pagination and public discovery', async () => {
    const local = await createTestContext();
    try {
      await user(local, 'h');
      await user(local, 'v');
      const e1 = await createEvent(local, 'h', { title: 'Alpha public', visibility: 'public' });
      const e2 = await createEvent(local, 'h', { title: 'Beta link-only' });
      const e3 = await createEvent(local, 'h', { title: 'Gamma public later', visibility: 'public', startsAt: new Date(local.clock.now.getTime() + 5 * DAY).toISOString(), endsAt: new Date(local.clock.now.getTime() + 5 * DAY + HOUR).toISOString() });
      const draft = await createEvent(local, 'h', { title: 'Draft public', visibility: 'public', draft: true });
      await join(local, e1.event.eventId, 'v');
      await join(local, e3.event.eventId, 'v');

      const hosting = await call(local, 'GET', '/v1/events?scope=hosting', { user: 'h' });
      expect(hosting.body.items.map((e: { eventId: string }) => e.eventId).sort()).toEqual([e1, e2, e3, draft].map((d) => d.event.eventId).sort());
      expect(hosting.body.items[0].mySignupStatus).toBeDefined();

      const upcoming = await call(local, 'GET', '/v1/events?scope=upcoming&limit=1', { user: 'v' });
      expect(upcoming.body.items).toHaveLength(1);
      expect(upcoming.body.items[0].eventId).toBe(e1.event.eventId);
      expect(upcoming.body.nextCursor).toBeDefined();
      const page2 = await call(local, 'GET', `/v1/events?scope=upcoming&limit=1&cursor=${encodeURIComponent(upcoming.body.nextCursor)}`, { user: 'v' });
      expect(page2.body.items[0].eventId).toBe(e3.event.eventId);
      expect((await call(local, 'GET', '/v1/events?scope=upcoming&cursor=!!!', { user: 'v' })).status).toBe(400);
      expect((await call(local, 'GET', '/v1/events?scope=bogus', { user: 'v' })).status).toBe(400);

      const pub = await call(local, 'GET', '/v1/public/events');
      expect(pub.status).toBe(200);
      expect(pub.body.items.map((e: { title: string }) => e.title)).toEqual(['Alpha public', 'Gamma public later']);
      expect(pub.body.items[0].mySignupStatus).toBeUndefined();
      const q = await call(local, 'GET', '/v1/public/events?q=gamma');
      expect(q.body.items.map((e: { title: string }) => e.title)).toEqual(['Gamma public later']);

      const pubDetail = await call(local, 'GET', `/v1/public/events/${e1.event.eventId}`);
      expect(pubDetail.status).toBe(200);
      expect(pubDetail.body.roster).toBeUndefined();
      expect(pubDetail.body.settlement).toBeUndefined();
      expect(pubDetail.body.confirmedCount).toBe(2);
      expect((await call(local, 'GET', `/v1/events/${e1.event.eventId}`)).status).toBe(401);

      await call(local, 'POST', `/v1/events/${e1.event.eventId}/close`, { user: 'h' });
      expect((await call(local, 'GET', '/v1/public/events')).body.items.map((e: { title: string }) => e.title)).toEqual(['Gamma public later']);

      local.clock.advance(3 * DAY);
      const past = await call(local, 'GET', '/v1/events?scope=past', { user: 'v' });
      expect(past.body.items.map((e: { eventId: string }) => e.eventId)).toEqual([e1.event.eventId]);
      const stillUpcoming = await call(local, 'GET', '/v1/events?scope=upcoming', { user: 'v' });
      expect(stillUpcoming.body.items.map((e: { eventId: string }) => e.eventId)).toEqual([e3.event.eventId]);
    } finally {
      await local.cleanup();
    }
  });

  it('shows redacted roster entries to non-hosts', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 4 });
    const [p] = await users(ctx, 'r', 1);
    await join(ctx, d.event.eventId, p!, 'arriving late');
    const view = await detail(ctx, d.event.eventId, 'stranger');
    expect(view.me.isHost).toBe(false);
    expect(view.me.canJoin).toBe(true);
    for (const row of view.roster) {
      expect(row).not.toHaveProperty('email');
      expect(row).not.toHaveProperty('note');
    }
    const hostView = await detail(ctx, d.event.eventId, 'host');
    expect(hostView.roster.find((r) => r.userId === p)).toMatchObject({ email: `${p}@test.dev`, note: 'arriving late' });
  });

  it('health and 404 envelope', async () => {
    const h = await call(ctx, 'GET', '/v1/health');
    expect(h.body).toEqual({ ok: true, version: expect.any(String) });
    expect(h.headers.get('x-request-id')).toBeTruthy();
    const nf = await call(ctx, 'GET', '/v1/nothing', { user: 'host' });
    expect(nf.status).toBe(404);
    expect(nf.body.error.code).toBe('not_found');
    expect((await call(ctx, 'GET', `/v1/events/doesnotexist1`, { user: 'host' })).status).toBe(404);
  });
});
