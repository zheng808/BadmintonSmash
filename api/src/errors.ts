import { HTTP_STATUS_BY_CODE, type ErrorCode } from '@badmintonsmash/shared';

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = HTTP_STATUS_BY_CODE[code];
  }
}

export const notFound = (what = 'Resource') => new AppError('not_found', `${what} not found`);
export const forbidden = (message = 'You are not allowed to do that') => new AppError('forbidden', message);
export const conflict = (message: string, details?: unknown) => new AppError('conflict', message, details);
