import { IsoDateTime, Signup } from '@badmintonsmash/shared';
import { z } from 'zod';
import { SIGNUP_SK_PREFIX, signupIndexKeys, signupKey, userSignupsPk } from './keys';
import { scopeToSk, type ListOptions } from './events';
import { type Condition, type Item, type QueryOutput, type Store, type Update } from './store';

/** Stored signup: no email/phone (those are joined from profiles), plus startsAt for the user index. */
export const SignupRecord = Signup.omit({ email: true, phone: true }).extend({ startsAt: IsoDateTime });
export type SignupRecord = z.infer<typeof SignupRecord>;

export class SignupsRepo {
  constructor(private readonly store: Store) {}

  async get(eventId: string, userId: string, consistent = false): Promise<SignupRecord | undefined> {
    const item = await this.store.get(signupKey(eventId, userId), consistent);
    return item ? SignupRecord.parse(item) : undefined;
  }

  async listByEvent(eventId: string, consistent = false): Promise<SignupRecord[]> {
    const items = await this.store.queryAll({ pk: `EVENT#${eventId}`, sk: { beginsWith: SIGNUP_SK_PREFIX }, consistent });
    return items.map((i) => SignupRecord.parse(i));
  }

  async listByUser(userId: string, opts: ListOptions): Promise<QueryOutput<SignupRecord>> {
    const { sk, forward } = scopeToSk(opts.scope, opts.nowIso);
    const out = await this.store.query({ index: 'GSI1', pk: userSignupsPk(userId), sk, forward, limit: opts.limit, cursor: opts.cursor });
    return { items: out.items.map((i) => SignupRecord.parse(i)), ...(out.cursor ? { cursor: out.cursor } : {}) };
  }

  async listAllByUser(userId: string): Promise<SignupRecord[]> {
    const items = await this.store.queryAll({ index: 'GSI1', pk: userSignupsPk(userId) });
    return items.map((i) => SignupRecord.parse(i));
  }

  async update(eventId: string, userId: string, update: Update, condition?: Condition): Promise<SignupRecord> {
    const item = await this.store.update(signupKey(eventId, userId), update, condition);
    return SignupRecord.parse(item);
  }

  toItem(rec: SignupRecord): Item {
    return { ...signupKey(rec.eventId, rec.userId), ...signupIndexKeys(rec), type: 'SIGNUP', ...rec };
  }
}
