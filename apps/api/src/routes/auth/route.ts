import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import { ClearOwnCachePayloadSchema, SecureMePayloadSchema } from './schema';

export const secureMeRoute = createRoute({
  description: 'Returns information about the currently authenticated user',
  method: 'get',
  path: '/auth/me',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(SecureMePayloadSchema),
        },
      },
      description: 'Current user information retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get current authenticated user',
  tags: ['auth'],
});

/**
 * Clear own server-side caches
 * Any authenticated user can clear their own caches (for logout/session change)
 */
export const clearOwnCacheRoute = createRoute({
  description: 'Clears all server-side KV caches for the current user. Use before logout to ensure clean state for next login.',
  method: 'post',
  path: '/auth/clear-cache',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': {
          schema: createApiResponseSchema(ClearOwnCachePayloadSchema),
        },
      },
      description: 'Cache cleared successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Clear own server-side caches',
  tags: ['auth'],
});
