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

// Import our unified type-safe error context and schema
import type { ErrorContext } from '@/api/core';
import { ErrorContextSchema } from '@/api/core/schemas';

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
 * API error severity levels schema - Zod enum for validation
 */
export const ApiErrorSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Inferred type from Zod schema - replaces hard-coded type
 */
export type ApiErrorSeverity = z.infer<typeof ApiErrorSeveritySchema>;

/**
 * Error severity constant for easy access (derived from schema)
 */
export const ERROR_SEVERITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
} as const;

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
  severity: ApiErrorSeveritySchema.optional().default('medium'),
  details: z.unknown().optional(),
  context: ErrorContextSchema.optional(),
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
  public readonly severity: ApiErrorSeverity;
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
 * } catch {
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
// AI PROVIDER ERROR METADATA (OpenRouter, Anthropic, OpenAI, etc.)
// ============================================================================

/**
 * Error category types for AI provider errors
 * Follows OpenRouter error categorization: https://openrouter.ai/docs#errors
 */
export type AIProviderErrorCategory
  = 'provider_rate_limit' // Rate limiting (429, quota exceeded) - retry aggressively
    | 'provider_network' // Network/connectivity issues (502, 503, 504) - retry aggressively
    | 'provider_service' // Service unavailable - retry aggressively
    | 'model_not_found' // Model unavailable (404) - don't retry
    | 'model_content_filter' // Content policy violation - don't retry
    | 'authentication' // API key invalid (401, 403) - don't retry
    | 'validation' // Bad request (400) - don't retry
    | 'unknown'; // Unknown error - cautious retry

/**
 * Structured metadata from AI provider errors (OpenRouter, Anthropic, OpenAI, etc.)
 * Used for comprehensive error logging and user-facing error messages
 */
export type AIProviderErrorMetadata = {
  // Error identification
  errorName: string;
  errorType: string;
  errorCategory: AIProviderErrorCategory;

  // User-facing message
  errorMessage: string;

  // Provider-specific details (OpenRouter, Anthropic, OpenAI format)
  openRouterError?: string;
  openRouterCode?: string;
  openRouterType?: string;
  openRouterMetadata?: Record<string, unknown>;

  // HTTP details
  statusCode?: number;
  requestId?: string;

  // Technical details for debugging
  rawErrorMessage: string;
  responseBody?: string;
  cause?: string;
  traceId?: string; // ✅ LLM trace ID for PostHog/debugging correlation

  // Retry decision
  isTransient: boolean;
  shouldRetry: boolean;

  // Participant context (for multi-model scenarios)
  participantId?: string;
  participantRole?: string | null;
  modelId?: string;
};

/**
 * ✅ AI PROVIDER ERROR METADATA: Extract comprehensive error details from AI SDK errors
 *
 * PATTERN: Shared utility for OpenRouter/Anthropic/OpenAI error parsing
 * REFERENCE: backend-patterns.md:1415-1437 (normalizeError pattern)
 *
 * This utility follows the established error handling pattern in error-handling.ts
 * and extends it specifically for AI provider errors (OpenRouter, Anthropic, OpenAI).
 *
 * OpenRouter/AI providers return errors in multiple formats:
 * 1. Standard HTTP errors with JSON body: { error: { message, code, metadata } }
 * 2. AI SDK errors with responseBody containing provider JSON
 * 3. Model-specific errors from underlying providers
 *
 * @param error - Error from AI SDK (unknown type for safety)
 * @param participantContext - Optional participant information for context
 * @param participantContext.id - Participant ID for error tracking
 * @param participantContext.modelId - Model ID being used (e.g., "anthropic/claude-3.5-sonnet")
 * @param participantContext.role - Role description of the participant (nullable)
 * @returns Comprehensive structured error metadata for logging and display
 *
 * @example
 * ```typescript
 * try {
 *   await streamText({ model, prompt });
 * } catch {
 *   const metadata = structureAIProviderError(error, {
 *     id: participant.id,
 *     modelId: participant.modelId,
 *     role: participant.role
 *   });
 *   // Log or display structured error
 *   logger.error('AI provider error', metadata);
 * }
 * ```
 */
export function structureAIProviderError(
  error: unknown,
  participantContext?: { id: string; modelId: string; role: string | null },
  traceId?: string,
): AIProviderErrorMetadata {
  // ✅ STEP 1: Extract base error fields from AI SDK error object
  const err = error as Error & {
    cause?: unknown;
    statusCode?: number;
    responseBody?: string;
    responseHeaders?: Record<string, string>;
    code?: string;
    data?: unknown;
  };

  const errorName = err?.name || 'UnknownError';
  let errorMessage = err?.message || 'An unexpected error occurred';
  const errorType = err?.constructor?.name || 'Error';
  const statusCode = err?.statusCode;
  const responseBody = err?.responseBody;
  const responseHeaders = err?.responseHeaders;
  const cause = err?.cause;

  // ✅ STEP 2: Parse provider-specific error from response body (JSON format)
  let providerError: {
    message?: string;
    code?: string;
    type?: string;
    metadata?: Record<string, unknown>;
  } | null = null;

  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody);
      // Provider standard error format: { error: { message, code, metadata } }
      if (parsed.error) {
        providerError = {
          message: parsed.error.message || parsed.error,
          code: parsed.error.code,
          type: parsed.error.type,
          metadata: parsed.error.metadata,
        };
        // Override error message with provider's detailed message
        if (providerError.message) {
          errorMessage = String(providerError.message);
        }
      } else if (parsed.message) {
        // Alternative format: { message, error }
        providerError = {
          message: parsed.message,
          code: parsed.code,
        };
        errorMessage = parsed.message;
      }
    } catch {
      // responseBody is not JSON - may be plain text error
      if (responseBody.length > 0 && responseBody.length < 500) {
        errorMessage = responseBody;
      }
    }
  }

  // ✅ STEP 3: Categorize error and determine retry strategy
  let errorCategory: AIProviderErrorCategory = 'unknown';
  let errorIsTransient: boolean;
  let shouldRetry: boolean;

  const errorLower = errorMessage.toLowerCase();
  const providerCode = providerError?.code ? String(providerError.code).toLowerCase() : undefined;

  // Provider-level errors (retry aggressively)
  if (
    statusCode === 429
    || providerCode === 'rate_limit_exceeded'
    || errorLower.includes('rate limit')
    || errorLower.includes('quota')
    || errorLower.includes('too many requests')
  ) {
    errorCategory = 'provider_rate_limit';
    errorIsTransient = true;
    shouldRetry = true;
  } else if (
    statusCode === 502
    || statusCode === 503
    || statusCode === 504
    || providerCode === 'service_unavailable'
    || providerCode === 'timeout'
    || errorLower.includes('timeout')
    || errorLower.includes('connection')
    || errorLower.includes('network')
    || errorLower.includes('econnrefused')
    || errorLower.includes('dns')
    || errorLower.includes('service unavailable')
    || errorLower.includes('gateway')
  ) {
    errorCategory = 'provider_network';
    errorIsTransient = true;
    shouldRetry = true;
  } else if (
    statusCode === 404
    || providerCode === 'model_not_found'
    || providerCode === 'no_endpoints'
    || errorLower.includes('model not found')
    || errorLower.includes('does not exist')
    || errorLower.includes('no endpoints found')
    || errorLower.includes('model is not available')
    || errorLower.includes('model does not support')
  ) {
    errorCategory = 'model_not_found';
    errorIsTransient = false;
    shouldRetry = false;
  } else if (
    errorLower.includes('content')
    || errorLower.includes('filter')
    || errorLower.includes('safety')
    || errorLower.includes('moderation')
    || errorLower.includes('policy')
    || errorLower.includes('inappropriate')
  ) {
    errorCategory = 'model_content_filter';
    errorIsTransient = false;
    shouldRetry = false;
  } else if (
    statusCode === 401
    || statusCode === 403
    || providerCode === 'unauthorized'
    || providerCode === 'forbidden'
    || errorLower.includes('invalid api key')
    || errorLower.includes('unauthorized')
    || errorLower.includes('api key')
    || errorLower.includes('authentication')
  ) {
    errorCategory = 'authentication';
    errorIsTransient = false;
    shouldRetry = false;
  } else if (
    statusCode === 400
    || providerCode === 'invalid_request'
    || errorLower.includes('invalid')
    || errorLower.includes('malformed')
    || errorLower.includes('bad request')
  ) {
    errorCategory = 'validation';
    errorIsTransient = false;
    shouldRetry = false;
  } else {
    // Intentionally empty
    errorCategory = 'unknown';
    errorIsTransient = true;
    shouldRetry = true;
  }

  // ✅ STEP 4: Extract provider request/response IDs for debugging
  const requestId = responseHeaders?.['x-request-id'] || responseHeaders?.['x-trace-id'];

  // ✅ STEP 5: Return comprehensive metadata
  return {
    errorName,
    errorType,
    errorCategory,
    errorMessage,
    openRouterError: providerError?.message,
    openRouterCode: providerError?.code,
    openRouterType: providerError?.type,
    openRouterMetadata: providerError?.metadata,
    statusCode,
    requestId,
    rawErrorMessage: errorMessage,
    responseBody: responseBody?.substring(0, 1000),
    cause: cause ? String(cause) : undefined,
    traceId, // ✅ Include LLM trace ID for debugging correlation
    isTransient: errorIsTransient,
    shouldRetry,
    participantId: participantContext?.id,
    participantRole: participantContext?.role,
    modelId: participantContext?.modelId,
  };
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
