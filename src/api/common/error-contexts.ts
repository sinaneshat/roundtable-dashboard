/**
 * Error Context Builders
 *
 * Centralized error context helpers for creating structured error contexts
 * following the ErrorContext discriminated union pattern.
 *
 * Usage:
 * ```typescript
 * import { ErrorContextBuilders } from '@/api/common/error-contexts';
 *
 * throw createError.unauthenticated(
 *   'Authentication required',
 *   ErrorContextBuilders.auth(),
 * );
 * ```
 */

import type { ErrorContext } from '@/api/core';
import type { DatabaseOperation } from '@/api/core/enums';

export const ErrorContextBuilders = {
  /**
   * Create authentication error context
   * Used when session is required but missing or invalid
   */
  auth: (operation?: string): ErrorContext => ({
    errorType: 'authentication',
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
    errorType: 'resource',
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
    errorType: 'authorization',
    resource,
    resourceId,
    userId,
  }),

  /**
   * Create validation error context
   * Used when request validation fails
   */
  validation: (field?: string): ErrorContext => ({
    errorType: 'validation',
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
    errorType: 'database',
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
    errorType: 'external_service',
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
    errorType: 'external_service',
    service: 'stripe',
    operation,
    resourceId,
  }),
} as const;
