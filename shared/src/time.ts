export function formatEventRange(startsAt: string, endsAt: string, timeZone: string, locale = 'en-CA'): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric', timeZone });
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone });
  const zone = new Intl.DateTimeFormat(locale, { timeZoneName: 'short', timeZone })
    .formatToParts(start)
    .find((p) => p.type === 'timeZoneName')?.value;
  const sameDay = day.format(start) === day.format(end);
  const endText = sameDay ? time.format(end) : `${day.format(end)} ${time.format(end)}`;
  return `${day.format(start)}, ${time.format(start)} – ${endText}${zone ? ` ${zone}` : ''}`;
}

export function formatDateTime(iso: string, timeZone: string, locale = 'en-CA'): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone,
  }).format(new Date(iso));
}

export function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
