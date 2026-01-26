import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import { AdminClearUserCacheBodySchema, AdminClearUserCachePayloadSchema, AdminSearchUserPayloadSchema, AdminSearchUserQuerySchema } from './schema';

/**
 * Admin: Search users by name or email
 * Only accessible by admin users
 */
export const adminSearchUserRoute = createRoute({
  description: 'Search for users by partial name or email match. Requires minimum 3 characters. Only accessible by admin users.',
  method: 'get',
  path: '/admin/users/search',
  request: {
    query: AdminSearchUserQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(AdminSearchUserPayloadSchema),
        },
      },
      description: 'Matching users found',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Search users by name or email (admin only)',
  tags: ['admin'],
});

/**
 * Admin: Clear all caches for a user
 * Used during impersonation to ensure fresh data
 */
export const adminClearUserCacheRoute = createRoute({
  description: 'Invalidates all server-side KV caches for a user. Used during impersonation to ensure fresh data.',
  method: 'post',
  path: '/admin/users/clear-cache',
  request: {
    body: {
      content: {
        'application/json': {
          schema: AdminClearUserCacheBodySchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(AdminClearUserCachePayloadSchema),
        },
      },
      description: 'Cache cleared successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Clear all server caches for a user (admin only)',
  tags: ['admin'],
});
