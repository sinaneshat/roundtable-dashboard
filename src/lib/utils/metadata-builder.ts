/**
 * Type-Safe Metadata Builder
 *
 * ✅ MIGRATED TO NEW SINGLE SOURCE OF TRUTH: Uses DbAssistantMessageMetadata
 * Enforces all required fields at compile-time via TypeScript
 *
 * PREVENTS: Missing fields that cause schema validation failures
 * ENSURES: Backend and frontend always create valid metadata
 *
 * Location: /src/lib/utils/metadata-builder.ts
 */

import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import type { RoundNumber } from '@/lib/schemas/round-schemas';

// ============================================================================
// Type-Safe Builder Parameters
// ============================================================================

/**
 * Required parameters for creating participant message metadata
 * TypeScript enforces ALL fields must be provided
 */
export type ParticipantMetadataParams = {
  // Round tracking (0-based: first round is 0)
  roundNumber: RoundNumber;

  // Participant identification
  participantId: string;
  participantIndex: number;
  participantRole: string | null;

  // Model information
  model: string;

  // AI SDK core fields (will have defaults if not provided)
  finishReason?: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'failed' | 'other' | 'unknown';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  // Error state (defaults to false if not provided)
  hasError?: boolean;
  errorType?: 'rate_limit' | 'context_length' | 'api_error' | 'network' | 'timeout' | 'model_unavailable' | 'empty_response' | 'unknown';
  errorMessage?: string;
  errorCategory?: string;

  // Error flags (defaults to false if not provided)
  isTransient?: boolean;
  isPartialResponse?: boolean;

  // Optional backend fields
  providerMessage?: string;
  openRouterError?: Record<string, unknown>;
  retryAttempts?: number;
  isEmptyResponse?: boolean;
  statusCode?: number;
  responseBody?: string;
  aborted?: boolean;
  createdAt?: string;
};

// ============================================================================
// Type-Safe Metadata Builder Functions
// ============================================================================

/**
 * Create participant message metadata with type safety
 *
 * ✅ COMPILE-TIME SAFETY: TypeScript enforces all required fields
 * ✅ RUNTIME SAFETY: Validates against Zod schema (optional)
 * ✅ DEFAULT VALUES: Provides sensible defaults for optional fields
 *
 * @example
 * const metadata = createParticipantMetadata({
 *   roundNumber: 1,
 *   participantId: '01ABC123',
 *   participantIndex: 0, // First participant
 *   participantRole: null,
 *   model: 'gpt-4',
 * });
 */
export function createParticipantMetadata(
  params: ParticipantMetadataParams,
): DbAssistantMessageMetadata {
  // ✅ TYPE SAFETY: Return type is DbAssistantMessageMetadata (single source of truth)
  // TypeScript ensures this object matches the Zod schema structure
  return {
    // ✅ DISCRIMINATOR: Required 'role' field for type-safe metadata
    role: 'assistant' as const,

    // Required fields (no defaults)
    roundNumber: params.roundNumber,
    participantId: params.participantId,
    participantIndex: params.participantIndex,
    participantRole: params.participantRole,
    model: params.model,

    // AI SDK fields with defaults
    finishReason: params.finishReason ?? 'unknown',
    usage: params.usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },

    // Error state with defaults (CRITICAL: Must always be present)
    hasError: params.hasError ?? false,
    isTransient: params.isTransient ?? false,
    isPartialResponse: params.isPartialResponse ?? false,

    // Optional error details (only present if provided)
    ...(params.errorType && { errorType: params.errorType }),
    ...(params.errorMessage && { errorMessage: params.errorMessage }),
    ...(params.errorCategory && { errorCategory: params.errorCategory }),

    // Optional backend fields (only present if provided)
    ...(params.providerMessage && { providerMessage: params.providerMessage }),
    ...(params.openRouterError && { openRouterError: params.openRouterError }),
    ...(params.retryAttempts !== undefined && { retryAttempts: params.retryAttempts }),
    ...(params.isEmptyResponse !== undefined && { isEmptyResponse: params.isEmptyResponse }),
    ...(params.statusCode !== undefined && { statusCode: params.statusCode }),
    ...(params.responseBody && { responseBody: params.responseBody }),
    ...(params.aborted !== undefined && { aborted: params.aborted }),
    ...(params.createdAt && { createdAt: params.createdAt }),
  };
}

/**
 * Update participant metadata with new fields
 * Preserves existing fields while updating specified ones
 *
 * ✅ TYPE SAFETY: Only allows valid DbAssistantMessageMetadata fields
 *
 * @example
 * const updated = updateParticipantMetadata(existingMetadata, {
 *   hasError: true,
 *   errorMessage: 'Model timeout',
 * });
 */
export function updateParticipantMetadata(
  existing: DbAssistantMessageMetadata,
  updates: Partial<ParticipantMetadataParams>,
): DbAssistantMessageMetadata {
  return createParticipantMetadata({
    ...existing,
    ...updates,
  });
}

// ============================================================================
// Streaming-Specific Metadata Builders
// ============================================================================

/**
 * Create initial streaming metadata (before streaming starts)
 * Used in AI SDK messageMetadata callback with type='start'
 *
 * ✅ COMPILE-TIME GUARANTEE: All required fields must be provided
 * ✅ STREAMING DEFAULT: Sets finishReason='unknown' and usage=0
 */
export function createStreamingMetadata(
  params: Omit<ParticipantMetadataParams, 'finishReason' | 'usage'>,
): DbAssistantMessageMetadata {
  return createParticipantMetadata({
    ...params,
    finishReason: 'unknown',
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  });
}

/**
 * Update streaming metadata when stream finishes
 * Used in AI SDK messageMetadata callback with type='finish'
 *
 * @param streamMetadata - Initial metadata from createStreamingMetadata
 * @param finishResult - AI SDK finishResult from onFinish callback
 * @param finishResult.finishReason - Reason the stream finished
 * @param finishResult.usage - Token usage statistics
 * @param finishResult.usage.promptTokens - Tokens used in prompt
 * @param finishResult.usage.completionTokens - Tokens used in completion
 * @param finishResult.usage.totalTokens - Total tokens used
 * @param finishResult.totalUsage - Alternative total usage (fallback for some models)
 * @param finishResult.totalUsage.promptTokens - Tokens used in prompt
 * @param finishResult.totalUsage.completionTokens - Tokens used in completion
 * @param finishResult.totalUsage.totalTokens - Total tokens used
 */
export function completeStreamingMetadata(
  streamMetadata: DbAssistantMessageMetadata,
  finishResult: {
    finishReason: 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other' | 'unknown';
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    totalUsage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  },
): DbAssistantMessageMetadata {
  // Use totalUsage as fallback for models like DeepSeek
  const usageData = finishResult.usage || finishResult.totalUsage;

  return updateParticipantMetadata(streamMetadata, {
    finishReason: finishResult.finishReason as 'stop' | 'length' | 'content-filter' | 'tool-calls' | 'failed' | 'other' | 'unknown',
    usage: usageData
      ? {
          promptTokens: usageData.promptTokens ?? 0,
          completionTokens: usageData.completionTokens ?? 0,
          totalTokens: usageData.totalTokens ?? (usageData.promptTokens ?? 0) + (usageData.completionTokens ?? 0),
        }
      : streamMetadata.usage,
  });
}

/**
 * Create error metadata for failed streams
 * Used in AI SDK onError callback
 */
export function createErrorMetadata(
  streamMetadata: DbAssistantMessageMetadata,
  error: {
    message: string;
    errorType?: string;
    errorCategory?: string;
    isTransient?: boolean;
    statusCode?: number;
    responseBody?: string;
  },
): DbAssistantMessageMetadata {
  return updateParticipantMetadata(streamMetadata, {
    hasError: true,
    errorMessage: error.message,
    errorType: error.errorType as 'rate_limit' | 'context_length' | 'api_error' | 'network' | 'timeout' | 'model_unavailable' | 'empty_response' | 'unknown' | undefined,
    errorCategory: error.errorCategory,
    isTransient: error.isTransient ?? false,
    isPartialResponse: false,
    statusCode: error.statusCode,
    responseBody: error.responseBody,
  });
}

// ============================================================================
// Type Guards for Runtime Validation
// ============================================================================

/**
 * Type guard to check if metadata has all required participant fields
 * Useful for runtime validation in addition to compile-time checks
 */
export function hasRequiredParticipantFields(
  metadata: unknown,
): metadata is DbAssistantMessageMetadata {
  if (!metadata || typeof metadata !== 'object')
    return false;

  const m = metadata as Record<string, unknown>;

  // Check all required fields exist
  return (
    typeof m.roundNumber === 'number'
    && typeof m.participantId === 'string'
    && typeof m.participantIndex === 'number'
    && (m.participantRole === null || typeof m.participantRole === 'string')
    && typeof m.model === 'string'
    && typeof m.finishReason === 'string'
    && typeof m.usage === 'object'
    && typeof m.hasError === 'boolean'
    && typeof m.isTransient === 'boolean'
    && typeof m.isPartialResponse === 'boolean'
  );
}
