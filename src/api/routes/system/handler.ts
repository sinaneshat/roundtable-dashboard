import type { RouteHandler } from '@hono/zod-openapi';

import { createHandler, Responses } from '@/api/core';
import { HealthStatuses } from '@/api/core/enums';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';
import { STATIC_CACHE_TAGS } from '@/db/cache/cache-tags';

import type { clearCacheRoute, detailedHealthRoute, healthRoute } from './route';
import type { HealthCheckContext } from './schema';

/**
 * Basic health check handler
 * Returns simple health status for monitoring systems
 */
export const healthHandler: RouteHandler<typeof healthRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'healthCheck',
  },
  async (c) => {
    return Responses.health(c, HealthStatuses.HEALTHY);
  },
);

/**
 * Detailed health check handler
 * Returns comprehensive health status including dependencies
 */
export const detailedHealthHandler: RouteHandler<typeof detailedHealthRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'detailedHealthCheck',
  },
  async (c) => {
    const startTime = Date.now();

    // Check database connectivity
    const dbCheck = await checkDatabase({ env: c.env });

    // Check environment configuration
    const envCheck = checkEnvironment({ env: c.env });

    // Build dependencies object
    const dependencies = {
      database: dbCheck,
      environment: envCheck,
    };

    // Calculate overall status based on dependency health
    const overallStatus = Object.values(dependencies).some(dep => dep.status === HealthStatuses.UNHEALTHY)
      ? HealthStatuses.UNHEALTHY
      : Object.values(dependencies).some(dep => dep.status === HealthStatuses.DEGRADED)
        ? HealthStatuses.DEGRADED
        : HealthStatuses.HEALTHY;

    const duration = Date.now() - startTime;

    return Responses.detailedHealth(c, overallStatus, dependencies, duration);
  },
);

/**
 * Check database connectivity
 */
async function checkDatabase(_c: HealthCheckContext) {
  const startTime = Date.now();

  try {
    // Use the established pattern for database access
    const db = await getDbAsync();
    await db.run('SELECT 1');

    return {
      status: HealthStatuses.HEALTHY,
      message: 'Database is responsive',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      status: HealthStatuses.UNHEALTHY,
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Check environment configuration
 */
function checkEnvironment(c: HealthCheckContext) {
  try {
    const missingVars: string[] = [];

    // Check for required environment variables
    if (!c.env.BETTER_AUTH_SECRET)
      missingVars.push('BETTER_AUTH_SECRET');
    if (!c.env.NEXT_PUBLIC_WEBAPP_ENV)
      missingVars.push('NEXT_PUBLIC_WEBAPP_ENV');

    if (missingVars.length > 0) {
      return {
        status: HealthStatuses.DEGRADED,
        message: `Missing environment variables: ${missingVars.join(', ')}`,
        details: { missingVars },
      };
    }

    return {
      status: HealthStatuses.HEALTHY,
      message: 'All required environment variables are present',
    };
  } catch (error) {
    return {
      status: HealthStatuses.UNHEALTHY,
      message: `Environment check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Clear all backend caches handler
 * Invalidates all known cache tags to force fresh data
 */
export const clearCacheHandler: RouteHandler<typeof clearCacheRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'clearCache',
  },
  async (c) => {
    try {
      const db = await getDbAsync();

      // List of all cache tags that will be cleared
      const clearedTags: string[] = [];

      // Invalidate all static cache tags
      if (db.$cache) {
        // Build list of all known static tags
        const staticTags = [
          STATIC_CACHE_TAGS.ACTIVE_PRODUCTS,
          STATIC_CACHE_TAGS.ACTIVE_PRICES,
        ];

        await db.$cache.invalidate({
          tags: staticTags,
        });

        clearedTags.push(...staticTags);
        clearedTags.push('all-static-caches-invalidated');
      } else {
        // Intentionally empty
        clearedTags.push('no-cache-configured');
      }

      return Responses.ok(c, {
        ok: true,
        message: 'All backend caches cleared successfully. Note: User-specific caches will be cleared on next mutation.',
        timestamp: new Date().toISOString(),
        clearedTags,
      });
    } catch (error) {
      return Responses.internalServerError(
        c,
        `Failed to clear caches: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  },
);
