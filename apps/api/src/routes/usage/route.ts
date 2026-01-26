/**
 * Usage Routes
 *
 * User usage statistics and quota information endpoints
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createProtectedRouteResponses } from '@/core';

import { UsageStatsResponseSchema } from './schema';

/**
 * ✅ SINGLE SOURCE OF TRUTH - Get user usage statistics
 *
 * This is the ONLY usage/quota endpoint needed.
 * Returns ALL quota information for threads, messages, summaries, and custom roles.
 * Frontend derives quota blocking from: remaining === 0 or used >= limit
 */
export const getUserUsageStatsRoute = createRoute({
  description: 'Retrieve comprehensive usage statistics with quota limits for all resource types',
  method: 'get',
  path: '/usage/stats',
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'application/json': { schema: UsageStatsResponseSchema },
      },
      description: 'Usage statistics retrieved successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Get user usage statistics',
  tags: ['usage'],
});
