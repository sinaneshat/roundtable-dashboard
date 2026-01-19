/**
 * Request Logger Middleware
 *
 * Logs ALL HTTP requests as structured JSON for Cloudflare Workers Logs.
 * Provides comprehensive observability across all environments.
 *
 * Server-side logging is ALWAYS enabled (all environments).
 * Log level varies by environment:
 * - prod: Essential request logs only (method, path, status, duration)
 * - preview/local: Detailed logs with headers, timing breakdown
 *
 * @see https://developers.cloudflare.com/workers/observability/logs/workers-logs/
 */

import type { RequestLogLevel } from '@roundtable/shared/enums';
import { REQUEST_LOG_LEVEL_BY_ENV, RequestLogLevels } from '@roundtable/shared/enums';
import type { Context, Next } from 'hono';

import type { ApiEnv } from '@/types';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get log level based on environment
 */
function getLogLevel(): RequestLogLevel {
  const env = process.env.WEBAPP_ENV || process.env.NODE_ENV || 'development';
  return REQUEST_LOG_LEVEL_BY_ENV[env] ?? RequestLogLevels.VERBOSE;
}

/**
 * Check if verbose logging is enabled
 */
function isVerboseLogging(): boolean {
  const level = getLogLevel();
  return level === RequestLogLevels.VERBOSE || level === RequestLogLevels.STANDARD;
}

// ============================================================================
// STRUCTURED LOG TYPES
// ============================================================================

type RequestLogEntry = {
  log_type: 'api_request';
  timestamp: string;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  request_id?: string;
  cf_colo?: string;
  cf_country?: string;
  // Optional verbose fields
  query?: Record<string, string>;
  content_type?: string;
  content_length?: string;
  user_agent?: string;
  origin?: string;
  referer?: string;
};

// ============================================================================
// MIDDLEWARE
// ============================================================================

/**
 * Request logger middleware
 *
 * Logs all requests as structured JSON for Cloudflare Workers Logs.
 * Automatically indexes fields for filtering and searching.
 *
 * Usage: app.use('*', requestLogger);
 */
export async function requestLogger(c: Context<ApiEnv>, next: Next): Promise<void | Response> {
  const startTime = Date.now();

  // Process request
  await next();

  // Calculate duration
  const duration = Date.now() - startTime;

  // Extract Cloudflare context
  const cfRay = c.req.header('cf-ray');
  const cf = c.req.raw.cf;

  // Build log entry
  const logEntry: RequestLogEntry = {
    log_type: 'api_request',
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    status: c.res?.status || 0,
    duration_ms: duration,
    request_id: cfRay,
    cf_colo: cf?.colo as string | undefined,
    cf_country: cf?.country as string | undefined,
  };

  // Add verbose fields in non-prod environments
  if (isVerboseLogging()) {
    logEntry.query = c.req.query() as Record<string, string>;
    logEntry.content_type = c.req.header('content-type');
    logEntry.content_length = c.req.header('content-length');
    logEntry.user_agent = c.req.header('user-agent');
    logEntry.origin = c.req.header('origin');
    logEntry.referer = c.req.header('referer');
  }

  // Log as structured JSON for Cloudflare Workers Logs
  // Using console.log for normal requests, console.warn for slow requests
  if (duration > 5000) {
    // eslint-disable-next-line no-console
    console.warn({ ...logEntry, slow_request: true });
  } else if (c.res?.status && c.res.status >= 400) {
    // Error responses logged at warn level
    // eslint-disable-next-line no-console
    console.warn(logEntry);
  } else {
    // Normal requests
    // eslint-disable-next-line no-console
    console.log(logEntry);
  }
}
