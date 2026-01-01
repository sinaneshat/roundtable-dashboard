/**
 * Global Error Logging Middleware
 *
 * Catches and logs ALL errors across the entire API layer.
 * Wraps Stoker's onError middleware with comprehensive error logging.
 *
 * IMPORTANT: This middleware automatically logs ALL exceptions, rejections,
 * and HTTP errors at the Hono framework level. Individual route handlers
 * do NOT need to add logging - it's handled here automatically.
 *
 * Cloudflare Workers Logs Best Practice:
 * - Log structured JSON objects for automatic field indexing
 * - This enables filtering by any field (error_type, path, status, etc.)
 * - See: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
 *
 * Location: /src/api/middleware/error-logger.ts
 * Used by: src/api/index.ts (global middleware)
 */

import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import onError from 'stoker/middlewares/on-error';

import type { ApiEnv } from '@/api/types';

/**
 * Global error logging middleware
 *
 * Logs ALL errors as structured JSON for Cloudflare Workers Logs indexing.
 * Then delegates to Stoker's onError for response formatting.
 *
 * Logged Fields (auto-indexed by Cloudflare):
 * - log_type: "api_error" for filtering
 * - timestamp: ISO timestamp
 * - method: HTTP method
 * - path: Request path
 * - status: HTTP status code
 * - error_name: Error class name
 * - error_message: Error message
 * - error_stack: Stack trace (always included for debugging)
 * - request_id: CF-Ray header if available
 * - cf_colo: Cloudflare datacenter
 *
 * @example
 * // In src/api/index.ts:
 * app.onError(errorLogger);
 */
export const errorLogger: ErrorHandler<ApiEnv> = async (err, c) => {
  // Determine status code
  let status = 500;
  let errorType = 'UnknownError';

  if (err instanceof HTTPException) {
    status = err.status;
    errorType = 'HTTPException';
  } else if (err instanceof Error) {
    errorType = err.constructor.name;
  }

  // Extract Cloudflare request context
  const cfRay = c.req.header('cf-ray');
  const cf = c.req.raw.cf as Record<string, unknown> | undefined;

  // Build structured error log (Cloudflare auto-indexes JSON fields)
  const errorLog = {
    log_type: 'api_error',
    timestamp: new Date().toISOString(),
    method: c.req.method,
    path: c.req.path,
    status,
    error_type: errorType,
    error_name: err.name,
    error_message: err.message,
    error_stack: err.stack,
    // Cloudflare context
    request_id: cfRay,
    cf_colo: cf?.colo,
    cf_country: cf?.country,
    // URL details for debugging
    url: c.req.url,
    query: c.req.query(),
  };

  // Log as structured JSON for Cloudflare Workers Logs
  // Cloudflare automatically indexes all JSON fields for filtering
  console.error(errorLog);

  // Delegate to Stoker's onError for response formatting
  return onError(err, c);
};
