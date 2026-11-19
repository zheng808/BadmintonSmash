import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNotifierHandler } from '../src/notify/notifier';
import { domainEvent } from '../src/notify/publisher';
import { MemorySender } from '../src/notify/sender';
import { DAY, HOUR, call, createEvent, createTestContext, join, user, type TestCtx } from './helpers';

let ctx: TestCtx;
let eventId: string;
beforeAll(async () => {
  ctx = await createTestContext();
  await user(ctx, 'host', 'host@test.dev');
  await call(ctx, 'PUT', '/v1/me', { user: 'host', body: { displayName: 'Host', paymentHandles: { etransfer: 'host@test.dev' } } });
  await user(ctx, 'p1', 'p1@test.dev');
  await user(ctx, 'p2', 'p2@test.dev');
  eventId = (await createEvent(ctx, 'host', { capacity: 3 })).event.eventId;
  await join(ctx, eventId, 'p1');
  await join(ctx, eventId, 'p2');
});
afterAll(() => ctx.cleanup());

let n = 0;
const record = (body: unknown): SQSRecord =>
  ({ messageId: `m${++n}`, receiptHandle: 'rh', body: typeof body === 'string' ? body : JSON.stringify(body), attributes: {}, messageAttributes: {}, md5OfBody: '', eventSource: 'aws:sqs', eventSourceARN: 'arn', awsRegion: 'us-west-2' }) as unknown as SQSRecord;
const sqs = (...bodies: unknown[]): SQSEvent => ({ Records: bodies.map(record) });

describe('notifier', () => {
  it('sends bilingual emails and dedupes repeats', async () => {
    const sender = new MemorySender();
    const handler = createNotifierHandler(ctx.deps, sender);
    const msg = domainEvent({ type: 'signup.confirmed', eventId, userIds: ['p1'], eventVersion: 2, dedupeSuffix: 1, now: ctx.clock.now });
    const out = await handler(sqs(msg));
    expect(out.batchItemFailures).toEqual([]);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]!.to).toBe('p1@test.dev');
    expect(sender.sent[0]!.subject).toBe("You're in: Thursday drop-in / 报名成功：Thursday drop-in");
    expect(sender.sent[0]!.text).toContain('Richmond Oval');
    expect(sender.sent[0]!.text).toContain(`https://smash.test/e/${eventId}`);
    expect(sender.sent[0]!.html).toContain('<p>');
    await handler(sqs(msg));
    expect(sender.sent).toHaveLength(1);
  });

  it('respects the non-essential opt-out but still sends essential mail', async () => {
    await call(ctx, 'PUT', '/v1/me', { user: 'p2', body: { displayName: 'Pat', notificationPrefs: { emailNonEssential: false } } });
    const sender = new MemorySender();
    const handler = createNotifierHandler(ctx.deps, sender);
    await handler(sqs(domainEvent({ type: 'signup.waitlisted', eventId, userIds: ['p2'], eventVersion: 3, dedupeSuffix: 'x', now: ctx.clock.now })));
    expect(sender.sent).toHaveLength(0);
    await handler(sqs(domainEvent({ type: 'fee.finalized', eventId, userIds: ['p2', 'p1'], eventVersion: 4, dedupeSuffix: 1, payload: { amounts: { p2: 1040, p1: 1040 } }, now: ctx.clock.now })));
    expect(sender.sent.map((e) => e.to).sort()).toEqual(['p1@test.dev', 'p2@test.dev']);
    expect(sender.sent[0]!.subject).toContain('$10.40');
    expect(sender.sent[0]!.text).toContain('e-Transfer');
  });

  it('reports failed records for retry and lets the retry resend', async () => {
    const sender = new MemorySender();
    sender.failFor = (e) => e.to === 'p1@test.dev';
    const handler = createNotifierHandler(ctx.deps, sender);
    const good = domainEvent({ type: 'event.updated', eventId, userIds: ['p2'], eventVersion: 5, dedupeSuffix: 5, now: ctx.clock.now });
    const bad = domainEvent({ type: 'event.cancelled', eventId, userIds: ['p1'], eventVersion: 6, dedupeSuffix: 6, now: ctx.clock.now });
    const out = await handler(sqs(good, bad, '{not json', domainEvent({ type: 'event.cancelled', eventId: 'missingevent1', userIds: ['p1'], eventVersion: 1, dedupeSuffix: 1, now: ctx.clock.now })));
    expect(out.batchItemFailures.map((f) => f.itemIdentifier)).toEqual(['m' + (n - 2), 'm' + (n - 1)]);
    expect(sender.sent.map((e) => e.to)).toEqual(['p2@test.dev']);
    sender.failFor = undefined;
    const retry = await handler(sqs(bad));
    expect(retry.batchItemFailures).toEqual([]);
    expect(sender.sent.map((e) => e.to)).toEqual(['p2@test.dev', 'p1@test.dev']);
  });

  it('includes the waitlist position and payment amounts from current state', async () => {
    await user(ctx, 'p3', 'p3@test.dev');
    await user(ctx, 'p4', 'p4@test.dev');
    await join(ctx, eventId, 'p3');
    const r = await join(ctx, eventId, 'p4');
    expect(r.body.signup.status).toBe('waitlisted');
    const sender = new MemorySender();
    const handler = createNotifierHandler(ctx.deps, sender);
    await handler(sqs(ctx.publisher.ofType('signup.waitlisted').at(-1)));
    expect(sender.sent[0]!.subject).toContain('Waitlisted #2');
    expect(sender.sent[0]!.text).toContain('候补名单中排第 2 位');
    ctx.clock.advance(3 * DAY + HOUR);
    const fin = await call(ctx, 'POST', `/v1/events/${eventId}/settlement/finalize`, { user: 'host', body: { courtCostCents: 3000, shuttleCount: 0, shuttleUnitCostCents: 0 } });
    expect(fin.status).toBe(200);
    await handler(sqs(ctx.publisher.ofType('fee.finalized').at(-1)));
    // payers are the 3 confirmed players (host, p1, p2): $30 / 3. p1/p2 already have fee.finalized:v1 markers from the earlier test.
    expect(sender.sent.find((e) => e.to === 'p3@test.dev')).toBeUndefined();
    const toHost = sender.sent.find((e) => e.to === 'host@test.dev');
    expect(toHost?.subject).toContain('$10.00');
    expect(toHost?.text).toContain('e-Transfer: host@test.dev');
  });
});
