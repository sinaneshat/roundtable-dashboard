/**
 * Unified AI Stream Error Handling
 *
 * Shared error types and utilities for AI streaming across frontend and backend.
 * Uses Zod schemas for type safety and validation.
 *
 * @see /src/api/services/openrouter.service.ts - Backend error handling
 * @see /src/components/chat/chat-message-error.tsx - Frontend error display
 */

import { z } from 'zod';

// ============================================================================
// Zod Schemas (Single Source of Truth)
// ============================================================================

/**
 * Error type enum - all possible AI stream error types
 */
export const AIStreamErrorTypeSchema = z.enum([
  'rate_limit', // 429 - Rate limiting
  'model_unavailable', // 503 - Model temporarily unavailable
  'invalid_request', // 400 - Bad request format
  'authentication', // 401/403 - Auth issues
  'timeout', // Request timeout
  'network', // Network/connection error
  'empty_response', // Model generated no content
  'model_error', // Model-specific error (safety, context length, etc.)
  'unknown', // Unclassified error
]);

/**
 * Classified error information
 */
export const ClassifiedErrorSchema = z.object({
  type: AIStreamErrorTypeSchema,
  message: z.string(), // User-friendly message
  technicalMessage: z.string(), // Technical details for logging
  shouldRetry: z.boolean(),
  retryAfterMs: z.number().optional(),
  isTransient: z.boolean(),
});

/**
 * Error metadata stored in database
 */
export const ErrorMetadataSchema = z.object({
  error: z.string(), // Error type string
  errorMessage: z.string(), // User-friendly message
  errorType: AIStreamErrorTypeSchema,
  errorDetails: z.string(), // JSON string with technical details
  isTransient: z.boolean(),
});

// ============================================================================
// Inferred Types (from Zod schemas)
// ============================================================================

export type AIStreamErrorType = z.infer<typeof AIStreamErrorTypeSchema>;
export type ClassifiedError = z.infer<typeof ClassifiedErrorSchema>;
export type ErrorMetadata = z.infer<typeof ErrorMetadataSchema>;

// ============================================================================
// Error Messages (User-Facing)
// ============================================================================

export const ERROR_MESSAGES: Record<AIStreamErrorType, string> = {
  rate_limit: 'This model is currently rate-limited. Please try again shortly or use a different model.',
  model_unavailable: 'This model is temporarily unavailable. Please try again in a few moments.',
  invalid_request: 'Unable to process request for this model. Please check your input.',
  authentication: 'Authentication error with AI provider. Please contact support.',
  timeout: 'Request timed out. Please try again.',
  network: 'Network connection issue. Please check your connection and try again.',
  empty_response: 'Model generated no response. Please try again.',
  model_error: 'Model encountered an error. This may be due to content filters or input length.',
  unknown: 'An unexpected error occurred. Please try again.',
};

// ============================================================================
// Error Classification Logic
// ============================================================================

/**
 * Classify error from AI SDK / OpenRouter
 *
 * Examines error message and returns classified error with user-friendly message
 */
export function classifyAIStreamError(error: unknown): ClassifiedError {
  const errorString = String(error);
  const errorMessage = error instanceof Error ? error.message : errorString;
  const errorLower = errorMessage.toLowerCase();

  // Rate limit (429)
  if (errorLower.includes('429') || errorLower.includes('rate limit') || errorLower.includes('rate-limit')) {
    return {
      type: 'rate_limit',
      message: ERROR_MESSAGES.rate_limit,
      technicalMessage: errorMessage,
      shouldRetry: false, // AI SDK already retried
      isTransient: true,
    };
  }

  // Model unavailable (503)
  if (errorLower.includes('503') || errorLower.includes('unavailable') || errorLower.includes('service unavailable')) {
    return {
      type: 'model_unavailable',
      message: ERROR_MESSAGES.model_unavailable,
      technicalMessage: errorMessage,
      shouldRetry: false,
      isTransient: true,
    };
  }

  // Bad request (400)
  if (errorLower.includes('400') || errorLower.includes('bad request') || errorLower.includes('invalid')) {
    return {
      type: 'invalid_request',
      message: ERROR_MESSAGES.invalid_request,
      technicalMessage: errorMessage,
      shouldRetry: false,
      isTransient: false,
    };
  }

  // Authentication (401/403)
  if (errorLower.includes('401') || errorLower.includes('403') || errorLower.includes('unauthorized') || errorLower.includes('forbidden')) {
    return {
      type: 'authentication',
      message: ERROR_MESSAGES.authentication,
      technicalMessage: errorMessage,
      shouldRetry: false,
      isTransient: false,
    };
  }

  // Timeout
  if (errorLower.includes('timeout') || errorLower.includes('timed out')) {
    return {
      type: 'timeout',
      message: ERROR_MESSAGES.timeout,
      technicalMessage: errorMessage,
      shouldRetry: false,
      isTransient: true,
    };
  }

  // Network errors
  if (errorLower.includes('network') || errorLower.includes('connection') || errorLower.includes('econnrefused') || errorLower.includes('enotfound')) {
    return {
      type: 'network',
      message: ERROR_MESSAGES.network,
      technicalMessage: errorMessage,
      shouldRetry: false,
      isTransient: true,
    };
  }

  // Empty response
  if (errorLower.includes('empty') || errorLower.includes('no content') || errorLower.includes('no response')) {
    return {
      type: 'empty_response',
      message: ERROR_MESSAGES.empty_response,
      technicalMessage: errorMessage,
      shouldRetry: false,
      isTransient: true,
    };
  }

  // Model-specific errors
  if (errorLower.includes('safety') || errorLower.includes('content filter') || errorLower.includes('context length') || errorLower.includes('token limit')) {
    return {
      type: 'model_error',
      message: ERROR_MESSAGES.model_error,
      technicalMessage: errorMessage,
      shouldRetry: false,
      isTransient: false,
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    message: ERROR_MESSAGES.unknown,
    technicalMessage: errorMessage,
    shouldRetry: false,
    isTransient: true,
  };
}

/**
 * Format error for database storage
 */
export function formatErrorForDatabase(error: unknown, modelId: string): ErrorMetadata {
  const classified = classifyAIStreamError(error);

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

/**
 * Parse error metadata from database
 */
export function parseErrorMetadata(metadata: unknown): ErrorMetadata | null {
  try {
    const parsed = ErrorMetadataSchema.safeParse(metadata);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
