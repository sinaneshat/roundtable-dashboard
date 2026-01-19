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

import type { Context, Next } from 'hono';

import type { ApiEnv } from '@/types';

// ============================================================================
// CONFIGURATION
// ============================================================================

type LogLevel = 'minimal' | 'standard' | 'verbose';

/**
 * Get log level based on environment
 */
function getLogLevel(): LogLevel {
  const env = process.env.WEBAPP_ENV || process.env.NODE_ENV || 'development';

  switch (env) {
    case 'prod':
    case 'production':
      return 'minimal'; // Essential logs only
    case 'preview':
      return 'standard'; // Standard logs with some details
    default:
      return 'verbose'; // Full verbose logging
  }
}

/**
 * Check if verbose logging is enabled
 */
function isVerboseLogging(): boolean {
  const level = getLogLevel();
  return level === 'verbose' || level === 'standard';
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

/**
 * Auth request logger - specialized for /api/auth/* routes
 * Provides additional context for authentication debugging
 */
export async function authRequestLogger(c: Context<ApiEnv>, next: Next): Promise<void | Response> {
  const startTime = Date.now();
  const path = c.req.path;

  // Only log auth endpoints
  if (!path.startsWith('/api/auth')) {
    return next();
  }

  await next();

  const duration = Date.now() - startTime;

  // Build auth-specific log entry
  const logEntry = {
    log_type: 'auth_request',
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    status: c.res?.status || 0,
    duration_ms: duration,
    request_id: c.req.header('cf-ray'),
    // Auth-specific context
    has_cookie: !!c.req.header('cookie'),
    has_authorization: !!c.req.header('authorization'),
    origin: c.req.header('origin'),
  };

  // eslint-disable-next-line no-console
  console.log(logEntry);
}
