import { Event, EventStatus } from '@badmintonsmash/shared';
import { z } from 'zod';
import { eventIndexKeys, eventKey, hostPk, statusPk } from './keys';
import { cond, type Condition, type Item, type QueryOutput, type Store } from './store';

/** Event plus internal fields that never leave the API. */
export const EventRecord = Event.extend({
  hostIsPlaying: z.boolean().optional(),
  cancelReason: z.string().optional(),
});
export type EventRecord = z.infer<typeof EventRecord>;

export type ListScope = 'upcoming' | 'past' | 'all';

export interface ListOptions {
  scope: ListScope;
  nowIso: string;
  limit?: number;
  cursor?: Record<string, unknown>;
}

export function scopeToSk(scope: ListScope, nowIso: string) {
  if (scope === 'upcoming') return { sk: { gte: nowIso }, forward: true };
  if (scope === 'past') return { sk: { lt: nowIso }, forward: false };
  return { sk: undefined, forward: false };
}

export class EventsRepo {
  constructor(private readonly store: Store) {}

  async get(eventId: string, consistent = false): Promise<EventRecord | undefined> {
    const item = await this.store.get(eventKey(eventId), consistent);
    return item ? EventRecord.parse(item) : undefined;
  }

  async create(rec: EventRecord): Promise<void> {
    await this.store.put(this.toItem(rec), cond.notExists('PK'));
  }

  /**
   * Apply field changes with a version compare-and-swap (default) and recompute index keys.
   * Pass `undefined` for a field to remove it.
   */
  async patch(prev: EventRecord, changes: Partial<EventRecord>, nowIso: string, condition?: Condition): Promise<EventRecord> {
    const merged = { ...prev, ...changes };
    const set: Record<string, unknown> = { ...changes, ...eventIndexKeys(merged), updatedAt: nowIso };
    delete set.version;
    const item = await this.store.update(eventKey(prev.eventId), { set, add: { version: 1 } }, condition ?? cond.eq('version', prev.version));
    return EventRecord.parse(item);
  }

  async listByHost(hostId: string, opts: ListOptions): Promise<QueryOutput<EventRecord>> {
    const { sk, forward } = scopeToSk(opts.scope, opts.nowIso);
    const out = await this.store.query({ index: 'GSI1', pk: hostPk(hostId), sk, forward, limit: opts.limit, cursor: opts.cursor });
    return { items: out.items.map((i) => EventRecord.parse(i)), ...(out.cursor ? { cursor: out.cursor } : {}) };
  }

  async listPublicOpen(nowIso: string, limit?: number, cursor?: Record<string, unknown>): Promise<QueryOutput<EventRecord>> {
    const out = await this.store.query({
      index: 'GSI2', pk: statusPk('open'), sk: { between: [`public#${nowIso}`, 'public#~'] }, forward: true, limit, cursor,
    });
    return { items: out.items.map((i) => EventRecord.parse(i)), ...(out.cursor ? { cursor: out.cursor } : {}) };
  }

  async listByStatus(status: EventStatus): Promise<EventRecord[]> {
    const items = await this.store.queryAll({ index: 'GSI2', pk: statusPk(status) });
    return items.map((i) => EventRecord.parse(i));
  }

  async batchGet(eventIds: string[]): Promise<Map<string, EventRecord>> {
    const unique = [...new Set(eventIds)];
    const items = unique.length ? await this.store.batchGet(unique.map(eventKey)) : [];
    return new Map(items.map((i) => {
      const e = EventRecord.parse(i);
      return [e.eventId, e];
    }));
  }

  toItem(rec: EventRecord): Item {
    return { ...eventKey(rec.eventId), ...eventIndexKeys(rec), type: 'EVENT', ...rec };
  }
}
