import { Profile } from '@badmintonsmash/shared';
import { userKey } from './keys';
import { cond, type Item, type Store, type Update } from './store';

export class UsersRepo {
  constructor(private readonly store: Store) {}

  async get(userId: string): Promise<Profile | undefined> {
    const item = await this.store.get(userKey(userId));
    return item ? Profile.parse(item) : undefined;
  }

  async create(profile: Profile): Promise<void> {
    await this.store.put(this.toItem(profile), cond.notExists('PK'));
  }

  async update(userId: string, update: Update): Promise<Profile> {
    const item = await this.store.update(userKey(userId), update, cond.exists('PK'));
    return Profile.parse(item);
  }

  async batchGet(userIds: string[]): Promise<Map<string, Profile>> {
    const unique = [...new Set(userIds)];
    const items = unique.length ? await this.store.batchGet(unique.map(userKey)) : [];
    return new Map(items.map((i) => {
      const p = Profile.parse(i);
      return [p.userId, p];
    }));
  }

  async delete(userId: string): Promise<void> {
    await this.store.delete(userKey(userId));
  }

  private toItem(p: Profile): Item {
    return { ...userKey(p.userId), type: 'USER', ...p };
  }
}
