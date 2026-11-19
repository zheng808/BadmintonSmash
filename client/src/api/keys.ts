import type { EventScope } from '@badmintonsmash/shared';

export const keys = {
  me: ['me'] as const,
  money: ['money'] as const,
  events: (scope: EventScope) => ['events', scope] as const,
  allEvents: ['events'] as const,
  publicEvents: (q: string) => ['publicEvents', q] as const,
  allPublicEvents: ['publicEvents'] as const,
  event: (id: string) => ['event', id] as const,
  settlement: (id: string) => ['settlement', id] as const,
};
