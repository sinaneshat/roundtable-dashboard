import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/core';
import { requireAdmin } from '@/lib/auth';
import { discoverTrends } from '@/services/jobs/trend-discovery.service';
import type { ApiEnv } from '@/types';

import type { discoverTrendsRoute } from './route';
import { DiscoverTrendsRequestSchema } from './schema';

/**
 * Discover trending topics (admin only)
 */
export const discoverTrendsHandler: RouteHandler<typeof discoverTrendsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    operationName: 'discoverTrends',
    validateBody: DiscoverTrendsRequestSchema,
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    const { keyword, maxSuggestions, platforms } = c.validated.body;

    const result = await discoverTrends(
      keyword,
      platforms,
      maxSuggestions,
      c.env,
    );

    return Responses.ok(c, result);
  },
);
