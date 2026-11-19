import type { Deps } from '../deps';
import { domainEvent } from '../notify/publisher';
import { eventKey, signupKey } from '../repo/keys';
import { ConditionFailedError, cond } from '../repo/store';

/**
 * Promote waitlisted players (lowest seq first) while spots remain. Every step is a conditional
 * transaction, so a crash mid-loop is harmless: the next call picks up where it stopped (design §5.4).
 */
export async function promote(deps: Deps, eventId: string): Promise<string[]> {
  const promoted: string[] = [];
  for (let i = 0; i < 200; i++) {
    const event = await deps.events.get(eventId, true);
    if (!event || !['open', 'closed'].includes(event.status)) break;
    if (event.confirmedCount >= event.capacity || event.waitlistCount <= 0) break;
    const roster = await deps.signups.listByEvent(eventId, true);
    const next = roster.filter((s) => s.status === 'waitlisted').sort((a, b) => a.seq - b.seq)[0];
    if (!next) break;
    const now = deps.now();
    const nowIso = now.toISOString();
    const fixed = event.fee.mode === 'fixed' ? { amountOwedCents: event.fee.fixedAmountCents ?? 0, paymentStatus: 'unpaid' } : {};
    try {
      await deps.store.transact([
        {
          op: 'update',
          key: signupKey(eventId, next.userId),
          update: { set: { status: 'confirmed', updatedAt: nowIso, ...fixed } },
          condition: cond.eq('status', 'waitlisted'),
        },
        {
          op: 'update',
          key: eventKey(eventId),
          update: { add: { confirmedCount: 1, waitlistCount: -1, version: 1 }, set: { updatedAt: nowIso } },
          condition: cond.and(cond.ltAttr('confirmedCount', 'capacity'), cond.gt('waitlistCount', 0), cond.in('status', ['open', 'closed'])),
        },
      ]);
    } catch (err) {
      if (err instanceof ConditionFailedError) continue;
      throw err;
    }
    promoted.push(next.userId);
    await deps.publisher.publish(
      domainEvent({ type: 'signup.promoted', eventId, userIds: [next.userId], eventVersion: event.version + 1, dedupeSuffix: next.seq, now }),
    );
  }
  return promoted;
}
