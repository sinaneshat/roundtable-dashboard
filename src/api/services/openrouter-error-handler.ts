/**
 * OpenRouter Error Handler Service
 *
 * ✅ AI SDK v5 COMPLIANT: Uses APICallError and proper error type checking
 * ✅ OPENROUTER API COMPLIANT: Based on official error specification
 * ✅ ZOD-FIRST: All types imported from route schemas (single source of truth)
 *
 * Official OpenRouter Error Documentation:
 * https://openrouter.ai/docs/api-reference/errors
 *
 * OpenRouter Error Response Format:
 * {
 *   error: {
 *     code: number;        // HTTP status code (400, 401, 402, 403, 408, 429, 502, 503)
 *     message: string;     // Error description
 *     metadata?: {
 *       provider_name?: string;  // Provider that encountered error
 *       raw?: string;            // Raw error from provider
 *       reasons?: string[];      // Moderation reasons (if 403)
 *       flagged_input?: string;  // Flagged text (if 403)
 *     }
 *   }
 * }
 *
 * Following AI SDK error handling best practices:
 * https://ai-sdk.dev/docs/ai-sdk-core/error-handling
 */

import { APICallError } from 'ai';

/**
 * OpenRouter error types for classification
 * Based on HTTP status codes from official documentation
 */
export type OpenRouterErrorType
  = | 'rate_limit' // 429: Rate limited
    | 'model_unavailable' // 502/503: Model down or no provider available
    | 'invalid_request' // 400: Bad request, invalid params, CORS
    | 'authentication' // 401: Invalid credentials, expired OAuth
    | 'insufficient_credits' // 402: No credits available
    | 'moderation' // 403: Input flagged by moderation
    | 'timeout' // 408: Request timeout
    | 'network' // Network errors, connection issues
    | 'empty_response' // Model returned no content
    | 'unknown'; // Unclassified errors

/**
 * Classified error with type metadata
 */
export type ClassifiedError = {
  type: OpenRouterErrorType;
  message: string;
  technicalMessage: string;
  maxRetries: number;
  baseDelayMs: number;
  shouldRetry: boolean;
  isTransient: boolean;
};

/**
 * Error type metadata for classification and handling
 * Based on OpenRouter official error codes
 *
 * ⚠️ CLARIFICATION: This is metadata ONLY - not retry configuration
 * Actual retry count is controlled by AI_RETRY_CONFIG.maxAttempts = 10 in @/api/routes/chat/schema
 * The maxRetries field here indicates "suggested retries" but is NOT used for actual retry logic
 * Per USER REQUIREMENT: All errors retry 10 times via AI_RETRY_CONFIG
 */
const ERROR_TYPE_METADATA: Record<OpenRouterErrorType, {
  maxRetries: number; // Metadata only - actual retries controlled by AI_RETRY_CONFIG
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
  // 400: Bad request - permanent, don't retry
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
  // 408: Timeout - transient, retry
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

/**
 * OpenRouter error response structure (official specification)
 * https://openrouter.ai/docs/api-reference/errors
 *
 * Note: This type is for documentation purposes only (not actively used in code)
 */
export type _OpenRouterErrorResponse = {
  error: {
    code: number; // HTTP status code
    message: string; // Error description
    metadata?: {
      provider_name?: string; // Provider that encountered error
      raw?: string; // Raw error from provider
      reasons?: string[]; // Moderation reasons (if 403)
      flagged_input?: string; // Flagged text (if 403)
    };
  };
};

/**
 * Extract error details from OpenRouter response body
 * Based on official OpenRouter error specification
 *
 * Priority:
 * 1. error.metadata.raw - Actual upstream provider error (MOST DETAILED)
 * 2. error.message - OpenRouter's error message
 * 3. error.code - HTTP status code for classification
 */
export function extractErrorDetails(responseBody: unknown): {
  message: string | null;
  code: number | null;
  providerName: string | null;
  providerRaw: string | null;
  moderationReasons: string[] | null;
  flaggedInput: string | null;
} {
  try {
    if (!responseBody || typeof responseBody !== 'object') {
      return {
        message: null,
        code: null,
        providerName: null,
        providerRaw: null,
        moderationReasons: null,
        flaggedInput: null,
      };
    }

    const body = responseBody as Record<string, unknown>;

    // OpenRouter official format: { error: { code, message, metadata } }
    if (body.error && typeof body.error === 'object') {
      const errorObj = body.error as Record<string, unknown>;

      const message = typeof errorObj.message === 'string' ? errorObj.message : null;
      const code = typeof errorObj.code === 'number' ? errorObj.code : null;

      // Extract metadata if present
      let providerName: string | null = null;
      let providerRaw: string | null = null;
      let moderationReasons: string[] | null = null;
      let flaggedInput: string | null = null;

      if (errorObj.metadata && typeof errorObj.metadata === 'object') {
        const metadata = errorObj.metadata as Record<string, unknown>;

        // Provider error details
        if (typeof metadata.provider_name === 'string') {
          providerName = metadata.provider_name;
        }
        if (typeof metadata.raw === 'string') {
          providerRaw = metadata.raw;
        }

        // Moderation error details (403)
        if (Array.isArray(metadata.reasons)) {
          moderationReasons = metadata.reasons.filter(r => typeof r === 'string') as string[];
        }
        if (typeof metadata.flagged_input === 'string') {
          flaggedInput = metadata.flagged_input;
        }
      }

      return {
        message,
        code,
        providerName,
        providerRaw,
        moderationReasons,
        flaggedInput,
      };
    }

    // Fallback: Try to extract message and code from top level
    const message = typeof body.message === 'string' ? body.message : null;
    const code = typeof body.code === 'number' ? body.code : null;

    return {
      message,
      code,
      providerName: null,
      providerRaw: null,
      moderationReasons: null,
      flaggedInput: null,
    };
  } catch {
    return {
      message: null,
      code: null,
      providerName: null,
      providerRaw: null,
      moderationReasons: null,
      flaggedInput: null,
    };
  }
}

/**
 * ✅ AI SDK v5 COMPLIANT + OPENROUTER API COMPLIANT
 * Classify error using APICallError and OpenRouter error specification
 *
 * Classification strategy:
 * 1. Check for AI SDK retry wrapper errors (extract underlying error)
 * 2. Use HTTP status code ONLY for classification (NO string matching)
 * 3. Extract raw provider message from metadata.raw
 * 4. Use error.message as fallback
 *
 * OpenRouter HTTP Status Codes (official):
 * - 400: Bad Request (invalid params, CORS)
 * - 401: Invalid credentials
 * - 402: Insufficient credits
 * - 403: Moderation flagged
 * - 408: Request timeout
 * - 429: Rate limited
 * - 502: Model down or invalid response
 * - 503: No available provider
 *
 * @see https://sdk.vercel.ai/docs/reference/ai-sdk-errors/ai-api-call-error
 * @see https://openrouter.ai/docs/api-reference/errors
 */
export function classifyOpenRouterError(error: unknown): ClassifiedError {
  // ✅ STEP 1: Check for AI SDK retry wrapper errors
  // AI SDK wraps errors like: "Failed after 3 attempts. Last error: <actual error>"
  // The ACTUAL error with all details is in error.lastError or error.errors[last]
  if (error instanceof Error) {
    const retryMatch = error.message.match(/Failed after \d+ attempts\. Last error: (.+)/);
    if (retryMatch) {
      // ✅ CRITICAL: Extract the actual APICallError from the retry wrapper
      // AI SDK stores the last error in error.lastError or error.errors array
      const errorObj = error as Error & {
        cause?: unknown;
        lastError?: unknown;
        errors?: unknown[];
      };

      // Try to get the underlying error with full details
      let underlyingError: unknown = error;

      // Priority 1: Check lastError property (AI SDK retry pattern)
      if (errorObj.lastError) {
        underlyingError = errorObj.lastError;
      } else if (Array.isArray(errorObj.errors) && errorObj.errors.length > 0) {
        // Priority 2: Check errors array (get the last error)
        underlyingError = errorObj.errors[errorObj.errors.length - 1];
      } else if (errorObj.cause) {
        // Priority 3: Check cause property
        underlyingError = errorObj.cause;
      }

      // If we found an underlying error (not the same as the wrapper), classify that
      if (underlyingError !== error) {
        return classifyOpenRouterError(underlyingError);
      }

      // If no underlying error found, create one with the extracted message
      const extractedError = new Error(retryMatch[1]);
      return classifyOpenRouterError(extractedError);
    }
  }

  // ✅ STEP 2: Check if this is an AI SDK APICallError with OpenRouter response
  if (APICallError.isInstance(error)) {
    const { statusCode, responseBody, url } = error;

    // Extract OpenRouter error details from response body
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
 * ✅ AI SDK v5 COMPLIANT: Format error for database storage with full context
 *
 * Includes all available error details from APICallError for debugging:
 * - HTTP status code
 * - Provider error message and code
 * - Request URL
 * - Response body (for debugging)
 * - Retry information
 */
export function formatErrorForDatabase(error: unknown, modelId: string): {
  error: string;
  errorMessage: string;
  errorType: OpenRouterErrorType;
  errorDetails: string;
  isTransient: boolean;
} {
  const classified = classifyOpenRouterError(error);

  // Build comprehensive error details object
  const errorDetailsObj: Record<string, unknown> = {
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

    // Extract OpenRouter-specific error details
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
