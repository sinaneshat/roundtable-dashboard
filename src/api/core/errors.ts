/**
 * Consolidated Error Handling System
 *
 * This module provides a unified error handling system that consolidates:
 * - Error factory functions for consistent error creation
 * - Error context builders for structured logging
 * - HTTP exception factories for type-safe exceptions
 * - Error response builders for consistent API responses
 *
 * SINGLE SOURCE OF TRUTH for all error handling patterns in the API layer.
 *
 * Features:
 * - Type-safe error creation with Zod validation
 * - Consistent HTTP status code mapping
 * - Structured error contexts using discriminated unions
 * - Integration with Hono's HTTPException
 * - Comprehensive error metadata for logging and debugging
 *
 * Usage:
 * ```typescript
 * import { ApiErrors } from '@/api/core/errors';
 *
 * // Throw structured errors
 * throw ApiErrors.notFound('User', 'user-id', 'requesting-user-id');
 * throw ApiErrors.unauthorized('subscription', 'sub-id', 'user-id');
 * throw ApiErrors.databaseError('select', 'users', 'user-id');
 *
 * // Validation errors
 * throw ApiErrors.validationError('email', 'Invalid email format');
 * throw ApiErrors.badRequest('Missing required field: name');
 * ```
 */

import type { Context } from 'hono';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { ErrorContextBuilders } from '@/api/common/error-contexts';
import { AppError, createError, ERROR_CODES } from '@/api/common/error-handling';
import type { ErrorContext } from '@/api/core';
import type { DatabaseOperation } from '@/api/core/enums';

// ============================================================================
// ❌ NO RE-EXPORTS FROM @/api/common/* - Import directly from source
// ============================================================================
// POLICY: Only barrel exports from modules within the same directory.
// For @/api/common/* utilities, import directly from their canonical source.
//
// ✓ CORRECT: import { createError } from '@/api/common/error-handling';
// ✗ WRONG:   import { createError } from '@/api/core';
//
// This ensures single source of truth and prevents circular dependencies.
// ============================================================================

/**
 * Consolidated API Error Factory
 *
 * Provides simplified error creation methods that combine error factory,
 * context builders, and consistent messaging patterns.
 *
 * These methods wrap the underlying createError factory with common
 * error context patterns to reduce boilerplate in handlers.
 */
export const ApiErrors = {
  /**
   * Not Found Error - Resource does not exist
   *
   * @param resource - Type of resource (e.g., 'User', 'Subscription', 'Thread')
   * @param resourceId - Optional resource identifier
   * @param userId - Optional user identifier for context
   *
   * @example
   * throw ApiErrors.notFound('User', userId);
   * throw ApiErrors.notFound('Subscription', subscriptionId, userId);
   */
  notFound: (resource: string, resourceId?: string, userId?: string) => {
    const context = ErrorContextBuilders.resourceNotFound(resource, resourceId, userId);
    return createError.notFound(`${resource} not found`, context);
  },

  /**
   * Unauthorized Error - User lacks permission
   *
   * @param resource - Type of resource being accessed
   * @param resourceId - Optional resource identifier
   * @param userId - Optional user identifier for context
   *
   * @example
   * throw ApiErrors.unauthorized('subscription', subscriptionId, userId);
   */
  unauthorized: (resource: string, resourceId?: string, userId?: string) => {
    const context = ErrorContextBuilders.authorization(resource, resourceId, userId);
    return createError.unauthorized(`You do not have access to this ${resource}`, context);
  },

  /**
   * Authentication Error - Session required but missing/invalid
   *
   * @param operation - Optional operation being attempted
   *
   * @example
   * throw ApiErrors.authenticationRequired();
   * throw ApiErrors.authenticationRequired('access_protected_resource');
   */
  authenticationRequired: (operation?: string) => {
    const context = ErrorContextBuilders.auth(operation);
    return createError.unauthenticated('Authentication required', context);
  },

  /**
   * Validation Error - Single field validation failure
   *
   * @param field - Field name that failed validation
   * @param message - Validation error message
   *
   * @example
   * throw ApiErrors.validationError('email', 'Invalid email format');
   */
  validationError: (field: string, message: string) => {
    const context = ErrorContextBuilders.validation(field);
    return createError.validation(message, context);
  },

  /**
   * Bad Request Error - Invalid request format or parameters
   *
   * @param message - Error message describing the bad request
   * @param field - Optional field that caused the error
   *
   * @example
   * throw ApiErrors.badRequest('Missing required field: name');
   * throw ApiErrors.badRequest('Invalid price format', 'priceId');
   */
  badRequest: (message: string, field?: string) => {
    const context = field ? ErrorContextBuilders.validation(field) : undefined;
    return createError.badRequest(message, context);
  },

  /**
   * Database Error - Database operation failed
   *
   * @param operation - Database operation type
   * @param table - Optional table name
   * @param userId - Optional user identifier for context
   *
   * @example
   * throw ApiErrors.databaseError('select', 'users', userId);
   * throw ApiErrors.databaseError('batch', 'stripeCustomer');
   */
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

  /**
   * External Service Error - Third-party service failure
   *
   * @param service - Service name (e.g., 'stripe', 'openrouter', 'email')
   * @param operation - Operation being performed
   * @param message - Error message
   * @param resourceId - Optional resource identifier
   *
   * @example
   * throw ApiErrors.externalServiceError('stripe', 'create_checkout_session', 'Failed to create session');
   * throw ApiErrors.externalServiceError('openrouter', 'stream_text', 'Model unavailable', modelId);
   */
  externalServiceError: (
    service: string,
    operation: string,
    message: string,
    resourceId?: string,
  ) => {
    const context = ErrorContextBuilders.externalService(service, operation, resourceId);
    return createError.internal(message, context);
  },

  /**
   * Stripe Error - Convenience wrapper for Stripe-specific errors
   *
   * @param operation - Stripe operation being performed
   * @param message - Error message
   * @param resourceId - Optional Stripe resource ID
   *
   * @example
   * throw ApiErrors.stripeError('create_checkout_session', 'Session URL missing');
   * throw ApiErrors.stripeError('cancel_subscription', 'Subscription not found', subscriptionId);
   */
  stripeError: (operation: string, message: string, resourceId?: string) => {
    const context = ErrorContextBuilders.stripe(operation, resourceId);
    return createError.internal(message, context);
  },

  /**
   * Internal Server Error - Unexpected server error
   *
   * @param message - Error message
   * @param context - Optional error context
   *
   * @example
   * throw ApiErrors.internal('Unexpected error occurred');
   * throw ApiErrors.internal('Failed to process request', context);
   */
  internal: (message: string, context?: ErrorContext) => {
    return createError.internal(message, context);
  },

  /**
   * Conflict Error - Resource already exists or state conflict
   *
   * @param message - Error message
   * @param resource - Optional resource type
   * @param resourceId - Optional resource identifier
   *
   * @example
   * throw ApiErrors.conflict('User already exists', 'user', email);
   * throw ApiErrors.conflict('Subscription already active');
   */
  conflict: (message: string, resource?: string, resourceId?: string) => {
    const context = resource ? ErrorContextBuilders.resourceNotFound(resource, resourceId) : undefined;
    return createError.conflict(message, context);
  },

  /**
   * Rate Limit Error - Too many requests
   *
   * @param message - Optional custom message
   *
   * @example
   * throw ApiErrors.rateLimitExceeded();
   * throw ApiErrors.rateLimitExceeded('API rate limit exceeded for this endpoint');
   */
  rateLimitExceeded: (message?: string) => {
    return createError.rateLimit(message || 'Too many requests');
  },

  /**
   * Gone Error - Resource permanently deleted (410)
   *
   * @param resource - Resource type
   * @param resourceId - Optional resource identifier
   *
   * @example
   * throw ApiErrors.gone('Thread', threadId);
   */
  gone: (resource: string, resourceId?: string) => {
    const context = ErrorContextBuilders.resourceNotFound(resource, resourceId);
    return createError.gone(`${resource} no longer available`, context);
  },
} as const;

// ✅ Use ErrorContextBuilders directly from '@/api/common/error-contexts'
// ✅ Use ERROR_CODES directly from '@/api/common/error-handling'

/**
 * Type guard to check if an error is an AppError
 *
 * @param error - Error to check
 * @returns True if error is an AppError instance
 *
 * @example
 * try {
 *   await operation();
 * } catch (error) {
 *   if (isAppError(error)) {
 *
 *   }
 * }
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
        code: ERROR_CODES.INTERNAL_SERVER_ERROR,
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
