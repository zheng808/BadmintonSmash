import { z } from 'zod';

export const ErrorCode = z.enum([
  'validation_error',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'signup_window_closed',
  'event_not_open',
  'rate_limited',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const HTTP_STATUS_BY_CODE: Record<ErrorCode, number> = {
  validation_error: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  signup_window_closed: 409,
  event_not_open: 409,
  rate_limited: 429,
  internal_error: 500,
};

export function Paginated<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().optional() });
}
export type Paginated<T> = { items: T[]; nextCursor?: string };

export const HealthResponse = z.object({ ok: z.literal(true), version: z.string() });
export type HealthResponse = z.infer<typeof HealthResponse>;
