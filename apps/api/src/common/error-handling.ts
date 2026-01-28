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
import { log } from '@/lib/logger';

import { extractAISdkError, getErrorMessage, getErrorName } from './error-types';

// ============================================================================
// ERROR DETAILS SCHEMA (Discriminated Union)
// ============================================================================

const ServiceErrorDetailsSchema = z.object({
  detailType: z.literal('service_error'),
  originalError: z.string().optional(),
  serviceName: z.string(),
});

const ValidationErrorDetailsSchema = z.object({
  detailType: z.literal('validation_error'),
  fields: z.array(z.object({
    code: z.string().optional(),
    field: z.string(),
    message: z.string(),
  })),
});

const GenericErrorDetailsSchema = z.object({
  detailType: z.literal('generic'),
  info: z.string().optional(),
});

const BatchErrorDetailsSchema = z.object({
  currentSize: z.number().optional(),
  detailType: z.literal('batch'),
  originalError: z.string().optional(),
  statementCount: z.number().optional(),
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
  code: ErrorCodeSchema,
  context: ErrorContextSchema.optional(),
  correlationId: z.string().optional(),
  details: ErrorDetailsSchema.optional(),
  message: z.string().min(1),
  severity: ApiErrorSeveritySchema.optional().default('medium'),
  statusCode: z.number().int().min(100).max(599),
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
    this.timestamp = new Date();
    // Filter out undefined values for optional properties
    if (validated.details !== undefined) {
      this.details = validated.details;
    }
    if (validated.context !== undefined) {
      this.context = validated.context;
    }
    if (validated.correlationId !== undefined) {
      this.correlationId = validated.correlationId;
    }

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      code: this.code,
      context: this.sanitizeContext(),
      correlationId: this.correlationId,
      details: this.details,
      message: this.message,
      name: this.name,
      severity: this.severity,
      stack: this.stack,
      statusCode: this.statusCode,
      timestamp: this.timestamp.toISOString(),
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
    code = ErrorCodes.EXTERNAL_SERVICE_ERROR,
    context,
    correlationId,
    message,
    originalError,
    serviceName,
  }: {
    message: string;
    serviceName: string;
    code?: ErrorCode;
    originalError?: Error;
    context?: ErrorContext;
    correlationId?: string;
  }) {
    // Build config object, only including defined optional properties
    const config: AppErrorConfig = {
      code,
      details: {
        detailType: 'service_error',
        originalError: originalError?.message,
        serviceName,
      },
      message,
      severity: ApiErrorSeverities.HIGH,
      statusCode: HttpStatusCodes.BAD_GATEWAY,
    };
    if (context !== undefined) {
      config.context = context;
    }
    if (correlationId !== undefined) {
      config.correlationId = correlationId;
    }
    super(config);

    this.serviceName = serviceName;
    if (originalError !== undefined) {
      this.originalError = originalError;
    }
  }
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Helper to build AppErrorConfig with optional properties filtered out.
 * This satisfies exactOptionalPropertyTypes by only including defined values.
 */
function buildErrorConfig(
  base: {
    code: ErrorCode;
    message: string;
    severity: ApiErrorSeverity;
    statusCode: number;
  },
  context?: ErrorContext,
  correlationId?: string,
): AppErrorConfig {
  const config: AppErrorConfig = { ...base };
  if (context !== undefined) {
    config.context = context;
  }
  if (correlationId !== undefined) {
    config.correlationId = correlationId;
  }
  return config;
}

export const createError = {
  alreadyExists: (resource = 'Resource', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.RESOURCE_ALREADY_EXISTS,
      message: `${resource} already exists`,
      severity: ApiErrorSeverities.LOW,
      statusCode: HttpStatusCodes.CONFLICT,
    }, context, correlationId)),

  badRequest: (message = 'Invalid request', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      severity: ApiErrorSeverities.LOW,
      statusCode: HttpStatusCodes.BAD_REQUEST,
    }, context, correlationId)),

  conflict: (message = 'Resource conflict', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.RESOURCE_CONFLICT,
      message,
      severity: ApiErrorSeverities.MEDIUM,
      statusCode: HttpStatusCodes.CONFLICT,
    }, context, correlationId)),

  database: (message = 'Database operation failed', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.DATABASE_ERROR,
      message,
      severity: ApiErrorSeverities.CRITICAL,
      statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
    }, context, correlationId)),

  emailService: (message = 'Email service error', originalError?: Error, context?: ErrorContext, correlationId?: string) => {
    const config: {
      message: string;
      serviceName: string;
      code: ErrorCode;
      originalError?: Error;
      context?: ErrorContext;
      correlationId?: string;
    } = {
      code: ErrorCodes.EMAIL_SERVICE_ERROR,
      message,
      serviceName: 'Email',
    };
    if (originalError !== undefined) {
      config.originalError = originalError;
    }
    if (context !== undefined) {
      config.context = context;
    }
    if (correlationId !== undefined) {
      config.correlationId = correlationId;
    }
    return new ExternalServiceError(config);
  },

  gone: (message = 'Resource no longer available', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      message,
      severity: ApiErrorSeverities.LOW,
      statusCode: HttpStatusCodes.GONE,
    }, context, correlationId)),

  internal: (message = 'Internal server error', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.INTERNAL_SERVER_ERROR,
      message,
      severity: ApiErrorSeverities.CRITICAL,
      statusCode: HttpStatusCodes.INTERNAL_SERVER_ERROR,
    }, context, correlationId)),

  notFound: (resource = 'Resource', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.RESOURCE_NOT_FOUND,
      message: `${resource} not found`,
      severity: ApiErrorSeverities.LOW,
      statusCode: HttpStatusCodes.NOT_FOUND,
    }, context, correlationId)),

  rateLimit: (message = 'Too many requests', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.RATE_LIMIT_EXCEEDED,
      message,
      severity: ApiErrorSeverities.MEDIUM,
      statusCode: HttpStatusCodes.TOO_MANY_REQUESTS,
    }, context, correlationId)),

  tokenExpired: (message = 'Authentication token has expired', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.TOKEN_EXPIRED,
      message,
      severity: ApiErrorSeverities.LOW,
      statusCode: HttpStatusCodes.UNAUTHORIZED,
    }, context, correlationId)),

  unauthenticated: (message = 'Authentication required', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.UNAUTHENTICATED,
      message,
      severity: ApiErrorSeverities.MEDIUM,
      statusCode: HttpStatusCodes.UNAUTHORIZED,
    }, context, correlationId)),

  unauthorized: (message = 'Insufficient permissions', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.UNAUTHORIZED,
      message,
      severity: ApiErrorSeverities.MEDIUM,
      statusCode: HttpStatusCodes.FORBIDDEN,
    }, context, correlationId)),

  validation: (message = 'Validation failed', context?: ErrorContext, correlationId?: string) =>
    new AppError(buildErrorConfig({
      code: ErrorCodes.VALIDATION_ERROR,
      message,
      severity: ApiErrorSeverities.LOW,
      statusCode: HttpStatusCodes.BAD_REQUEST,
    }, context, correlationId)),

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
    limit: z.number().optional(),
    metaType: z.literal('rate_limit'),
    remaining: z.number().optional(),
    retryAfter: z.number().optional(),
  }),
  z.object({
    metaType: z.literal('model_info'),
    modelId: z.string().optional(),
    provider: z.string().optional(),
    reason: z.string().optional(),
  }),
  z.object({
    data: z.record(z.string(), z.string()).optional(),
    metaType: z.literal('raw'),
  }),
]);

// Type exported for internal schema validation - used by ProviderErrorDetailsSchema
type ProviderMetadata = z.infer<typeof ProviderMetadataSchema>;
export type { ProviderMetadata };

export const ProviderErrorDetailsSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  metadata: ProviderMetadataSchema.optional(),
  type: z.string().optional(),
});

export type ProviderErrorDetails = z.infer<typeof ProviderErrorDetailsSchema>;

// ============================================================================
// PROVIDER ERROR RESPONSE SCHEMAS (type-safe JSON parsing)
// ============================================================================

const ProviderNestedErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().optional(),
    message: z.string().optional(),
    metadata: ProviderMetadataSchema.optional(),
    type: z.string().optional(),
  }),
});

const ProviderFlatErrorResponseSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
});

export const AIProviderErrorMetadataSchema = z.object({
  cause: z.string().optional(),
  errorCategory: ErrorCategorySchema,
  errorMessage: z.string(),
  errorName: z.string(),
  errorType: z.string(),
  isTransient: z.boolean(),
  modelId: z.string().optional(),
  openRouterCode: z.string().optional(),
  openRouterError: z.string().optional(),
  openRouterMetadata: ProviderMetadataSchema.optional(),
  openRouterType: z.string().optional(),
  participantId: z.string().optional(),
  participantRole: z.string().nullable().optional(),
  rawErrorMessage: z.string(),
  requestId: z.string().optional(),
  responseBody: z.string().optional(),
  shouldRetry: z.boolean(),
  statusCode: z.number().optional(),
  traceId: z.string().optional(),
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

  log.error(`[StructErr] model=${participantContext?.modelId ?? '-'} isErr=${isErrorInstance} status=${errStatus} msg=${errMsg} body=${errBody}`);

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
          code: error.code,
          message: error.message ?? String(nestedResult.data.error),
          metadata: error.metadata,
          type: error.type,
        };
        if (providerError.message) {
          errorMessage = providerError.message;
        }
      } else {
        // Try flat format: { message, code }
        const flatResult = ProviderFlatErrorResponseSchema.safeParse(parsed);
        if (flatResult.success) {
          providerError = {
            code: flatResult.data.code,
            message: flatResult.data.message,
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
    cause: cause ? String(cause) : undefined,
    errorCategory,
    errorMessage,
    errorName,
    errorType,
    isTransient: errorIsTransient,
    modelId: participantContext?.modelId,
    openRouterCode: providerError?.code,
    openRouterError: providerError?.message,
    openRouterMetadata: providerError?.metadata,
    openRouterType: providerError?.type,
    participantId: participantContext?.id,
    participantRole: participantContext?.role,
    rawErrorMessage: errorMessage,
    requestId,
    responseBody: responseBody?.substring(0, 1000),
    shouldRetry,
    statusCode,
    traceId,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  AppError,
  ExternalServiceError,
};
