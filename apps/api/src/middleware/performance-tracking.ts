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

import { WebAppEnvs } from '@roundtable/shared';
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
  const env = process.env.WEBAPP_ENV || WebAppEnvs.LOCAL;
  return env === WebAppEnvs.LOCAL || env === WebAppEnvs.PREVIEW;
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
 * Performance response format for API responses
 */
export type PerformanceResponseFormat = {
  timing: {
    total: number;
    db: {
      queryCount: number;
      totalTime: number;
      avgTime: number;
      queries: Array<{
        query: string;
        duration: number;
      }>;
    };
  };
  cloudflare: {
    placement: string;
    ray: string;
  };
};

/**
 * Format performance metrics for API response
 * Returns object to be included in response meta
 */
export function formatPerformanceForResponse(c?: { get: (key: string) => unknown }): PerformanceResponseFormat | undefined {
  if (!isPerformanceTrackingEnabled()) {
    return undefined;
  }

  // Type guard: Validate metrics structure at runtime
  const rawMetrics = c?.get('performanceMetrics');
  if (!rawMetrics || typeof rawMetrics !== 'object') {
    return undefined;
  }

  // Runtime type validation for PerformanceMetrics
  const metrics = rawMetrics as Record<string, unknown>;
  if (
    typeof metrics.requestStartTime !== 'number'
    || typeof metrics.dbQueryCount !== 'number'
    || typeof metrics.dbTotalTime !== 'number'
    || !Array.isArray(metrics.dbQueries)
  ) {
    return undefined;
  }

  // Now safe to use as PerformanceMetrics
  const typedMetrics = metrics as PerformanceMetrics;
  if (!typedMetrics) {
    return undefined;
  }

  const now = Date.now();

  return {
    timing: {
      total: now - typedMetrics.requestStartTime,
      db: {
        queryCount: typedMetrics.dbQueryCount,
        totalTime: typedMetrics.dbTotalTime,
        avgTime: typedMetrics.dbQueryCount > 0
          ? Math.round(typedMetrics.dbTotalTime / typedMetrics.dbQueryCount)
          : 0,
        queries: typedMetrics.dbQueries.map(q => ({
          query: q.query,
          duration: q.duration,
        })),
      },
    },
    cloudflare: {
      placement: typedMetrics.cfPlacement || 'unknown',
      ray: typedMetrics.cfRay || 'unknown',
    },
  };
}
