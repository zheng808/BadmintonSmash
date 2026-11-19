import type { Signup } from '@badmintonsmash/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DAY, HOUR, call, createTestContext, detail, fillEvent, join, user, users, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
  await user(ctx, 'host', 'alex@test.dev');
  await call(ctx, 'PUT', '/v1/me', { user: 'host', body: { displayName: 'Alex', paymentHandles: { etransfer: 'alex@test.dev', wechat: 'alex-wx' } } });
});
afterAll(() => ctx.cleanup());

const costs = { courtCostCents: 9600, shuttleCount: 9, shuttleUnitCostCents: 320 };

async function settledEvent(others = 11) {
  const { eventId, players } = await fillEvent(ctx, 'host', 12, others);
  ctx.clock.advance(2 * DAY + 3 * HOUR); // event has started
  return { eventId, players };
}

describe('settle after', () => {
  it('AC-7: splits $124.80 over 12 attended players and shows up in money views', async () => {
    const { eventId, players } = await settledEvent();
    ctx.publisher.clear();
    const r = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: costs });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.settlement).toMatchObject({ totalCents: 12480, payerCount: 12, perPlayerCents: 1040, surplusCents: 0, version: 1, payers: 'attended' });
    expect(r.body.warnings).toEqual([]);
    const d = await detail(ctx, eventId, 'host');
    for (const s of d.roster) expect(s).toMatchObject({ amountOwedCents: 1040, paymentStatus: 'unpaid' });
    expect(d.event.settlement?.finalizedAt).toBeDefined();

    const hostMoney = await call(ctx, 'GET', '/v1/me/money', { user: 'host' });
    const mine = hostMoney.body.owedToMe.find((o: { eventId: string }) => o.eventId === eventId);
    expect(mine).toMatchObject({ outstandingCents: 12480, collectedCents: 0, waivedCents: 0, unpaidCount: 12, paidCount: 0, currency: 'CAD' });
    const playerMoney = await call(ctx, 'GET', '/v1/me/money', { user: players[0] });
    expect(playerMoney.body.owed).toEqual([
      expect.objectContaining({ eventId, amountOwedCents: 1040, paymentStatus: 'unpaid', hostDisplayName: 'Alex', paymentHandles: { etransfer: 'alex@test.dev', wechat: 'alex-wx' } }),
    ]);
    const fin = ctx.publisher.ofType('fee.finalized');
    expect(fin).toHaveLength(1);
    expect(fin[0]!.userIds).toHaveLength(12);
    expect((fin[0]!.payload as { amounts: Record<string, number> }).amounts[players[0]!]).toBe(1040);
    const past = await call(ctx, 'GET', '/v1/events?scope=past', { user: players[0] });
    expect(past.body.items.find((e: { eventId: string }) => e.eventId === eventId)).toMatchObject({ myAmountOwedCents: 1040, myPaymentStatus: 'unpaid' });
  });

  it('AC-8: a no-show is excluded and the rest pay $11.35', async () => {
    const { eventId, players } = await settledEvent();
    const noShow = players[5]!;
    await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/${noShow}`, { user: 'host', body: { attended: false } });
    const preview = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/preview`, { user: 'host', body: costs });
    expect(preview.body).toMatchObject({ payerCount: 11, perPlayerCents: 1135 });
    expect(((await detail(ctx, eventId, 'host')).roster as Signup[])[0]!.amountOwedCents).toBeUndefined(); // preview wrote nothing
    const r = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: costs });
    expect(r.body.settlement.perPlayerCents).toBe(1135);
    expect(r.body.settlement.surplusCents).toBe(1135 * 11 - 12480);
    const roster = (await detail(ctx, eventId, 'host')).roster as Signup[];
    expect(roster.find((s) => s.userId === noShow)!.amountOwedCents).toBeUndefined();
    expect(roster.filter((s) => s.amountOwedCents === 1135)).toHaveLength(11);
  });

  it('AC-9: marking paid moves money and emails a receipt', async () => {
    const { eventId, players } = await settledEvent();
    await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: costs });
    const p = players[0]!;
    const claim = await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/me`, { user: p, body: { claimedPaid: true } });
    expect(claim.body.signup.claimedPaidAt).toBeDefined();
    ctx.publisher.clear();
    const paid = await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/${p}`, { user: 'host', body: { paymentStatus: 'paid' } });
    expect(paid.body.signup).toMatchObject({ paymentStatus: 'paid', paidAt: expect.any(String) });
    expect(ctx.publisher.ofType('payment.recorded')).toEqual([expect.objectContaining({ userIds: [p] })]);
    const money = await call(ctx, 'GET', '/v1/me/money', { user: 'host' });
    expect(money.body.owedToMe.find((o: { eventId: string }) => o.eventId === eventId)).toMatchObject({ collectedCents: 1040, outstandingCents: 11440, paidCount: 1, unpaidCount: 11 });
    expect((await call(ctx, 'GET', '/v1/me/money', { user: p })).body.owed[0]).toMatchObject({ paymentStatus: 'paid', claimedPaidAt: expect.any(String) });
    // marking paid twice does not re-publish
    await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/${p}`, { user: 'host', body: { paymentStatus: 'paid' } });
    expect(ctx.publisher.ofType('payment.recorded')).toHaveLength(1);
  });

  it('re-finalising keeps paid amounts, warns, and drops amounts for players no longer charged', async () => {
    const { eventId, players } = await settledEvent();
    await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: costs });
    const paidPlayer = players[1]!;
    const waivedPlayer = players[2]!;
    await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/${paidPlayer}`, { user: 'host', body: { paymentStatus: 'paid' } });
    await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/${waivedPlayer}`, { user: 'host', body: { paymentStatus: 'waived' } });
    await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/${players[3]}`, { user: 'host', body: { attended: false } });
    const r = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: { ...costs, otherCostCents: 500, otherLabel: 'parking' } });
    expect(r.status).toBe(200);
    expect(r.body.settlement.version).toBe(2);
    expect(r.body.settlement.totalCents).toBe(12980);
    expect(r.body.settlement.payerCount).toBe(11);
    expect(r.body.warnings).toHaveLength(1);
    expect(r.body.warnings[0]).toMatch(/already paid/);
    const rows = Object.fromEntries(((await detail(ctx, eventId, 'host')).roster as Signup[]).map((s) => [s.userId, s]));
    expect(rows[paidPlayer]).toMatchObject({ amountOwedCents: 1040, paymentStatus: 'paid' });
    expect(rows[waivedPlayer]).toMatchObject({ amountOwedCents: 1180, paymentStatus: 'waived' });
    expect(rows[players[3]!]!.amountOwedCents).toBeUndefined();
    expect(rows[players[0]!]).toMatchObject({ amountOwedCents: 1180, paymentStatus: 'unpaid' });
  });

  it('can charge late cancels and supports overrides', async () => {
    const { eventId, players } = await fillEvent(ctx, 'host', 12, 11, { cancelDeadlineHours: 24 });
    ctx.clock.advance(DAY + 2 * HOUR);
    const late = players[0]!;
    await call(ctx, 'DELETE', `/v1/events/${eventId}/signups/me`, { user: late });
    ctx.clock.advance(DAY + 2 * HOUR);
    const r = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, {
      user: 'host', body: { ...costs, includeLateCancels: [late], overrides: { host: 0 } },
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.settlement.payerCount).toBe(12);
    expect(r.body.settlement.amounts[late]).toBe(1040);
    expect(r.body.settlement.amounts['host']).toBe(0);
    expect(r.body.settlement.surplusCents).toBe(-1040);
    const money = await call(ctx, 'GET', '/v1/me/money', { user: late });
    expect(money.body.owed[0]).toMatchObject({ eventId, amountOwedCents: 1040 });
  });

  it('refuses to settle before start, with no payers, or on cancelled events', async () => {
    const { eventId, players } = await fillEvent(ctx, 'host', 12, 2);
    const early = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: costs });
    expect(early.status).toBe(409);
    ctx.clock.advance(3 * DAY);
    for (const p of ['host', ...players]) await call(ctx, 'PATCH', `/v1/events/${eventId}/signups/${p}`, { user: 'host', body: { attended: false } });
    const none = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: costs });
    expect(none.status).toBe(409);
    expect(none.body.error.message).toMatch(/No payers/);
    expect((await call(ctx, 'GET', `/v1/events/${eventId}/settlement`, { user: 'host' })).body).toBeNull();
    const d2 = await fillEvent(ctx, 'host', 12, 1);
    await call(ctx, 'POST', `/v1/events/${d2.eventId}/cancel`, { user: 'host' });
    expect((await call(ctx, 'POST', `/v1/events/${d2.eventId}/settlement/finalize`, { user: 'host', body: costs })).status).toBe(409);
  });

  it('validates settlement input', async () => {
    const { eventId } = await settledEvent(1);
    const bad = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: { ...costs, shuttleCount: -1 } });
    expect(bad.status).toBe(400);
    const stored = await call(ctx, 'GET', `/v1/events/${eventId}/settlement`, { user: 'host' });
    expect(stored.body).toBeNull();
    await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: costs });
    expect((await call(ctx, 'GET', `/v1/events/${eventId}/settlement`, { user: 'host' })).body).toMatchObject({ totalCents: 12480, version: 1 });
    const [other] = await users(ctx, 'o', 1);
    await join(ctx, eventId, other!).catch(() => undefined);
    expect((await call(ctx, 'GET', `/v1/events/${eventId}/settlement`, { user: other })).status).toBe(403);
  });
});
