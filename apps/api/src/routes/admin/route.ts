import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import { AdminClearUserCacheBodySchema, AdminClearUserCachePayloadSchema, AdminSearchUserPayloadSchema, AdminSearchUserQuerySchema } from './schema';

/**
 * Admin: Search users by name or email
 * Only accessible by admin users
 */
export const adminSearchUserRoute = createRoute({
  method: 'get',
  path: '/admin/users/search',
  tags: ['admin'],
  summary: 'Search users by name or email (admin only)',
  description: 'Search for users by partial name or email match. Requires minimum 3 characters. Only accessible by admin users.',
  request: {
    query: AdminSearchUserQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Matching users found',
      content: {
        'application/json': {
          schema: createApiResponseSchema(AdminSearchUserPayloadSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});

/**
 * Admin: Clear all caches for a user
 * Used during impersonation to ensure fresh data
 */
export const adminClearUserCacheRoute = createRoute({
  method: 'post',
  path: '/admin/users/clear-cache',
  tags: ['admin'],
  summary: 'Clear all server caches for a user (admin only)',
  description: 'Invalidates all server-side KV caches for a user. Used during impersonation to ensure fresh data.',
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
      description: 'Cache cleared successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(AdminClearUserCachePayloadSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
