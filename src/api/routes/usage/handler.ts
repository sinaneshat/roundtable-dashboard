import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import {
  checkCustomRoleQuota,
  checkMessageQuota,
  checkThreadQuota,
  getUserUsageStats,
} from '@/api/services/usage-tracking.service';
import type { ApiEnv } from '@/api/types';

import type {
  checkCustomRoleQuotaRoute,
  checkMessageQuotaRoute,
  checkThreadQuotaRoute,
  getUserUsageStatsRoute,
} from './route';

// ============================================================================
// Usage Statistics Handlers
// ============================================================================

/**
 * Get user usage statistics
 * Returns comprehensive usage data for UI display
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

/**
 * Check thread creation quota
 * Used by UI to show whether "Create Thread" button should be enabled
 */
export const checkThreadQuotaHandler: RouteHandler<
  typeof checkThreadQuotaRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'checkThreadQuota',
  },
  async (c) => {
    const { user } = c.auth();

    const quota = await checkThreadQuota(user.id);

    return Responses.ok(c, quota);
  },
);

/**
 * Check message creation quota
 * Used by UI to show whether "Send Message" button should be enabled
 */
export const checkMessageQuotaHandler: RouteHandler<
  typeof checkMessageQuotaRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'checkMessageQuota',
  },
  async (c) => {
    const { user } = c.auth();

    const quota = await checkMessageQuota(user.id);

    return Responses.ok(c, quota);
  },
);

/**
 * Check custom role creation quota
 * Used by UI to show whether "Create Custom Role" button should be enabled
 */
export const checkCustomRoleQuotaHandler: RouteHandler<
  typeof checkCustomRoleQuotaRoute,
  ApiEnv
> = createHandler(
  {
    auth: 'session',
    operationName: 'checkCustomRoleQuota',
  },
  async (c) => {
    const { user } = c.auth();

    const quota = await checkCustomRoleQuota(user.id);

    return Responses.ok(c, quota);
  },
);
