/**
 * Error Context Builders
 *
 * Centralized error context helpers for creating structured error contexts
 * following the ErrorContext discriminated union pattern.
 *
 * Usage:
 * ```typescript
 * import { ErrorContextBuilders } from '@/common/error-contexts';
 *
 * throw createError.unauthenticated(
 *   'Authentication required',
 *   ErrorContextBuilders.auth(),
 * );
 * ```
 */

import type { DatabaseOperation } from '@roundtable/shared/enums';
import { ErrorContextTypes } from '@roundtable/shared/enums';

import type { ErrorContext } from '@/core';

export const ErrorContextBuilders = {
  /**
   * Create authentication error context
   * Used when session is required but missing or invalid
   */
  auth: (operation?: string): ErrorContext => ({
    errorType: ErrorContextTypes.AUTHENTICATION,
    operation: operation || 'session_required',
  }),

  /**
   * Create resource not found error context
   * Used when a database record or API resource is not found
   */
  resourceNotFound: (
    resource: string,
    resourceId?: string,
    userId?: string,
  ): ErrorContext => ({
    errorType: ErrorContextTypes.RESOURCE,
    resource,
    resourceId,
    userId,
  }),

  /**
   * Create authorization error context
   * Used when user lacks permission to access a resource
   */
  authorization: (
    resource: string,
    resourceId?: string,
    userId?: string,
  ): ErrorContext => ({
    errorType: ErrorContextTypes.AUTHORIZATION,
    resource,
    resourceId,
    userId,
  }),

  /**
   * Create validation error context
   * Used when request validation fails
   */
  validation: (field?: string): ErrorContext => ({
    errorType: ErrorContextTypes.VALIDATION,
    field,
  }),

  /**
   * Create database error context
   * Used when database operations fail
   */
  database: (
    operation: DatabaseOperation,
    table?: string,
  ): ErrorContext => ({
    errorType: ErrorContextTypes.DATABASE,
    operation,
    table,
  }),

  /**
   * Create external service error context
   * Used when external API calls fail (Stripe, OpenRouter, etc.)
   */
  externalService: (
    service: string,
    operation?: string,
    resourceId?: string,
  ): ErrorContext => ({
    errorType: ErrorContextTypes.EXTERNAL_SERVICE,
    service,
    operation,
    resourceId,
  }),

  /**
   * Create Stripe-specific error context
   * Convenience wrapper for externalService with service='stripe'
   */
  stripe: (
    operation?: string,
    resourceId?: string,
  ): ErrorContext => ({
    errorType: ErrorContextTypes.EXTERNAL_SERVICE,
    service: 'stripe',
    operation,
    resourceId,
  }),
} as const;
