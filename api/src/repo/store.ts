/**
 * Narrow storage interface over DynamoDB. All conditions and updates use top-level attribute
 * names only, so both the real DynamoDB implementation and the in-memory test implementation
 * share one unambiguous semantics.
 */
export interface Key {
  PK: string;
  SK: string;
}

export type Item = Key & Record<string, unknown>;

export type Condition =
  | { kind: 'attribute_not_exists'; path: string }
  | { kind: 'attribute_exists'; path: string }
  | { kind: 'eq'; path: string; value: unknown }
  | { kind: 'ne'; path: string; value: unknown }
  | { kind: 'lt'; path: string; value: number | string }
  | { kind: 'lte'; path: string; value: number | string }
  | { kind: 'gt'; path: string; value: number | string }
  | { kind: 'gte'; path: string; value: number | string }
  /** path < otherPath (both attributes on the same item) */
  | { kind: 'lt_attr'; path: string; other: string }
  | { kind: 'gte_attr'; path: string; other: string }
  | { kind: 'in'; path: string; values: unknown[] }
  | { kind: 'and'; conditions: Condition[] }
  | { kind: 'or'; conditions: Condition[] };

export const cond = {
  notExists: (path: string): Condition => ({ kind: 'attribute_not_exists', path }),
  exists: (path: string): Condition => ({ kind: 'attribute_exists', path }),
  eq: (path: string, value: unknown): Condition => ({ kind: 'eq', path, value }),
  ne: (path: string, value: unknown): Condition => ({ kind: 'ne', path, value }),
  lt: (path: string, value: number | string): Condition => ({ kind: 'lt', path, value }),
  lte: (path: string, value: number | string): Condition => ({ kind: 'lte', path, value }),
  gt: (path: string, value: number | string): Condition => ({ kind: 'gt', path, value }),
  gte: (path: string, value: number | string): Condition => ({ kind: 'gte', path, value }),
  ltAttr: (path: string, other: string): Condition => ({ kind: 'lt_attr', path, other }),
  gteAttr: (path: string, other: string): Condition => ({ kind: 'gte_attr', path, other }),
  in: (path: string, values: unknown[]): Condition => ({ kind: 'in', path, values }),
  and: (...conditions: Condition[]): Condition => ({ kind: 'and', conditions }),
  or: (...conditions: Condition[]): Condition => ({ kind: 'or', conditions }),
};

export interface Update {
  set?: Record<string, unknown>;
  /** Numeric increments (negative to decrement). */
  add?: Record<string, number>;
  remove?: string[];
}

export type WriteOp =
  | { op: 'put'; item: Item; condition?: Condition }
  | { op: 'update'; key: Key; update: Update; condition?: Condition }
  | { op: 'delete'; key: Key; condition?: Condition };

export type IndexName = 'GSI1' | 'GSI2';

export type SortKeyCondition =
  | { beginsWith: string }
  | { between: [string, string] }
  | { gte: string }
  | { gt: string }
  | { lt: string }
  | { lte: string };

export interface QueryInput {
  index?: IndexName;
  pk: string;
  sk?: SortKeyCondition;
  /** Ascending by sort key when true (default). */
  forward?: boolean;
  limit?: number;
  cursor?: Record<string, unknown>;
  filter?: Condition;
  consistent?: boolean;
}

export interface QueryOutput<T> {
  items: T[];
  cursor?: Record<string, unknown>;
}

export class ConditionFailedError extends Error {
  constructor(message = 'Conditional check failed') {
    super(message);
    this.name = 'ConditionFailedError';
  }
}

export interface Store {
  get<T extends Item>(key: Key, consistent?: boolean): Promise<T | undefined>;
  put(item: Item, condition?: Condition): Promise<void>;
  /** Returns the full item after the update. */
  update<T extends Item>(key: Key, update: Update, condition?: Condition): Promise<T>;
  delete(key: Key, condition?: Condition): Promise<void>;
  query<T extends Item>(q: QueryInput): Promise<QueryOutput<T>>;
  /** Fetch all pages of a query. */
  queryAll<T extends Item>(q: Omit<QueryInput, 'cursor' | 'limit'>): Promise<T[]>;
  batchGet<T extends Item>(keys: Key[]): Promise<T[]>;
  /** All-or-nothing; throws ConditionFailedError when any condition fails. Max 100 ops. */
  transact(ops: WriteOp[]): Promise<void>;
}

export const INDEX_KEYS: Record<IndexName | 'TABLE', { pk: string; sk: string }> = {
  TABLE: { pk: 'PK', sk: 'SK' },
  GSI1: { pk: 'GSI1PK', sk: 'GSI1SK' },
  GSI2: { pk: 'GSI2PK', sk: 'GSI2SK' },
};
