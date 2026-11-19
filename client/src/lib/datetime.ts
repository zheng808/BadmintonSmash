/** Wall-clock <-> UTC conversion for an IANA time zone, using only Intl (no date library). */
export interface WallTime {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
}

function partsIn(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

/** Offset (ms) of `timeZone` from UTC at `date`. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function utcToWall(iso: string, timeZone: string): WallTime {
  const p = partsIn(new Date(iso), timeZone);
  return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute };
}

export function wallToUtc(w: WallTime, timeZone: string): Date {
  const guess = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  const first = guess - tzOffsetMs(new Date(guess), timeZone);
  const second = guess - tzOffsetMs(new Date(first), timeZone);
  return new Date(second);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DDTHH:mm" as used by <input type="datetime-local">. */
export function wallToInputValue(w: WallTime): string {
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

export function inputValueToWall(s: string): WallTime | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s);
  if (!m) return undefined;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]) };
}

export function isoToInputValue(iso: string | undefined, timeZone: string): string {
  return iso ? wallToInputValue(utcToWall(iso, timeZone)) : '';
}

export function inputValueToIso(s: string, timeZone: string): string | undefined {
  const w = inputValueToWall(s);
  return w ? wallToUtc(w, timeZone).toISOString() : undefined;
}

/** Interpret a Date's *local* components as wall time in `timeZone` (native pickers work in device-local time). */
export function localDateToIso(d: Date, timeZone: string): string {
  return wallToUtc(
    { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours(), minute: d.getMinutes() },
    timeZone,
  ).toISOString();
}

/** Inverse of localDateToIso: a Date whose local components equal the wall time in `timeZone`. */
export function isoToLocalDate(iso: string, timeZone: string): Date {
  const w = utcToWall(iso, timeZone);
  return new Date(w.year, w.month - 1, w.day, w.hour, w.minute);
}

export function nextRoundHour(from = new Date(), hoursAhead = 24): Date {
  const d = new Date(from.getTime() + hoursAhead * 3_600_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d;
}

export function addHoursIso(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}
