import { describe, expect, it } from 'vitest';
import { ExprBuilder, compileCondition, compileUpdate } from '../src/repo/dynamo-store';
import { MemoryStore, evaluateCondition } from '../src/repo/memory-store';
import { ConditionFailedError, cond } from '../src/repo/store';

describe('DynamoDB expression compiler', () => {
  it('compiles nested conditions with path-vs-path comparisons and IN', () => {
    const b = new ExprBuilder();
    const expr = compileCondition(
      cond.and(cond.eq('status', 'open'), cond.ltAttr('confirmedCount', 'capacity'), cond.in('status', ['open', 'closed']), cond.notExists('PK')),
      b,
    );
    expect(expr).toBe('(#n0 = :v0 AND #n1 < #n2 AND #n0 IN (:v1, :v2) AND attribute_not_exists(#n3))');
    expect(b.names).toEqual({ '#n0': 'status', '#n1': 'confirmedCount', '#n2': 'capacity', '#n3': 'PK' });
    expect(b.values).toEqual({ ':v0': 'open', ':v1': 'open', ':v2': 'closed' });
  });

  it('compiles SET / ADD / REMOVE and treats undefined SET values as REMOVE', () => {
    const b = new ExprBuilder();
    const expr = compileUpdate({ set: { title: 'x', note: undefined }, add: { version: 1, confirmedCount: -1 }, remove: ['paidAt'] }, b);
    expect(expr).toBe('SET #n0 = :v0 ADD #n1 :v1, #n2 :v2 REMOVE #n3, #n4');
    expect(b.names['#n4']).toBe('note');
    expect(() => compileUpdate({}, new ExprBuilder())).toThrow();
  });
});

describe('evaluateCondition', () => {
  const item = { PK: 'a', SK: 'b', status: 'open', confirmedCount: 11, capacity: 12 };
  it('treats missing attributes as failing comparisons', () => {
    expect(evaluateCondition(cond.eq('missing', 1), item)).toBe(false);
    expect(evaluateCondition(cond.ne('missing', 1), item)).toBe(false);
    expect(evaluateCondition(cond.notExists('missing'), item)).toBe(true);
    expect(evaluateCondition(cond.notExists('PK'), undefined)).toBe(true);
  });
  it('compares attributes against each other', () => {
    expect(evaluateCondition(cond.ltAttr('confirmedCount', 'capacity'), item)).toBe(true);
    expect(evaluateCondition(cond.gteAttr('confirmedCount', 'capacity'), item)).toBe(false);
    expect(evaluateCondition(cond.gteAttr('confirmedCount', 'capacity'), { ...item, confirmedCount: 12 })).toBe(true);
  });
});

describe('MemoryStore', () => {
  it('enforces put conditions and atomic transactions', async () => {
    const s = new MemoryStore();
    await s.put({ PK: 'E', SK: 'META', n: 1 }, cond.notExists('PK'));
    await expect(s.put({ PK: 'E', SK: 'META', n: 2 }, cond.notExists('PK'))).rejects.toBeInstanceOf(ConditionFailedError);
    await expect(
      s.transact([
        { op: 'update', key: { PK: 'E', SK: 'META' }, update: { add: { n: 1 } } },
        { op: 'put', item: { PK: 'E', SK: 'X' }, condition: cond.exists('PK') },
      ]),
    ).rejects.toBeInstanceOf(ConditionFailedError);
    expect((await s.get<{ PK: string; SK: string; n: number }>({ PK: 'E', SK: 'META' }))?.n).toBe(1);
    await expect(s.transact([{ op: 'put', item: { PK: 'A', SK: '1' } }, { op: 'put', item: { PK: 'A', SK: '1' } }])).rejects.toThrow(/multiple operations/);
  });

  it('updates create items, ADD on missing attributes starts at zero, undefined removes', async () => {
    const s = new MemoryStore();
    const out = await s.update<{ PK: string; SK: string; c: number; t?: string }>({ PK: 'U', SK: '1' }, { add: { c: 2 }, set: { t: 'x' } });
    expect(out).toEqual({ PK: 'U', SK: '1', c: 2, t: 'x' });
    const out2 = await s.update<{ PK: string; SK: string; c: number; t?: string }>({ PK: 'U', SK: '1' }, { set: { t: undefined } });
    expect(out2.t).toBeUndefined();
  });

  it('queries with sort-key conditions, ordering, filters and pagination', async () => {
    const s = new MemoryStore();
    for (const i of [3, 1, 2, 4]) {
      await s.put({ PK: 'E', SK: `SIGNUP#u${i}`, GSI1PK: 'USER#x', GSI1SK: `2026-0${i}#e${i}`, seq: i });
    }
    await s.put({ PK: 'E', SK: 'META' });
    const roster = await s.query({ pk: 'E', sk: { beginsWith: 'SIGNUP#' } });
    expect(roster.items.map((i) => i.SK)).toEqual(['SIGNUP#u1', 'SIGNUP#u2', 'SIGNUP#u3', 'SIGNUP#u4']);
    const desc = await s.query({ index: 'GSI1', pk: 'USER#x', sk: { lt: '2026-04' }, forward: false, limit: 2 });
    expect(desc.items.map((i) => i.seq)).toEqual([3, 2]);
    expect(desc.cursor).toBeDefined();
    const next = await s.query({ index: 'GSI1', pk: 'USER#x', sk: { lt: '2026-04' }, forward: false, limit: 2, cursor: desc.cursor });
    expect(next.items.map((i) => i.seq)).toEqual([1]);
    expect(next.cursor).toBeUndefined();
    const filtered = await s.query({ pk: 'E', sk: { beginsWith: 'SIGNUP#' }, filter: cond.gte('seq', 3) });
    expect(filtered.items).toHaveLength(2);
    const between = await s.query({ index: 'GSI1', pk: 'USER#x', sk: { between: ['2026-02', '2026-03~'] } });
    expect(between.items.map((i) => i.seq)).toEqual([2, 3]);
  });
});
