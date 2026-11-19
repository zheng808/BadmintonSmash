import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY, HOUR, call, createEvent, createTestContext, detail, fillEvent, join, user, users, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
  await user(ctx, 'host');
});
afterAll(() => ctx.cleanup());

const positionOf = async (eventId: string, userId: string) => (await detail(ctx, eventId, userId)).me.position;

describe('join / waitlist', () => {
  it('AC-1: joins with a spot available and is confirmed', async () => {
    const { eventId } = await fillEvent(ctx, 'host', 12, 10); // host + 10 = 11
    await user(ctx, 'late1');
    ctx.publisher.clear();
    const r = await join(ctx, eventId, 'late1');
    expect(r.status).toBe(201);
    expect(r.body.signup.status).toBe('confirmed');
    expect(r.body.position).toBeUndefined();
    const d = await detail(ctx, eventId, 'late1');
    expect(d.event.confirmedCount).toBe(12);
    expect(d.me.signup?.status).toBe('confirmed');
    expect(d.me.canJoin).toBe(false);
    expect(d.me.cannotJoinReason).toMatch(/already/);
    const published = ctx.publisher.ofType('signup.confirmed');
    expect(published).toHaveLength(1);
    expect(published[0]!.userIds).toEqual(['late1']);
    expect(published[0]!.dedupeKey).toMatch(/^signup\.confirmed:/);
  });

  it('AC-2: joins a full event and gets a waitlist position', async () => {
    const { eventId } = await fillEvent(ctx, 'host', 12, 11);
    const [w1, w2, w3] = await users(ctx, 'w', 3);
    expect((await join(ctx, eventId, w1!)).body.position).toBe(1);
    expect((await join(ctx, eventId, w2!)).body.position).toBe(2);
    const r = await join(ctx, eventId, w3!);
    expect(r.body.signup.status).toBe('waitlisted');
    expect(r.body.position).toBe(3);
    const d = await detail(ctx, eventId, w3!);
    expect(d.event.confirmedCount).toBe(12);
    expect(d.event.waitlistCount).toBe(3);
    expect(d.me.position).toBe(3);
    expect(d.roster.map((s) => s.status)).toEqual([...Array(12).fill('confirmed'), 'waitlisted', 'waitlisted', 'waitlisted']);
    expect(ctx.publisher.ofType('signup.waitlisted').some((e) => e.userIds[0] === w3)).toBe(true);
  });

  it('AC-3: 20 concurrent joins for the last spot -> exactly one confirmed, 19 waitlisted in order', async () => {
    const { eventId } = await fillEvent(ctx, 'host', 12, 10); // 11 confirmed
    const ids = await users(ctx, 'c', 20);
    const results = await Promise.all(ids.map((id) => join(ctx, eventId, id)));
    for (const r of results) expect(r.status, JSON.stringify(r.body)).toBe(201);
    const statuses = results.map((r) => r.body.signup.status);
    expect(statuses.filter((s) => s === 'confirmed')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'waitlisted')).toHaveLength(19);
    const d = await detail(ctx, eventId, 'host');
    expect(d.event.confirmedCount).toBe(12);
    expect(d.event.waitlistCount).toBe(19);
    const waitlisted = d.roster.filter((s) => s.status === 'waitlisted');
    expect(waitlisted).toHaveLength(19);
    const positions = await Promise.all(waitlisted.map((s) => positionOf(eventId, s.userId)));
    expect([...positions].sort((a, b) => a! - b!)).toEqual(Array.from({ length: 19 }, (_, i) => i + 1));
    expect(new Set(waitlisted.map((s) => s.seq)).size).toBe(19);
  });

  it('rejects double joins, joins outside the window, and joins on closed events', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 5, signupOpensAt: new Date(ctx.clock.now.getTime() + DAY).toISOString() });
    const id = d.event.eventId;
    await user(ctx, 'early');
    const tooEarly = await join(ctx, id, 'early');
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe('signup_window_closed');
    const view = await detail(ctx, id, 'early');
    expect(view.me.canJoin).toBe(false);
    expect(view.me.cannotJoinReason).toMatch(/not opened/);
    ctx.clock.advance(DAY + HOUR);
    expect((await join(ctx, id, 'early')).status).toBe(201);
    const twice = await join(ctx, id, 'early');
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe('conflict');
    ctx.clock.advance(DAY); // past start
    await user(ctx, 'tardy');
    expect((await join(ctx, id, 'tardy')).body.error.code).toBe('signup_window_closed');
    ctx.clock.set('2026-11-18T18:00:00Z');
  });
});

describe('leave / promote', () => {
  it('AC-4: leaving promotes the earliest waitlisted player and re-sequences', async () => {
    const { eventId, players } = await fillEvent(ctx, 'host', 12, 11);
    const [a, b] = await users(ctx, 'q', 2);
    await join(ctx, eventId, a!);
    await join(ctx, eventId, b!);
    ctx.publisher.clear();
    const leaver = players[0]!;
    const r = await call(ctx, 'DELETE', `/v1/events/${eventId}/signups/me`, { user: leaver });
    expect(r.status).toBe(200);
    expect(r.body.signup.status).toBe('cancelled');
    expect(r.body.signup.lateCancel).toBeUndefined();
    const d = await detail(ctx, eventId, 'host');
    expect(d.event.confirmedCount).toBe(12);
    expect(d.event.waitlistCount).toBe(1);
    expect(d.roster.find((s) => s.userId === a)?.status).toBe('confirmed');
    expect(await positionOf(eventId, b!)).toBe(1);
    const promoted = ctx.publisher.ofType('signup.promoted');
    expect(promoted).toHaveLength(1);
    expect(promoted[0]!.userIds).toEqual([a]);
    expect(d.roster.some((s) => s.userId === leaver)).toBe(false);
  });

  it('AC-5: increasing capacity promotes in order', async () => {
    const { eventId } = await fillEvent(ctx, 'host', 12, 11);
    const [a, b, c] = await users(ctx, 'k', 3);
    for (const id of [a, b, c]) await join(ctx, eventId, id!);
    const r = await call(ctx, 'PATCH', `/v1/events/${eventId}`, { user: 'host', body: { capacity: 14 } });
    expect(r.status).toBe(200);
    expect(r.body.event.confirmedCount).toBe(14);
    expect(r.body.event.waitlistCount).toBe(1);
    const byId = Object.fromEntries(r.body.roster.map((s: { userId: string; status: string }) => [s.userId, s.status]));
    expect(byId[a!]).toBe('confirmed');
    expect(byId[b!]).toBe('confirmed');
    expect(byId[c!]).toBe('waitlisted');
    expect(await positionOf(eventId, c!)).toBe(1);
  });

  it('leaving the waitlist does not promote; leaving when not signed up is 409', async () => {
    const { eventId } = await fillEvent(ctx, 'host', 12, 11);
    const [a, b] = await users(ctx, 'm', 2);
    await join(ctx, eventId, a!);
    await join(ctx, eventId, b!);
    ctx.publisher.clear();
    expect((await call(ctx, 'DELETE', `/v1/events/${eventId}/signups/me`, { user: a })).status).toBe(200);
    const d = await detail(ctx, eventId, 'host');
    expect(d.event.waitlistCount).toBe(1);
    expect(d.event.confirmedCount).toBe(12);
    expect(await positionOf(eventId, b!)).toBe(1);
    expect(ctx.publisher.ofType('signup.promoted')).toHaveLength(0);
    expect((await call(ctx, 'DELETE', `/v1/events/${eventId}/signups/me`, { user: a })).status).toBe(409);
  });

  it('rejoining goes to the back of the queue', async () => {
    const { eventId } = await fillEvent(ctx, 'host', 12, 11);
    const [a, b] = await users(ctx, 'z', 2);
    await join(ctx, eventId, a!);
    await call(ctx, 'DELETE', `/v1/events/${eventId}/signups/me`, { user: a });
    await join(ctx, eventId, b!);
    ctx.clock.advance(1000);
    const again = await join(ctx, eventId, a!);
    expect(again.status).toBe(201);
    expect(again.body.position).toBe(2);
    expect(await positionOf(eventId, b!)).toBe(1);
  });

  it('flags late cancels against the deadline', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 5, cancelDeadlineHours: 24 });
    const id = d.event.eventId;
    const [p] = await users(ctx, 'l', 1);
    await join(ctx, id, p!);
    ctx.clock.advance(DAY + 2 * HOUR); // 22 h before start
    const r = await call(ctx, 'DELETE', `/v1/events/${id}/signups/me`, { user: p });
    expect(r.body.signup.lateCancel).toBe(true);
    ctx.clock.set('2026-11-18T18:00:00Z');
  });
});

describe('fixed fee', () => {
  it('sets the amount at confirmation and promotion, rewrites unpaid on fee change', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 2, fee: { mode: 'fixed', currency: 'CAD', fixedAmountCents: 1500 } });
    const id = d.event.eventId;
    expect(d.me.signup?.amountOwedCents).toBe(1500);
    const [a, b] = await users(ctx, 'f', 2);
    const ra = await join(ctx, id, a!);
    expect(ra.body.signup).toMatchObject({ amountOwedCents: 1500, paymentStatus: 'unpaid' });
    const rb = await join(ctx, id, b!);
    expect(rb.body.signup.amountOwedCents).toBeUndefined();
    await call(ctx, 'DELETE', `/v1/events/${id}/signups/me`, { user: a });
    const after = await detail(ctx, id, 'host');
    expect(after.roster.find((s) => s.userId === b)).toMatchObject({ status: 'confirmed', amountOwedCents: 1500, paymentStatus: 'unpaid' });
    await call(ctx, 'PATCH', `/v1/events/${id}/signups/${b}`, { user: 'host', body: { paymentStatus: 'paid' } });
    const changed = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { fee: { mode: 'fixed', currency: 'CAD', fixedAmountCents: 1800 } } });
    expect(changed.status).toBe(200);
    const rows = Object.fromEntries(changed.body.roster.map((s: { userId: string }) => [s.userId, s]));
    expect(rows['host'].amountOwedCents).toBe(1800);
    expect(rows[b!].amountOwedCents).toBe(1500); // paid players keep their recorded amount
    const toSettle = await call(ctx, 'PATCH', `/v1/events/${id}`, { user: 'host', body: { fee: { mode: 'settle_after', currency: 'CAD' } } });
    const rows2 = Object.fromEntries(toSettle.body.roster.map((s: { userId: string }) => [s.userId, s]));
    expect(rows2['host'].amountOwedCents).toBeUndefined();
    expect(rows2[b!].paymentStatus).toBe('paid');
  });
});

describe('host roster management', () => {
  it('removes a player (promoting the waitlist) and adds by email', async () => {
    const { eventId, players } = await fillEvent(ctx, 'host', 12, 11);
    const [w] = await users(ctx, 'rm', 1);
    await join(ctx, eventId, w!);
    ctx.publisher.clear();
    const victim = players[3]!;
    const r = await call(ctx, 'DELETE', `/v1/events/${eventId}/signups/${victim}`, { user: 'host', body: { reason: 'No-show last week' } });
    expect(r.status).toBe(200);
    expect(r.body.signup.status).toBe('removed');
    const removed = ctx.publisher.ofType('signup.removed');
    expect(removed).toHaveLength(1);
    expect(removed[0]!.payload?.reason).toBe('No-show last week');
    expect(ctx.publisher.ofType('signup.promoted')[0]!.userIds).toEqual([w]);
    const d = await detail(ctx, eventId, 'host');
    expect(d.event.confirmedCount).toBe(12);
    expect(d.event.waitlistCount).toBe(0);

    await user(ctx, 'byemail', 'ByEmail@Test.dev');
    const added = await call(ctx, 'POST', `/v1/events/${eventId}/signups/add`, { user: 'host', body: { email: 'byemail@test.dev' } });
    expect(added.status).toBe(201);
    expect(added.body.signup.status).toBe('waitlisted');
    expect(added.body.position).toBe(1);
    expect((await call(ctx, 'POST', `/v1/events/${eventId}/signups/add`, { user: 'host', body: { email: 'nobody@test.dev' } })).status).toBe(404);
    expect((await call(ctx, 'DELETE', `/v1/events/${eventId}/signups/${victim}`, { user: 'host' })).status).toBe(409);
  });

  it('player notes and claimed-paid guard', async () => {
    const d = await createEvent(ctx, 'host', { capacity: 4 });
    const [p] = await users(ctx, 'n', 1);
    await join(ctx, d.event.eventId, p!);
    const r = await call(ctx, 'PATCH', `/v1/events/${d.event.eventId}/signups/me`, { user: p, body: { note: 'bringing a tube' } });
    expect(r.body.signup.note).toBe('bringing a tube');
    const claim = await call(ctx, 'PATCH', `/v1/events/${d.event.eventId}/signups/me`, { user: p, body: { claimedPaid: true } });
    expect(claim.status).toBe(409);
    const attend = await call(ctx, 'PATCH', `/v1/events/${d.event.eventId}/signups/${p}`, { user: 'host', body: { attended: false } });
    expect(attend.body.signup.attended).toBe(false);
    const noAmount = await call(ctx, 'PATCH', `/v1/events/${d.event.eventId}/signups/${p}`, { user: 'host', body: { paymentStatus: 'paid' } });
    expect(noAmount.status).toBe(409);
  });
});
