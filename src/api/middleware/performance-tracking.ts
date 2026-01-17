/**
 * Performance Tracking Middleware
 *
 * Tracks request timing, DB queries, and other performance metrics.
 * Only active in preview/local environments to avoid production overhead.
 *
 * Adds to context:
 * - startTime: Request start timestamp
 * - dbQueries: Array of DB query timings
 * - performanceMetrics: Aggregated performance data
 */

import type { Context, Next } from 'hono';

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

// Global state for tracking (reset per request)
let currentRequestMetrics: PerformanceMetrics | null = null;

/**
 * Check if performance tracking should be enabled
 * Only in preview/local/development environments
 */
function isPerformanceTrackingEnabled(): boolean {
  const env = process.env.NEXT_PUBLIC_WEBAPP_ENV || 'development';
  return env === 'local' || env === 'preview' || env === 'development';
}

/**
 * Get current performance metrics (for use in response builders)
 */
export function getCurrentPerformanceMetrics(): PerformanceMetrics | null {
  return currentRequestMetrics;
}

/**
 * Record a DB query timing
 * Call this from instrumented DB access points
 */
export function recordDbQuery(query: string, duration: number): void {
  if (!currentRequestMetrics) {
    return;
  }

  currentRequestMetrics.dbQueries.push({
    query: query.slice(0, 100), // Truncate long queries
    duration,
    timestamp: Date.now(),
  });
  currentRequestMetrics.dbQueryCount++;
  currentRequestMetrics.dbTotalTime += duration;
}

/**
 * Performance tracking middleware
 * Sets up timing and extracts Cloudflare placement info
 */
export async function performanceTracking(c: Context, next: Next): Promise<void | Response> {
  // Skip if not enabled
  if (!isPerformanceTrackingEnabled()) {
    return next();
  }

  const startTime = Date.now();

  // Initialize metrics for this request
  currentRequestMetrics = {
    requestStartTime: startTime,
    dbQueryCount: 0,
    dbTotalTime: 0,
    dbQueries: [],
  };

  // Store start time in context for response builders
  c.set('startTime', startTime);
  c.set('performanceTracking', true);

  // Extract Cloudflare headers if available
  const cfRay = c.req.header('cf-ray');
  const cfPlacement = c.req.header('cf-placement');

  if (cfRay) {
    currentRequestMetrics.cfRay = cfRay;
  }
  if (cfPlacement) {
    currentRequestMetrics.cfPlacement = cfPlacement;
  }

  await next();

  // Calculate total duration
  const endTime = Date.now();
  currentRequestMetrics.totalDuration = endTime - startTime;

  // Store final metrics in context for potential logging
  c.set('performanceMetrics', currentRequestMetrics);

  // Add performance headers to response (only in preview/local)
  if (c.res) {
    const headers = new Headers(c.res.headers);

    // Add timing headers
    headers.set('X-Response-Time', `${currentRequestMetrics.totalDuration}ms`);
    headers.set('X-DB-Query-Count', String(currentRequestMetrics.dbQueryCount));
    headers.set('X-DB-Total-Time', `${currentRequestMetrics.dbTotalTime}ms`);

    if (currentRequestMetrics.cfPlacement) {
      headers.set('X-CF-Placement', currentRequestMetrics.cfPlacement);
    }

    // Clone response with new headers
    c.res = new Response(c.res.body, {
      status: c.res.status,
      statusText: c.res.statusText,
      headers,
    });
  }

  // Reset for next request
  currentRequestMetrics = null;
}

/**
 * Create a timed DB wrapper
 * Wraps database calls to track their execution time
 */
export function withDbTiming<T>(
  queryName: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isPerformanceTrackingEnabled() || !currentRequestMetrics) {
    return fn();
  }

  const start = Date.now();
  return fn().finally(() => {
    const duration = Date.now() - start;
    recordDbQuery(queryName, duration);
  });
}

/**
 * Format performance metrics for API response
 * Returns object to be included in response meta
 */
export function formatPerformanceForResponse(): Record<string, unknown> | undefined {
  if (!isPerformanceTrackingEnabled() || !currentRequestMetrics) {
    return undefined;
  }

  const metrics = currentRequestMetrics;
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
