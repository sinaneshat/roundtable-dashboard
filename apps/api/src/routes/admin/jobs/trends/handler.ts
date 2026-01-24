import type { RouteHandler } from '@hono/zod-openapi';

import { createError } from '@/common/error-handling';
import { createHandler, Responses } from '@/core';
import { discoverTrends } from '@/services/jobs/trend-discovery.service';
import type { ApiEnv } from '@/types';

import type { discoverTrendsRoute } from './route';
import { DiscoverTrendsRequestSchema } from './schema';

/**
 * Helper: Check if user is admin
 */
function requireAdmin(user: { role?: string | null; id: string }) {
  if (user.role !== 'admin') {
    throw createError.unauthorized('Admin access required', {
      errorType: 'authorization',
      resource: 'admin',
      userId: user.id,
    });
  }
}

/**
 * Discover trending topics (admin only)
 */
export const discoverTrendsHandler: RouteHandler<typeof discoverTrendsRoute, ApiEnv> = createHandler(
  {
    auth: 'session',
    validateBody: DiscoverTrendsRequestSchema,
    operationName: 'discoverTrends',
  },
  async (c) => {
    const { user } = c.auth();
    requireAdmin(user);

    const { keyword, platforms, maxSuggestions } = c.validated.body;

    const result = await discoverTrends(
      keyword,
      platforms,
      maxSuggestions,
      c.env,
    );

    return Responses.ok(c, result);
  },
);
