/**
 * Error Metadata Service - Unified Error Extraction and Categorization
 *
 * ✅ SINGLE SOURCE OF TRUTH: Uses schemas from @/lib/schemas/error-schemas.ts
 * ✅ ZERO-CASTING PRINCIPLE: All type validations via Zod schemas
 * ✅ TYPE-SAFE: No any types, strict null checks, comprehensive error metadata
 * ✅ ENUM-BASED PATTERNS: Uses ErrorCategorySchema.enum.* for constants
 *
 * This service provides:
 * - Unified error metadata extraction from AI provider responses
 * - Error categorization following ErrorCategorySchema
 * - Transient error detection for retry logic
 * - Empty response error building with context-aware messages
 * - Provider-specific error extraction (OpenRouter, OpenAI, etc.)
 *
 * @see /docs/backend-patterns.md - Service layer patterns
 * @see /src/lib/schemas/error-schemas.ts - Error category schemas (SINGLE SOURCE OF TRUTH)
 * @see /src/lib/schemas/message-metadata.ts - Finish reason schemas
 */

import { z } from 'zod';

import type { ErrorCategory } from '@/api/core/enums';
import { ErrorCategorySchema, FinishReasonSchema } from '@/api/core/enums';
import { categorizeErrorMessage } from '@/lib/schemas/error-schemas';
import { isObject } from '@/lib/utils';

// ============================================================================
// TYPE DEFINITIONS (Zod Schemas - Single Source of Truth)
// ============================================================================

/**
 * Error metadata structure returned by extraction functions
 * Provides comprehensive error context for storage and display
 */
export const ErrorMetadataSchema = z.object({
  hasError: z.boolean().describe('Whether an error occurred'),
  openRouterError: z.string().optional().describe('Raw OpenRouter/provider error message'),
  errorCategory: ErrorCategorySchema.optional().describe('Categorized error type for UI handling'),
  errorMessage: z.string().optional().describe('Human-readable error message for display'),
  providerMessage: z.string().optional().describe('Detailed provider message for debugging'),
  isTransientError: z.boolean().describe('Whether error is transient (worth retrying)'),
  isPartialResponse: z.boolean().describe('Whether partial content was generated despite error'),
});

export type ErrorMetadata = z.infer<typeof ErrorMetadataSchema>;

/**
 * Parameters for extractErrorMetadata function
 * Includes all context needed for comprehensive error detection
 */
export const ExtractErrorMetadataParamsSchema = z.object({
  providerMetadata: z.unknown().describe('Provider metadata from AI SDK (may contain error details)'),
  response: z.unknown().describe('Raw response object from provider'),
  finishReason: z.string().describe('AI SDK finish reason'),
  usage: z.object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
  }).optional().describe('Token usage statistics'),
  text: z.string().optional().describe('Generated text content (to detect partial responses)'),
  reasoning: z.string().optional().describe('Generated reasoning content (for o1/o3 models that output reasoning instead of text)'),
});

export type ExtractErrorMetadataParams = z.infer<typeof ExtractErrorMetadataParamsSchema>;

/**
 * Parameters for buildEmptyResponseError function
 * Context for generating detailed empty response error messages
 */
export const BuildEmptyResponseErrorParamsSchema = z.object({
  inputTokens: z.number().describe('Number of input tokens'),
  outputTokens: z.number().describe('Number of output tokens (should be 0 for empty response)'),
  finishReason: z.string().describe('AI SDK finish reason'),
});

export type BuildEmptyResponseErrorParams = z.infer<typeof BuildEmptyResponseErrorParamsSchema>;

/**
 * Provider error extraction result
 * Contains both raw error and categorization
 */
export const ProviderErrorResultSchema = z.object({
  rawError: z.string().optional().describe('Raw error message from provider'),
  category: ErrorCategorySchema.optional().describe('Categorized error type'),
});

export type ProviderErrorResult = z.infer<typeof ProviderErrorResultSchema>;

// ============================================================================
// ERROR CATEGORIZATION
// ============================================================================

/**
 * Categorize error based on error message content
 *
 * ✅ DELEGATED: Uses categorizeErrorMessage from @/lib/schemas/error-schemas.ts
 * ✅ SINGLE SOURCE OF TRUTH: No duplicate logic
 *
 * @param errorMessage - Raw error message from provider
 * @returns Typed error category from ErrorCategorySchema
 *
 * @example
 * ```typescript
 * const category = categorizeError('Rate limit exceeded');
 * // Returns: 'rate_limit'
 * ```
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  return categorizeErrorMessage(errorMessage);
}

// ============================================================================
// TRANSIENT ERROR DETECTION
// ============================================================================

/**
 * Determine if error is transient (worth retrying)
 *
 * ✅ CENTRALIZED LOGIC: Single source for retry decision
 * ✅ TYPE-SAFE: Uses Zod enum values for categories and finish reasons
 *
 * Transient errors include:
 * - Provider errors (server issues)
 * - Network errors (connectivity)
 * - Rate limits (temporary quota)
 * - Empty responses with non-stop finish reasons (incomplete generation)
 *
 * @param errorCategory - Categorized error type
 * @param finishReason - AI SDK finish reason
 * @returns Whether error is transient
 *
 * @example
 * ```typescript
 * const shouldRetry = isTransientError('rate_limit', 'other');
 * // Returns: true
 * ```
 */
export function isTransientError(
  errorCategory: ErrorCategory | undefined,
  finishReason: string,
): boolean {
  if (!errorCategory) {
    return false;
  }

  // Transient error categories (always worth retrying)
  const transientCategories: ErrorCategory[] = [
    ErrorCategorySchema.enum.provider_error,
    ErrorCategorySchema.enum.network,
    ErrorCategorySchema.enum.rate_limit,
  ];

  if (transientCategories.includes(errorCategory)) {
    return true;
  }

  // Empty response errors are transient unless finish reason is 'stop'
  // (stop = model intentionally completed with no output, likely content filter)
  if (errorCategory === ErrorCategorySchema.enum.empty_response) {
    return finishReason !== FinishReasonSchema.enum.stop;
  }

  return false;
}

// ============================================================================
// PROVIDER ERROR EXTRACTION
// ============================================================================

/**
 * Extract provider-specific error details from metadata and response
 *
 * ✅ TYPE-SAFE: Uses isObject type guard instead of casting
 * ✅ COMPREHENSIVE: Checks multiple error field locations
 *
 * Checks for errors in:
 * 1. providerMetadata.error
 * 2. providerMetadata.errorMessage
 * 3. providerMetadata.moderation (content filter)
 * 4. providerMetadata.contentFilter
 * 5. response.error
 *
 * @param providerMetadata - Provider metadata from AI SDK
 * @param response - Raw response object from provider
 * @returns Provider error result with raw error and category
 *
 * @example
 * ```typescript
 * const { rawError, category } = extractProviderError(metadata, response);
 * // Returns: { rawError: 'Model not found', category: 'model_not_found' }
 * ```
 */
export function extractProviderError(
  providerMetadata: unknown,
  response: unknown,
): ProviderErrorResult {
  let rawError: string | undefined;
  let category: ErrorCategory | undefined;

  // ✅ TYPE-SAFE: Check providerMetadata with type guard
  if (isObject(providerMetadata)) {
    // Extract error field (string or object)
    if (providerMetadata.error) {
      rawError
        = typeof providerMetadata.error === 'string'
          ? providerMetadata.error
          : JSON.stringify(providerMetadata.error);
    }

    // Check errorMessage field as fallback
    if (!rawError && providerMetadata.errorMessage) {
      rawError = String(providerMetadata.errorMessage);
    }

    // Detect content moderation errors
    if (providerMetadata.moderation || providerMetadata.contentFilter) {
      category = ErrorCategorySchema.enum.content_filter;
      rawError = rawError || 'Content was filtered by safety systems';
    }
  }

  // ✅ TYPE-SAFE: Check response with type guard
  if (!rawError && isObject(response)) {
    if (response.error) {
      rawError
        = typeof response.error === 'string'
          ? response.error
          : JSON.stringify(response.error);
    }
  }

  // Categorize error if found
  if (rawError && !category) {
    category = categorizeError(rawError);
  }

  return { rawError, category };
}

// ============================================================================
// EMPTY RESPONSE ERROR BUILDING
// ============================================================================

/**
 * Build context-aware error messages for empty responses
 *
 * ✅ DESCRIPTIVE: Provides detailed messages based on finish reason
 * ✅ ACTIONABLE: Suggests next steps for users
 * ✅ TYPE-SAFE: Uses Zod enum values for finish reasons
 *
 * Empty response scenarios:
 * - stop: Model completed but filtered (content filter)
 * - length: Hit token limit without output (configuration issue)
 * - content-filter: Explicit content moderation (safety block)
 * - failed/other: Provider error (transient)
 * - unknown: Generic empty response
 *
 * @param params - Empty response context (tokens and finish reason)
 * @returns Error metadata with detailed messages
 *
 * @example
 * ```typescript
 * const error = buildEmptyResponseError({
 *   inputTokens: 150,
 *   outputTokens: 0,
 *   finishReason: 'stop',
 * });
 * // Returns error with content_filter category and descriptive message
 * ```
 */
export function buildEmptyResponseError(
  params: BuildEmptyResponseErrorParams,
): ErrorMetadata {
  const { inputTokens, outputTokens, finishReason } = params;

  // Build base statistics for all error messages
  const baseStats = `Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, Status: ${finishReason}`;

  let providerMessage: string;
  let errorMessage: string;
  let errorCategory: ErrorCategory;
  let isTransientError: boolean;

  // ✅ TYPE-SAFE: Use Zod enum values for finish reason comparison
  if (finishReason === FinishReasonSchema.enum.stop) {
    // stop = Model completed intentionally with no output (likely content filter)
    providerMessage = `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`;
    errorMessage
      = 'Returned empty response - possible content filtering or safety block';
    errorCategory = ErrorCategorySchema.enum.content_filter;
    isTransientError = false; // Content filters are not transient
  } else if (finishReason === FinishReasonSchema.enum.length) {
    // length = Hit token limit before generating output (configuration issue)
    providerMessage = `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`;
    errorMessage = 'Exceeded token limit without generating content';
    errorCategory = ErrorCategorySchema.enum.provider_error;
    isTransientError = true; // User can retry with shorter input
  } else if (finishReason === FinishReasonSchema.enum['content-filter']) {
    // content-filter = Explicit content moderation
    providerMessage = `Content was filtered by safety systems. ${baseStats}`;
    errorMessage = 'Blocked by content filter';
    errorCategory = ErrorCategorySchema.enum.content_filter;
    isTransientError = false; // Content filters are policy-based, not transient
  } else if (
    finishReason === FinishReasonSchema.enum.failed
    || finishReason === FinishReasonSchema.enum.other
  ) {
    // failed/other = Provider error (transient)
    providerMessage = `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`;
    errorMessage = 'Encountered a provider error';
    errorCategory = ErrorCategorySchema.enum.provider_error;
    isTransientError = true; // Provider errors are usually transient
  } else {
    // unknown = Generic empty response
    providerMessage = `Model returned empty response. ${baseStats}`;
    errorMessage = `Returned empty response (reason: ${finishReason})`;
    errorCategory = ErrorCategorySchema.enum.empty_response;
    isTransientError = true; // Unknown empty responses may be transient
  }

  return {
    hasError: true,
    errorCategory,
    errorMessage,
    providerMessage,
    isTransientError,
    isPartialResponse: false, // Empty response = no partial content
  };
}

// ============================================================================
// COMPREHENSIVE ERROR METADATA EXTRACTION
// ============================================================================

/**
 * Extract comprehensive error metadata from AI provider response
 *
 * ✅ UNIFIED: Single function for all error detection and categorization
 * ✅ COMPREHENSIVE: Handles provider errors, empty responses, and partial responses
 * ✅ TYPE-SAFE: Uses Zod schemas and type guards throughout
 *
 * Detection flow:
 * 1. Extract provider errors from metadata/response
 * 2. Check for empty response (no output tokens)
 * 3. Categorize errors based on content
 * 4. Build detailed error messages
 * 5. Determine transience for retry logic
 * 6. Detect partial responses (error with some content)
 *
 * @param params - Error extraction parameters
 * @returns Comprehensive error metadata
 *
 * @example
 * ```typescript
 * const errorMetadata = extractErrorMetadata({
 *   providerMetadata: finishResult.providerMetadata,
 *   response: finishResult.response,
 *   finishReason: finishResult.finishReason,
 *   usage: { inputTokens: 150, outputTokens: 0 },
 *   text: '',
 * });
 * // Returns: { hasError: true, errorCategory: 'empty_response', ... }
 * ```
 */
export function extractErrorMetadata(
  params: ExtractErrorMetadataParams,
): ErrorMetadata {
  const { providerMetadata, response, finishReason, usage, text, reasoning }
    = params;

  // Extract provider-specific errors
  const { rawError, category: providerCategory } = extractProviderError(
    providerMetadata,
    response,
  );

  // ✅ CRITICAL: Handle cases where usage is missing
  // Some models (like DeepSeek) don't return usage in the expected format
  // If usage is missing but text was generated, don't mark as empty response
  const outputTokens = usage?.outputTokens || 0;
  const inputTokens = usage?.inputTokens || 0;
  const hasGeneratedText = (text?.trim().length || 0) > 0;

  // ✅ CRITICAL FIX: Check reasoning content for o1/o3 models
  // These models may output all content as reasoning instead of text
  // Both text OR reasoning should count as generated content
  const hasGeneratedReasoning = (reasoning?.trim().length || 0) > 0;
  const hasGeneratedContent = hasGeneratedText || hasGeneratedReasoning;

  // Empty response detection: no output tokens AND no generated content (text or reasoning)
  // ✅ ROOT CAUSE FIX: Detect empty response REGARDLESS of finishReason
  // Previous bug: Skipped detection when finishReason='unknown'
  // But 'unknown' with no content means stream ended abnormally - this IS an error
  // finishReason='unknown' is NOT "streaming init" - it's a failed stream completion
  //
  // If onFinish fires with finishReason='unknown' and no content, the stream failed
  // This happens with models like gemini-2.5-flash-lite that abort early
  const isEmptyResponse = outputTokens === 0 && !hasGeneratedContent;

  // Error occurred if we have provider error OR empty response
  const hasError = isEmptyResponse || !!rawError;

  // Build error metadata based on error type
  if (!hasError) {
    // No error detected
    return {
      hasError: false,
      isTransientError: false,
      isPartialResponse: false,
    };
  }

  // Provider error detected
  if (rawError) {
    const errorCategory = providerCategory || categorizeError(rawError);

    return {
      hasError: true,
      openRouterError: rawError,
      errorCategory,
      errorMessage: rawError,
      providerMessage: rawError,
      isTransientError: isTransientError(errorCategory, finishReason),
      isPartialResponse: hasGeneratedContent || outputTokens > 0, // Partial = error with some content
    };
  }

  // Empty response detected (no provider error)
  const emptyResponseError = buildEmptyResponseError({
    inputTokens,
    outputTokens,
    finishReason,
  });

  return emptyResponseError;
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Default export: All error metadata functions
 *
 * Usage:
 * ```typescript
 * import ErrorMetadataService from '@/api/services/error-metadata.service';
 *
 * const metadata = ErrorMetadataService.extractErrorMetadata({ ... });
 * const isRetryable = ErrorMetadataService.isTransientError(category, reason);
 * ```
 */
export default {
  extractErrorMetadata,
  categorizeError,
  isTransientError,
  buildEmptyResponseError,
  extractProviderError,
};
