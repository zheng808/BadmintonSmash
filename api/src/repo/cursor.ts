import { AppError } from '../errors';

export function encodeCursor(key: Record<string, unknown> | undefined): string | undefined {
  if (!key) return undefined;
  return Buffer.from(JSON.stringify(key), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string | undefined): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  throw new AppError('validation_error', 'Invalid cursor');
}
