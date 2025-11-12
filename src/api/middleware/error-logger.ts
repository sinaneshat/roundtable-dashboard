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
 * Logs ALL errors that occur in the API layer to console.error with context.
 * Then delegates to Stoker's onError for response formatting.
 *
 * Error Logging Format:
 * - Path: Request path that caused the error
 * - Method: HTTP method (GET, POST, etc.)
 * - Status: HTTP status code
 * - Message: Error message
 * - Stack: Full stack trace (in development)
 *
 * @example
 * // In src/api/index.ts:
 * app.onError(errorLogger);
 */
export const errorLogger: ErrorHandler<ApiEnv> = async (err, c) => {
  // Extract error details for logging
  const path = c.req.path;
  const method = c.req.method;
  const timestamp = new Date().toISOString();

  // Determine status code
  let status = 500;
  if (err instanceof HTTPException) {
    status = err.status;
  }

  // Build error context for logging
  const errorContext = {
    timestamp,
    method,
    path,
    status,
    message: err.message,
  };

  // Log error with full context
  // ✅ Always log errors - this is the single point of failure tracking
  console.error(
    `[API Error] ${method} ${path} → ${status}`,
    errorContext,
    // Include stack trace in development
    c.env.NODE_ENV === 'development' ? err.stack : undefined,
  );

  // Delegate to Stoker's onError for response formatting
  // Stoker handles proper error response structure and status codes
  return onError(err, c);
};
