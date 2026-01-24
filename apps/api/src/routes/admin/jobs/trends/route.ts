import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createApiResponseSchema, createProtectedRouteResponses } from '@/core';

import {
  DiscoverTrendsRequestSchema,
  DiscoverTrendsResponseSchema,
} from './schema';

/**
 * Admin: Discover trending topics for automated jobs
 */
export const discoverTrendsRoute = createRoute({
  method: 'post',
  path: '/admin/jobs/trends/discover',
  tags: ['admin-jobs'],
  summary: 'Discover trending topics (admin only)',
  description: 'Search social media for trending topics and generate discussion prompts with suggested round counts.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: DiscoverTrendsRequestSchema,
        },
      },
    },
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'Trends discovered successfully',
      content: {
        'application/json': {
          schema: createApiResponseSchema(DiscoverTrendsResponseSchema),
        },
      },
    },
    ...createProtectedRouteResponses(),
  },
});
