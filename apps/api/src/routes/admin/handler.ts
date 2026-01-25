import type { RouteHandler } from '@hono/zod-openapi';
import { UserRoles } from '@roundtable/shared';
import { and, like, ne, or, sql } from 'drizzle-orm';

import { invalidateAllUserCaches } from '@/common/cache-utils';
import { createError } from '@/common/error-handling';
import { createHandler, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db/tables';
import type { ApiEnv } from '@/types';

import type { adminClearUserCacheRoute, adminSearchUserRoute } from './route';
import { AdminClearUserCacheBodySchema, AdminSearchUserQuerySchema } from './schema';

/**
 * Handler for admin user search endpoint
 * Searches for users by partial name or email match (admin only)
 */
export const adminSearchUserHandler: RouteHandler<typeof adminSearchUserRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: AdminSearchUserQuerySchema,
    operationName: 'adminSearchUser',
  },
  async (c) => {
    const { user } = c.auth();
    const { q, limit = 5 } = c.validated.query;

    // Check admin role
    if (user.role !== UserRoles.ADMIN) {
      throw createError.unauthorized('Admin access required', {
        errorType: 'authorization',
        resource: 'admin',
        userId: user.id,
      });
    }

    const db = await getDbAsync();
    const searchPattern = `%${q.toLowerCase()}%`;

    // Search by name or email (case-insensitive partial match), excluding current user
    const users = await db.query.user.findMany({
      where: and(
        ne(tables.user.id, user.id),
        or(
          like(sql`lower(${tables.user.email})`, searchPattern),
          like(sql`lower(${tables.user.name})`, searchPattern),
        ),
      ),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
      },
      limit,
      orderBy: (user, { asc }) => [asc(user.name)],
    });

    return Responses.ok(c, {
      users,
      total: users.length,
    });
  },
);

/**
 * Handler for admin clear user cache endpoint
 * Clears all server-side caches for a user (for impersonation)
 */
export const adminClearUserCacheHandler: RouteHandler<typeof adminClearUserCacheRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: AdminClearUserCacheBodySchema,
    operationName: 'adminClearUserCache',
  },
  async (c) => {
    const { user } = c.auth();
    const { userId } = c.validated.body;

    // Check admin role
    if (user.role !== UserRoles.ADMIN) {
      throw createError.unauthorized('Admin access required', {
        errorType: 'authorization',
        resource: 'admin',
        userId: user.id,
      });
    }

    const db = await getDbAsync();
    await invalidateAllUserCaches(db, userId);

    return Responses.ok(c, { cleared: true });
  },
);
