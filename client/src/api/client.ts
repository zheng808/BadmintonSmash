import type { ApiError, ErrorCode } from '@badmintonsmash/shared';

import { getAccessToken } from '@/auth/auth';
import { env } from '@/lib/env';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode | 'network_error',
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function isApiError(e: unknown, code?: ApiClientError['code']): e is ApiClientError {
  return e instanceof ApiClientError && (code === undefined || e.code === code);
}

let devUserId: string | undefined;
export function setDevUserHeader(id: string | undefined): void {
  devUserId = id;
}

let onUnauthorized: (() => void) | undefined;
export function setUnauthorizedHandler(fn: (() => void) | undefined): void {
  onUnauthorized = fn;
}

async function authHeaders(): Promise<Record<string, string>> {
  if (env.devAuth) {
    const id = devUserId ?? env.devUser;
    return { 'x-dev-user': id, 'x-dev-email': `${id}@dev.local` };
  }
  const token = await getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const url = `${env.apiBase}${path.startsWith('/') ? path : `/${path}`}`;
  const headers: Record<string, string> = { accept: 'application/json', ...(await authHeaders()) };
  if (body !== undefined) headers['content-type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    throw new ApiClientError(0, 'network_error', 'Could not reach the server.', e);
  }

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
  }

  if (!res.ok) {
    const envelope = (json ?? {}) as Partial<ApiError>;
    const code = envelope.error?.code ?? (res.status === 401 ? 'unauthorized' : 'internal_error');
    const message = envelope.error?.message ?? `Request failed (${res.status})`;
    if (res.status === 401 && !env.devAuth) onUnauthorized?.();
    throw new ApiClientError(res.status, code, message, envelope.error?.details);
  }
  return json as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string, body?: unknown) => request<T>('DELETE', path, body),
};

export function queryString(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter((kv): kv is [string, string | number] => kv[1] !== undefined && kv[1] !== '');
  if (entries.length === 0) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}
