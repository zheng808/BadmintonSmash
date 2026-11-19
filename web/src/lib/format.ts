import type { Currency } from '@badmintonsmash/shared';

import { intlLocale, type UiLocale } from '@/i18n';

export function formatCents(cents: number, currency: Currency, locale?: UiLocale): string {
  return new Intl.NumberFormat(intlLocale(locale), { style: 'currency', currency, minimumFractionDigits: 2 }).format(cents / 100);
}

/** "Thu, Nov 20, 7:00 PM" in the event's time zone, with the zone shown when it differs from the viewer's. */
export function formatDateTime(iso: string, timezone: string, locale?: UiLocale): string {
  const viewerTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: timezone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(viewerTz !== timezone ? { timeZoneName: 'short' } : {}),
  }).format(new Date(iso));
}

export function formatTime(iso: string, timezone: string, locale?: UiLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

export function formatDate(iso: string, timezone: string, locale?: UiLocale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { timeZone: timezone, weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' }).format(
    new Date(iso),
  );
}

/** "Thu, Nov 20 · 7:00–9:00 PM" */
export function formatRange(startIso: string, endIso: string, timezone: string, locale?: UiLocale): string {
  return `${formatDate(startIso, timezone, locale)} · ${formatTime(startIso, timezone, locale)}–${formatTime(endIso, timezone, locale)}`;
}

export function parseMoney(input: string): number | undefined {
  const s = input.trim().replace(/[,$￥¥\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return undefined;
  return Math.round(Number(s) * 100);
}

export function centsToInput(cents: number | undefined): string {
  return cents === undefined ? '' : (cents / 100).toFixed(2);
}
