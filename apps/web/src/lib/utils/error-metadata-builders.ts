/**
 * Error Metadata Builders
 *
 * **PURPOSE**: Consolidate error detection, categorization, and message generation
 * **SINGLE SOURCE OF TRUTH**: All error metadata construction patterns
 *
 * This module consolidates:
 * - Error message generation from streaming.handler.ts
 * - OpenRouter error metadata extraction
 * - Error categorization logic
 * - Transient error detection
 *
 * Design Principles:
 * 1. Type-safe error detection with Zod validation
 * 2. Context-aware error message generation
 * 3. Categorization based on error patterns
 * 4. Transient vs permanent error classification
 *
 * References:
 * - message-persistence.service.ts:168-282 (extractErrorMetadata)
 * - posthog-llm-tracking.ts:634-649 (isTransientError)
 * - product-logic.service.ts:745-776 (isTransientError)
 */

import { ErrorCategorySchema, FinishReasonSchema } from '@roundtable/shared';
import type { LanguageModelUsage } from 'ai';

import { categorizeErrorMessage } from '@/lib/schemas/error-schemas';

import { isObject } from './type-guards';

// ============================================================================
// Types
// ============================================================================

export type ErrorMetadataFields = {
  hasError: boolean;
  openRouterError?: string;
  errorCategory?: string;
  errorMessage?: string;
  providerMessage?: string;
  isTransient: boolean;
  isPartialResponse: boolean;
};

export type OpenRouterErrorContext = {
  providerMetadata: unknown;
  response: unknown;
  finishReason: string;
  usage?: LanguageModelUsage;
  text?: string;
};

// ============================================================================
// Error Message Generation
// ============================================================================

/**
 * Generate context-aware error messages based on finish reason and token counts
 *
 * Builds detailed error messages that help users understand what went wrong:
 * - Content filtering/safety blocks
 * - Token limit exceeded
 * - Provider errors
 * - Empty responses
 *
 * @param finishReason - Finish reason from streaming response
 * @param usage - AI SDK LanguageModelUsage with token counts
 * @returns Tuple of [errorMessage, providerMessage, errorCategory]
 *
 * @example
 * ```typescript
 * const [error, provider, category] = generateErrorMessage('stop', { inputTokens: 1500, outputTokens: 0 });
 * // error: 'Returned empty response - possible content filtering or safety block'
 * // provider: 'Model completed but returned no content. Input: 1500 tokens...'
 * // category: 'content_filter'
 * ```
 */
export function generateErrorMessage(
  finishReason: string,
  usage: LanguageModelUsage,
): [errorMessage: string, providerMessage: string, errorCategory: string] {
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;
  const baseStats = `Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, Status: ${finishReason}`;

  if (finishReason === FinishReasonSchema.enum.stop) {
    return [
      'Returned empty response - possible content filtering or safety block',
      `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`,
      ErrorCategorySchema.enum.content_filter,
    ];
  }

  if (finishReason === FinishReasonSchema.enum.length) {
    return [
      'Exceeded token limit without generating content',
      `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`,
      ErrorCategorySchema.enum.provider_error,
    ];
  }

  if (finishReason === FinishReasonSchema.enum['content-filter']) {
    return [
      'Blocked by content filter',
      `Content was filtered by safety systems. ${baseStats}`,
      ErrorCategorySchema.enum.content_filter,
    ];
  }

  if (
    finishReason === FinishReasonSchema.enum.failed
    || finishReason === FinishReasonSchema.enum.other
  ) {
    return [
      'Encountered a provider error',
      `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`,
      ErrorCategorySchema.enum.provider_error,
    ];
  }

  // Default case
  return [
    `Returned empty response (reason: ${finishReason})`,
    `Model returned empty response. ${baseStats}`,
    ErrorCategorySchema.enum.empty_response,
  ];
}

// ============================================================================
// OpenRouter Error Extraction
// ============================================================================

/**
 * Extract OpenRouter-specific error details from provider metadata
 *
 * Checks multiple possible error field locations:
 * - providerMetadata.error
 * - providerMetadata.errorMessage
 * - providerMetadata.moderation (content filter)
 * - providerMetadata.contentFilter
 * - response.error
 *
 * @param context - Context containing provider metadata and response
 * @returns Tuple of [openRouterError, errorCategory] or [undefined, undefined]
 *
 * @example
 * ```typescript
 * const [error, category] = buildOpenRouterErrorMetadata({
 *   providerMetadata: { error: 'Model not found' },
 *   response: {},
 *   finishReason: 'failed',
 * });
 * // error: 'Model not found'
 * // category: 'model_not_found'
 * ```
 */
export function buildOpenRouterErrorMetadata(
  context: Pick<OpenRouterErrorContext, 'providerMetadata' | 'response'>,
): [openRouterError: string | undefined, errorCategory: string | undefined] {
  let openRouterError: string | undefined;
  let errorCategory: string | undefined;

  // Check providerMetadata for OpenRouter-specific errors
  if (isObject(context.providerMetadata)) {
    if (context.providerMetadata.error) {
      openRouterError
        = typeof context.providerMetadata.error === 'string'
          ? context.providerMetadata.error
          : JSON.stringify(context.providerMetadata.error);
    }
    if (!openRouterError && context.providerMetadata.errorMessage) {
      openRouterError = String(context.providerMetadata.errorMessage);
    }
    // Check for moderation/content filter errors
    if (
      context.providerMetadata.moderation
      || context.providerMetadata.contentFilter
    ) {
      errorCategory = ErrorCategorySchema.enum.content_filter;
      openRouterError
        = openRouterError || 'Content was filtered by safety systems';
    }
  }

  // Check response object for errors
  if (!openRouterError && isObject(context.response)) {
    if (context.response.error) {
      openRouterError
        = typeof context.response.error === 'string'
          ? context.response.error
          : JSON.stringify(context.response.error);
    }
  }

  return [openRouterError, errorCategory];
}

// ============================================================================
// Complete Error Metadata Builder
// ============================================================================

/**
 * Build complete error metadata from streaming response context
 *
 * **SINGLE SOURCE OF TRUTH**: All error metadata construction
 *
 * This function:
 * 1. Extracts OpenRouter error details
 * 2. Categorizes errors
 * 3. Generates context-aware error messages
 * 4. Detects partial responses
 * 5. Classifies transient vs permanent errors
 *
 * @param context - Full context from streaming handler
 * @returns Complete error metadata fields
 *
 * @example
 * ```typescript
 * const errorMeta = buildErrorMetadataFields({
 *   providerMetadata: { error: 'Rate limit exceeded' },
 *   response: {},
 *   finishReason: 'failed',
 *   usage: { inputTokens: 1000, outputTokens: 0 },
 *   text: '',
 * });
 * // {
 * //   hasError: true,
 * //   openRouterError: 'Rate limit exceeded',
 * //   errorCategory: 'rate_limit',
 * //   errorMessage: 'Rate limit exceeded',
 * //   providerMessage: 'Rate limit exceeded',
 * //   isTransient: true,
 * //   isPartialResponse: false
 * // }
 * ```
 */
export function buildErrorMetadataFields(
  context: OpenRouterErrorContext,
): ErrorMetadataFields {
  // Extract OpenRouter error details
  const [openRouterError, initialCategory]
    = buildOpenRouterErrorMetadata(context);

  // Determine if response is empty
  const outputTokens = context.usage?.outputTokens || 0;
  const hasGeneratedText = (context.text?.trim().length || 0) > 0;
  const isEmptyResponse = outputTokens === 0 && !hasGeneratedText;
  const hasError = isEmptyResponse || !!openRouterError;

  let errorMessage: string | undefined;
  let providerMessage: string | undefined;
  let errorCategory = initialCategory;

  if (hasError) {
    if (openRouterError) {
      // OpenRouter provided error details
      providerMessage = openRouterError;
      errorMessage = openRouterError;
      // Use canonical categorization, fallback to initial category if unknown
      const categorized = categorizeErrorMessage(openRouterError);
      errorCategory = categorized !== ErrorCategorySchema.enum.provider_error
        ? categorized
        : (errorCategory || categorized);
    } else if (outputTokens === 0 && context.usage) {
      // Empty response - generate context-aware messages
      const [genError, genProvider, genCategory] = generateErrorMessage(
        context.finishReason,
        context.usage,
      );
      errorMessage = genError;
      providerMessage = genProvider;
      errorCategory = genCategory;
    }
  }

  // Detect partial response: error occurred but some content was generated
  const isPartialResponse
    = hasError && ((context.text?.length || 0) > 0 || outputTokens > 0);

  // Determine if error is transient (worth retrying)
  const isTransient = hasError
    ? isTransientError(errorCategory, context.finishReason)
    : false;

  return {
    hasError,
    openRouterError,
    errorCategory,
    errorMessage,
    providerMessage,
    isTransient,
    isPartialResponse,
  };
}

// ============================================================================
// Transient Error Detection
// ============================================================================

/**
 * Determine if an error is transient (retriable)
 *
 * **CONSOLIDATED LOGIC**: Replaces 3+ implementations across codebase
 *
 * Transient errors:
 * - Provider errors (temporary service issues)
 * - Network errors (timeouts, connection failures)
 * - Rate limits (429, quota exceeded)
 * - Empty responses (unless explicit stop)
 *
 * Permanent errors:
 * - Model not found
 * - Content filter (user input issue)
 * - Invalid API key
 * - Unauthorized/forbidden
 * - Data policy violations
 *
 * @param errorCategory - Error category from ErrorCategorySchema
 * @param finishReason - Finish reason from streaming response
 * @returns True if error should be retried
 *
 * @example
 * ```typescript
 * isTransientError('rate_limit', 'failed'); // true - rate limits are temporary
 * isTransientError('model_not_found', 'failed'); // false - model doesn't exist
 * isTransientError('provider_error', 'failed'); // true - provider issue might resolve
 * ```
 *
 * @remarks
 * This function consolidates logic from:
 * - message-persistence.service.ts:266-271
 * - posthog-llm-tracking.ts:634-649
 * - product-logic.service.ts:745-776
 */
export function isTransientError(
  errorCategory?: string,
  finishReason?: string,
): boolean {
  if (!errorCategory) {
    return true; // Unknown errors are assumed transient
  }

  // Transient error categories
  const transientCategories = [
    ErrorCategorySchema.enum.provider_error,
    ErrorCategorySchema.enum.network,
    ErrorCategorySchema.enum.rate_limit,
  ];

  if (
    transientCategories.includes(
      errorCategory as (typeof transientCategories)[number],
    )
  ) {
    return true;
  }

  // Empty response is transient unless it's an explicit stop
  if (
    errorCategory === ErrorCategorySchema.enum.empty_response
    && finishReason !== FinishReasonSchema.enum.stop
  ) {
    return true;
  }

  // Permanent error categories (don't retry)
  const permanentCategories = [
    ErrorCategorySchema.enum.model_not_found,
    ErrorCategorySchema.enum.content_filter,
  ];

  return !permanentCategories.includes(
    errorCategory as (typeof permanentCategories)[number],
  );
}

/**
 * Check if error is transient based on error object or message
 *
 * Variant that accepts Error object or string for broader compatibility
 * Used by PostHog tracking and product logic
 *
 * @param error - Error object, message string, or unknown value
 * @returns True if error should be retried
 *
 * @example
 * ```typescript
 * const error = new Error('Rate limit exceeded');
 * error.statusCode = 429;
 * isTransientErrorFromObject(error); // true
 *
 * isTransientErrorFromObject('Model not found'); // false
 * isTransientErrorFromObject('Network timeout'); // true
 * ```
 */
export function isTransientErrorFromObject(error: unknown): boolean {
  if (!error) {
    return true; // No error is treated as transient
  }

  // ✅ TYPE-SAFE: Check HTTP status code if available using type guard
  let statusCode: number | undefined;
  if (isObject(error) && 'statusCode' in error && typeof error.statusCode === 'number') {
    statusCode = error.statusCode;
  }

  if (statusCode === 429 || statusCode === 503 || statusCode === 502) {
    return true; // Rate limits and server errors are transient
  }

  // Extract error message
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorLower = errorMessage.toLowerCase();

  // Permanent error patterns - don't retry (user action required)
  const permanentErrorPatterns = [
    'model not found',
    'invalid api key',
    'invalid model',
    'unauthorized',
    'forbidden',
    'model does not exist',
    'data policy',
    'no endpoints found',
    'payment required',
    'quota exceeded',
    'invalid request',
    'unsupported',
  ];

  for (const pattern of permanentErrorPatterns) {
    if (errorLower.includes(pattern)) {
      return false; // Don't retry permanent errors
    }
  }

  // Network errors are transient
  if (errorLower.includes('network') || errorLower.includes('timeout')) {
    return true;
  }

  // All other errors are considered transient - retry
  return true;
}
