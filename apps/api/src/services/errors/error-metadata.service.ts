/**
 * Error Metadata Service - Unified Error Extraction and Categorization
 *
 * Single source of truth for AI provider error detection and categorization.
 * All type validations use Zod schemas - no type casting.
 *
 * Provides:
 * - Unified error metadata extraction from AI provider responses
 * - Error categorization following ErrorCategorySchema
 * - Transient error detection for retry logic
 * - Empty response error building with context-aware messages
 * - Provider-specific error extraction (OpenRouter, OpenAI, etc.)
 */

import type { ErrorCategory } from '@roundtable/shared/enums';
import {
  ErrorCategories,
  ErrorCategorySchema,
  FinishReasons,
} from '@roundtable/shared/enums';
import * as z from 'zod';

import { categorizeErrorMessage } from '@/lib/schemas/error-schemas';
import { isTransientError } from '@/lib/utils/error-metadata-builders';
import { isObject } from '@/lib/utils/type-guards';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Helper to access index signature properties safely
 * Required for noPropertyAccessFromIndexSignature TypeScript option
 */
function getObjectProp<T>(obj: Record<string, unknown>, key: string): T | undefined {
  return obj[key] as T | undefined;
}

// ============================================================================
// TYPE DEFINITIONS (Zod Schemas - Single Source of Truth)
// ============================================================================

/**
 * Error metadata structure returned by extraction functions
 * Provides comprehensive error context for storage and display
 */
export const ExtractedErrorMetadataSchema = z.object({
  errorCategory: ErrorCategorySchema.optional(),
  errorMessage: z.string().optional(),
  hasError: z.boolean(),
  isPartialResponse: z.boolean(),
  isTransientError: z.boolean(),
  openRouterError: z.string().optional(),
  providerMessage: z.string().optional(),
}).strict();

export type ExtractedErrorMetadata = z.infer<typeof ExtractedErrorMetadataSchema>;

/**
 * Provider error extraction result
 */
export const ProviderErrorResultSchema = z.object({
  category: ErrorCategorySchema.optional(),
  rawError: z.string().optional(),
}).strict();

export type ProviderErrorResult = z.infer<typeof ProviderErrorResultSchema>;

/**
 * Usage statistics from AI provider
 */
export const UsageStatsSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
}).strict();

export type UsageStats = z.infer<typeof UsageStatsSchema>;

// ============================================================================
// ERROR CATEGORIZATION
// ============================================================================

/**
 * Categorize error based on error message content
 * Delegates to categorizeErrorMessage from error-schemas.ts
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
    const providerError = getObjectProp<unknown>(providerMetadata, 'error');
    if (providerError) {
      rawError
        = typeof providerError === 'string'
          ? providerError
          : JSON.stringify(providerError);
    }

    // Check errorMessage field as fallback
    const errorMessage = getObjectProp<unknown>(providerMetadata, 'errorMessage');
    if (!rawError && errorMessage) {
      rawError = String(errorMessage);
    }

    // Detect content moderation errors
    const moderation = getObjectProp<unknown>(providerMetadata, 'moderation');
    const contentFilter = getObjectProp<unknown>(providerMetadata, 'contentFilter');
    if (moderation || contentFilter) {
      category = ErrorCategories.CONTENT_FILTER;
      rawError = rawError || 'Content was filtered by safety systems';
    }
  }

  // Check response with type guard
  if (!rawError && isObject(response)) {
    const responseError = getObjectProp<unknown>(response, 'error');
    if (responseError) {
      rawError
        = typeof responseError === 'string'
          ? responseError
          : JSON.stringify(responseError);
    }
  }

  // Categorize error if found
  if (rawError && !category) {
    category = categorizeError(rawError);
  }

  return { category, rawError };
}

// ============================================================================
// EMPTY RESPONSE ERROR BUILDING
// ============================================================================

type BuildEmptyResponseErrorParams = {
  inputTokens: number;
  outputTokens: number;
  finishReason: string;
};

/**
 * Build context-aware error messages for empty responses
 *
 * Empty response scenarios:
 * - stop: Model completed but filtered (content filter)
 * - length: Hit token limit without output (configuration issue)
 * - content-filter: Explicit content moderation (safety block)
 * - failed/other: Provider error (transient)
 * - unknown: Generic empty response
 */
export function buildEmptyResponseError(
  params: BuildEmptyResponseErrorParams,
): ExtractedErrorMetadata;
export function buildEmptyResponseError(
  inputTokens: number,
  outputTokens: number,
  finishReason: string,
): ExtractedErrorMetadata;
export function buildEmptyResponseError(
  inputTokensOrParams: number | BuildEmptyResponseErrorParams,
  outputTokens?: number,
  finishReason?: string,
): ExtractedErrorMetadata {
  // Handle both calling patterns
  const params = typeof inputTokensOrParams === 'object'
    ? inputTokensOrParams
    : {
        finishReason: finishReason ?? 'unknown',
        inputTokens: inputTokensOrParams,
        outputTokens: outputTokens ?? 0,
      };

  const { finishReason: reason, inputTokens, outputTokens: outTokens } = params;
  // Build base statistics for all error messages
  const baseStats = `Input: ${inputTokens} tokens, Output: ${outTokens} tokens, Status: ${reason}`;

  let providerMessage: string;
  let errorMessage: string;
  let errorCategory: ErrorCategory;
  let isTransientErrorFlag: boolean;

  if (reason === FinishReasons.STOP) {
    // stop = Model completed intentionally with no output (likely content filter)
    providerMessage = `Model completed but returned no content. ${baseStats}. This may indicate content filtering, safety constraints, or the model chose not to respond.`;
    errorMessage = 'Returned empty response - possible content filtering or safety block';
    errorCategory = ErrorCategories.CONTENT_FILTER;
    isTransientErrorFlag = false; // Content filters are not transient
  } else if (reason === FinishReasons.LENGTH) {
    // length = Hit token limit before generating output (configuration issue)
    providerMessage = `Model hit token limit before generating content. ${baseStats}. Try reducing the conversation history or input length.`;
    errorMessage = 'Exceeded token limit without generating content';
    errorCategory = ErrorCategories.PROVIDER_ERROR;
    isTransientErrorFlag = true; // User can retry with shorter input
  } else if (reason === FinishReasons.CONTENT_FILTER) {
    // content-filter = Explicit content moderation
    providerMessage = `Content was filtered by safety systems. ${baseStats}`;
    errorMessage = 'Blocked by content filter';
    errorCategory = ErrorCategories.CONTENT_FILTER;
    isTransientErrorFlag = false; // Content filters are policy-based, not transient
  } else if (reason === FinishReasons.FAILED || reason === FinishReasons.OTHER) {
    // failed/other = Provider error (transient)
    providerMessage = `Provider error prevented response generation. ${baseStats}. This may be a temporary issue with the model provider.`;
    errorMessage = 'Encountered a provider error';
    errorCategory = ErrorCategories.PROVIDER_ERROR;
    isTransientErrorFlag = true; // Provider errors are usually transient
  } else {
    // unknown = Generic empty response
    providerMessage = `Model returned empty response. ${baseStats}`;
    errorMessage = `Returned empty response (reason: ${reason})`;
    errorCategory = ErrorCategories.EMPTY_RESPONSE;
    isTransientErrorFlag = true; // Unknown empty responses may be transient
  }

  return {
    errorCategory,
    errorMessage,
    hasError: true,
    isPartialResponse: false, // Empty response = no partial content
    isTransientError: isTransientErrorFlag,
    providerMessage,
  };
}

// ============================================================================
// COMPREHENSIVE ERROR METADATA EXTRACTION
// ============================================================================

type ExtractErrorMetadataParams = {
  providerMetadata: unknown;
  response: unknown;
  finishReason: string;
  usage?: UsageStats;
  text?: string;
  reasoning?: string;
};

/**
 * Type guard to check if value is ExtractErrorMetadataParams
 */
function isExtractErrorMetadataParams(
  value: unknown,
): value is ExtractErrorMetadataParams {
  if (!isObject(value)) {
    return false;
  }
  const finishReason = getObjectProp<unknown>(value, 'finishReason');
  return (
    typeof finishReason === 'string'
    && 'providerMetadata' in value
    && 'response' in value
  );
}

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
 */
export function extractErrorMetadata(
  params: ExtractErrorMetadataParams,
): ExtractedErrorMetadata;
export function extractErrorMetadata(
  providerMetadata: unknown,
  response: unknown,
  finishReason: string,
  usage?: UsageStats,
  text?: string,
  reasoning?: string,
): ExtractedErrorMetadata;
export function extractErrorMetadata(
  providerMetadataOrParams: unknown | ExtractErrorMetadataParams,
  response?: unknown,
  finishReason?: string,
  usage?: UsageStats,
  text?: string,
  reasoning?: string,
): ExtractedErrorMetadata {
  // Handle both calling patterns with type guard
  const params = isExtractErrorMetadataParams(providerMetadataOrParams)
    ? providerMetadataOrParams
    : {
        finishReason: finishReason ?? 'unknown',
        providerMetadata: providerMetadataOrParams,
        reasoning,
        response: response ?? null,
        text,
        usage,
      };

  const {
    finishReason: reason,
    providerMetadata,
    reasoning: reasoningData,
    response: resp,
    text: textData,
    usage: usageData,
  } = params;

  // Extract provider-specific errors
  const { category: providerCategory, rawError } = extractProviderError(
    providerMetadata,
    resp,
  );

  // Handle cases where usage is missing (some models like DeepSeek don't return usage)
  const outputTokens = usageData?.outputTokens || 0;
  const inputTokens = usageData?.inputTokens || 0;
  const hasGeneratedText = (textData?.trim().length || 0) > 0;

  // Check reasoning content for o1/o3 models that output reasoning instead of text
  const hasGeneratedReasoning = (reasoningData?.trim().length || 0) > 0;
  const hasGeneratedContent = hasGeneratedText || hasGeneratedReasoning;

  // ✅ FIX: DeepSeek and some models don't return usage/finishReason but DO generate content
  // Only mark as empty response if we're CERTAIN there's no content:
  // - If text/reasoning exists, it's NOT empty (regardless of token counts)
  // - If finishReason is undefined AND tokens are 0, only mark empty if no content
  // - finishReason 'stop' with 0 tokens but WITH content = successful (some models don't report usage)
  const isKnownFailureReason = reason === FinishReasons.FAILED
    || reason === FinishReasons.ERROR
    || reason === FinishReasons.CONTENT_FILTER;

  // ✅ FIX: Interrupted stream detection (page refresh mid-stream)
  // When reason is undefined/null with 0 tokens and no content, this indicates
  // an interrupted stream (e.g., page refresh), NOT an actual error.
  // DeepSeek and other models may return 200 status with empty body during interruption.
  // The incomplete-round-resumption logic handles retry - don't show as error.
  const isInterruptedStream = !reason && outputTokens === 0 && !hasGeneratedContent;

  // Empty response = no generated content AND known failure reason
  // Don't treat interrupted streams (undefined reason) as empty response errors
  const isEmptyResponse = !hasGeneratedContent && isKnownFailureReason;

  // Error occurred if we have provider error OR empty response (NOT interrupted stream)
  const hasError = (isEmptyResponse || !!rawError) && !isInterruptedStream;

  // Build error metadata based on error type
  if (!hasError) {
    // No error detected
    return {
      hasError: false,
      isPartialResponse: false,
      isTransientError: false,
    };
  }

  // Provider error detected
  if (rawError) {
    const errorCategory = providerCategory || categorizeError(rawError);

    return {
      errorCategory,
      errorMessage: rawError,
      hasError: true,
      isPartialResponse: hasGeneratedContent || outputTokens > 0, // Partial = error with some content
      isTransientError: isTransientError(errorCategory, reason),
      openRouterError: rawError,
      providerMessage: rawError,
    };
  }

  // Empty response detected (no provider error)
  return buildEmptyResponseError(inputTokens, outputTokens, reason);
}
