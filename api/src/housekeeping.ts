import type { Deps } from './deps';
import { promote } from './domain/promote';
import { ConditionFailedError } from './repo/store';

export interface HousekeepingResult {
  completed: string[];
  promoted: Record<string, string[]>;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Hourly job: auto-complete events 24 h after they end and re-run waitlist promotion as a
 * safety net for events that have free spots and a waitlist (design §10, §16).
 */
export async function runHousekeeping(deps: Deps): Promise<HousekeepingResult> {
  const result: HousekeepingResult = { completed: [], promoted: {} };
  const now = deps.now();
  for (const status of ['open', 'closed'] as const) {
    const events = await deps.events.listByStatus(status);
    for (const e of events) {
      if (Date.parse(e.endsAt) < now.getTime() - DAY_MS) {
        try {
          await deps.events.patch(e, { status: 'completed' }, now.toISOString());
          result.completed.push(e.eventId);
        } catch (err) {
          if (!(err instanceof ConditionFailedError)) throw err;
        }
        continue;
      }
      if (e.waitlistCount > 0 && e.confirmedCount < e.capacity) {
        const ids = await promote(deps, e.eventId);
        if (ids.length) result.promoted[e.eventId] = ids;
      }
    }
  }
  deps.logger.info('housekeeping done', { completed: result.completed.length, promotedEvents: Object.keys(result.promoted).length });
  return result;
}
