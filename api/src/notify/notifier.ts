import { DomainEvent, Signup, waitlistPosition } from '@badmintonsmash/shared';
import type { SQSBatchResponse, SQSEvent, SQSRecord } from 'aws-lambda';
import type { Deps } from '../deps';
import { notifKey } from '../repo/keys';
import { ConditionFailedError, cond } from '../repo/store';
import type { EmailSender } from './sender';
import { ESSENTIAL_TYPES, renderEmail } from './templates';

const SEVEN_DAYS = 7 * 24 * 3600;

async function processRecord(deps: Deps, sender: EmailSender, record: SQSRecord): Promise<void> {
  const msg = DomainEvent.parse(JSON.parse(record.body));
  const event = await deps.events.get(msg.eventId);
  if (!event) {
    deps.logger.warn('notification for missing event dropped', { eventId: msg.eventId, type: msg.type });
    return;
  }
  const host = await deps.users.get(event.hostId);
  if (!host) {
    deps.logger.warn('notification for event without host profile dropped', { eventId: msg.eventId });
    return;
  }
  const roster = await deps.signups.listByEvent(event.eventId);
  const profiles = await deps.users.batchGet(msg.userIds);
  const essential = ESSENTIAL_TYPES.has(msg.type);
  const failures: string[] = [];
  for (const userId of msg.userIds) {
    const recipient = profiles.get(userId);
    if (!recipient) continue;
    if (!essential && recipient.notificationPrefs.emailNonEssential === false) continue;
    const key = notifKey(`${msg.dedupeKey}:${userId}`);
    const nowSec = Math.floor(deps.now().getTime() / 1000);
    try {
      await deps.store.put({ ...key, type: 'NOTIF', sentAt: deps.now().toISOString(), ttl: nowSec + SEVEN_DAYS }, cond.notExists('PK'));
    } catch (err) {
      if (err instanceof ConditionFailedError) continue; // already sent
      throw err;
    }
    const mine = roster.find((s) => s.userId === userId);
    const signup = mine ? Signup.parse(mine) : undefined;
    const position = mine?.status === 'waitlisted' ? waitlistPosition(roster, userId) : undefined;
    const email = renderEmail(msg.type, {
      event,
      recipient,
      host,
      ...(signup ? { signup } : {}),
      ...(position !== undefined ? { position } : {}),
      ...(msg.payload ? { payload: msg.payload } : {}),
      appWebUrl: deps.config.appWebUrl,
    });
    try {
      await sender.send({ to: recipient.email, ...email });
      deps.logger.info('email sent', { type: msg.type, eventId: event.eventId, userId });
    } catch (err) {
      await deps.store.delete(key).catch(() => undefined); // allow the retry to resend
      deps.logger.error('email send failed', { err, type: msg.type, eventId: event.eventId, userId });
      failures.push(userId);
    }
  }
  if (failures.length) throw new Error(`Failed to send ${msg.type} to ${failures.length} recipient(s)`);
}

/** SQS batch handler with partial batch failure reporting. */
export function createNotifierHandler(deps: Deps, sender: EmailSender) {
  return async (event: SQSEvent): Promise<SQSBatchResponse> => {
    const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
    for (const record of event.Records) {
      try {
        await processRecord(deps, sender, record);
      } catch (err) {
        deps.logger.error('notification record failed', { err, messageId: record.messageId });
        batchItemFailures.push({ itemIdentifier: record.messageId });
      }
    }
    return { batchItemFailures };
  };
}
