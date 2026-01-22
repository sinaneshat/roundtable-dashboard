import type { RouteHandler } from '@hono/zod-openapi';
import { HealthStatuses } from '@roundtable/shared/enums';

import { createHandler, Responses } from '@/core';
import { getDbAsync } from '@/db';
import type { ApiEnv } from '@/types';

import type { detailedHealthRoute, healthRoute } from './route';
import type { HealthCheckContext } from './schema';

// Track app-level timing
let appModuleLoadTime: number | null = null;
const appStartTime = Date.now();

/**
 * Basic health check handler with app-level timing
 * Returns simple health status for monitoring systems
 */
export const healthHandler: RouteHandler<typeof healthRoute, ApiEnv> = createHandler(
  {
    auth: 'public',
    operationName: 'healthCheck',
  },
  async (c) => {
    const handlerStart = Date.now();

    // Track first invocation as module load complete
    if (appModuleLoadTime === null) {
      appModuleLoadTime = Date.now() - appStartTime;
    }

    const timings = {
      appModuleLoadMs: appModuleLoadTime,
      handlerExecutionMs: Date.now() - handlerStart,
      appAgeMs: Date.now() - appStartTime,
    };

    // Return with timing info in response headers
    c.header('X-App-Module-Load-Ms', String(timings.appModuleLoadMs));
    c.header('X-Handler-Execution-Ms', String(timings.handlerExecutionMs));
    c.header('X-App-Age-Ms', String(timings.appAgeMs));

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

    // ✅ OPTIMIZATION: Parallelize independent health checks
    const [dbCheck, envCheck] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkEnvironment({ env: c.env })), // Wrap sync function for Promise.all
    ]);

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
async function checkDatabase() {
  const startTime = Date.now();

  try {
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
    if (!c.env.WEBAPP_ENV)
      missingVars.push('WEBAPP_ENV');

    if (missingVars.length > 0) {
      return {
        status: HealthStatuses.DEGRADED,
        message: `Missing environment variables: ${missingVars.join(', ')}`,
        details: { detailType: 'health_check', missingVars: missingVars.join(', '), missingCount: missingVars.length },
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
