/**
 * OpenRouter Error Handler Service
 *
 * ✅ AI SDK v5 COMPLIANT: Uses APICallError and proper error type checking
 * ✅ ZOD-FIRST: All types imported from route schemas (single source of truth)
 *
 * Following AI SDK error handling best practices:
 * https://ai-sdk.dev/docs/ai-sdk-core/error-handling
 */

import { APICallError } from 'ai';

/**
 * OpenRouter error types for classification
 */
export type OpenRouterErrorType =
  | 'rate_limit'
  | 'model_unavailable'
  | 'invalid_request'
  | 'authentication'
  | 'model_error'
  | 'timeout'
  | 'network'
  | 'empty_response'
  | 'unknown';

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
  rate_limit: {
    maxRetries: 3,
    baseDelayMs: 2000,
    shouldRetry: true,
    isTransient: true,
  },
  model_unavailable: {
    maxRetries: 2,
    baseDelayMs: 3000,
    shouldRetry: true,
    isTransient: true,
  },
  invalid_request: {
    maxRetries: 0,
    baseDelayMs: 0,
    shouldRetry: false,
    isTransient: false,
  },
  authentication: {
    maxRetries: 0,
    baseDelayMs: 0,
    shouldRetry: false,
    isTransient: false,
  },
  timeout: {
    maxRetries: 2,
    baseDelayMs: 1000,
    shouldRetry: true,
    isTransient: true,
  },
  network: {
    maxRetries: 3,
    baseDelayMs: 1000,
    shouldRetry: true,
    isTransient: true,
  },
  empty_response: {
    maxRetries: 1,
    baseDelayMs: 1000,
    shouldRetry: true,
    isTransient: true,
  },
  model_error: {
    maxRetries: 0,
    baseDelayMs: 0,
    shouldRetry: false,
    isTransient: false,
  },
  unknown: {
    maxRetries: 1,
    baseDelayMs: 2000,
    shouldRetry: true,
    isTransient: true,
  },
};

/**
 * User-friendly error messages for each error type
 */
const ERROR_MESSAGES: Record<OpenRouterErrorType, string> = {
  rate_limit: 'This model is currently experiencing high demand. Retrying...',
  model_unavailable: 'This model is temporarily unavailable. Retrying with a different server...',
  invalid_request: 'Unable to process request for this model. Please check your input.',
  authentication: 'Authentication error with AI provider. Please contact support.',
  timeout: 'Request timed out. Retrying...',
  network: 'Network connection issue. Retrying...',
  empty_response: 'Model generated no response. Retrying...',
  model_error: 'This model encountered an error processing your request. This may be due to content filters or input length.',
  unknown: 'An unexpected error occurred. Retrying...',
};

/**
 * Extract error details from OpenRouter/AI provider response body
 *
 * OpenRouter error format hierarchy (prioritize most detailed):
 * 1. error.metadata.raw - Actual upstream provider message (MOST DETAILED)
 * 2. error.message - OpenRouter's wrapper message
 * 3. message - Fallback top-level message
 */
export function extractErrorDetails(responseBody: unknown): {
  providerMessage: string | null;
  providerCode: string | null;
} {
  try {
    if (!responseBody || typeof responseBody !== 'object') {
      return { providerMessage: null, providerCode: null };
    }

    const body = responseBody as Record<string, unknown>;

    // OpenRouter error format: { error: { message: string, code?: string, metadata?: { raw: string } } }
    if (body.error && typeof body.error === 'object') {
      const errorObj = body.error as Record<string, unknown>;

      // ✅ PRIORITY 1: Check metadata.raw for upstream provider's actual message
      // This contains the REAL error from the model provider (e.g., "deepseek/deepseek-r1:free is temporarily rate-limited upstream...")
      if (errorObj.metadata && typeof errorObj.metadata === 'object') {
        const metadata = errorObj.metadata as Record<string, unknown>;
        if (typeof metadata.raw === 'string' && metadata.raw.trim()) {
          return {
            providerMessage: metadata.raw,
            providerCode: typeof errorObj.code === 'string' ? errorObj.code : null,
          };
        }
      }

      // ✅ PRIORITY 2: Fall back to error.message (usually generic like "Provider returned error")
      if (typeof errorObj.message === 'string' && errorObj.message.trim()) {
        return {
          providerMessage: errorObj.message,
          providerCode: typeof errorObj.code === 'string' ? errorObj.code : null,
        };
      }

      return {
        providerMessage: null,
        providerCode: typeof errorObj.code === 'string' ? errorObj.code : null,
      };
    }

    // Alternative format: { message: string, code?: string }
    if (body.message) {
      return {
        providerMessage: typeof body.message === 'string' ? body.message : null,
        providerCode: typeof body.code === 'string' ? body.code : null,
      };
    }

    return { providerMessage: null, providerCode: null };
  } catch {
    return { providerMessage: null, providerCode: null };
  }
}

/**
 * ✅ AI SDK v5 COMPLIANT: Classify error using APICallError
 *
 * Following AI SDK error handling patterns:
 * - Uses APICallError.isInstance() for type checking
 * - Extracts statusCode for accurate classification
 * - Parses responseBody for provider-specific error messages
 * - Falls back to error.message for non-API errors
 *
 * @see https://ai-sdk.dev/docs/reference/ai-sdk-errors/ai-api-call-error
 */
export function classifyOpenRouterError(error: unknown): ClassifiedError {
  // ✅ STEP 0: Check for AI SDK retry wrapper errors
  // AI SDK wraps errors like: "Failed after 3 attempts. Last error: <actual error>"
  // The ACTUAL error with all details is in error.lastError or error.errors[last]
  if (error instanceof Error) {
    const retryMatch = error.message.match(/Failed after \d+ attempts\. Last error: (.+)/);
    if (retryMatch) {
      const actualErrorMessage = retryMatch[1];

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
      // This should rarely happen - it means AI SDK changed their error structure
      const extractedError = new Error(actualErrorMessage);
      return classifyOpenRouterError(extractedError);
    }
  }

  // ✅ STEP 1: Check if this is an AI SDK APICallError
  if (APICallError.isInstance(error)) {
    const { statusCode, responseBody, url } = error;

    // Extract detailed error message from response body
    const { providerMessage, providerCode } = extractErrorDetails(responseBody);

    // Build detailed technical message for logging
    const technicalParts: string[] = [
      `HTTP ${statusCode}`,
      `URL: ${url}`,
    ];

    if (providerCode) {
      technicalParts.push(`Code: ${providerCode}`);
    }

    if (providerMessage) {
      technicalParts.push(`Provider: ${providerMessage}`);
    } else {
      // Include raw response body for debugging if no structured message
      technicalParts.push(`Body: ${JSON.stringify(responseBody)}`);
    }

    const technicalMessage = technicalParts.join(' | ');

    // ✅ STEP 2: Classify based on HTTP status code (most reliable)
    switch (statusCode) {
      case 429: {
        // Rate limit - ALWAYS use provider message if available for max detail
        // Provider message contains specific info like "deepseek/deepseek-r1:free is temporarily rate-limited upstream..."
        const userMessage = providerMessage || ERROR_MESSAGES.rate_limit;

        return {
          type: 'rate_limit',
          message: userMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.rate_limit,
        };
      }

      case 503: {
        // Service unavailable / model unavailable
        const userMessage = providerMessage || ERROR_MESSAGES.model_unavailable;
        return {
          type: 'model_unavailable',
          message: userMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.model_unavailable,
        };
      }

      case 400: {
        // Bad request - show provider's specific error
        const userMessage = providerMessage || ERROR_MESSAGES.invalid_request;
        return {
          type: 'invalid_request',
          message: userMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.invalid_request,
        };
      }

      case 401:
      case 403: {
        // Authentication error
        const userMessage = providerMessage || ERROR_MESSAGES.authentication;
        return {
          type: 'authentication',
          message: userMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.authentication,
        };
      }

      case 500:
      case 502:
      case 504: {
        // Server errors
        const userMessage = providerMessage || 'The AI service encountered a server error. Retrying...';
        return {
          type: 'model_unavailable',
          message: userMessage,
          technicalMessage,
          ...ERROR_TYPE_METADATA.model_unavailable,
        };
      }

      default: {
        // ✅ STEP 3: Check provider message for specific error types
        if (providerMessage) {
          const messageLower = providerMessage.toLowerCase();

          // Check for context length / token limit errors
          if (messageLower.includes('context') || messageLower.includes('token') || messageLower.includes('length')) {
            return {
              type: 'model_error',
              message: `Context length exceeded: ${providerMessage}`,
              technicalMessage,
              ...ERROR_TYPE_METADATA.model_error,
            };
          }

          // Check for safety/content filter errors
          if (messageLower.includes('safety') || messageLower.includes('filter') || messageLower.includes('policy')) {
            return {
              type: 'model_error',
              message: `Content filtered: ${providerMessage}`,
              technicalMessage,
              ...ERROR_TYPE_METADATA.model_error,
            };
          }

          // Use provider message directly for unknown status codes
          return {
            type: 'unknown',
            message: providerMessage,
            technicalMessage,
            ...ERROR_TYPE_METADATA.unknown,
          };
        }

        // No provider message, use generic error
        return {
          type: 'unknown',
          message: ERROR_MESSAGES.unknown,
          technicalMessage,
          ...ERROR_TYPE_METADATA.unknown,
        };
      }
    }
  }

  // ✅ STEP 4: Handle non-API errors (network, timeout, etc.)
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Check error message for specific patterns
  if (error instanceof Error && error.name === 'AbortError') {
    return {
      type: 'timeout',
      message: ERROR_MESSAGES.timeout,
      technicalMessage: errorMessage,
      ...ERROR_TYPE_METADATA.timeout,
    };
  }

  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      type: 'timeout',
      message: ERROR_MESSAGES.timeout,
      technicalMessage: errorMessage,
      ...ERROR_TYPE_METADATA.timeout,
    };
  }

  if (errorLower.includes('network') || errorLower.includes('connection') || errorLower.includes('econnrefused') || errorLower.includes('enotfound') || errorLower.includes('fetch')) {
    return {
      type: 'network',
      message: ERROR_MESSAGES.network,
      technicalMessage: errorMessage,
      ...ERROR_TYPE_METADATA.network,
    };
  }

  // ✅ USER FIX: Check for "high demand" / rate limit messages
  // Even if not HTTP 429, treat as rate limit for proper retry handling
  if (errorLower.includes('high demand') || errorLower.includes('rate limit') || errorLower.includes('too many requests')) {
    return {
      type: 'rate_limit',
      message: ERROR_MESSAGES.rate_limit,
      technicalMessage: errorMessage,
      ...ERROR_TYPE_METADATA.rate_limit,
    };
  }

  if (errorLower.includes('empty') || errorLower.includes('no content') || errorLower.includes('no response')) {
    return {
      type: 'empty_response',
      message: ERROR_MESSAGES.empty_response,
      technicalMessage: errorMessage,
      ...ERROR_TYPE_METADATA.empty_response,
    };
  }

  // Default to unknown error with the actual error message
  return {
    type: 'unknown',
    message: errorMessage || ERROR_MESSAGES.unknown,
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

    // Extract provider-specific error details
    const { providerMessage, providerCode } = extractErrorDetails(responseBody);
    if (providerMessage) {
      errorDetailsObj.providerMessage = providerMessage;
    }
    if (providerCode) {
      errorDetailsObj.providerCode = providerCode;
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
