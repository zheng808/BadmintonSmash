import { isApiError } from '@/api/client';
import { t } from '@/i18n';

interface Issue {
  path?: PropertyKey[];
  message: string;
}

/** zod issues -> { fieldName: message } keyed by the first path segment. */
export function issuesToFieldErrors(issues: Issue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = String(issue.path?.[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function errorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (e.code === 'validation_error' && Array.isArray(e.details)) {
      const first = (e.details as Issue[])[0];
      if (first) return `${String(first.path?.join('.') ?? '')}: ${first.message}`.replace(/^: /, '');
    }
    return e.message;
  }
  if (e instanceof Error && e.message) return e.message;
  return t().common.somethingWrong;
}
