import type { Event, Signup, SignupPublic } from '@badmintonsmash/shared';

import { t } from '@/i18n';
import { formatRange } from '@/lib/format';

type RosterEntry = Signup | SignupPublic;

export function splitRoster<T extends RosterEntry>(roster: T[]): { confirmed: T[]; waitlisted: T[] } {
  const bySeq = (a: T, b: T) => a.seq - b.seq;
  return {
    confirmed: roster.filter((s) => s.status === 'confirmed').sort(bySeq),
    waitlisted: roster.filter((s) => s.status === 'waitlisted').sort(bySeq),
  };
}

/** 接龙-style text for pasting into a WeChat group. */
export function rosterText(event: Pick<Event, 'title' | 'startsAt' | 'endsAt' | 'timezone' | 'venue' | 'capacity'>, roster: RosterEntry[], shareUrl: string): string {
  const { confirmed, waitlisted } = splitRoster(roster);
  const lines: string[] = [event.title, `${formatRange(event.startsAt, event.endsAt, event.timezone)} @ ${event.venue.name}`, ''];
  confirmed.forEach((s, i) => lines.push(`${i + 1}. ${s.displayName}`));
  for (let i = confirmed.length; i < event.capacity; i += 1) lines.push(`${i + 1}. `);
  if (waitlisted.length > 0) {
    lines.push('', `— ${t().share.rosterWaitlist} —`);
    waitlisted.forEach((s, i) => lines.push(`${i + 1}. ${s.displayName}`));
  }
  lines.push('', t().share.rosterFooter(shareUrl));
  return lines.join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
