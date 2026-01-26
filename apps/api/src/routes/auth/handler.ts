import type { RouteHandler } from '@hono/zod-openapi';

import { invalidateAllUserCaches } from '@/common/cache-utils';
import { createHandler, Responses } from '@/core';
import { getDbAsync } from '@/db';
import type { ApiEnv } from '@/types';

import type { clearOwnCacheRoute, secureMeRoute } from './route';

/**
 * Handler for secure /auth/me endpoint
 * Returns current authenticated user information
 * Following Better Auth patterns for user data retrieval
 */
export const secureMeHandler: RouteHandler<typeof secureMeRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'getMe',
  },
  async (c) => {
    // Get user from Better Auth session context (guaranteed non-null with auth: 'session')
    const { user } = c.auth();

    // Return user object directly - matches SecureMePayloadSchema shape
    return Responses.ok(c, {
      createdAt: user.createdAt,
      email: user.email,
      emailVerified: user.emailVerified,
      id: user.id,
      image: user.image,
      name: user.name,
      updatedAt: user.updatedAt,
    });
  },
);

/**
 * Handler for /auth/clear-cache endpoint
 * Clears all server-side KV caches for current user
 * Use before logout to ensure clean state for next login
 */
export const clearOwnCacheHandler: RouteHandler<typeof clearOwnCacheRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'clearOwnCache',
  },
  async (c) => {
    const { user } = c.auth();
    const db = await getDbAsync();

    await invalidateAllUserCaches(db, user.id);

    return Responses.ok(c, { cleared: true });
  },
);
