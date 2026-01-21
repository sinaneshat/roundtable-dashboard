/**
 * Type-Safe Metadata Builder
 *
 * Enforces all required fields at compile-time via TypeScript.
 * Uses DbAssistantMessageMetadata as single source of truth.
 *
 * PREVENTS: Missing fields that cause schema validation failures
 * ENSURES: Backend and frontend always create valid metadata
 */

import type { ErrorType, FinishReason } from '@roundtable/shared/enums';
import { FinishReasons, MessageRoles } from '@roundtable/shared/enums';
import type { LanguageModelUsage } from 'ai';

import type {
  DbAssistantMessageMetadata,
  DbCitation,
} from '@/db/schemas/chat-metadata';
import type { RoundNumber } from '@/lib/schemas/round-schemas';
import type { AvailableSource } from '@/types/citations';

// ============================================================================
// Type-Safe Builder Parameters
// ============================================================================

/**
 * Required parameters for creating participant message metadata
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
  finishReason?: FinishReason;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  // Error state (defaults to false if not provided)
  hasError?: boolean;
  errorType?: ErrorType;
  errorMessage?: string;
  errorCategory?: string;

  // Error flags (defaults to false if not provided)
  isTransient?: boolean;
  isPartialResponse?: boolean;

  // Optional backend fields
  providerMessage?: string;
  openRouterError?: Record<string, string | number | boolean | null>;
  retryAttempts?: number;
  isEmptyResponse?: boolean;
  statusCode?: number;
  responseBody?: string;
  aborted?: boolean;
  createdAt?: string;

  // RAG citations (resolved source references from AI response)
  citations?: DbCitation[];

  // Available sources (files/context available to AI, shown even without inline citations)
  availableSources?: AvailableSource[];

  // Reasoning duration in seconds (for "Thought for X seconds" display on page refresh)
  reasoningDuration?: number;
};

// ============================================================================
// Type-Safe Metadata Builder Functions
// ============================================================================

/**
 * Create participant message metadata with type safety
 */
export function createParticipantMetadata(
  params: ParticipantMetadataParams,
): DbAssistantMessageMetadata {
  return {
    role: MessageRoles.ASSISTANT,

    // Required fields (no defaults)
    roundNumber: params.roundNumber,
    participantId: params.participantId,
    participantIndex: params.participantIndex,
    participantRole: params.participantRole,
    model: params.model,

    // AI SDK fields with defaults
    finishReason: params.finishReason ?? FinishReasons.UNKNOWN,
    usage: params.usage ?? {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },

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
    ...(params.retryAttempts !== undefined && {
      retryAttempts: params.retryAttempts,
    }),
    ...(params.isEmptyResponse !== undefined && {
      isEmptyResponse: params.isEmptyResponse,
    }),
    ...(params.statusCode !== undefined && { statusCode: params.statusCode }),
    ...(params.responseBody && { responseBody: params.responseBody }),
    ...(params.aborted !== undefined && { aborted: params.aborted }),
    ...(params.createdAt && { createdAt: params.createdAt }),

    // RAG citations (only present if AI referenced sources)
    ...(params.citations
      && params.citations.length > 0 && { citations: params.citations }),

    // Available sources (files/context available to AI for "Sources" UI)
    ...(params.availableSources
      && params.availableSources.length > 0 && {
      availableSources: params.availableSources,
    }),

    // Reasoning duration (for "Thought for X seconds" display)
    ...(params.reasoningDuration !== undefined
      && params.reasoningDuration > 0 && {
      reasoningDuration: params.reasoningDuration,
    }),
  };
}

/**
 * Update participant metadata with new fields
 * Preserves existing fields while updating specified ones
 */
export function updateParticipantMetadata(
  existing: DbAssistantMessageMetadata,
  updates: Partial<ParticipantMetadataParams>,
): DbAssistantMessageMetadata {
  return createParticipantMetadata({
    roundNumber: existing.roundNumber,
    participantId: existing.participantId,
    participantIndex: existing.participantIndex,
    participantRole: existing.participantRole,
    model: existing.model,
    finishReason: updates.finishReason ?? existing.finishReason,
    usage: updates.usage ?? existing.usage,
    hasError: updates.hasError ?? existing.hasError,
    errorType: updates.errorType ?? existing.errorType,
    errorMessage: updates.errorMessage ?? existing.errorMessage,
    errorCategory: updates.errorCategory ?? existing.errorCategory,
    isTransient: updates.isTransient ?? existing.isTransient,
    isPartialResponse: updates.isPartialResponse ?? existing.isPartialResponse,
    providerMessage: updates.providerMessage ?? existing.providerMessage,
    openRouterError: updates.openRouterError ?? existing.openRouterError,
    retryAttempts: updates.retryAttempts ?? existing.retryAttempts,
    isEmptyResponse: updates.isEmptyResponse ?? existing.isEmptyResponse,
    statusCode: updates.statusCode ?? existing.statusCode,
    responseBody: updates.responseBody ?? existing.responseBody,
    aborted: updates.aborted ?? existing.aborted,
    createdAt: updates.createdAt ?? existing.createdAt,
    citations: updates.citations ?? existing.citations,
    availableSources: updates.availableSources ?? (existing.availableSources as ParticipantMetadataParams['availableSources']),
    reasoningDuration: updates.reasoningDuration ?? existing.reasoningDuration,
  });
}

// ============================================================================
// Streaming-Specific Metadata Builders
// ============================================================================

/**
 * Create initial streaming metadata (before streaming starts)
 * Used in AI SDK messageMetadata callback with type='start'
 */
export function createStreamingMetadata(
  params: Omit<ParticipantMetadataParams, 'finishReason' | 'usage'>,
): DbAssistantMessageMetadata {
  return createParticipantMetadata({
    ...params,
    finishReason: FinishReasons.UNKNOWN,
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
 */
export function completeStreamingMetadata(
  streamMetadata: DbAssistantMessageMetadata,
  finishResult: {
    finishReason: FinishReason;
    usage?: LanguageModelUsage;
    totalUsage?: LanguageModelUsage;
  },
): DbAssistantMessageMetadata {
  const usageData = finishResult.usage || finishResult.totalUsage;
  const promptTokens = usageData?.inputTokens ?? 0;
  const completionTokens = usageData?.outputTokens ?? 0;
  const totalTokens = usageData?.totalTokens;

  return updateParticipantMetadata(streamMetadata, {
    finishReason: finishResult.finishReason,
    usage: usageData
      ? {
          promptTokens,
          completionTokens,
          totalTokens: totalTokens ?? promptTokens + completionTokens,
        }
      : streamMetadata.usage,
  });
}

/**
 * Create assistant message metadata with error state for failed streams
 */
export function createStreamErrorMetadata(
  streamMetadata: DbAssistantMessageMetadata,
  error: {
    message: string;
    errorType?: ErrorType;
    errorCategory?: string;
    isTransient?: boolean;
    statusCode?: number;
    responseBody?: string;
  },
): DbAssistantMessageMetadata {
  return updateParticipantMetadata(streamMetadata, {
    hasError: true,
    errorMessage: error.message,
    errorType: error.errorType,
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
 */
export function hasRequiredParticipantFields(
  metadata: unknown,
): metadata is DbAssistantMessageMetadata {
  if (!metadata || typeof metadata !== 'object')
    return false;

  return (
    'roundNumber' in metadata
    && typeof metadata.roundNumber === 'number'
    && 'participantId' in metadata
    && typeof metadata.participantId === 'string'
    && 'participantIndex' in metadata
    && typeof metadata.participantIndex === 'number'
    && 'participantRole' in metadata
    && (metadata.participantRole === null
      || typeof metadata.participantRole === 'string')
    && 'model' in metadata
    && typeof metadata.model === 'string'
    && 'finishReason' in metadata
    && typeof metadata.finishReason === 'string'
    && 'usage' in metadata
    && typeof metadata.usage === 'object'
    && 'hasError' in metadata
    && typeof metadata.hasError === 'boolean'
    && 'isTransient' in metadata
    && typeof metadata.isTransient === 'boolean'
    && 'isPartialResponse' in metadata
    && typeof metadata.isPartialResponse === 'boolean'
  );
}
