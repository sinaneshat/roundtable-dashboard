/**
 * Standardized Error Handling Patterns for API Routes
 *
 * Uses Zod for schema validation and type inference.
 * ErrorContext uses discriminated unions from core/schemas.
 */

import type { ApiErrorSeverity, ErrorCategory, ErrorCode } from '@roundtable/shared/enums';
import { ApiErrorSeverities, ApiErrorSeveritySchema, ErrorCategories, ErrorCategorySchema, ErrorCodes, ErrorCodeSchema } from '@roundtable/shared/enums';
import * as HttpStatusCodes from 'stoker/http-status-codes';
import * as z from 'zod';

import type { ErrorContext } from '@/core/schemas';
import { ErrorContextSchema } from '@/core/schemas';

import { extractAISdkError, getErrorMessage, getErrorName } from './error-types';

// ============================================================================
// ERROR DETAILS SCHEMA (Discriminated Union)
// ============================================================================

const ServiceErrorDetailsSchema = z.object({
  detailType: z.literal('service_error'),
  serviceName: z.string(),
  originalError: z.string().optional(),
});

const ValidationErrorDetailsSchema = z.object({
  detailType: z.literal('validation_error'),
  fields: z.array(z.object({
    field: z.string(),
    message: z.string(),
    code: z.string().optional(),
  })),
});

const GenericErrorDetailsSchema = z.object({
  detailType: z.literal('generic'),
  info: z.string().optional(),
});

const BatchErrorDetailsSchema = z.object({
  detailType: z.literal('batch'),
  currentSize: z.number().optional(),
  statementCount: z.number().optional(),
  originalError: z.string().optional(),
});

export const ErrorDetailsSchema = z.discriminatedUnion('detailType', [
  ServiceErrorDetailsSchema,
  ValidationErrorDetailsSchema,
  GenericErrorDetailsSchema,
  BatchErrorDetailsSchema,
]);

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

// ============================================================================
// ERROR CONFIGURATION SCHEMA
// ============================================================================

export const AppErrorConfigSchema = z.object({
  message: z.string().min(1),
  code: ErrorCodeSchema,
  statusCode: z.number().int().min(100).max(599),
  severity: ApiErrorSeveritySchema.optional().default('medium'),
  details: ErrorDetailsSchema.optional(),
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
  public readonly details?: ErrorDetails;
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

    if (this.context.errorType === 'authentication' && 'attemptedEmail' in this.context) {
      return {
        ...this.context,
        attemptedEmail: this.context.attemptedEmail ? '[REDACTED]' : undefined,
      };
    }

    return this.context;
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

/**
 * Provider error metadata schema
 * Uses typed discriminated union for metadata instead of z.unknown()
 */
const ProviderMetadataSchema = z.discriminatedUnion('metaType', [
  z.object({
    metaType: z.literal('rate_limit'),
    retryAfter: z.number().optional(),
    remaining: z.number().optional(),
    limit: z.number().optional(),
  }),
  z.object({
    metaType: z.literal('model_info'),
    modelId: z.string().optional(),
    provider: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    metaType: z.literal('raw'),
    data: z.record(z.string(), z.string()).optional(),
  }),
]);

// Type exported for internal schema validation - used by ProviderErrorDetailsSchema
type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;
export type { ProviderMetadata };

export const ProviderErrorDetailsSchema = z.object({
  message: z.string().optional(),
  code: z.string().optional(),
  type: z.string().optional(),
  metadata: ProviderMetadataSchema.optional(),
});

export type ProviderErrorDetails = z.infer<typeof ProviderErrorDetailsSchema>;

// ============================================================================
// PROVIDER ERROR RESPONSE SCHEMAS (type-safe JSON parsing)
// ============================================================================

const ProviderNestedErrorResponseSchema = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.string().optional(),
    type: z.string().optional(),
    metadata: ProviderMetadataSchema.optional(),
  }),
});

const ProviderFlatErrorResponseSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
});

export const AIProviderErrorMetadataSchema = z.object({
  errorName: z.string(),
  errorType: z.string(),
  errorCategory: ErrorCategorySchema,
  errorMessage: z.string(),
  openRouterError: z.string().optional(),
  openRouterCode: z.string().optional(),
  openRouterType: z.string().optional(),
  openRouterMetadata: ProviderMetadataSchema.optional(),
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
  // ✅ DEBUG: Handle plain objects (stringify to see full structure)
  const isErrorInstance = error instanceof Error;
  const errMsg = isErrorInstance
    ? error.message.substring(0, 200)
    : (typeof error === 'object' && error !== null ? JSON.stringify(error).substring(0, 500) : String(error));

  // Use extractAISdkError for type-safe error field extraction
  const aiError = extractAISdkError(error);
  const errStatus = aiError?.statusCode ?? '-';
  const errBody = aiError?.responseBody ? aiError.responseBody.substring(0, 200) : '-';

  console.error(`[StructErr] model=${participantContext?.modelId ?? '-'} isErr=${isErrorInstance} status=${errStatus} msg=${errMsg} body=${errBody}`);

  const errorName = getErrorName(error) ?? 'UnknownError';
  let errorMessage = getErrorMessage(error);
  const errorType = error instanceof Error ? error.constructor.name : 'Error';
  const statusCode = aiError?.statusCode;
  const responseBody = aiError?.responseBody;
  const cause = aiError?.cause;

  const ResponseHeadersSchema = z.record(z.string(), z.string());
  let responseHeaders: z.infer<typeof ResponseHeadersSchema> | undefined;
  if (error instanceof Error && 'responseHeaders' in error) {
    const result = ResponseHeadersSchema.safeParse(error.responseHeaders);
    if (result.success) {
      responseHeaders = result.data;
    }
  }

  let providerError: ProviderErrorDetails | null = null;

  if (responseBody) {
    try {
      const parsed: unknown = JSON.parse(responseBody);

      // ✅ ZOD-BASED PARSING: Use schema validation instead of manual type guards
      // Try nested error format first: { error: { message, code, type, metadata } }
      const nestedResult = ProviderNestedErrorResponseSchema.safeParse(parsed);
      if (nestedResult.success) {
        const { error } = nestedResult.data;
        providerError = {
          message: error.message ?? String(nestedResult.data.error),
          code: error.code,
          type: error.type,
          metadata: error.metadata,
        };
        if (providerError.message) {
          errorMessage = providerError.message;
        }
      } else {
        // Try flat format: { message, code }
        const flatResult = ProviderFlatErrorResponseSchema.safeParse(parsed);
        if (flatResult.success) {
          providerError = {
            message: flatResult.data.message,
            code: flatResult.data.code,
          };
          errorMessage = flatResult.data.message;
        }
      }
    } catch {
      // responseBody is not valid JSON - use as plain text
      if (responseBody.length > 0 && responseBody.length < 500) {
        errorMessage = responseBody;
      }
    }
  }

  // Categorize error and determine retry strategy
  let errorCategory: ErrorCategory = ErrorCategories.UNKNOWN;
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
    errorCategory = ErrorCategories.PROVIDER_RATE_LIMIT;
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
    errorCategory = ErrorCategories.PROVIDER_NETWORK;
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
    errorCategory = ErrorCategories.MODEL_NOT_FOUND;
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
    errorCategory = ErrorCategories.MODEL_CONTENT_FILTER;
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
    errorCategory = ErrorCategories.AUTHENTICATION;
    errorIsTransient = false;
    shouldRetry = false;
  } else if (
    statusCode === 400
    || providerCode === 'invalid_request'
    || errorLower.includes('invalid')
    || errorLower.includes('malformed')
    || errorLower.includes('bad request')
  ) {
    errorCategory = ErrorCategories.VALIDATION;
    errorIsTransient = false;
    shouldRetry = false;
  } else {
    errorCategory = ErrorCategories.UNKNOWN;
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
