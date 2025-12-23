import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import type { z } from 'zod';

import { mapStatusCode } from '@/api/core';
import type { ApiEnv } from '@/api/types';
import type { sessionSelectSchema, userSelectSchema } from '@/db/validation/auth';
import { auth } from '@/lib/auth/server';

import { csrfProtection } from './csrf';

type SelectSession = z.infer<typeof sessionSelectSchema>;
type SelectUser = z.infer<typeof userSelectSchema>;

/**
 * Shared authentication helper - extracts session from request headers
 * and sets context variables. Used by both attachSession and requireSession.
 *
 * Supports two authentication methods following Better Auth patterns:
 * 1. Session cookies (browser/web app authentication)
 * 2. API keys via x-api-key header (programmatic access)
 *
 * With sessionForAPIKeys enabled, Better Auth automatically validates API keys
 * and creates sessions when getSession() is called with x-api-key header.
 * @see https://www.better-auth.com/docs/plugins/api-key#sessions-from-api-keys
 */
async function authenticateSession(c: Context<ApiEnv>): Promise<{
  session: SelectSession | null;
  user: SelectUser | null;
}> {
  // Better Auth's getSession() automatically handles both:
  // - Session cookies (standard web authentication)
  // - API keys (when sessionForAPIKeys: true is enabled)
  const sessionData = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  // Normalize undefined fields to null for proper type safety
  const session = sessionData?.session
    ? {
        ...sessionData.session,
        ipAddress: sessionData.session.ipAddress ?? null,
        userAgent: sessionData.session.userAgent ?? null,
      } as SelectSession
    : null;

  const user = sessionData?.user
    ? {
        ...sessionData.user,
        image: sessionData.user.image ?? null,
      } as SelectUser
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
  return next();
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
        message: 'Authentication required',
        details: 'Valid session cookie or API key required to access this resource',
      }), {
        status: HttpStatusCodes.UNAUTHORIZED,
        headers: {
          'Content-Type': 'application/json',
          'WWW-Authenticate': 'Session realm="api", ApiKey realm="api"',
        },
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
      message: 'Authentication failed',
      details: 'Session or API key validation error',
    }), {
      status: HttpStatusCodes.UNAUTHORIZED,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Session realm="api", ApiKey realm="api"',
      },
    });
    throw new HTTPException(mapStatusCode(HttpStatusCodes.UNAUTHORIZED), { res, cause: e });
  }
});

/**
 * Optional session middleware - attaches session if present, continues if not
 * Use this for routes that support both authenticated and unauthenticated access
 * Handler logic can then check c.var.user to determine access level
 *
 * Example: Public threads (anyone can view if public, only owner can view if private)
 */
export const requireOptionalSession = createMiddleware<ApiEnv>(async (c, next) => {
  try {
    // Use shared helper to authenticate session (same as attachSession)
    await authenticateSession(c);
  } catch {
    // Log error but don't throw - allow unauthenticated requests to proceed
    c.set('session', null);
    c.set('user', null);
  }
  return next();
});

/**
 * Combined middleware for routes with mixed access patterns:
 * - Safe methods (GET, HEAD, OPTIONS): Optional session, no CSRF
 * - Mutation methods (POST, PATCH, PUT, DELETE): Required session + CSRF
 *
 * Use this for routes like /chat/threads/:id where:
 * - GET allows public access (handler checks if thread is public)
 * - PATCH/DELETE require authentication and CSRF protection
 */
export const protectMutations = createMiddleware<ApiEnv>(async (c, next) => {
  const method = c.req.method.toUpperCase();
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(method)) {
    // Safe methods: optional session, no CSRF
    return requireOptionalSession(c, next);
  }

  // Mutation methods: CSRF + required session (chain middlewares properly)
  return csrfProtection(c, async () => {
    await requireSession(c, next);
  });
});
