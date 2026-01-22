import type { RouteHandler } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';

import { createError } from '@/common/error-handling';
import { createHandler, Responses } from '@/core';
import { getDbAsync } from '@/db';
import * as tables from '@/db/tables';
import type { ApiEnv } from '@/types';

import type { adminSearchUserRoute } from './route';
import { AdminSearchUserQuerySchema } from './schema';

/**
 * Handler for admin user search endpoint
 * Searches for a user by email address (admin only)
 */
export const adminSearchUserHandler: RouteHandler<typeof adminSearchUserRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateQuery: AdminSearchUserQuerySchema,
    operationName: 'adminSearchUser',
  },
  async (c) => {
    const { user } = c.auth();
    const { email } = c.validated.query;

    // Check admin role
    if (user.role !== 'admin') {
      throw createError.unauthorized('Admin access required', {
        errorType: 'authorization',
        resource: 'admin',
        userId: user.id,
      });
    }

    const db = await getDbAsync();

    const foundUser = await db.query.user.findFirst({
      where: eq(tables.user.email, email),
      columns: {
        id: true,
        email: true,
        name: true,
        image: true,
      },
    });

    if (!foundUser) {
      return Responses.notFound(c, 'User not found');
    }

    return Responses.ok(c, {
      id: foundUser.id,
      email: foundUser.email,
      name: foundUser.name,
      image: foundUser.image,
    });
  },
);
