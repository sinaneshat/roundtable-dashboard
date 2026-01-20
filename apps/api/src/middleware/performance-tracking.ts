/**
 * Performance Tracking Middleware
 *
 * Tracks request timing, DB queries, and other performance metrics.
 * Only active in preview/local environments to avoid production overhead.
 *
 * Adds to context:
 * - startTime: Request start timestamp
 * - performanceMetrics: Aggregated performance data
 *
 * OFFICIAL HONO PATTERN: Uses createMiddleware for proper typing
 */

import { createMiddleware } from 'hono/factory';

import type { ApiEnv } from '@/types';

// Performance metrics stored in context
export type DbQueryTiming = {
  query: string;
  duration: number;
  timestamp: number;
};

export type PerformanceMetrics = {
  requestStartTime: number;
  totalDuration?: number;
  dbQueryCount: number;
  dbTotalTime: number;
  dbQueries: DbQueryTiming[];
  workerInitTime?: number;
  cfPlacement?: string;
  cfRay?: string;
};

/**
 * Check if performance tracking should be enabled
 * Only in preview/local environments (not prod)
 * WEBAPP_ENV values: 'local' | 'preview' | 'prod' (from wrangler.jsonc)
 */
function isPerformanceTrackingEnabled(): boolean {
  const env = process.env.WEBAPP_ENV || 'local';
  return env === 'local' || env === 'preview';
}

/**
 * Performance tracking middleware
 * Sets up timing and extracts Cloudflare placement info
 * Stores metrics in request context (not global state) for concurrency safety
 */
export const performanceTracking = createMiddleware<ApiEnv>(async (c, next) => {
  // Skip if not enabled
  if (!isPerformanceTrackingEnabled()) {
    await next();
    return;
  }

  const startTime = Date.now();

  // Initialize metrics in context (request-scoped, not global)
  const metrics: PerformanceMetrics = {
    requestStartTime: startTime,
    dbQueryCount: 0,
    dbTotalTime: 0,
    dbQueries: [],
    cfRay: c.req.header('cf-ray') || undefined,
    cfPlacement: c.req.header('cf-placement') || undefined,
  };

  // Store in context immediately so it's available during request processing
  c.set('startTime', startTime);
  c.set('performanceTracking', true);
  c.set('performanceMetrics', metrics);

  await next();

  // Calculate total duration (metrics is still the same object reference)
  metrics.totalDuration = Date.now() - startTime;

  // Add performance headers to response
  if (c.res) {
    const headers = new Headers(c.res.headers);
    headers.set('X-Response-Time', `${metrics.totalDuration}ms`);
    headers.set('X-DB-Query-Count', String(metrics.dbQueryCount));
    headers.set('X-DB-Total-Time', `${metrics.dbTotalTime}ms`);

    if (metrics.cfPlacement) {
      headers.set('X-CF-Placement', metrics.cfPlacement);
    }

    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  }
});

/**
 * Format performance metrics for API response
 * Returns object to be included in response meta
 */
export function formatPerformanceForResponse(c?: { get: (key: string) => unknown }): Record<string, unknown> | undefined {
  if (!isPerformanceTrackingEnabled()) {
    return undefined;
  }

  const metrics = c?.get('performanceMetrics') as PerformanceMetrics | undefined;
  if (!metrics) {
    return undefined;
  }

  const now = Date.now();

  return {
    timing: {
      total: now - metrics.requestStartTime,
      db: {
        queryCount: metrics.dbQueryCount,
        totalTime: metrics.dbTotalTime,
        avgTime: metrics.dbQueryCount > 0
          ? Math.round(metrics.dbTotalTime / metrics.dbQueryCount)
          : 0,
        queries: metrics.dbQueries.map(q => ({
          query: q.query,
          duration: q.duration,
        })),
      },
    },
    cloudflare: {
      placement: metrics.cfPlacement || 'unknown',
      ray: metrics.cfRay || 'unknown',
    },
  };
}
