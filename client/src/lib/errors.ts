import { ApiClientError } from '@/api/client';
import { t } from '@/i18n';

/** Human-readable message for any thrown value. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiClientError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return t().common.somethingWrong;
}

/** zod issues -> { fieldName: message } using the first path segment. */
export function issuesToFieldErrors(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? '_');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
