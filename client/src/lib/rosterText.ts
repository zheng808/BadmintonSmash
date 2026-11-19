/**
 * Plain-text roster for pasting into chat (WeChat "接龙" style). Pure; no React.
 *
 * Example output:
 *   Thursday drop-in
 *   Thu, Dec 4, 7:00 p.m. – 9:00 p.m. PST · Richmond Oval
 *
 *   1. Alice
 *   2. Bob
 *
 *   候补 / Waitlist:
 *   1. Carol
 */
export interface RosterTextInput {
  title: string;
  dateLine: string;
  venueLine?: string;
  confirmed: readonly string[];
  waitlist: readonly string[];
  /** Defaults to the bilingual "候补 / Waitlist:" header. */
  waitlistHeader?: string;
  /** Optional trailing line, e.g. the share link. */
  footer?: string;
}

export function buildRosterText(input: RosterTextInput): string {
  const lines: string[] = [input.title.trim()];
  const where = [input.dateLine.trim(), input.venueLine?.trim()].filter((s): s is string => !!s).join(' · ');
  if (where) lines.push(where);
  lines.push('');
  if (input.confirmed.length === 0) {
    lines.push('1.');
  } else {
    input.confirmed.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
  }
  if (input.waitlist.length > 0) {
    lines.push('', input.waitlistHeader ?? '候补 / Waitlist:');
    input.waitlist.forEach((name, i) => lines.push(`${i + 1}. ${name}`));
  }
  if (input.footer) lines.push('', input.footer);
  return lines.join('\n');
}
