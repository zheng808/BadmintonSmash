import { DomainEventType, type Event, type Profile } from '@badmintonsmash/shared';
import { describe, expect, it } from 'vitest';
import { ESSENTIAL_TYPES, formatHandles, renderEmail } from '../src/notify/templates';

const event: Event = {
  eventId: 'abcdefghijkl', hostId: 'h', hostDisplayName: 'Alex', title: 'Thursday <drop-in>', venue: { name: 'Richmond Oval', address: '6111 River Rd' },
  startsAt: '2026-12-04T03:00:00.000Z', endsAt: '2026-12-04T05:00:00.000Z', timezone: 'America/Vancouver', capacity: 12, visibility: 'link', status: 'open',
  fee: { mode: 'settle_after', currency: 'CAD' }, confirmedCount: 12, waitlistCount: 1, version: 3, createdAt: '2026-11-18T18:00:00.000Z', updatedAt: '2026-11-18T18:00:00.000Z',
};
const profile = (userId: string, displayName: string): Profile => ({
  userId, email: `${userId}@test.dev`, displayName, paymentHandles: {}, notificationPrefs: { emailNonEssential: true }, eventDefaults: {},
  createdAt: '2026-11-18T18:00:00.000Z', updatedAt: '2026-11-18T18:00:00.000Z',
});
const host = { ...profile('h', 'Alex'), paymentHandles: { etransfer: 'alex@test.dev', wechat: 'alex-wx' } };

describe('email templates', () => {
  for (const type of DomainEventType.options) {
    it(`${type} renders English then Chinese with a link`, () => {
      const out = renderEmail(type, { event, recipient: profile('p', 'Pat'), host, position: 2, payload: { amounts: { p: 1040 }, reason: 'Rain', amountOwedCents: 1040 }, appWebUrl: 'https://smash.test/' });
      expect(out.subject).toContain(' / ');
      expect(out.subject).toMatch(/[一-鿿]/);
      expect(out.text).toContain('Pat');
      expect(out.text).toMatch(/[一-鿿]/);
      expect(out.text.indexOf('Hi Pat') === -1 || out.text.indexOf('Hi Pat') < out.text.search(/[一-鿿]/)).toBe(true);
      expect(out.text).toContain('https://smash.test/e/abcdefghijkl');
      expect(out.html).toContain('&lt;drop-in&gt;');
      expect(out.html).not.toContain('<drop-in>');
    });
  }

  it('fee.finalized lists the amount and payment handles in both languages', () => {
    const out = renderEmail('fee.finalized', { event, recipient: profile('p', 'Pat'), host, payload: { amounts: { p: 1135 } }, appWebUrl: 'https://smash.test' });
    expect(out.subject).toBe('You owe $11.35 for Thursday <drop-in> / 待付款 $11.35：Thursday <drop-in>');
    expect(out.text).toContain('e-Transfer: alex@test.dev');
    expect(out.text).toContain('微信支付: alex-wx');
    expect(formatHandles({ alipay: 'x', other: 'cash ok' }, 'en')).toEqual(['Alipay: x', 'Other: cash ok']);
  });

  it('waitlisted and cancelled reflect position and reason', () => {
    const w = renderEmail('signup.waitlisted', { event, recipient: profile('p', 'Pat'), host, position: 3, appWebUrl: 'https://smash.test' });
    expect(w.subject).toContain('Waitlisted #3');
    const c = renderEmail('event.cancelled', { event, recipient: profile('p', 'Pat'), host, payload: { reason: 'Rain' }, appWebUrl: 'https://smash.test' });
    expect(c.text).toContain('Reason: Rain');
    expect(c.text).toContain('原因：Rain');
  });

  it('declares the essential set', () => {
    expect([...ESSENTIAL_TYPES].sort()).toEqual(['event.cancelled', 'event.updated', 'fee.finalized', 'signup.promoted']);
  });
});
