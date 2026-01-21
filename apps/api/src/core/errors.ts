import { ErrorCodes } from '@roundtable/shared/enums';
import type { Context } from 'hono';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { AppError } from '@/common/error-handling';

/**
 * Type guard for AppError instances
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard for valid HTTP status codes
 */
function isValidStatusCode(code: number): code is 400 | 401 | 403 | 404 | 409 | 500 {
  return [400, 401, 403, 404, 409, 500].includes(code);
}

/**
 * Error Response Helper
 *
 * Format errors for API responses consistently.
 *
 * @param c - Hono context
 * @param error - Error to format
 * @returns Formatted error response
 *
 * @example
 * try {
 *   await operation();
 * } catch (error) {
 *   return formatErrorResponse(c, error);
 * }
 */
export function formatErrorResponse(c: Context, error: unknown): Response {
  if (isAppError(error)) {
    // Use type guard instead of type assertion
    const statusCode = isValidStatusCode(error.statusCode)
      ? error.statusCode
      : HttpStatusCodes.INTERNAL_SERVER_ERROR;

    return c.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          context: error.context,
        },
        meta: {
          requestId: c.get('requestId'),
          timestamp: new Date().toISOString(),
        },
      },
      statusCode,
    );
  }

  return c.json(
    {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_SERVER_ERROR,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
      },
      meta: {
        requestId: c.get('requestId'),
        timestamp: new Date().toISOString(),
      },
    },
    HttpStatusCodes.INTERNAL_SERVER_ERROR,
  );
}
