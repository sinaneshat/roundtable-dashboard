/**
 * System Routes
 *
 * Health check and cache management endpoints for system monitoring
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createPublicRouteResponses } from '@/core';

import { DetailedHealthResponseSchema, HealthResponseSchema } from './schema';

export const healthRoute = createRoute({
  description: 'Basic health check endpoint for monitoring',
  method: 'get',
  path: '/health',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: HealthResponseSchema },
      },
      description: 'Basic health check',
    },
    ...createPublicRouteResponses(),
  },
  summary: 'Basic health check',
  tags: ['system'],
});

export const detailedHealthRoute = createRoute({
  description: 'Detailed health check with environment and dependencies',
  method: 'get',
  path: '/health/detailed',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: DetailedHealthResponseSchema },
      },
      description: 'Detailed health check with environment and dependencies',
    },
    [HttpStatusCodes.SERVICE_UNAVAILABLE]: {
      content: {
        'application/json': { schema: DetailedHealthResponseSchema },
      },
      description: 'Service unavailable - health check failed',
    },
    ...createPublicRouteResponses(),
  },
  summary: 'Detailed health check',
  tags: ['system'],
});
