import type { Context } from 'hono';
import { csrf } from 'hono/csrf';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { mapStatusCode } from '@/api/core';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import { auth } from '@/lib/auth/server';
import type { Session, User } from '@/lib/auth/types';
import { getAllowedOriginsFromContext } from '@/lib/config/base-urls';

/** Internal auth header name for queue-triggered calls */
const INTERNAL_AUTH_HEADER = 'x-internal-queue-secret';

/** User ID header for internal queue calls */
const USER_ID_HEADER = 'x-queue-user-id';

/**
 * Authenticate internal queue calls
 *
 * Queue consumers call API endpoints with special headers instead of session cookies.
 * This validates the internal secret and loads the user from DB.
 *
 * @returns User if internal auth succeeds, null otherwise
 */
async function authenticateInternalQueue(c: Context<ApiEnv>): Promise<User | null> {
  const internalSecret = c.req.header(INTERNAL_AUTH_HEADER);
  const userId = c.req.header(USER_ID_HEADER);

  // Both headers required
  if (!internalSecret || !userId) {
    return null;
  }

  // Validate secret
  const expectedSecret = c.env?.INTERNAL_QUEUE_SECRET;
  if (!expectedSecret || internalSecret !== expectedSecret) {
    // Security: Don't log the actual secret values
    return null;
  }

  // Load user from DB
  const db = await getDbAsync();
  const userData = await db.query.user.findFirst({
    where: (user, { eq }) => eq(user.id, userId),
  });

  if (!userData) {
    console.error(`[InternalAuth] User not found: ${userId}`);
    return null;
  }

  // Return user with nullable fields normalized
  return {
    id: userData.id,
    name: userData.name,
    email: userData.email,
    emailVerified: userData.emailVerified,
    image: userData.image ?? null,
    createdAt: userData.createdAt,
    updatedAt: userData.updatedAt,
  };
}

/**
 * Shared authentication helper - extracts session from request headers
 * and sets context variables. Used by both attachSession and requireSession.
 *
 * Supports three authentication methods:
 * 1. Internal queue auth (X-Internal-Queue-Secret header) - for queue consumers
 * 2. Session cookies (browser/web app authentication)
 * 3. API keys via x-api-key header (programmatic access)
 *
 * With sessionForAPIKeys enabled, Better Auth automatically validates API keys
 * and creates sessions when getSession() is called with x-api-key header.
 * @see https://www.better-auth.com/docs/plugins/api-key#sessions-from-api-keys
 */
async function authenticateSession(c: Context<ApiEnv>): Promise<{
  session: Session | null;
  user: User | null;
}> {
  // 1. Check for internal queue authentication first
  // Queue consumers call with X-Internal-Queue-Secret instead of session cookies
  const internalUser = await authenticateInternalQueue(c);
  if (internalUser) {
    // Create a synthetic session for internal queue calls
    const syntheticSession: Session = {
      id: `queue-${Date.now()}`,
      userId: internalUser.id,
      expiresAt: new Date(Date.now() + 60000), // 1 minute (short-lived for queue processing)
      createdAt: new Date(),
      updatedAt: new Date(),
      token: 'internal-queue',
      ipAddress: null,
      userAgent: 'internal-queue-consumer',
    };

    c.set('session', syntheticSession);
    c.set('user', internalUser);
    c.set('requestId', c.req.header('x-request-id') || crypto.randomUUID());

    return { session: syntheticSession, user: internalUser };
  }

  // 2. Better Auth's getSession() automatically handles both:
  // - Session cookies (standard web authentication)
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
  // Build CSRF middleware inline to avoid re-export
  const allowedOrigins = getAllowedOriginsFromContext(c);
  const csrfMiddleware = csrf({
    origin: (origin) => {
      if (!origin)
        return true;
      return allowedOrigins.includes(origin);
    },
  });

  return csrfMiddleware(c, async () => {
    await requireSession(c, next);
  });
});
