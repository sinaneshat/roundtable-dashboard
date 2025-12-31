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

import type { ApiErrorSeverity, ErrorCode } from '@/api/core/enums';
import { ApiErrorSeverities, ApiErrorSeveritySchema, ErrorCodes, ErrorCodeSchema } from '@/api/core/enums';
import type { ErrorContext } from '@/api/core/schemas';
import { ErrorContextSchema } from '@/api/core/schemas';

import { extractAISdkError, getErrorMessage, getErrorName } from './error-types';

// ============================================================================
// ERROR CONFIGURATION SCHEMA
// ============================================================================

export const AppErrorConfigSchema = z.object({
  message: z.string().min(1),
  code: ErrorCodeSchema,
  statusCode: z.number().int().min(100).max(599),
  severity: ApiErrorSeveritySchema.optional().default('medium'),
  details: z.unknown().optional(),
  context: ErrorContextSchema.optional(),
  correlationId: z.string().optional(),
});

export type AppErrorConfig = z.input<typeof AppErrorConfigSchema>;

// ============================================================================
// ERROR CLASSES
// ============================================================================

class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly severity: ApiErrorSeverity;
  public readonly details?: unknown;
  public readonly context?: ErrorContext;
  public readonly timestamp: Date;
  public readonly correlationId?: string;

  constructor(config: AppErrorConfig) {
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

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

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

  private sanitizeContext(): ErrorContext | undefined {
    if (!this.context) {
      return undefined;
    }

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

class ExternalServiceError extends AppError {
  public readonly serviceName: string;
  public readonly originalError?: Error;

  constructor({
    message,
    serviceName,
    code = ErrorCodes.EXTERNAL_SERVICE_ERROR,
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
      severity: ApiErrorSeverities.HIGH,
      details: {
        detailType: 'service_error',
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

export const createError = {
  unauthenticated: (message = 'Authentication required', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.UNAUTHENTICATED,
      statusCode: HttpStatusCodes.UNAUTHORIZED,
      severity: ApiErrorSeverities.MEDIUM,
      context,
      correlationId,
    }),

  unauthorized: (message = 'Insufficient permissions', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.UNAUTHORIZED,
      statusCode: HttpStatusCodes.FORBIDDEN,
      severity: ApiErrorSeverities.MEDIUM,
      context,
      correlationId,
    }),

  tokenExpired: (message = 'Authentication token has expired', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.TOKEN_EXPIRED,
      statusCode: HttpStatusCodes.UNAUTHORIZED,
      severity: ApiErrorSeverities.LOW,
      context,
      correlationId,
    }),

  notFound: (resource = 'Resource', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message: `${resource} not found`,
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      statusCode: HttpStatusCodes.NOT_FOUND,
      severity: ApiErrorSeverities.LOW,
      context,
      correlationId,
    }),

  alreadyExists: (resource = 'Resource', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message: `${resource} already exists`,
      code: ErrorCodes.RESOURCE_ALREADY_EXISTS,
      statusCode: HttpStatusCodes.CONFLICT,
      severity: ApiErrorSeverities.LOW,
      context,
      correlationId,
    }),

  conflict: (message = 'Resource conflict', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.RESOURCE_CONFLICT,
      statusCode: HttpStatusCodes.CONFLICT,
      severity: ApiErrorSeverities.MEDIUM,
      context,
      correlationId,
    }),

  gone: (message = 'Resource no longer available', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      statusCode: HttpStatusCodes.GONE,
      severity: ApiErrorSeverities.LOW,
      context,
      correlationId,
    }),

  badRequest: (message = 'Invalid request', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.VALIDATION_ERROR,
      statusCode: HttpStatusCodes.BAD_REQUEST,
      severity: ApiErrorSeverities.LOW,
      context,
      correlationId,
    }),

  validation: (message = 'Validation failed', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.VALIDATION_ERROR,
      statusCode: HttpStatusCodes.BAD_REQUEST,
      severity: ApiErrorSeverities.LOW,
      context,
      correlationId,
    }),

  internal: (message = 'Internal server error', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
      severity: ApiErrorSeverities.CRITICAL,
      context,
      correlationId,
    }),

  database: (message = 'Database operation failed', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.DATABASE_ERROR,
      statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
      severity: ApiErrorSeverities.CRITICAL,
      context,
      correlationId,
    }),

  rateLimit: (message = 'Too many requests', context?: ErrorContext, correlationId?: string) =>
    new AppError({
      message,
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      statusCode: HttpStatusCodes.TOO_MANY_REQUESTS,
      severity: ApiErrorSeverities.MEDIUM,
      context,
      correlationId,
    }),

  emailService: (message = 'Email service error', originalError?: Error, context?: ErrorContext, correlationId?: string) =>
    new ExternalServiceError({
      message,
      serviceName: 'Email',
      code: ErrorCodes.EMAIL_SERVICE_ERROR,
      originalError,
      context,
      correlationId,
    }),

};

// ============================================================================
// ERROR UTILITY FUNCTIONS
// ============================================================================

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

// ============================================================================
// AI PROVIDER ERROR METADATA
// ============================================================================

export const AI_PROVIDER_ERROR_CATEGORIES = [
  'provider_rate_limit', // Rate limiting (429, quota exceeded) - retry aggressively
  'provider_network', // Network/connectivity issues (502, 503, 504) - retry aggressively
  'provider_service', // Service unavailable - retry aggressively
  'model_not_found', // Model unavailable (404) - don't retry
  'model_content_filter', // Content policy violation - don't retry
  'authentication', // API key invalid (401, 403) - don't retry
  'validation', // Bad request (400) - don't retry
  'unknown', // Unknown error - cautious retry
] as const;

export const AIProviderErrorCategorySchema = z.enum(AI_PROVIDER_ERROR_CATEGORIES);

export type AIProviderErrorCategory = z.infer<typeof AIProviderErrorCategorySchema>;

export const AIProviderErrorCategories = {
  PROVIDER_RATE_LIMIT: 'provider_rate_limit' as const,
  PROVIDER_NETWORK: 'provider_network' as const,
  PROVIDER_SERVICE: 'provider_service' as const,
  MODEL_NOT_FOUND: 'model_not_found' as const,
  MODEL_CONTENT_FILTER: 'model_content_filter' as const,
  AUTHENTICATION: 'authentication' as const,
  VALIDATION: 'validation' as const,
  UNKNOWN: 'unknown' as const,
} as const;

export const ProviderErrorDetailsSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  metadata: z.unknown().optional(),
});

export type ProviderErrorDetails = z.infer<typeof ProviderErrorDetailsSchema>;

export const AIProviderErrorMetadataSchema = z.object({
  errorName: z.string(),
  errorType: z.string(),
  errorCategory: AIProviderErrorCategorySchema,
  errorMessage: z.string(),
  openRouterError: z.string().optional(),
  openRouterCode: z.string().optional(),
  openRouterType: z.string().optional(),
  openRouterMetadata: z.unknown().optional(),
  statusCode: z.number().optional(),
  requestId: z.string().optional(),
  rawErrorMessage: z.string(),
  responseBody: z.string().optional(),
  cause: z.string().optional(),
  traceId: z.string().optional(),
  isTransient: z.boolean(),
  shouldRetry: z.boolean(),
  participantId: z.string().optional(),
  participantRole: z.string().nullable().optional(),
  modelId: z.string().optional(),
});

export type AIProviderErrorMetadata = z.infer<typeof AIProviderErrorMetadataSchema>;

export function structureAIProviderError(
  error: unknown,
  participantContext?: { id: string; modelId: string; role: string | null },
  traceId?: string,
): AIProviderErrorMetadata {
  const aiError = extractAISdkError(error);

  const errorName = getErrorName(error) ?? 'UnknownError';
  let errorMessage = getErrorMessage(error);
  const errorType = error instanceof Error ? error.constructor.name : 'Error';
  const statusCode = aiError?.statusCode;
  const responseBody = aiError?.responseBody;
  const cause = aiError?.cause;

  let responseHeaders: Record<string, string> | undefined;
  if (error instanceof Error && 'responseHeaders' in error) {
    const headers = (error as { responseHeaders?: unknown }).responseHeaders;
    // ✅ TYPE GUARD: Validate headers is a string record
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      // Validate each value is a string before casting
      const isValidHeaders = Object.values(headers).every(v => typeof v === 'string');
      if (isValidHeaders) {
        responseHeaders = headers as Record<string, string>;
      }
    }
  }

  let providerError: ProviderErrorDetails | null = null;

  if (responseBody) {
    try {
      const parsed: unknown = JSON.parse(responseBody);
      // ✅ TYPE GUARD: Validate parsed structure before access
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const parsedObj = parsed as Record<string, unknown>;
        // Provider standard error format: { error: { message, code, metadata } }
        if (parsedObj.error && typeof parsedObj.error === 'object' && !Array.isArray(parsedObj.error)) {
          const errorObj = parsedObj.error as Record<string, unknown>;
          providerError = ProviderErrorDetailsSchema.parse({
            message: typeof errorObj.message === 'string' ? errorObj.message : String(parsedObj.error),
            code: typeof errorObj.code === 'string' ? errorObj.code : undefined,
            type: typeof errorObj.type === 'string' ? errorObj.type : undefined,
            metadata: errorObj.metadata,
          });
          if (providerError.message) {
            errorMessage = providerError.message;
          }
        } else if (typeof parsedObj.message === 'string') {
          // Alternative format: { message, code }
          providerError = ProviderErrorDetailsSchema.parse({
            message: parsedObj.message,
            code: typeof parsedObj.code === 'string' ? parsedObj.code : undefined,
          });
          errorMessage = parsedObj.message;
        }
      }
    } catch {
      // responseBody is not valid JSON or schema parse failed - use as plain text
      if (responseBody.length > 0 && responseBody.length < 500) {
        errorMessage = responseBody;
      }
    }
  }

  // Categorize error and determine retry strategy
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
    errorCategory = AIProviderErrorCategories.PROVIDER_RATE_LIMIT;
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
    errorCategory = AIProviderErrorCategories.PROVIDER_NETWORK;
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
    errorCategory = AIProviderErrorCategories.MODEL_NOT_FOUND;
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
    errorCategory = AIProviderErrorCategories.MODEL_CONTENT_FILTER;
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
    errorCategory = AIProviderErrorCategories.AUTHENTICATION;
    errorIsTransient = false;
    shouldRetry = false;
  } else if (
    statusCode === 400
    || providerCode === 'invalid_request'
    || errorLower.includes('invalid')
    || errorLower.includes('malformed')
    || errorLower.includes('bad request')
  ) {
    errorCategory = AIProviderErrorCategories.VALIDATION;
    errorIsTransient = false;
    shouldRetry = false;
  } else {
    errorCategory = AIProviderErrorCategories.UNKNOWN;
    errorIsTransient = true;
    shouldRetry = true;
  }

  // Extract provider request/response IDs for debugging
  const requestId = responseHeaders?.['x-request-id'] || responseHeaders?.['x-trace-id'];

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
    traceId,
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

export default createError;
