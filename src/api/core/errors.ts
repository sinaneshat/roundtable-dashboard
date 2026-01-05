import type { Context } from 'hono';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { AppError, createError } from '@/api/common/error-handling';
import type { DatabaseOperation } from '@/api/core/enums';
import { ErrorCodes } from '@/api/core/enums';

import type { ErrorContext } from './schemas';

export const ApiErrors = {
  notFound: (resource: string, resourceId?: string, userId?: string) => {
    const context = ErrorContextBuilders.resourceNotFound(resource, resourceId, userId);
    return createError.notFound(`${resource} not found`, context);
  },

  unauthorized: (resource: string, resourceId?: string, userId?: string) => {
    const context = ErrorContextBuilders.authorization(resource, resourceId, userId);
    return createError.unauthorized(`You do not have access to this ${resource}`, context);
  },

  authenticationRequired: (operation?: string) => {
    const context = ErrorContextBuilders.auth(operation);
    return createError.unauthenticated('Authentication required', context);
  },

  validationError: (field: string, message: string) => {
    const context = ErrorContextBuilders.validation(field);
    return createError.validation(message, context);
  },

  badRequest: (message: string, field?: string) => {
    const context = field ? ErrorContextBuilders.validation(field) : undefined;
    return createError.badRequest(message, context);
  },

  databaseError: (
    operation: DatabaseOperation,
    table?: string,
    userId?: string,
  ) => {
    const context: ErrorContext = {
      errorType: 'database',
      operation,
      table,
      userId,
    };
    return createError.database('Database operation failed', context);
  },

  externalServiceError: (
    service: string,
    operation: string,
    message: string,
    resourceId?: string,
  ) => {
    const context = ErrorContextBuilders.externalService(service, operation, resourceId);
    return createError.internal(message, context);
  },

  stripeError: (operation: string, message: string, resourceId?: string) => {
    const context = ErrorContextBuilders.stripe(operation, resourceId);
    return createError.internal(message, context);
  },

  internal: (message: string, context?: ErrorContext) => {
    return createError.internal(message, context);
  },

  conflict: (message: string, resource?: string, resourceId?: string) => {
    const context = resource ? ErrorContextBuilders.resourceNotFound(resource, resourceId) : undefined;
    return createError.conflict(message, context);
  },

  rateLimitExceeded: (message?: string) => {
    return createError.rateLimit(message || 'Too many requests');
  },

  gone: (resource: string, resourceId?: string) => {
    const context = ErrorContextBuilders.resourceNotFound(resource, resourceId);
    return createError.gone(`${resource} no longer available`, context);
  },
} as const;

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
