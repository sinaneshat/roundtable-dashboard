/**
 * System Routes
 *
 * Health check and cache management endpoints for system monitoring
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createPublicRouteResponses } from '@/api/core';

import { BenchmarkResponseSchema, ClearCacheResponseSchema, DetailedHealthResponseSchema, HealthResponseSchema } from './schema';

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
    ...createPublicRouteResponses(),
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
    ...createPublicRouteResponses(),
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
    ...createPublicRouteResponses(),
  },
});

export const benchmarkRoute = createRoute({
  method: 'get',
  path: '/benchmark',
  tags: ['system'],
  summary: 'Run database query benchmarks',
  description: 'Benchmarks common database queries to measure performance. Uses performance.now() for timing.',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Benchmark results',
      content: {
        'application/json': { schema: BenchmarkResponseSchema },
      },
    },
    ...createPublicRouteResponses(),
  },
});
