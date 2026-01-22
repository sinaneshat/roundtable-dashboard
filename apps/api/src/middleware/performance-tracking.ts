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
import { z } from 'zod';

import type { ApiEnv } from '@/types';

// Zod schemas for performance tracking (SINGLE SOURCE OF TRUTH)
export const DbQueryTimingSchema = z.object({
  query: z.string(),
  duration: z.number(),
  timestamp: z.number(),
});

export const PerformanceMetricsSchema = z.object({
  requestStartTime: z.number(),
  totalDuration: z.number().optional(),
  dbQueryCount: z.number(),
  dbTotalTime: z.number(),
  dbQueries: z.array(DbQueryTimingSchema),
  workerInitTime: z.number().optional(),
  cfPlacement: z.string().optional(),
  cfRay: z.string().optional(),
});

// Type inference from Zod schemas
export type DbQueryTiming = z.infer<typeof DbQueryTimingSchema>;
export type PerformanceMetrics = z.infer<typeof PerformanceMetricsSchema>;

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
export const PerformanceResponseFormatSchema = z.object({
  timing: z.object({
    total: z.number(),
    db: z.object({
      queryCount: z.number(),
      totalTime: z.number(),
      avgTime: z.number(),
      queries: z.array(z.object({
        query: z.string(),
        duration: z.number(),
      })),
    }),
  }),
  cloudflare: z.object({
    placement: z.string(),
    ray: z.string(),
  }),
});

export type PerformanceResponseFormat = z.infer<typeof PerformanceResponseFormatSchema>;

/**
 * Format performance metrics for API response
 * Returns object to be included in response meta
 */
export function formatPerformanceForResponse(c?: { get: (key: string) => unknown }): PerformanceResponseFormat | undefined {
  if (!isPerformanceTrackingEnabled()) {
    return undefined;
  }

  const rawMetrics = c?.get('performanceMetrics');
  if (!rawMetrics || typeof rawMetrics !== 'object') {
    return undefined;
  }

  // Zod validation instead of unsafe type cast
  const parseResult = PerformanceMetricsSchema.safeParse(rawMetrics);
  if (!parseResult.success) {
    return undefined;
  }

  const metrics = parseResult.data;
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
