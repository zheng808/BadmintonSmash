import {
  ConditionFailedError, INDEX_KEYS, type Condition, type Item, type Key, type QueryInput,
  type QueryOutput, type Store, type Update, type WriteOp,
} from './store';

const keyOf = (k: Key) => `${k.PK}\u0000${k.SK}`;
const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const tick = () => new Promise<void>((r) => setImmediate(r));

function comparable(a: unknown, b: unknown): boolean {
  return (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string');
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function evaluateCondition(c: Condition, item: Item | undefined): boolean {
  const v = item?.[('path' in c ? c.path : '') as string];
  switch (c.kind) {
    case 'attribute_not_exists':
      return v === undefined;
    case 'attribute_exists':
      return v !== undefined;
    case 'eq':
      return v !== undefined && deepEqual(v, c.value);
    case 'ne':
      return v !== undefined && !deepEqual(v, c.value);
    case 'lt':
      return comparable(v, c.value) && (v as number) < (c.value as number);
    case 'lte':
      return comparable(v, c.value) && (v as number) <= (c.value as number);
    case 'gt':
      return comparable(v, c.value) && (v as number) > (c.value as number);
    case 'gte':
      return comparable(v, c.value) && (v as number) >= (c.value as number);
    case 'lt_attr': {
      const o = item?.[c.other];
      return comparable(v, o) && (v as number) < (o as number);
    }
    case 'gte_attr': {
      const o = item?.[c.other];
      return comparable(v, o) && (v as number) >= (o as number);
    }
    case 'in':
      return v !== undefined && c.values.some((x) => deepEqual(x, v));
    case 'and':
      return c.conditions.every((x) => evaluateCondition(x, item));
    case 'or':
      return c.conditions.some((x) => evaluateCondition(x, item));
  }
}

function applyUpdate(existing: Item | undefined, key: Key, update: Update): Item {
  const next: Item = { ...(existing ?? {}), ...key };
  for (const [k, v] of Object.entries(update.set ?? {})) {
    if (v === undefined) delete next[k];
    else next[k] = clone(v);
  }
  for (const [k, n] of Object.entries(update.add ?? {})) {
    const cur = next[k];
    next[k] = (typeof cur === 'number' ? cur : 0) + n;
  }
  for (const k of update.remove ?? []) delete next[k];
  return next;
}

function matchesSk(sk: unknown, c: QueryInput['sk']): boolean {
  if (!c) return true;
  if (typeof sk !== 'string') return false;
  if ('beginsWith' in c) return sk.startsWith(c.beginsWith);
  if ('between' in c) return sk >= c.between[0] && sk <= c.between[1];
  if ('gte' in c) return sk >= c.gte;
  if ('gt' in c) return sk > c.gt;
  if ('lt' in c) return sk < c.lt;
  if ('lte' in c) return sk <= c.lte;
  return true;
}

/** In-memory Store with DynamoDB semantics for conditions, updates, queries and transactions. */
export class MemoryStore implements Store {
  private readonly items = new Map<string, Item>();

  /** Test helper: raw snapshot. */
  dump(): Item[] {
    return [...this.items.values()].map((i) => clone(i));
  }

  async get<T extends Item>(key: Key): Promise<T | undefined> {
    await tick();
    return clone(this.items.get(keyOf(key))) as T | undefined;
  }

  async put(item: Item, condition?: Condition): Promise<void> {
    await tick();
    this.putSync(item, condition);
  }

  async update<T extends Item>(key: Key, update: Update, condition?: Condition): Promise<T> {
    await tick();
    return clone(this.updateSync(key, update, condition)) as T;
  }

  async delete(key: Key, condition?: Condition): Promise<void> {
    await tick();
    this.deleteSync(key, condition);
  }

  async query<T extends Item>(q: QueryInput): Promise<QueryOutput<T>> {
    await tick();
    const { pk: pkAttr, sk: skAttr } = INDEX_KEYS[q.index ?? 'TABLE'];
    const forward = q.forward !== false;
    const sorted = [...this.items.values()]
      .filter((i) => i[pkAttr] === q.pk && (q.index ? i[skAttr] !== undefined : true) && matchesSk(i[skAttr], q.sk))
      .sort((a, b) => {
        const x = String(a[skAttr]);
        const y = String(b[skAttr]);
        const c = x < y ? -1 : x > y ? 1 : keyOf(a) < keyOf(b) ? -1 : 1;
        return forward ? c : -c;
      });
    let start = 0;
    if (q.cursor) {
      const idx = sorted.findIndex((i) => i.PK === q.cursor?.PK && i.SK === q.cursor?.SK);
      start = idx + 1;
    }
    const limit = q.limit ?? Number.MAX_SAFE_INTEGER;
    const page = sorted.slice(start, start + limit);
    const items = page.filter((i) => !q.filter || evaluateCondition(q.filter, i)).map((i) => clone(i)) as T[];
    const more = start + page.length < sorted.length;
    const last = page[page.length - 1];
    return more && last ? { items, cursor: { PK: last.PK, SK: last.SK } } : { items };
  }

  async queryAll<T extends Item>(q: Omit<QueryInput, 'cursor' | 'limit'>): Promise<T[]> {
    const out: T[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.query<T>({ ...q, cursor, limit: 100 });
      out.push(...page.items);
      cursor = page.cursor;
    } while (cursor);
    return out;
  }

  async batchGet<T extends Item>(keys: Key[]): Promise<T[]> {
    await tick();
    return keys.map((k) => this.items.get(keyOf(k))).filter((i): i is Item => !!i).map((i) => clone(i)) as T[];
  }

  async transact(ops: WriteOp[]): Promise<void> {
    await tick();
    if (ops.length === 0) return;
    if (ops.length > 100) throw new Error('Transaction exceeds 100 items');
    const seen = new Set<string>();
    for (const op of ops) {
      const key = op.op === 'put' ? keyOf(op.item) : keyOf(op.key);
      if (seen.has(key)) throw new Error('Transaction request cannot include multiple operations on one item');
      seen.add(key);
      const existing = this.items.get(key);
      if (op.condition && !evaluateCondition(op.condition, existing)) throw new ConditionFailedError();
    }
    for (const op of ops) {
      if (op.op === 'put') this.putSync(op.item);
      else if (op.op === 'update') this.updateSync(op.key, op.update);
      else this.deleteSync(op.key);
    }
  }

  private putSync(item: Item, condition?: Condition) {
    const k = keyOf(item);
    if (condition && !evaluateCondition(condition, this.items.get(k))) throw new ConditionFailedError();
    this.items.set(k, clone(item));
  }

  private updateSync(key: Key, update: Update, condition?: Condition): Item {
    const k = keyOf(key);
    const existing = this.items.get(k);
    if (condition && !evaluateCondition(condition, existing)) throw new ConditionFailedError();
    const next = applyUpdate(existing, key, update);
    this.items.set(k, next);
    return next;
  }

  private deleteSync(key: Key, condition?: Condition) {
    const k = keyOf(key);
    if (condition && !evaluateCondition(condition, this.items.get(k))) throw new ConditionFailedError();
    this.items.delete(k);
  }
}
