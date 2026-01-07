import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import {
  getUserUsageStats,
} from '@/api/services/usage';
import type { ApiEnv } from '@/api/types';

import type {
  getUserUsageStatsRoute,
} from './route';

// ============================================================================
// Usage Statistics Handler
// ============================================================================

/**
 * ✅ SINGLE SOURCE OF TRUTH - Get user usage statistics
 *
 * Returns comprehensive usage data including ALL quota information.
 * Frontend uses this to:
 * - Display usage meters and statistics
 * - Block UI when remaining === 0 or used >= limit
 * - Show quota warnings
 */
export const getUserUsageStatsHandler: RouteHandler<
  typeof getUserUsageStatsRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'getUserUsageStats',
  },
  async (c) => {
    const { user } = c.auth();

    const stats = await getUserUsageStats(user.id);

    return Responses.ok(c, stats);
  },
);
