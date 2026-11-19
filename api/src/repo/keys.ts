import type { Key } from './store';

export const userKey = (userId: string): Key => ({ PK: `USER#${userId}`, SK: 'PROFILE' });
export const eventKey = (eventId: string): Key => ({ PK: `EVENT#${eventId}`, SK: 'META' });
export const signupKey = (eventId: string, userId: string): Key => ({ PK: `EVENT#${eventId}`, SK: `SIGNUP#${userId}` });
export const notifKey = (dedupeKey: string): Key => ({ PK: `NOTIF#${dedupeKey}`, SK: 'SENT' });

export const SIGNUP_SK_PREFIX = 'SIGNUP#';

export function eventIndexKeys(e: { hostId: string; startsAt: string; eventId: string; status: string; visibility: string }) {
  return {
    GSI1PK: `HOST#${e.hostId}`,
    GSI1SK: `${e.startsAt}#${e.eventId}`,
    GSI2PK: `STATUS#${e.status}`,
    GSI2SK: `${e.visibility}#${e.startsAt}#${e.eventId}`,
  };
}

export function signupIndexKeys(s: { userId: string; startsAt: string; eventId: string }) {
  return { GSI1PK: `USER#${s.userId}`, GSI1SK: `${s.startsAt}#${s.eventId}` };
}

export const hostPk = (hostId: string) => `HOST#${hostId}`;
export const userSignupsPk = (userId: string) => `USER#${userId}`;
export const statusPk = (status: string) => `STATUS#${status}`;
