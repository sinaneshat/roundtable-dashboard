import type { Context } from 'hono';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { AppError } from '@/api/common/error-handling';
import { ErrorCodes } from '@/api/core/enums';

/**
 * Type guard for AppError instances
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
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
      error.statusCode as 400 | 401 | 403 | 404 | 409 | 500,
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
