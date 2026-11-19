/** Conversions between ISO UTC instants and `datetime-local` wall-clock strings in an IANA time zone. */

function partsIn(date: Date, tz: string): Record<string, number> {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const out: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value);
  return out;
}

/** Offset of `tz` from UTC at `date`, in milliseconds. */
function offsetMs(date: Date, tz: string): number {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.year ?? 1970, (p.month ?? 1) - 1, p.day ?? 1, (p.hour ?? 0) % 24, p.minute ?? 0, p.second ?? 0);
  return asUtc - date.getTime();
}

/** `YYYY-MM-DDTHH:mm` wall-clock time in `tz` -> ISO UTC string. */
export function zonedLocalToIso(local: string, tz: string): string | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) return undefined;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  let utc = naive - offsetMs(new Date(naive), tz);
  const second = offsetMs(new Date(utc), tz);
  if (naive - second !== utc) utc = naive - second; // DST transition edge
  const d = new Date(utc);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/** ISO UTC string -> `YYYY-MM-DDTHH:mm` wall-clock time in `tz` for a datetime-local input. */
export function isoToZonedLocal(iso: string | undefined, tz: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = partsIn(d, tz);
  const pad = (n: number | undefined) => String(n ?? 0).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad((p.hour ?? 0) % 24)}:${pad(p.minute)}`;
}

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Vancouver';
}

/** Next full hour at least `minHoursAhead` from now, as ISO. */
export function nextRoundHourIso(minHoursAhead: number): string {
  const d = new Date(Date.now() + minHoursAhead * 3_600_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

export function addHoursIso(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}
