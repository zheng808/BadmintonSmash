import type { EventStatus } from '@badmintonsmash/shared';
import { conflict, forbidden } from '../errors';

/** The single place that answers "may user U act as host on event E". */
export function isHost(event: { hostId: string }, userId: string): boolean {
  return event.hostId === userId;
}

export function assertHost(event: { hostId: string }, userId: string): void {
  if (!isHost(event, userId)) throw forbidden('Only the host can do that');
}

const MUTABLE: EventStatus[] = ['draft', 'open', 'closed'];

/** Events that are completed or cancelled cannot change (except settlement/payments). */
export function assertMutable(event: { status: EventStatus }): void {
  if (!MUTABLE.includes(event.status)) throw conflict(`Event is ${event.status} and cannot be changed`);
}

export const normalizeIso = (s: string): string => new Date(s).toISOString();
