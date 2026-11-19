import type { MoneySummary, OwedItem, OwedToMeItem } from '@badmintonsmash/shared';
import type { Deps } from '../deps';

export async function getMoney(deps: Deps, userId: string): Promise<MoneySummary> {
  const nowIso = deps.now().toISOString();
  const signups = (await deps.signups.listAllByUser(userId)).filter((s) => (s.amountOwedCents ?? 0) > 0);
  const events = await deps.events.batchGet(signups.map((s) => s.eventId));
  const hosts = await deps.users.batchGet([...events.values()].map((e) => e.hostId));
  const owed: OwedItem[] = [];
  for (const s of signups) {
    const e = events.get(s.eventId);
    if (!e || e.status === 'cancelled') continue;
    const host = hosts.get(e.hostId);
    owed.push({
      eventId: e.eventId,
      title: e.title,
      startsAt: e.startsAt,
      timezone: e.timezone,
      hostId: e.hostId,
      hostDisplayName: e.hostDisplayName,
      paymentHandles: host?.paymentHandles ?? {},
      currency: e.fee.currency,
      amountOwedCents: s.amountOwedCents ?? 0,
      paymentStatus: s.paymentStatus ?? 'unpaid',
      ...(s.claimedPaidAt ? { claimedPaidAt: s.claimedPaidAt } : {}),
    });
  }
  owed.sort((a, b) => (a.startsAt < b.startsAt ? 1 : -1));

  const hosted = await deps.events.listByHost(userId, { scope: 'all', nowIso, limit: 50 });
  const owedToMe: OwedToMeItem[] = [];
  for (const e of hosted.items) {
    if (e.status === 'cancelled' || e.status === 'draft') continue;
    if (!e.settlement && e.fee.mode !== 'fixed') continue;
    const roster = await deps.signups.listByEvent(e.eventId);
    let collected = 0, outstanding = 0, waived = 0, paidCount = 0, unpaidCount = 0;
    for (const s of roster) {
      const amt = s.amountOwedCents ?? 0;
      if (amt <= 0) continue;
      if (s.paymentStatus === 'paid') { collected += amt; paidCount++; }
      else if (s.paymentStatus === 'waived') waived += amt;
      else { outstanding += amt; unpaidCount++; }
    }
    if (collected + outstanding + waived === 0) continue;
    owedToMe.push({
      eventId: e.eventId, title: e.title, startsAt: e.startsAt, timezone: e.timezone, currency: e.fee.currency,
      collectedCents: collected, outstandingCents: outstanding, waivedCents: waived, paidCount, unpaidCount,
    });
  }
  return { owed, owedToMe };
}
