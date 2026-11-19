import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runHousekeeping } from '../src/housekeeping';
import { eventKey } from '../src/repo/keys';
import { DAY, HOUR, createEvent, createTestContext, detail, fillEvent, join, user, users, type TestCtx } from './helpers';

let ctx: TestCtx;
beforeAll(async () => {
  ctx = await createTestContext();
  await user(ctx, 'host');
});
afterAll(() => ctx.cleanup());

describe('housekeeping', () => {
  it('completes events 24h after they end and leaves recent ones alone', async () => {
    const old = await createEvent(ctx, 'host', { capacity: 3 });
    const recent = await createEvent(ctx, 'host', {
      capacity: 3,
      startsAt: new Date(ctx.clock.now.getTime() + 3 * DAY).toISOString(),
      endsAt: new Date(ctx.clock.now.getTime() + 3 * DAY + 2 * HOUR).toISOString(),
    });
    const closed = await createEvent(ctx, 'host', { capacity: 3 });
    await ctx.deps.events.patch((await ctx.deps.events.get(closed.event.eventId))!, { status: 'closed' }, ctx.clock.now.toISOString());
    ctx.clock.advance(3 * DAY + 3 * HOUR); // old ended 2d+1h ago (> 24h); recent ended 1h ago
    const result = await runHousekeeping(ctx.deps);
    expect(result.completed.sort()).toEqual([old.event.eventId, closed.event.eventId].sort());
    expect((await detail(ctx, old.event.eventId, 'host')).event.status).toBe('completed');
    expect((await detail(ctx, recent.event.eventId, 'host')).event.status).toBe('open');
    expect((await runHousekeeping(ctx.deps)).completed).toEqual([]);
    ctx.clock.set('2026-11-18T18:00:00Z');
  });

  it('promotes waitlisted players when spots are free (safety net)', async () => {
    const { eventId } = await fillEvent(ctx, 'host', 2, 1);
    const [a, b] = await users(ctx, 'hk', 2);
    await join(ctx, eventId, a!);
    await join(ctx, eventId, b!);
    // Simulate a capacity bump that skipped promotion (e.g. crash mid-loop).
    await ctx.store.update(eventKey(eventId), { set: { capacity: 3 }, add: { version: 1 } });
    const result = await runHousekeeping(ctx.deps);
    expect(result.promoted[eventId]).toEqual([a]);
    const d = await detail(ctx, eventId, 'host');
    expect(d.event.confirmedCount).toBe(3);
    expect(d.event.waitlistCount).toBe(1);
    expect(d.roster.find((s) => s.userId === b)?.status).toBe('waitlisted');
  });
});
