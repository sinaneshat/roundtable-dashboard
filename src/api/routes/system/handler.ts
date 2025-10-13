import type { RouteHandler } from '@hono/zod-openapi';

import { normalizeError } from '@/api/common/error-handling';
import { createHandler, Responses } from '@/api/core';
import { apiLogger } from '@/api/middleware/hono-logger';
import type { ApiEnv } from '@/api/types';
import { getDbAsync } from '@/db';

import type { detailedHealthRoute, healthRoute } from './route';

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
    c.logger.info('Basic health check requested', {
      logType: 'operation',
      operationName: 'healthCheck',
    });

    const payload = {
      ok: true,
      status: 'healthy' as const,
      timestamp: new Date().toISOString(),
    };

    c.logger.info('Basic health check completed successfully', {
      logType: 'operation',
      operationName: 'healthCheck',
      resource: 'healthy',
    });

    return Responses.ok(c, payload);
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
    c.logger.info('Starting detailed health check', {
      logType: 'operation',
      operationName: 'detailedHealthCheck',
    });

    const startTime = Date.now();

    // Check database connectivity
    const dbCheck = await checkDatabase(c);

    // Check environment configuration
    const envCheck = checkEnvironment(c);

    // Calculate overall status
    const dependencies = {
      database: dbCheck,
      environment: envCheck,
    };

    const healthCounts = Object.values(dependencies).reduce(
      (acc, check) => {
        acc.total++;
        if (check.status === 'healthy')
          acc.healthy++;
        else if (check.status === 'degraded')
          acc.degraded++;
        else acc.unhealthy++;
        return acc;
      },
      { total: 0, healthy: 0, degraded: 0, unhealthy: 0 },
    );

    const overallStatus = healthCounts.unhealthy > 0
      ? 'unhealthy'
      : healthCounts.degraded > 0 ? 'degraded' : 'healthy';

    const duration = Date.now() - startTime;

    const payload = {
      ok: overallStatus === 'healthy',
      status: overallStatus,
      timestamp: new Date().toISOString(),
      duration,
      env: {
        runtime: 'cloudflare-workers',
        version: globalThis.navigator?.userAgent || 'unknown',
        nodeEnv: c.env.NODE_ENV || 'unknown',
      },
      dependencies,
      summary: healthCounts,
    };

    c.logger.info('Detailed health check completed', {
      logType: 'operation',
      operationName: 'detailedHealthCheck',
      resource: `status-${overallStatus}`,
      duration,
    });

    // For health endpoints, we need to return proper HTTP status codes
    if (overallStatus === 'healthy') {
      return Responses.ok(c, payload);
    } else {
      return Responses.serviceUnavailable(c, 'System is unhealthy', payload);
    }
  },
);

/**
 * Check database connectivity
 */
async function checkDatabase(_c: { env: ApiEnv['Bindings'] }) {
  const startTime = Date.now();

  try {
    // Use the established pattern for database access
    const db = await getDbAsync();
    await db.run('SELECT 1');

    return {
      status: 'healthy' as const,
      message: 'Database is responsive',
      duration: Date.now() - startTime,
    };
  } catch (error) {
    apiLogger.error('Database health check failed', normalizeError(error));
    return {
      status: 'unhealthy' as const,
      message: `Database connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Check environment configuration
 */
function checkEnvironment(c: { env: ApiEnv['Bindings'] }) {
  try {
    const missingVars: string[] = [];

    // Check for required environment variables
    if (!c.env.BETTER_AUTH_SECRET)
      missingVars.push('BETTER_AUTH_SECRET');
    if (!c.env.NEXT_PUBLIC_WEBAPP_ENV)
      missingVars.push('NEXT_PUBLIC_WEBAPP_ENV');

    if (missingVars.length > 0) {
      return {
        status: 'degraded' as const,
        message: `Missing environment variables: ${missingVars.join(', ')}`,
        details: { missingVars },
      };
    }

    return {
      status: 'healthy' as const,
      message: 'All required environment variables are present',
    };
  } catch (error) {
    apiLogger.error('Environment health check failed', normalizeError(error));
    return {
      status: 'unhealthy' as const,
      message: `Environment check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
