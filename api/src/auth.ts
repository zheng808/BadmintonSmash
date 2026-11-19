import type { MiddlewareHandler } from 'hono';
import type { LambdaContext } from 'hono/aws-lambda';

/** The parts of the API Gateway HTTP API (v2) event we read. */
export interface GatewayEvent {
  requestContext?: { authorizer?: { jwt?: { claims: Record<string, unknown> } } };
}
import type { Deps } from './deps';
import { AppError } from './errors';

export type AppEnv = {
  Bindings: { event?: GatewayEvent; context?: LambdaContext };
  Variables: { userId: string; requestId: string; devEmail?: string };
};

const PUBLIC_PREFIXES = ['/v1/health', '/v1/public'];

/**
 * Identity comes from the API Gateway JWT authorizer (claims.sub). With DEV_AUTH=1 the
 * `x-dev-user` header is accepted instead (local dev and tests only; never set in AWS).
 */
export function authMiddleware(deps: Deps): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const path = c.req.path;
    if (PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return next();
    const claims = c.env?.event?.requestContext?.authorizer?.jwt?.claims;
    const sub = claims?.sub;
    let userId = typeof sub === 'string' && sub.length > 0 ? sub : undefined;
    if (!userId && deps.config.devAuth) {
      userId = c.req.header('x-dev-user') || undefined;
      const email = c.req.header('x-dev-email');
      if (email) c.set('devEmail', email);
    }
    if (!userId) throw new AppError('unauthorized', 'Missing or invalid credentials');
    c.set('userId', userId);
    await next();
  };
}
