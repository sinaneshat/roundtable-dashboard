import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import * as HttpStatusPhrases from 'stoker/http-status-phrases';

import { ApiErrorResponseSchema, createApiResponseSchema } from '@/api/core/schemas';

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
    [HttpStatusCodes.UNAUTHORIZED]: {
      description: HttpStatusPhrases.UNAUTHORIZED,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
    [HttpStatusCodes.INTERNAL_SERVER_ERROR]: {
      description: HttpStatusPhrases.INTERNAL_SERVER_ERROR,
      content: {
        'application/json': {
          schema: ApiErrorResponseSchema,
        },
      },
    },
  },
});
