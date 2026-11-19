import {
  BatchGetCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand,
  TransactWriteCommand, UpdateCommand, type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  ConditionFailedError, INDEX_KEYS, type Condition, type Item, type Key, type QueryInput,
  type QueryOutput, type Store, type Update, type WriteOp,
} from './store';

/** Collects #name / :value placeholders for one expression set. */
export class ExprBuilder {
  readonly names: Record<string, string> = {};
  readonly values: Record<string, unknown> = {};
  private n = 0;
  private v = 0;
  private readonly nameIdx = new Map<string, string>();

  name(path: string): string {
    const existing = this.nameIdx.get(path);
    if (existing) return existing;
    const p = `#n${this.n++}`;
    this.names[p] = path;
    this.nameIdx.set(path, p);
    return p;
  }

  value(v: unknown): string {
    const p = `:v${this.v++}`;
    this.values[p] = v;
    return p;
  }

  attrs(): { ExpressionAttributeNames?: Record<string, string>; ExpressionAttributeValues?: Record<string, unknown> } {
    return {
      ...(Object.keys(this.names).length ? { ExpressionAttributeNames: this.names } : {}),
      ...(Object.keys(this.values).length ? { ExpressionAttributeValues: this.values } : {}),
    };
  }
}

export function compileCondition(c: Condition, b: ExprBuilder): string {
  switch (c.kind) {
    case 'attribute_not_exists':
      return `attribute_not_exists(${b.name(c.path)})`;
    case 'attribute_exists':
      return `attribute_exists(${b.name(c.path)})`;
    case 'eq':
      return `${b.name(c.path)} = ${b.value(c.value)}`;
    case 'ne':
      return `${b.name(c.path)} <> ${b.value(c.value)}`;
    case 'lt':
      return `${b.name(c.path)} < ${b.value(c.value)}`;
    case 'lte':
      return `${b.name(c.path)} <= ${b.value(c.value)}`;
    case 'gt':
      return `${b.name(c.path)} > ${b.value(c.value)}`;
    case 'gte':
      return `${b.name(c.path)} >= ${b.value(c.value)}`;
    case 'lt_attr':
      return `${b.name(c.path)} < ${b.name(c.other)}`;
    case 'gte_attr':
      return `${b.name(c.path)} >= ${b.name(c.other)}`;
    case 'in':
      return `${b.name(c.path)} IN (${c.values.map((v) => b.value(v)).join(', ')})`;
    case 'and':
      return `(${c.conditions.map((x) => compileCondition(x, b)).join(' AND ')})`;
    case 'or':
      return `(${c.conditions.map((x) => compileCondition(x, b)).join(' OR ')})`;
  }
}

export function compileUpdate(u: Update, b: ExprBuilder): string {
  const parts: string[] = [];
  const sets = Object.entries(u.set ?? {}).filter(([, v]) => v !== undefined);
  const removes = [...(u.remove ?? []), ...Object.entries(u.set ?? {}).filter(([, v]) => v === undefined).map(([k]) => k)];
  if (sets.length) parts.push(`SET ${sets.map(([k, v]) => `${b.name(k)} = ${b.value(v)}`).join(', ')}`);
  const adds = Object.entries(u.add ?? {});
  if (adds.length) parts.push(`ADD ${adds.map(([k, n]) => `${b.name(k)} ${b.value(n)}`).join(', ')}`);
  if (removes.length) parts.push(`REMOVE ${removes.map((k) => b.name(k)).join(', ')}`);
  if (!parts.length) throw new Error('Empty update');
  return parts.join(' ');
}

function skExpression(sk: QueryInput['sk'], skName: string, b: ExprBuilder): string | undefined {
  if (!sk) return undefined;
  if ('beginsWith' in sk) return `begins_with(${skName}, ${b.value(sk.beginsWith)})`;
  if ('between' in sk) return `${skName} BETWEEN ${b.value(sk.between[0])} AND ${b.value(sk.between[1])}`;
  if ('gte' in sk) return `${skName} >= ${b.value(sk.gte)}`;
  if ('gt' in sk) return `${skName} > ${b.value(sk.gt)}`;
  if ('lt' in sk) return `${skName} < ${b.value(sk.lt)}`;
  if ('lte' in sk) return `${skName} <= ${b.value(sk.lte)}`;
  return undefined;
}

function isConditionFailure(err: unknown): boolean {
  const e = err as { name?: string; CancellationReasons?: Array<{ Code?: string }> };
  if (e?.name === 'ConditionalCheckFailedException') return true;
  if (e?.name === 'TransactionCanceledException') {
    // TransactionConflict = another transaction touched the item; callers re-read and retry.
    return (e.CancellationReasons ?? []).some((r) => r.Code === 'ConditionalCheckFailed' || r.Code === 'TransactionConflict');
  }
  return false;
}

export function createDocumentClient(opts: { region: string; endpoint?: string }): DynamoDBDocumentClient {
  const base = new DynamoDBClient({ region: opts.region, ...(opts.endpoint ? { endpoint: opts.endpoint } : {}) });
  return DynamoDBDocumentClient.from(base, { marshallOptions: { removeUndefinedValues: true } });
}

export class DynamoStore implements Store {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async get<T extends Item>(key: Key, consistent = false): Promise<T | undefined> {
    const out = await this.doc.send(new GetCommand({ TableName: this.tableName, Key: key, ConsistentRead: consistent }));
    return out.Item as T | undefined;
  }

  async put(item: Item, condition?: Condition): Promise<void> {
    const b = new ExprBuilder();
    const expr = condition ? compileCondition(condition, b) : undefined;
    await this.guard(this.doc.send(new PutCommand({ TableName: this.tableName, Item: item, ConditionExpression: expr, ...b.attrs() })));
  }

  async update<T extends Item>(key: Key, update: Update, condition?: Condition): Promise<T> {
    const b = new ExprBuilder();
    const UpdateExpression = compileUpdate(update, b);
    const ConditionExpression = condition ? compileCondition(condition, b) : undefined;
    const out = await this.guard(
      this.doc.send(new UpdateCommand({ TableName: this.tableName, Key: key, UpdateExpression, ConditionExpression, ReturnValues: 'ALL_NEW', ...b.attrs() })),
    );
    return out.Attributes as T;
  }

  async delete(key: Key, condition?: Condition): Promise<void> {
    const b = new ExprBuilder();
    const expr = condition ? compileCondition(condition, b) : undefined;
    await this.guard(this.doc.send(new DeleteCommand({ TableName: this.tableName, Key: key, ConditionExpression: expr, ...b.attrs() })));
  }

  async query<T extends Item>(q: QueryInput): Promise<QueryOutput<T>> {
    const b = new ExprBuilder();
    const { pk, sk } = INDEX_KEYS[q.index ?? 'TABLE'];
    const parts = [`${b.name(pk)} = ${b.value(q.pk)}`];
    const skExpr = q.sk ? skExpression(q.sk, b.name(sk), b) : undefined;
    if (skExpr) parts.push(skExpr);
    const FilterExpression = q.filter ? compileCondition(q.filter, b) : undefined;
    const out = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: q.index,
        KeyConditionExpression: parts.join(' AND '),
        FilterExpression,
        ScanIndexForward: q.forward !== false,
        Limit: q.limit,
        ExclusiveStartKey: q.cursor,
        ConsistentRead: q.index ? undefined : q.consistent,
        ...b.attrs(),
      }),
    );
    return { items: (out.Items ?? []) as T[], ...(out.LastEvaluatedKey ? { cursor: out.LastEvaluatedKey } : {}) };
  }

  async queryAll<T extends Item>(q: Omit<QueryInput, 'cursor' | 'limit'>): Promise<T[]> {
    const out: T[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const page = await this.query<T>({ ...q, cursor });
      out.push(...page.items);
      cursor = page.cursor;
    } while (cursor);
    return out;
  }

  async batchGet<T extends Item>(keys: Key[]): Promise<T[]> {
    const out: T[] = [];
    for (let i = 0; i < keys.length; i += 100) {
      let pending: Key[] = keys.slice(i, i + 100);
      for (let attempt = 0; pending.length && attempt < 5; attempt++) {
        const res = await this.doc.send(new BatchGetCommand({ RequestItems: { [this.tableName]: { Keys: pending } } }));
        out.push(...((res.Responses?.[this.tableName] ?? []) as T[]));
        pending = (res.UnprocessedKeys?.[this.tableName]?.Keys ?? []) as Key[];
        if (pending.length) await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      }
      if (pending.length) throw new Error('BatchGet left unprocessed keys');
    }
    return out;
  }

  async transact(ops: WriteOp[]): Promise<void> {
    if (ops.length === 0) return;
    if (ops.length > 100) throw new Error('Transaction exceeds 100 items');
    const TransactItems: NonNullable<TransactWriteCommandInput['TransactItems']> = ops.map((op) => {
      const b = new ExprBuilder();
      if (op.op === 'put') {
        const ConditionExpression = op.condition ? compileCondition(op.condition, b) : undefined;
        return { Put: { TableName: this.tableName, Item: op.item, ConditionExpression, ...b.attrs() } };
      }
      if (op.op === 'update') {
        const UpdateExpression = compileUpdate(op.update, b);
        const ConditionExpression = op.condition ? compileCondition(op.condition, b) : undefined;
        return { Update: { TableName: this.tableName, Key: op.key, UpdateExpression, ConditionExpression, ...b.attrs() } };
      }
      const ConditionExpression = op.condition ? compileCondition(op.condition, b) : undefined;
      return { Delete: { TableName: this.tableName, Key: op.key, ConditionExpression, ...b.attrs() } };
    });
    await this.guard(this.doc.send(new TransactWriteCommand({ TransactItems })));
  }

  private async guard<T>(p: Promise<T>): Promise<T> {
    try {
      return await p;
    } catch (err) {
      if (isConditionFailure(err)) throw new ConditionFailedError();
      throw err;
    }
  }
}
