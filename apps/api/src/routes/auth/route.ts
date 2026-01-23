import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import { ClearOwnCachePayloadSchema, SecureMePayloadSchema } from './schema';

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

/**
 * Clear own server-side caches
 * Any authenticated user can clear their own caches (for logout/session change)
 */
export const clearOwnCacheRoute = createRoute({
  method: 'post',
  path: '/auth/clear-cache',
  tags: ['auth'],
  summary: 'Clear own server-side caches',
  description: 'Clears all server-side KV caches for the current user. Use before logout to ensure clean state for next login.',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Cache cleared successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(ClearOwnCachePayloadSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
