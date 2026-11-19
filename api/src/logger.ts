import { Logger } from '@aws-lambda-powertools/logger';
import type { LogLevel } from '@aws-lambda-powertools/logger/types';

export type AppLogger = Logger;

export function createLogger(serviceName: string, logLevel: string): Logger {
  return new Logger({ serviceName, logLevel: logLevel as LogLevel });
}
