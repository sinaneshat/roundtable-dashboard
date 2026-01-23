import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import { AdminSearchUserPayloadSchema, AdminSearchUserQuerySchema } from './schema';

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
