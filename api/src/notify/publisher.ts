import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { DomainEvent, DomainEventType } from '@badmintonsmash/shared';
import type { AppLogger } from '../logger';

export interface Publisher {
  publish(event: DomainEvent): Promise<void>;
}

export class SqsPublisher implements Publisher {
  constructor(
    private readonly client: SQSClient,
    private readonly queueUrl: string,
  ) {}

  async publish(event: DomainEvent): Promise<void> {
    await this.client.send(new SendMessageCommand({ QueueUrl: this.queueUrl, MessageBody: JSON.stringify(event) }));
  }
}

/** Collects events in memory (tests, local dev). */
export class MemoryPublisher implements Publisher {
  readonly events: DomainEvent[] = [];
  constructor(private readonly logger?: AppLogger) {}

  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
    this.logger?.info('domain event', { type: event.type, eventId: event.eventId, userIds: event.userIds });
  }

  ofType(type: DomainEventType): DomainEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  clear(): void {
    this.events.length = 0;
  }
}

export function domainEvent(args: {
  type: DomainEventType;
  eventId: string;
  userIds: string[];
  eventVersion: number;
  /** Something unique per occurrence (signup seq, settlement version, timestamp). */
  dedupeSuffix: string | number;
  payload?: Record<string, unknown>;
  now: Date;
}): DomainEvent {
  const who = args.userIds.length === 1 ? args.userIds[0] : 'all';
  return {
    type: args.type,
    eventId: args.eventId,
    userIds: args.userIds,
    eventVersion: args.eventVersion,
    dedupeKey: `${args.type}:${args.eventId}:${who}:${args.dedupeSuffix}`,
    ...(args.payload ? { payload: args.payload } : {}),
    occurredAt: args.now.toISOString(),
  };
}
