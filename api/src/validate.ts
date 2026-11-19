import type { Context } from 'hono';
import type { ZodType, z } from 'zod';
import { AppError } from './errors';

/** Parse the JSON body (empty body = {}) against a schema; 400 validation_error on failure. */
export async function parseBody<S extends ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  const text = await c.req.text();
  let raw: unknown = {};
  if (text.trim().length) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new AppError('validation_error', 'Body must be valid JSON');
    }
  }
  const result = schema.safeParse(raw);
  if (!result.success) throw new AppError('validation_error', 'Invalid request body', result.error.issues);
  return result.data;
}

export function parseQuery<S extends ZodType>(c: Context, schema: S): z.output<S> {
  const result = schema.safeParse(c.req.query());
  if (!result.success) throw new AppError('validation_error', 'Invalid query parameters', result.error.issues);
  return result.data;
}
