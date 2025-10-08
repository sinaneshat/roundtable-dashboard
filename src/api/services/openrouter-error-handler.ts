/**
 * OpenRouter Error Handler Service
 *
 * Provides error classification, retry logic, and user-friendly error messages
 * for OpenRouter API failures during AI model streaming
 */

/**
 * Error classification types for different failure scenarios
 */
export type OpenRouterErrorType =
  | 'rate_limit' // 429 - Rate limiting
  | 'model_unavailable' // 503 - Model temporarily unavailable
  | 'invalid_request' // 400 - Bad request format
  | 'authentication' // 401/403 - Auth issues
  | 'timeout' // Request timeout
  | 'network' // Network/connection error
  | 'empty_response' // Model generated no content
  | 'model_error' // Model-specific error (safety, context length, etc.)
  | 'unknown'; // Unclassified error

/**
 * Classified error information with retry guidance
 */
export type ClassifiedError = {
  type: OpenRouterErrorType;
  message: string; // User-friendly message
  technicalMessage: string; // Technical details for logging
  shouldRetry: boolean;
  retryAfterMs?: number; // Suggested retry delay
  isTransient: boolean; // Whether error is likely temporary
};

/**
 * Retry configuration for different error types
 */
const RETRY_CONFIG: Record<OpenRouterErrorType, {
  maxRetries: number;
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
 * Classify error from OpenRouter/AI SDK
 */
export function classifyOpenRouterError(error: unknown): ClassifiedError {
  const errorString = String(error);
  const errorMessage = error instanceof Error ? error.message : errorString;
  const errorLower = errorMessage.toLowerCase();

  // Check for HTTP status code patterns
  if (errorLower.includes('429') || errorLower.includes('rate limit')) {
    return {
      type: 'rate_limit',
      message: ERROR_MESSAGES.rate_limit,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.rate_limit,
    };
  }

  if (errorLower.includes('503') || errorLower.includes('service unavailable') || errorLower.includes('model unavailable')) {
    return {
      type: 'model_unavailable',
      message: ERROR_MESSAGES.model_unavailable,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.model_unavailable,
    };
  }

  if (errorLower.includes('400') || errorLower.includes('bad request') || errorLower.includes('invalid')) {
    return {
      type: 'invalid_request',
      message: ERROR_MESSAGES.invalid_request,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.invalid_request,
    };
  }

  if (errorLower.includes('401') || errorLower.includes('403') || errorLower.includes('unauthorized') || errorLower.includes('forbidden')) {
    return {
      type: 'authentication',
      message: ERROR_MESSAGES.authentication,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.authentication,
    };
  }

  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      type: 'timeout',
      message: ERROR_MESSAGES.timeout,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.timeout,
    };
  }

  if (errorLower.includes('network') || errorLower.includes('connection') || errorLower.includes('econnrefused') || errorLower.includes('enotfound')) {
    return {
      type: 'network',
      message: ERROR_MESSAGES.network,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.network,
    };
  }

  if (errorLower.includes('empty') || errorLower.includes('no content') || errorLower.includes('no response')) {
    return {
      type: 'empty_response',
      message: ERROR_MESSAGES.empty_response,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.empty_response,
    };
  }

  if (errorLower.includes('safety') || errorLower.includes('content filter') || errorLower.includes('context length') || errorLower.includes('token limit')) {
    return {
      type: 'model_error',
      message: ERROR_MESSAGES.model_error,
      technicalMessage: errorMessage,
      ...RETRY_CONFIG.model_error,
    };
  }

  // Default to unknown error
  return {
    type: 'unknown',
    message: ERROR_MESSAGES.unknown,
    technicalMessage: errorMessage,
    ...RETRY_CONFIG.unknown,
  };
}

/**
 * Calculate retry delay with exponential backoff
 */
export function calculateRetryDelay(
  errorType: OpenRouterErrorType,
  retryAttempt: number,
): number {
  const config = RETRY_CONFIG[errorType];
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
 * Check if error should be retried
 */
export function shouldRetryError(
  errorType: OpenRouterErrorType,
  retryAttempt: number,
): boolean {
  const config = RETRY_CONFIG[errorType];
  return config.shouldRetry && retryAttempt < config.maxRetries;
}

/**
 * Format error for database storage
 */
export function formatErrorForDatabase(error: unknown, modelId: string): {
  error: string;
  errorMessage: string;
  errorType: OpenRouterErrorType;
  errorDetails: string;
  isTransient: boolean;
} {
  const classified = classifyOpenRouterError(error);

  return {
    error: classified.type,
    errorMessage: classified.message,
    errorType: classified.type,
    errorDetails: JSON.stringify({
      technicalMessage: classified.technicalMessage,
      modelId,
      timestamp: new Date().toISOString(),
      isTransient: classified.isTransient,
    }),
    isTransient: classified.isTransient,
  };
}
