import {
  computeSettlement, formatCents, selectPayers,
  type FinalizeResult, type Settlement, type SettlementInput, type SettlementResult,
} from '@badmintonsmash/shared';
import type { Deps } from '../deps';
import { conflict, notFound } from '../errors';
import { domainEvent } from '../notify/publisher';
import { eventKey, signupKey } from '../repo/keys';
import { ConditionFailedError, cond, type WriteOp } from '../repo/store';
import { assertHost } from './permissions';

async function loadForSettlement(deps: Deps, eventId: string, userId: string) {
  const event = await deps.events.get(eventId, true);
  if (!event) throw notFound('Event');
  assertHost(event, userId);
  return event;
}

export async function previewSettlement(deps: Deps, eventId: string, userId: string, input: SettlementInput): Promise<SettlementResult> {
  await loadForSettlement(deps, eventId, userId);
  const roster = await deps.signups.listByEvent(eventId);
  const payerIds = selectPayers(roster, input.payers, input.includeLateCancels);
  return computeSettlement({ ...input, payerIds });
}

export async function getSettlement(deps: Deps, eventId: string, userId: string): Promise<Settlement | null> {
  const event = await loadForSettlement(deps, eventId, userId);
  return event.settlement ?? null;
}

/** Design §7: compute shares, write amounts to payers (keeping already-paid amounts), notify payers. */
export async function finalizeSettlement(deps: Deps, eventId: string, userId: string, input: SettlementInput): Promise<FinalizeResult> {
  const event = await loadForSettlement(deps, eventId, userId);
  if (!['open', 'closed', 'completed'].includes(event.status)) throw conflict(`Cannot settle a ${event.status} event`);
  const now = deps.now();
  if (Date.parse(event.startsAt) > now.getTime()) throw conflict('Settlement opens once the event has started');
  const roster = await deps.signups.listByEvent(eventId, true);
  const payerIds = selectPayers(roster, input.payers, input.includeLateCancels);
  if (payerIds.length === 0) throw conflict('No payers selected');
  const result = computeSettlement({ ...input, payerIds });
  const nowIso = now.toISOString();
  const currency = event.fee.currency;
  const warnings: string[] = [];
  const signupOps: WriteOp[] = [];
  for (const s of roster) {
    const amount = result.amounts[s.userId];
    if (amount !== undefined) {
      if (s.paymentStatus === 'paid') {
        if (s.amountOwedCents !== amount) {
          warnings.push(`${s.displayName} already paid ${formatCents(s.amountOwedCents ?? 0, currency)}; the new share is ${formatCents(amount, currency)}.`);
        }
        continue;
      }
      signupOps.push({
        op: 'update',
        key: signupKey(eventId, s.userId),
        update: { set: { amountOwedCents: amount, paymentStatus: s.paymentStatus === 'waived' ? 'waived' : 'unpaid', updatedAt: nowIso } },
      });
    } else if (s.amountOwedCents !== undefined && s.paymentStatus !== 'paid') {
      signupOps.push({
        op: 'update',
        key: signupKey(eventId, s.userId),
        update: { set: { amountOwedCents: undefined, paymentStatus: undefined, claimedPaidAt: undefined, updatedAt: nowIso } },
      });
    }
  }
  const settlement: Settlement = {
    ...input,
    ...result,
    finalizedAt: nowIso,
    version: (event.settlement?.version ?? 0) + 1,
  };
  const eventOp: WriteOp = {
    op: 'update',
    key: eventKey(eventId),
    update: { set: { settlement, updatedAt: nowIso }, add: { version: 1 } },
    condition: cond.eq('version', event.version),
  };
  const batches: WriteOp[][] = [[eventOp, ...signupOps.slice(0, 99)]];
  for (let i = 99; i < signupOps.length; i += 100) batches.push(signupOps.slice(i, i + 100));
  try {
    for (const batch of batches) await deps.store.transact(batch);
  } catch (err) {
    if (err instanceof ConditionFailedError) throw conflict('The event changed, please try again');
    throw err;
  }
  await deps.publisher.publish(
    domainEvent({
      type: 'fee.finalized',
      eventId,
      userIds: payerIds,
      eventVersion: event.version + 1,
      dedupeSuffix: settlement.version,
      payload: { amounts: result.amounts, perPlayerCents: result.perPlayerCents, totalCents: result.totalCents },
      now,
    }),
  );
  return { settlement, warnings };
}
