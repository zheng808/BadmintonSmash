import { DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import type { CreateEventForm, EventDetail } from '@badmintonsmash/shared';
import { expect } from 'vitest';
import { createApp, type App } from '../src/app';
import { createDeps, type Deps } from '../src/deps';
import { MemoryDirectory } from '../src/directory';
import { createLogger } from '../src/logger';
import { MemoryPublisher } from '../src/notify/publisher';
import { DynamoStore, createDocumentClient } from '../src/repo/dynamo-store';
import { MemoryStore } from '../src/repo/memory-store';
import type { Store } from '../src/repo/store';
import { createTableIfMissing } from '../src/repo/table';

export class Clock {
  now = new Date('2026-11-18T18:00:00Z');
  set(iso: string) {
    this.now = new Date(iso);
  }
  advance(ms: number) {
    this.now = new Date(this.now.getTime() + ms);
  }
}

export const HOUR = 3600_000;
export const DAY = 24 * HOUR;

export interface TestCtx {
  deps: Deps;
  app: App;
  store: Store;
  publisher: MemoryPublisher;
  directory: MemoryDirectory;
  clock: Clock;
  cleanup(): Promise<void>;
}

export const usingMemory = process.env.MEMORY_STORE === '1';
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8001';
const region = process.env.AWS_REGION ?? 'us-west-2';

export async function createTestContext(): Promise<TestCtx> {
  const tableName = `smash-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const clock = new Clock();
  let store: Store;
  let cleanup = async () => {};
  if (usingMemory) {
    store = new MemoryStore();
  } else {
    const client = new DynamoDBClient({ region, endpoint });
    try {
      await createTableIfMissing(client, tableName);
    } catch (err) {
      throw new Error(`DynamoDB Local not reachable at ${endpoint} (${(err as Error).message}). Start it (docker compose up -d) or run with MEMORY_STORE=1.`);
    }
    store = new DynamoStore(createDocumentClient({ region, endpoint }), tableName);
    cleanup = async () => {
      await client.send(new DeleteTableCommand({ TableName: tableName })).catch(() => undefined);
    };
  }
  const publisher = new MemoryPublisher();
  const directory = new MemoryDirectory();
  const deps = createDeps({
    store,
    publisher,
    userDirectory: directory,
    logger: createLogger('test', process.env.TEST_LOG_LEVEL ?? 'SILENT'),
    now: () => new Date(clock.now),
    config: { tableName, devAuth: true, memoryStore: usingMemory, dynamoEndpoint: endpoint, appWebUrl: 'https://smash.test' },
  });
  return { deps, app: createApp(deps), store, publisher, directory, clock, cleanup };
}

export interface CallOptions {
  user?: string;
  email?: string;
  body?: unknown;
}

export interface CallResult {
  status: number;
  body: any;
  headers: Headers;
}

export async function call(ctx: TestCtx, method: string, path: string, opts: CallOptions = {}): Promise<CallResult> {
  const headers: Record<string, string> = {};
  if (opts.user) headers['x-dev-user'] = opts.user;
  if (opts.email) headers['x-dev-email'] = opts.email;
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  const res = await ctx.app.request(path, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

/** Registers an identity and creates the profile through GET /me. */
export async function user(ctx: TestCtx, id: string, email = `${id}@test.dev`) {
  ctx.directory.setEmail(id, email);
  const r = await call(ctx, 'GET', '/v1/me', { user: id });
  expect(r.status).toBe(200);
  return r.body;
}

export async function users(ctx: TestCtx, prefix: string, n: number): Promise<string[]> {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
  for (const id of ids) await user(ctx, id);
  return ids;
}

export function eventInput(ctx: TestCtx, overrides: Partial<CreateEventForm> = {}): CreateEventForm {
  const start = new Date(ctx.clock.now.getTime() + 2 * DAY);
  return {
    title: 'Thursday drop-in',
    venue: { name: 'Richmond Oval', address: '6111 River Rd' },
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 2 * HOUR).toISOString(),
    timezone: 'America/Vancouver',
    capacity: 12,
    fee: { mode: 'settle_after', currency: 'CAD' },
    ...overrides,
  };
}

export async function createEvent(ctx: TestCtx, hostId: string, overrides: Partial<CreateEventForm> = {}): Promise<EventDetail> {
  const r = await call(ctx, 'POST', '/v1/events', { user: hostId, body: eventInput(ctx, overrides) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body as EventDetail;
}

export async function join(ctx: TestCtx, eventId: string, userId: string, note?: string): Promise<CallResult> {
  return call(ctx, 'POST', `/v1/events/${eventId}/signups`, { user: userId, body: note ? { note } : {} });
}

export async function detail(ctx: TestCtx, eventId: string, userId: string): Promise<EventDetail> {
  const r = await call(ctx, 'GET', `/v1/events/${eventId}`, { user: userId });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body as EventDetail;
}

/** Host + (n-1) others confirmed on a fresh event; returns ids of the others. */
export async function fillEvent(ctx: TestCtx, hostId: string, capacity: number, others: number, overrides: Partial<CreateEventForm> = {}) {
  const ev = await createEvent(ctx, hostId, { capacity, ...overrides });
  const ids = await users(ctx, `p${Math.random().toString(36).slice(2, 6)}_`, others);
  for (const id of ids) {
    const r = await join(ctx, ev.event.eventId, id);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
  }
  return { eventId: ev.event.eventId, players: ids };
}
