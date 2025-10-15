/**
 * Standardized Error Handling Patterns for API Routes
 *
 * This module provides comprehensive, standardized error handling patterns
 * across all API routes with consistent error formatting, logging, and
 * response structures.
 *
 * Uses Zod for schema validation and type inference to avoid hard-coded types.
 *
 * Features:
 * - Zod-based error schemas and validation
 * - Type inference instead of manual type definitions
 * - Consistent error response formatting
 * - Proper error logging without sensitive data
 * - HTTP status code mapping
 * - Error context and metadata handling
 * - Request tracing and correlation IDs
 */

// Using Stoker's HttpStatusCodes for maximum reusability
import * as HttpStatusCodes from 'stoker/http-status-codes';
import { z } from 'zod';

// Import our unified type-safe error context instead of generic Record
import type { ErrorContext } from '@/api/core';

// ============================================================================
// ZOD SCHEMAS FOR ERROR TYPES
// ============================================================================

/**
 * Standard error codes schema - Zod enum for validation
 */
export const ErrorCodeSchema = z.enum([
  // Authentication & Authorization
  'UNAUTHENTICATED',
  'UNAUTHORIZED',
  'TOKEN_EXPIRED',
  'TOKEN_INVALID',
  'INSUFFICIENT_PERMISSIONS',

  // Validation & Input
  'VALIDATION_ERROR',
  'INVALID_INPUT',
  'MISSING_REQUIRED_FIELD',
  'INVALID_FORMAT',
  'INVALID_ENUM_VALUE',

  // Resource Management
  'RESOURCE_NOT_FOUND',
  'RESOURCE_ALREADY_EXISTS',
  'RESOURCE_CONFLICT',
  'RESOURCE_LOCKED',
  'RESOURCE_EXPIRED',

  // Business Logic
  'BUSINESS_RULE_VIOLATION',

  // External Services
  'EXTERNAL_SERVICE_ERROR',
  'EMAIL_SERVICE_ERROR',
  'STORAGE_SERVICE_ERROR',

  // System & Infrastructure
  'INTERNAL_SERVER_ERROR',
  'DATABASE_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT_ERROR',
  'RATE_LIMIT_EXCEEDED',
  'SERVICE_UNAVAILABLE',
  'MAINTENANCE_MODE',
  'BATCH_FAILED',
  'BATCH_SIZE_EXCEEDED',
]);

/**
 * Inferred type from Zod schema - replaces hard-coded type
 */
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/**
 * Error codes constant for easy access (derived from schema)
 */
export const ERROR_CODES = ErrorCodeSchema.enum;

/**
 * Error severity levels schema - Zod enum for validation
 */
export const ErrorSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Inferred type from Zod schema - replaces hard-coded type
 */
export type ErrorSeverity = z.infer<typeof ErrorSeveritySchema>;

/**
 * Error severity constant for easy access (derived from schema)
 */
export const ERROR_SEVERITY = {
  LOW: 'low' as const,
  MEDIUM: 'medium' as const,
  HIGH: 'high' as const,
  CRITICAL: 'critical' as const,
} satisfies Record<string, ErrorSeverity>;

// ============================================================================
// ERROR CONFIGURATION SCHEMA
// ============================================================================

/**
 * Schema for AppError constructor parameters
 * Uses Zod for validation and type inference
 */
export const AppErrorConfigSchema = z.object({
  message: z.string().min(1),
  code: ErrorCodeSchema,
  statusCode: z.number().int().min(100).max(599),
  severity: ErrorSeveritySchema.optional().default('medium'),
  details: z.unknown().optional(),
  context: z.any().optional(), // ErrorContext type is complex, use any for now
  correlationId: z.string().optional(),
});

/**
 * Inferred type from schema - replaces hard-coded interface
 * Note: severity is optional due to default value
 */
export type AppErrorConfig = z.input<typeof AppErrorConfigSchema>;

// ============================================================================
// ERROR CLASSES
// ============================================================================

/**
 * Base application error class with enhanced metadata
 * Constructor parameters validated via Zod schema
 */
class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly severity: ErrorSeverity;
  public readonly details?: unknown;
  public readonly context?: ErrorContext;
  public readonly timestamp: Date;
  public readonly correlationId?: string;

  constructor(config: AppErrorConfig) {
    // Validate configuration via Zod schema (runtime validation)
    const validated = AppErrorConfigSchema.parse(config);

    super(validated.message);
    this.name = this.constructor.name;
    this.code = validated.code;
    this.statusCode = validated.statusCode;
    this.severity = validated.severity;
    this.details = validated.details;
    this.context = validated.context;
    this.timestamp = new Date();
    this.correlationId = validated.correlationId;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to JSON for logging
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      severity: this.severity,
      details: this.details,
      context: this.sanitizeContext(),
      timestamp: this.timestamp.toISOString(),
      correlationId: this.correlationId,
      stack: this.stack,
    };
  }

  /**
   * Remove sensitive data from context for logging
   * Now uses discriminated union for type safety
   */
  private sanitizeContext(): ErrorContext | undefined {
    if (!this.context)
      return undefined;

    // The discriminated union ensures type safety - no need for generic Record
    // Each error type has its own sanitization logic
    switch (this.context.errorType) {
      case 'authentication':
        return {
          ...this.context,
          attemptedEmail: this.context.attemptedEmail ? '[REDACTED]' : undefined,
        };
      default:
        return this.context;
    }
  }
}

/**
 * External service error class for third-party service failures
 */
class ExternalServiceError extends AppError {
  public readonly serviceName: string;
  public readonly originalError?: Error;

  constructor({
    message,
    serviceName,
    code = ERROR_CODES.EXTERNAL_SERVICE_ERROR,
    originalError,
    context,
    correlationId,
  }: {
    message: string;
    serviceName: string;
    code?: ErrorCode;
    originalError?: Error;
    context?: ErrorContext;
    correlationId?: string;
  }) {
    super({
      message,
      code,
      statusCode: HttpStatusCodes.BAD_GATEWAY,
      severity: ERROR_SEVERITY.HIGH,
      details: {
        serviceName,
        originalError: originalError?.message,
      },
      context,
      correlationId,
    });

    this.serviceName = serviceName;
    this.originalError = originalError;
  }
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Factory functions for creating common errors
 */
export const createError = {
  /**
   * Authentication errors
   */
  unauthenticated: (message = 'Authentication required', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.UNAUTHENTICATED,
      statusCode: HttpStatusCodes.UNAUTHORIZED,
      severity: ERROR_SEVERITY.MEDIUM,
      context,
      correlationId,
    }),

  unauthorized: (message = 'Insufficient permissions', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.UNAUTHORIZED,
      statusCode: HttpStatusCodes.FORBIDDEN,
      severity: ERROR_SEVERITY.MEDIUM,
      context,
      correlationId,
    }),

  tokenExpired: (message = 'Authentication token has expired', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.TOKEN_EXPIRED,
      statusCode: HttpStatusCodes.UNAUTHORIZED,
      severity: ERROR_SEVERITY.LOW,
      context,
      correlationId,
    }),

  /**
   * Resource errors
   */
  notFound: (resource = 'Resource', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message: `${resource} not found`,
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      statusCode: HttpStatusCodes.NOT_FOUND,
      severity: ERROR_SEVERITY.LOW,
      context,
      correlationId,
    }),

  alreadyExists: (resource = 'Resource', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message: `${resource} already exists`,
      code: ERROR_CODES.RESOURCE_ALREADY_EXISTS,
      statusCode: HttpStatusCodes.CONFLICT,
      severity: ERROR_SEVERITY.LOW,
      context,
      correlationId,
    }),

  conflict: (message = 'Resource conflict', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.RESOURCE_CONFLICT,
      statusCode: HttpStatusCodes.CONFLICT,
      severity: ERROR_SEVERITY.MEDIUM,
      context,
      correlationId,
    }),

  /**
   * SEO-friendly 410 Gone error for resources that existed but are no longer available
   * Use this for deleted or permanently unavailable resources to help search engines
   * remove them from their index
   */
  gone: (message = 'Resource no longer available', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.RESOURCE_NOT_FOUND,
      statusCode: HttpStatusCodes.GONE,
      severity: ERROR_SEVERITY.LOW,
      context,
      correlationId,
    }),

  /**
   * Validation errors
   */
  badRequest: (message = 'Invalid request', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: HttpStatusCodes.BAD_REQUEST,
      severity: ERROR_SEVERITY.LOW,
      context,
      correlationId,
    }),

  validation: (message = 'Validation failed', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.VALIDATION_ERROR,
      statusCode: HttpStatusCodes.BAD_REQUEST,
      severity: ERROR_SEVERITY.LOW,
      context,
      correlationId,
    }),

  /**
   * System errors
   */
  internal: (message = 'Internal server error', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
      severity: ERROR_SEVERITY.CRITICAL,
      context,
      correlationId,
    }),

  database: (message = 'Database operation failed', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.DATABASE_ERROR,
      statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
      severity: ERROR_SEVERITY.CRITICAL,
      context,
      correlationId,
    }),

  rateLimit: (message = 'Too many requests', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
      statusCode: HttpStatusCodes.TOO_MANY_REQUESTS,
      severity: ERROR_SEVERITY.MEDIUM,
      context,
      correlationId,
    }),

  /**
   * External service errors
   */
  emailService: (message = 'Email service error', originalError?: Error, context?: ErrorContext, correlationId?: string) =>
    new ExternalServiceError({
      message,
      serviceName: 'Email',
      code: ERROR_CODES.EMAIL_SERVICE_ERROR,
      originalError,
      context,
      correlationId,
    }),

};

// ============================================================================
// ERROR UTILITY FUNCTIONS
// ============================================================================

/**
 * Normalize an unknown error value to an Error instance
 *
 * This helper ensures consistent error handling by converting any thrown value
 * into a proper Error instance. Useful in catch blocks where the error type is unknown.
 *
 * @param error - The error value to normalize (can be anything)
 * @returns A proper Error instance
 *
 * @example
 * ```typescript
 * try {
 *   await somethingDangerous();
 * } catch (error) {
 *   throw createError.internal('Operation failed', context);
 * }
 * ```
 */
export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  AppError,
  ExternalServiceError,
};

// ERROR_CODES, ERROR_SEVERITY, ErrorCode, ErrorSeverity are already exported above

export default createError;
