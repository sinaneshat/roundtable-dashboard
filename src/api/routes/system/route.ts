import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { StandardApiResponses } from '@/api/core/response-schemas';

import { ClearCacheResponseSchema, DetailedHealthResponseSchema, HealthResponseSchema } from './schema';

export const healthRoute = createRoute({
  method: 'get',
  path: '/health',
  tags: ['system'],
  summary: 'Basic health check',
  description: 'Basic health check endpoint for monitoring',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Basic health check',
      content: {
        'application/json': { schema: HealthResponseSchema },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const detailedHealthRoute = createRoute({
  method: 'get',
  path: '/health/detailed',
  tags: ['system'],
  summary: 'Detailed health check',
  description: 'Detailed health check with environment and dependencies',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Detailed health check with environment and dependencies',
      content: {
        'application/json': { schema: DetailedHealthResponseSchema },
      },
    },
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: {
      description: 'Service unavailable - health check failed',
      content: {
        'application/json': { schema: DetailedHealthResponseSchema },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});

export const clearCacheRoute = createRoute({
  method: 'get',
  path: '/cache/clear',
  tags: ['system'],
  summary: 'Clear all backend caches',
  description: 'Clears all backend API caches including KV cache and all cache tags',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Cache cleared successfully',
      content: {
        'application/json': { schema: ClearCacheResponseSchema },
      },
    },
    ...StandardApiResponses.BAD_REQUEST,
    ...StandardApiResponses.INTERNAL_SERVER_ERROR,
  },
});
