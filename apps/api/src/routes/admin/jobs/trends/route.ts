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
  description: 'Search social media for trending topics and generate discussion prompts with suggested round counts.',
  method: 'post',
  path: '/admin/jobs/trends/discover',
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
      content: {
        'application/json': {
          schema: createApiResponseSchema(DiscoverTrendsResponseSchema),
        },
      },
      description: 'Trends discovered successfully',
    },
    ...createProtectedRouteResponses(),
  },
  summary: 'Discover trending topics (admin only)',
  tags: ['admin-jobs'],
});
