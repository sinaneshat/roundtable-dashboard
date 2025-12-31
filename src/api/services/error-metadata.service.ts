/**
 * Error Metadata Service - Unified Error Extraction and Categorization
 *
 * Uses schemas from @/lib/schemas/error-schemas.ts as single source of truth.
 * All type validations use Zod schemas - no type casting.
 *
 * Provides:
 * - Unified error metadata extraction from AI provider responses
 * - Error categorization following ErrorCategorySchema
 * - Transient error detection for retry logic
 * - Empty response error building with context-aware messages
 * - Provider-specific error extraction (OpenRouter, OpenAI, etc.)
 */

import { z } from 'zod';

import type { ErrorCategory } from '@/api/core/enums';
import { ErrorCategorySchema, FinishReasonSchema } from '@/api/core/enums';
import { categorizeErrorMessage } from '@/lib/schemas/error-schemas';
import { isObject } from '@/lib/utils';
import { isTransientError } from '@/lib/utils/error-metadata-builders';

// ============================================================================
// TYPE DEFINITIONS (Zod Schemas - Single Source of Truth)
// ============================================================================

/**
 * Error metadata structure returned by extraction functions
 * Provides comprehensive error context for storage and display
 *
 * Note: Named differently from @/lib/schemas/error-schemas.ts ErrorMetadataSchema
 * to avoid collision. This schema is for service-layer error extraction output.
 */
export const ExtractedErrorMetadataSchema = z.object({
  hasError: z.boolean().describe('Whether an error occurred'),
  openRouterError: z.string().optional().describe('Raw OpenRouter/provider error message'),
  errorCategory: ErrorCategorySchema.optional().describe('Categorized error type for UI handling'),
  errorMessage: z.string().optional().describe('Human-readable error message for display'),
  providerMessage: z.string().optional().describe('Detailed provider message for debugging'),
  isTransientError: z.boolean().describe('Whether error is transient (worth retrying)'),
  isPartialResponse: z.boolean().describe('Whether partial content was generated despite error'),
});

export type ExtractedErrorMetadata = z.infer<typeof ExtractedErrorMetadataSchema>;

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
 * Delegates to categorizeErrorMessage from @/lib/schemas/error-schemas.ts
 *
 * @param errorMessage - Raw error message from provider
 * @returns Typed error category from ErrorCategorySchema
 */
export function categorizeError(errorMessage: string): ErrorCategory {
  return categorizeErrorMessage(errorMessage);
}

// ============================================================================
// PROVIDER ERROR EXTRACTION
// ============================================================================

/**
 * Extract provider-specific error details from metadata and response
 * Uses isObject type guard for type-safe extraction
 *
 * Checks for errors in:
 * - providerMetadata.error
 * - providerMetadata.errorMessage
 * - providerMetadata.moderation (content filter)
 * - providerMetadata.contentFilter
 * - response.error
 *
 * @param providerMetadata - Provider metadata from AI SDK
 * @param response - Raw response object from provider
 * @returns Provider error result with raw error and category
 */
export function extractProviderError(
  providerMetadata: unknown,
  response: unknown,
): ProviderErrorResult {
  let rawError: string | undefined;
  let category: ErrorCategory | undefined;

  // Check providerMetadata with type guard
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

  // Check response with type guard
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
 * Empty response scenarios:
 * - stop: Model completed but filtered (content filter)
 * - length: Hit token limit without output (configuration issue)
 * - content-filter: Explicit content moderation (safety block)
 * - failed/other: Provider error (transient)
 * - unknown: Generic empty response
 *
 * @param params - Empty response context (tokens and finish reason)
 * @returns Error metadata with detailed messages
 */
export function buildEmptyResponseError(
  params: BuildEmptyResponseErrorParams,
): ExtractedErrorMetadata {
  const { inputTokens, outputTokens, finishReason } = params;

  // Build base statistics for all error messages
  const baseStats = `Input: ${inputTokens} tokens, Output: ${outputTokens} tokens, Status: ${finishReason}`;

  let providerMessage: string;
  let errorMessage: string;
  let errorCategory: ErrorCategory;
  let isTransientError: boolean;

  // Use Zod enum values for finish reason comparison
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
 */
export function extractErrorMetadata(
  params: ExtractErrorMetadataParams,
): ExtractedErrorMetadata {
  const { providerMetadata, response, finishReason, usage, text, reasoning }
    = params;

  // Extract provider-specific errors
  const { rawError, category: providerCategory } = extractProviderError(
    providerMetadata,
    response,
  );

  // Handle cases where usage is missing (some models like DeepSeek don't return usage)
  const outputTokens = usage?.outputTokens || 0;
  const inputTokens = usage?.inputTokens || 0;
  const hasGeneratedText = (text?.trim().length || 0) > 0;

  // Check reasoning content for o1/o3 models that output reasoning instead of text
  const hasGeneratedReasoning = (reasoning?.trim().length || 0) > 0;
  const hasGeneratedContent = hasGeneratedText || hasGeneratedReasoning;

  // Empty response detection: no output tokens AND no generated content
  // Detects regardless of finishReason - 'unknown' with no content is a failed stream
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
