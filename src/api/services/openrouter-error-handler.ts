/**
 * OpenRouter Error Handler Service
 *
 * ✅ AI SDK v5 COMPLIANT: Uses APICallError and proper error type checking
 * ✅ OPENROUTER API COMPLIANT: Based on official error specification
 * ✅ ZOD-FIRST: All validation and type inference from Zod schemas
 *
 * Official OpenRouter Error Documentation:
 * https://openrouter.ai/docs/api-reference/errors
 *
 * Following AI SDK error handling best practices:
 * https://ai-sdk.dev/docs/ai-sdk-core/error-handling
 *
 * Following codebase patterns from:
 * - @/api/core/schemas.ts: ErrorContextSchema discriminated union
 * - @/api/routes/chat/schema.ts: Shared validation schemas with z.infer
 */

import { z } from '@hono/zod-openapi';
import { APICallError } from 'ai';

// ============================================================================
// OPENROUTER ERROR SCHEMAS (Official API Specification)
// ============================================================================

/**
 * OpenRouter error metadata schema
 * Contains provider-specific error details and moderation information
 *
 * Based on official spec: https://openrouter.ai/docs/api-reference/errors
 */
const OpenRouterErrorMetadataSchema = z.object({
  provider_name: z.string().optional(),
  raw: z.string().optional(),
  reasons: z.array(z.string()).optional(),
  flagged_input: z.string().optional(),
  // Additional documented fields that OpenRouter may include
  provider_status_code: z.number().optional(),
  provider_error_code: z.string().optional(),
});

/**
 * OpenRouter error object schema
 * Core error structure returned by OpenRouter API
 */
const OpenRouterErrorObjectSchema = z.object({
  code: z.number().int(),
  message: z.string(),
  metadata: OpenRouterErrorMetadataSchema.optional(),
});

/**
 * OpenRouter error response schema (complete API response)
 * This is what OpenRouter actually returns when an error occurs
 */
const OpenRouterErrorResponseSchema = z.object({
  error: OpenRouterErrorObjectSchema,
});

/**
 * OpenRouter error types enum
 * Based on documented HTTP status codes from official API
 */
export const OpenRouterErrorTypeSchema = z.enum([
  'rate_limit', // 429: Rate limited
  'model_unavailable', // 502/503: Model down or no provider available
  'invalid_request', // 400/404: Bad request, invalid params, CORS, config errors
  'authentication', // 401: Invalid credentials, expired OAuth
  'insufficient_credits', // 402: No credits available
  'moderation', // 403: Input flagged by moderation
  'timeout', // 408/504: Request timeout or gateway timeout
  'network', // Network errors, connection issues
  'empty_response', // Model returned no content
  'unknown', // Unclassified errors
]);

export type OpenRouterErrorType = z.infer<typeof OpenRouterErrorTypeSchema>;

/**
 * AI SDK retry error wrapper schema
 * AI SDK wraps errors in retry logic and stores the actual error in these properties
 */
export const RetryErrorWrapperSchema = z.custom<Error & {
  cause?: Error;
  lastError?: Error;
  errors?: Error[];
}>(data => data instanceof Error);

type RetryErrorWrapper = z.infer<typeof RetryErrorWrapperSchema>;

/**
 * Type guard to check if an error is a RetryErrorWrapper
 */
function isRetryErrorWrapper(error: Error): error is RetryErrorWrapper {
  return 'lastError' in error || 'errors' in error || 'cause' in error;
}

/**
 * Classified error schema
 * Result of error classification with metadata
 */
export const ClassifiedErrorSchema = z.object({
  type: OpenRouterErrorTypeSchema,
  message: z.string(),
  technicalMessage: z.string(),
  maxRetries: z.number().int().nonnegative(),
  baseDelayMs: z.number().int().nonnegative(),
  shouldRetry: z.boolean(),
  isTransient: z.boolean(),
});

export type ClassifiedError = z.infer<typeof ClassifiedErrorSchema>;

/**
 * Error format for database storage
 * Extended with all available debugging information
 */
export const DatabaseErrorFormatSchema = z.object({
  error: z.string(),
  errorMessage: z.string(),
  errorType: OpenRouterErrorTypeSchema,
  errorDetails: z.string(),
  isTransient: z.boolean(),
});

export type DatabaseErrorFormat = z.infer<typeof DatabaseErrorFormatSchema>;

// ============================================================================
// ERROR TYPE METADATA
// ============================================================================

/**
 * Error type metadata for classification and handling
 * Based on OpenRouter official HTTP status codes
 *
 * ⚠️ CLARIFICATION: This is metadata ONLY - not retry configuration
 * Actual retry count is controlled by AI_RETRY_CONFIG.maxAttempts = 10 in @/api/routes/chat/schema
 * The maxRetries field here indicates "suggested retries" but is NOT used for actual retry logic
 * Per USER REQUIREMENT: All errors retry 10 times via AI_RETRY_CONFIG
 */
const ERROR_TYPE_METADATA: Record<OpenRouterErrorType, {
  maxRetries: number;
  baseDelayMs: number;
  shouldRetry: boolean;
  isTransient: boolean;
}> = {
  // 429: Rate limited - transient, retry with backoff
  rate_limit: {
    maxRetries: 3,
    baseDelayMs: 2000,
    shouldRetry: true,
    isTransient: true,
  },
  // 502/503: Model unavailable or down - transient, retry
  model_unavailable: {
    maxRetries: 2,
    baseDelayMs: 3000,
    shouldRetry: true,
    isTransient: true,
  },
  // 400/404: Bad request - permanent, don't retry
  invalid_request: {
    maxRetries: 0,
    baseDelayMs: 0,
    shouldRetry: false,
    isTransient: false,
  },
  // 401: Authentication failed - permanent, don't retry
  authentication: {
    maxRetries: 0,
    baseDelayMs: 0,
    shouldRetry: false,
    isTransient: false,
  },
  // 402: Insufficient credits - permanent, don't retry
  insufficient_credits: {
    maxRetries: 0,
    baseDelayMs: 0,
    shouldRetry: false,
    isTransient: false,
  },
  // 403: Moderation flagged - permanent, don't retry
  moderation: {
    maxRetries: 0,
    baseDelayMs: 0,
    shouldRetry: false,
    isTransient: false,
  },
  // 408/504: Timeout - transient, retry
  timeout: {
    maxRetries: 2,
    baseDelayMs: 1000,
    shouldRetry: true,
    isTransient: true,
  },
  // Network errors - transient, retry
  network: {
    maxRetries: 3,
    baseDelayMs: 1000,
    shouldRetry: true,
    isTransient: true,
  },
  // Empty response - transient, retry once
  empty_response: {
    maxRetries: 1,
    baseDelayMs: 1000,
    shouldRetry: true,
    isTransient: true,
  },
  // Unknown errors - cautiously retry
  unknown: {
    maxRetries: 1,
    baseDelayMs: 2000,
    shouldRetry: true,
    isTransient: true,
  },
};

// ============================================================================
// ERROR EXTRACTION AND CLASSIFICATION
// ============================================================================

/**
 * Extracted error details schema
 * This is what extractErrorDetails returns after validation
 */
export const ExtractedErrorDetailsSchema = z.object({
  message: z.string().nullable(),
  code: z.number().nullable(),
  providerName: z.string().nullable(),
  providerRaw: z.string().nullable(),
  moderationReasons: z.array(z.string()).nullable(),
  flaggedInput: z.string().nullable(),
});

type ExtractedErrorDetails = z.infer<typeof ExtractedErrorDetailsSchema>;

/**
 * Extract and validate error details from OpenRouter response body
 * Uses Zod for runtime validation instead of manual type checking
 *
 * Priority:
 * 1. error.metadata.raw - Actual upstream provider error (MOST DETAILED)
 * 2. error.message - OpenRouter's error message
 * 3. error.code - HTTP status code for classification
 *
 * Handles string, object, or undefined response bodies
 */
export function extractErrorDetails(responseBody: string | object | undefined): ExtractedErrorDetails {
  // Handle undefined or string response bodies
  if (!responseBody || typeof responseBody === 'string') {
    return {
      message: null,
      code: null,
      providerName: null,
      providerRaw: null,
      moderationReasons: null,
      flaggedInput: null,
    };
  }

  // ✅ ZOD VALIDATION: Parse OpenRouter error response
  const result = OpenRouterErrorResponseSchema.safeParse(responseBody);

  if (!result.success) {
    // Not a valid OpenRouter error response
    return {
      message: null,
      code: null,
      providerName: null,
      providerRaw: null,
      moderationReasons: null,
      flaggedInput: null,
    };
  }

  const { error } = result.data;

  // Extract metadata if present
  const metadata = error.metadata;

  return {
    message: error.message,
    code: error.code,
    providerName: metadata?.provider_name ?? null,
    providerRaw: metadata?.raw ?? null,
    moderationReasons: metadata?.reasons ?? null,
    flaggedInput: metadata?.flagged_input ?? null,
  };
}

/**
 * ✅ AI SDK v5 COMPLIANT + OPENROUTER API COMPLIANT + ZOD-FIRST
 * Classify error using APICallError and OpenRouter error specification
 *
 * Classification strategy:
 * 1. Check for AI SDK retry wrapper errors (extract underlying error)
 * 2. Use HTTP status code ONLY for classification (NO string matching)
 * 3. Extract raw provider message from metadata.raw via Zod validation
 * 4. Use error.message as fallback
 *
 * OpenRouter HTTP Status Codes (official):
 * - 400: Bad Request (invalid params, CORS)
 * - 401: Invalid credentials
 * - 402: Insufficient credits
 * - 403: Moderation flagged
 * - 404: Not found (config/privacy issues)
 * - 408: Request timeout
 * - 429: Rate limited
 * - 500/502: Model down or invalid response
 * - 503: No available provider
 * - 504: Gateway timeout
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-errors/ai-api-call-error
 * @see https://openrouter.ai/docs/api-reference/errors
 */
export function classifyOpenRouterError(error: Error): ClassifiedError {
  // ✅ STEP 1: Check for AI SDK retry wrapper errors
  // AI SDK wraps errors like: "Failed after 3 attempts. Last error: <actual error>"
  // The ACTUAL error with all details is in error.lastError or error.errors[last]
  let actualError: Error = error;

  const retryMatch = error.message.match(/Failed after \d+ attempts\. Last error: (.+)/);
  if (retryMatch && isRetryErrorWrapper(error)) {
    // ✅ CRITICAL: Extract the actual APICallError from the retry wrapper
    // AI SDK stores the last error in error.lastError or error.errors array

    // Priority 1: Check lastError property (AI SDK retry pattern)
    if (error.lastError) {
      actualError = error.lastError;
    } else if (Array.isArray(error.errors) && error.errors.length > 0) {
      // Priority 2: Check errors array (get the last error)
      const lastError = error.errors[error.errors.length - 1];
      if (lastError) {
        actualError = lastError;
      }
    } else if (error.cause) {
      // Priority 3: Check cause property
      actualError = error.cause;
    }

    // If we found an underlying error (not the same as the wrapper), classify that
    if (actualError !== error) {
      return classifyOpenRouterError(actualError);
    }

    // If no underlying error found, create one with the extracted message
    const extractedError = new Error(retryMatch[1]);
    return classifyOpenRouterError(extractedError);
  }

  // ✅ STEP 2: Check if this is an AI SDK APICallError with OpenRouter response
  if (APICallError.isInstance(error)) {
    const { statusCode, responseBody, url } = error;

    // ✅ ZOD VALIDATION: Extract OpenRouter error details from response body
    const errorDetails = extractErrorDetails(responseBody);

    // Determine the message to show user (prioritize provider raw error)
    const displayMessage = errorDetails.providerRaw
      || errorDetails.message
      || `HTTP ${statusCode}`;

    // Build detailed technical message for logging
    const technicalParts: string[] = [`HTTP ${statusCode}`, `URL: ${url}`];

    if (errorDetails.code) {
      technicalParts.push(`Code: ${errorDetails.code}`);
    }
    if (errorDetails.providerName) {
      technicalParts.push(`Provider: ${errorDetails.providerName}`);
    }
    if (errorDetails.providerRaw) {
      technicalParts.push(`Raw: ${errorDetails.providerRaw}`);
    }
    if (errorDetails.moderationReasons && errorDetails.moderationReasons.length > 0) {
      technicalParts.push(`Moderation: ${errorDetails.moderationReasons.join(', ')}`);
    }
    if (errorDetails.flaggedInput) {
      technicalParts.push(`Flagged: ${errorDetails.flaggedInput}`);
    }

    const technicalMessage = technicalParts.join(' | ');

    // ✅ STEP 3: Classify based on HTTP status code ONLY (official OpenRouter codes)
    // NO string matching - rely solely on documented HTTP status codes
    switch (statusCode) {
      case 400: {
        // Bad Request: invalid params, CORS, etc.
        return {
          type: 'invalid_request',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.invalid_request,
        };
      }

      case 401: {
        // Invalid credentials, expired OAuth
        return {
          type: 'authentication',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.authentication,
        };
      }

      case 402: {
        // Insufficient credits
        return {
          type: 'insufficient_credits',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.insufficient_credits,
        };
      }

      case 403: {
        // Moderation flagged
        return {
          type: 'moderation',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.moderation,
        };
      }

      case 404: {
        // Not found - treat as invalid request
        // (e.g., "No endpoints found matching your data policy")
        return {
          type: 'invalid_request',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.invalid_request,
        };
      }

      case 408: {
        // Request timeout
        return {
          type: 'timeout',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.timeout,
        };
      }

      case 429: {
        // Rate limited
        return {
          type: 'rate_limit',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.rate_limit,
        };
      }

      case 500:
      case 502: {
        // Model down or invalid response
        return {
          type: 'model_unavailable',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.model_unavailable,
        };
      }

      case 503: {
        // No available provider
        return {
          type: 'model_unavailable',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.model_unavailable,
        };
      }

      case 504: {
        // Gateway timeout
        return {
          type: 'timeout',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.timeout,
        };
      }

      default: {
        // Unknown HTTP status code - return raw message
        return {
          type: 'unknown',
          message: displayMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.unknown,
        };
      }
    }
  }

  // ✅ STEP 4: Handle non-API errors (network, timeout, AbortError)
  // These don't have HTTP status codes, so we check error type/name
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: 'timeout',
      message: errorMessage,
      technicalMessage: errorMessage,
      ...ERROR_TYPE_METADATA.timeout,
    };
  }

  // For other errors, return unknown with raw message
  return {
    type: 'unknown',
    message: errorMessage || 'Unknown error',
    technicalMessage: errorMessage,
    ...ERROR_TYPE_METADATA.unknown,
  };
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(
  errorType: OpenRouterErrorType,
  retryAttempt: number,
): number {
  const config = ERROR_TYPE_METADATA[errorType];
  if (!config.shouldRetry || retryAttempt >= config.maxRetries) {
    return 0;
  }

  // Exponential backoff: baseDelay * 2^retryAttempt
  // With jitter to avoid thundering herd
  const exponentialDelay = config.baseDelayMs * 2 ** retryAttempt;
  const jitter = Math.random() * 500; // Add 0-500ms random jitter
  return exponentialDelay + jitter;
}

/**
 * Comprehensive error details object schema
 * Contains all available debugging information
 */
export const ErrorDetailsObjectSchema = z.object({
  technicalMessage: z.string(),
  userMessage: z.string(),
  modelId: z.string(),
  timestamp: z.string(),
  isTransient: z.boolean(),
  shouldRetry: z.boolean(),
  statusCode: z.number().optional(),
  url: z.string().optional(),
  isRetryable: z.boolean().optional(),
  openRouterMessage: z.string().optional(),
  openRouterCode: z.number().optional(),
  providerName: z.string().optional(),
  providerRaw: z.string().optional(),
  moderationReasons: z.array(z.string()).optional(),
  flaggedInput: z.string().optional(),
  responseBody: z.string().optional(),
  errorName: z.string().optional(),
  errorMessage: z.string().optional(),
  errorStack: z.string().optional(),
});

type ErrorDetailsObject = z.infer<typeof ErrorDetailsObjectSchema>;

/**
 * ✅ AI SDK v5 COMPLIANT + ZOD-FIRST
 * Format error for database storage with full context
 *
 * Includes all available error details from APICallError for debugging:
 * - HTTP status code
 * - Provider error message and code
 * - Request URL
 * - Response body (for debugging)
 * - Retry information
 */
export function formatErrorForDatabase(
  error: Error,
  modelId: string,
): DatabaseErrorFormat {
  const classified = classifyOpenRouterError(error);

  // Build comprehensive error details object
  const errorDetailsObj: Partial<ErrorDetailsObject> = {
    technicalMessage: classified.technicalMessage,
    userMessage: classified.message,
    modelId,
    timestamp: new Date().toISOString(),
    isTransient: classified.isTransient,
    shouldRetry: classified.shouldRetry,
  };

  // ✅ Add APICallError-specific details if available
  if (APICallError.isInstance(error)) {
    const { statusCode, url, responseBody, isRetryable } = error;

    errorDetailsObj.statusCode = statusCode;
    errorDetailsObj.url = url;
    errorDetailsObj.isRetryable = isRetryable;

    // ✅ ZOD VALIDATION: Extract OpenRouter-specific error details
    const openRouterDetails = extractErrorDetails(responseBody);
    if (openRouterDetails.message) {
      errorDetailsObj.openRouterMessage = openRouterDetails.message;
    }
    if (openRouterDetails.code) {
      errorDetailsObj.openRouterCode = openRouterDetails.code;
    }
    if (openRouterDetails.providerName) {
      errorDetailsObj.providerName = openRouterDetails.providerName;
    }
    if (openRouterDetails.providerRaw) {
      errorDetailsObj.providerRaw = openRouterDetails.providerRaw;
    }
    if (openRouterDetails.moderationReasons) {
      errorDetailsObj.moderationReasons = openRouterDetails.moderationReasons;
    }
    if (openRouterDetails.flaggedInput) {
      errorDetailsObj.flaggedInput = openRouterDetails.flaggedInput;
    }

    // Include raw response body for debugging (truncate if too large)
    const responseBodyStr = JSON.stringify(responseBody);
    errorDetailsObj.responseBody = responseBodyStr.length > 1000
      ? `${responseBodyStr.substring(0, 1000)}... (truncated)`
      : responseBodyStr;
  } else if (error instanceof Error) {
    // Include Error-specific details
    errorDetailsObj.errorName = error.name;
    errorDetailsObj.errorStack = error.stack;
  }

  return {
    error: classified.type,
    errorMessage: classified.message,
    errorType: classified.type,
    errorDetails: JSON.stringify(errorDetailsObj, null, 2),
    isTransient: classified.isTransient,
  };
}
