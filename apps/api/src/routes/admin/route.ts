import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import { AdminSearchUserPayloadSchema, AdminSearchUserQuerySchema } from './schema';

/**
 * Admin: Search user by email
 * Only accessible by admin users
 */
export const adminSearchUserRoute = createRoute({
  method: 'get',
  path: '/admin/users/search',
  tags: ['admin'],
  summary: 'Search user by email (admin only)',
  description: 'Search for a user by their email address. Only accessible by admin users.',
  request: {
    query: AdminSearchUserQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'User found',
      content: {
        'application/json': {
          schema: createApiResponseSchema(AdminSearchUserPayloadSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
