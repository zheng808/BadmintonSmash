import type { Currency } from './schemas/common';

const LOCALE: Record<Currency, string> = { CAD: 'en-CA', USD: 'en-US' };

export function formatCents(cents: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALE[currency], { style: 'currency', currency }).format(cents / 100);
}

/** "12.5" -> 1250; rejects negatives and more than 2 decimals. */
export function parseMoneyToCents(text: string): number | undefined {
  const m = /^\s*\$?\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(text);
  if (!m) return undefined;
  const whole = Number(m[1]);
  const frac = m[2] ? Number(m[2].padEnd(2, '0')) : 0;
  return whole * 100 + frac;
}
