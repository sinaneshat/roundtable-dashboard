import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { mapStatusCode } from '@/core';
import type { Session, User } from '@/lib/auth/types';
import type { ApiEnv } from '@/types';

// Lazy load auth to reduce worker startup CPU time
let authModule: typeof import('@/lib/auth/server') | null = null;

async function getAuth() {
  if (!authModule) {
    authModule = await import('@/lib/auth/server');
  }
  return authModule.auth;
}

/**
 * Shared authentication helper - extracts session from request headers
 * and sets context variables. Used by both attachSession and requireSession.
 *
 * Supports two authentication methods:
 * 1. Session cookies (browser/web app authentication + queue consumers via forwarded cookies)
 * 2. API keys via x-api-key header (programmatic access)
 *
 * Queue consumers now pass the user's session cookie in the Cookie header,
 * so they're authenticated through the standard Better Auth flow.
 *
 * With sessionForAPIKeys enabled, Better Auth automatically validates API keys
 * and creates sessions when getSession() is called with x-api-key header.
 * @see https://www.better-auth.com/docs/plugins/api-key#sessions-from-api-keys
 */
async function authenticateSession(c: Context<ApiEnv>) {
  // Lazy load auth module to reduce worker startup CPU time
  const auth = await getAuth();

  // Better Auth's getSession() automatically handles:
  // - Session cookies (standard web authentication + queue consumers)
  // - API keys (when sessionForAPIKeys: true is enabled)
  const sessionData = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  // Better Auth inferred types (Session, User from auth.$Infer.Session) provide
  // direct type compatibility. Nullish coalescing ensures optional fields
  // are normalized to null for consistent downstream handling.
  const session: Session | null = sessionData?.session
    ? {
        ...sessionData.session,
        ipAddress: sessionData.session.ipAddress ?? null,
        userAgent: sessionData.session.userAgent ?? null,
      }
    : null;

  const user: User | null = sessionData?.user
    ? {
        ...sessionData.user,
        image: sessionData.user.image ?? null,
      }
    : null;

  c.set('session', session);
  c.set('user', user);
  c.set('requestId', c.req.header('x-request-id') || crypto.randomUUID());

  return { session, user };
}

// Attach session if present; does not enforce authentication
// Following Better Auth best practices for middleware integration
export const attachSession = createMiddleware<ApiEnv>(async (c, next) => {
  try {
    // Use shared helper to authenticate session
    await authenticateSession(c);
  } catch {
    // Log error but don't throw - allow unauthenticated requests to proceed
    // Provide more specific error context for debugging
    c.set('session', null);
    c.set('user', null);
  }
  return await next();
});

// Require an authenticated session using Better Auth
// Following Better Auth recommended patterns for protected route middleware
export const requireSession = createMiddleware<ApiEnv>(async (c, next) => {
  try {
    // Use shared helper to authenticate session
    const { session, user } = await authenticateSession(c);

    if (!user || !session) {
      // Return standardized unauthorized response following Better Auth patterns
      // Indicate both authentication methods are accepted
      const res = new Response(JSON.stringify({
        code: HttpStatusCodes.UNAUTHORIZED,
        details: 'Valid session cookie or API key required to access this resource',
        message: 'Authentication required',
      }), {
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Session realm="api", ApiKey realm="api"',
        },
        status: HttpStatusCodes.UNAUTHORIZED,
      });
      throw new HTTPException(mapStatusCode(HttpStatusCodes.UNAUTHORIZED), { res });
    }

    return next();
  } catch (e) {
    if (e instanceof HTTPException) {
      throw e; // Re-throw HTTP exceptions as-is
    }

    // Handle unexpected authentication errors gracefully
    const res = new Response(JSON.stringify({
      code: HttpStatusCodes.UNAUTHORIZED,
      details: 'Session or API key validation error',
      message: 'Authentication failed',
    }), {
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Session realm="api", ApiKey realm="api"',
      },
      status: HttpStatusCodes.UNAUTHORIZED,
    });
    throw new HTTPException(mapStatusCode(HttpStatusCodes.UNAUTHORIZED), { cause: e, res });
  }
});
