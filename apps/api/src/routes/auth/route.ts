import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import { SecureMePayloadSchema } from './schema';

export const secureMeRoute = createRoute({
  method: 'get',
  path: '/auth/me',
  tags: ['auth'],
  summary: 'Get current authenticated user',
  description: 'Returns information about the currently authenticated user',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Current user information retrieved successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(SecureMePayloadSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
