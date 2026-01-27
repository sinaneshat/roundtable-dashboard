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

import type { ApiEnv } from '@/types';

// ============================================================================
// DATABASE ERROR SANITIZATION
// ============================================================================

/**
 * Checks if an error message contains raw SQL or database internals.
 * These patterns indicate D1/Drizzle errors that shouldn't be exposed to clients.
 */
function isDatabaseError(message: string) {
  const sqlPatterns = [
    'Failed query',
    'UPDATE "',
    'INSERT INTO',
    'SELECT ',
    'DELETE FROM',
    'RETURNING ',
    'params:',
    'user_credit_balance',
    'D1_ERROR',
    'SQLITE_',
    'drizzle',
  ];

  const lowerMessage = message.toLowerCase();
  return sqlPatterns.some(pattern => lowerMessage.includes(pattern.toLowerCase()));
}

/**
 * Creates a sanitized error that doesn't expose database internals.
 * Logs the original error for debugging but returns a safe message to clients.
 */
function createSanitizedDatabaseError(originalError: Error) {
  const sanitizedError = new Error('A database operation failed. Please try again later.');
  sanitizedError.name = 'DatabaseError';
  // Preserve stack for internal logging but use sanitized message
  // Only assign stack if it exists to satisfy exactOptionalPropertyTypes
  if (originalError.stack !== undefined) {
    sanitizedError.stack = originalError.stack;
  }
  return sanitizedError;
}

/**
 * Check if this is an expected 401 authentication error.
 * These are expected on protected endpoints when user isn't authenticated.
 * We skip verbose logging for these to reduce console noise in dev.
 */
function isExpected401(err: Error, status: number) {
  if (status !== 401) {
    return false;
  }
  const message = err.message.toLowerCase();
  return message.includes('authentication required')
    || message.includes('unauthorized')
    || message.includes('session');
}

/**
 * Global error logging middleware
 *
 * Logs ALL errors as structured JSON for Cloudflare Workers Logs indexing.
 * Sanitizes database errors to prevent SQL leakage to clients.
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

  // Skip verbose logging for expected 401 auth errors
  // These are normal on protected endpoints when user isn't logged in
  if (isExpected401(err, status)) {
    return await onError(err, c);
  }

  // Extract Cloudflare request context
  // c.req.raw.cf is typed as CfProperties | undefined by Cloudflare's type definitions
  // which includes colo and country properties from IncomingRequestCfPropertiesBase
  const cfRay = c.req.header('cf-ray');
  const cf = c.req.raw.cf;

  // Build structured error log (Cloudflare auto-indexes JSON fields)
  // Always log the ORIGINAL error message for debugging (never sanitized)
  const errorLog = {
    cf_colo: cf?.colo,
    cf_country: cf?.country,
    error_message: err.message, // Original message for debugging
    error_name: err.name,
    error_stack: err.stack,
    error_type: errorType,
    log_type: 'api_error',
    method: c.req.method,
    path: c.req.path,
    query: c.req.query(),
    // Cloudflare context
    request_id: cfRay,
    status,
    timestamp: new Date().toISOString(),
    // URL details for debugging
    url: c.req.url,
  };

  // Log as structured JSON for Cloudflare Workers Logs
  // Cloudflare automatically indexes all JSON fields for filtering
  console.error(errorLog);

  // Sanitize database errors before sending to client
  // This prevents SQL queries and table names from leaking
  let errorToReturn = err;
  if (err instanceof Error && isDatabaseError(err.message)) {
    errorToReturn = createSanitizedDatabaseError(err);
    // Log that we sanitized this error for debugging
    console.error({
      log_type: 'error_sanitized',
      original_message: err.message,
      request_id: cfRay,
      sanitized_message: errorToReturn.message,
      timestamp: new Date().toISOString(),
    });
  }

  // Delegate to Stoker's onError for response formatting
  return await onError(errorToReturn, c);
};
