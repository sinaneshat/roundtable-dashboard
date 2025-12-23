import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createProtectedRouteResponses } from '@/api/core';

import {
  UsageStatsResponseSchema,
} from './schema';

/**
 * ✅ SINGLE SOURCE OF TRUTH - Get user usage statistics
 *
 * This is the ONLY usage/quota endpoint needed.
 * Returns ALL quota information for threads, messages, summaries, and custom roles.
 * Frontend derives quota blocking from: remaining === 0 or used >= limit
 */
export const getUserUsageStatsRoute = createRoute({
  method: 'get',
  path: '/usage/stats',
  tags: ['usage'],
  summary: 'Get user usage statistics',
  description: 'Retrieve comprehensive usage statistics with quota limits for all resource types',
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Usage statistics retrieved successfully',
      content: {
        'application/json': { schema: UsageStatsResponseSchema },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
