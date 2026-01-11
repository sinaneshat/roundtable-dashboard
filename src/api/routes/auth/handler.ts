import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import type { ApiEnv } from '@/api/types';

import type { secureMeRoute } from './route';

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
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  },
);
