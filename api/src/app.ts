import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { authMiddleware, type AppEnv } from './auth';
import type { Deps } from './deps';
import { AppError } from './errors';
import { eventRoutes } from './routes/events';
import { meRoutes } from './routes/me';
import { publicRoutes } from './routes/public';
import { settlementRoutes } from './routes/settlement';
import { signupRoutes } from './routes/signups';

export type App = Hono<AppEnv>;

export function createApp(deps: Deps): App {
  const app = new Hono<AppEnv>().basePath('/v1');

  app.use('*', async (c, next) => {
    const requestId = c.env?.context?.awsRequestId ?? c.req.header('x-request-id') ?? randomUUID();
    c.set('requestId', requestId);
    deps.logger.appendKeys({ requestId, path: c.req.path, method: c.req.method });
    try {
      await next();
    } finally {
      c.header('x-request-id', requestId);
      deps.logger.removeKeys(['userId']);
    }
  });

  app.onError((err, c) => {
    const requestId = c.get('requestId');
    if (err instanceof AppError) {
      if (err.status >= 500) deps.logger.error('request failed', { err, requestId });
      return c.json({ error: { code: err.code, message: err.message, ...(err.details !== undefined ? { details: err.details } : {}) } }, err.status as 400);
    }
    deps.logger.error('unhandled error', { err, requestId });
    return c.json({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500);
  });
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Route not found' } }, 404));

  app.get('/health', (c) => c.json({ ok: true as const, version: deps.config.version }));
  app.route('/public', publicRoutes(deps));

  app.use('*', authMiddleware(deps));
  app.use('*', async (c, next) => {
    deps.logger.appendKeys({ userId: c.get('userId') });
    await next();
  });
  app.route('/me', meRoutes(deps));
  app.route('/events', eventRoutes(deps));
  app.route('/events', signupRoutes(deps));
  app.route('/events', settlementRoutes(deps));
  return app;
}
