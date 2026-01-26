/**
 * Type-Safe Metadata Builder
 *
 * Enforces all required fields at compile-time via TypeScript.
 * Uses DbAssistantMessageMetadata as single source of truth.
 *
 * PREVENTS: Missing fields that cause schema validation failures
 * ENSURES: Backend and frontend always create valid metadata
 */

import type { CitationSourceType, ErrorType, FinishReason } from '@roundtable/shared';
import { FinishReasons, MessageRoles } from '@roundtable/shared';
import type { LanguageModelUsage } from 'ai';

import type { RoundNumber } from '@/lib/schemas/round-schemas';
import type { DbAssistantMessageMetadata, DbCitation } from '@/services/api';

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
  availableSources?: {
    id: string;
    sourceType: CitationSourceType;
    title: string;
    // Attachment-specific fields
    downloadUrl?: string;
    filename?: string;
    mimeType?: string;
    fileSize?: number;
    // Search-specific fields
    url?: string;
    domain?: string;
    // Context fields
    threadTitle?: string;
    description?: string;
    // Content excerpt for quote display in Sources tooltip
    excerpt?: string;
  }[];

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
    // AI SDK fields with defaults
    finishReason: params.finishReason ?? FinishReasons.UNKNOWN,

    hasError: params.hasError ?? false,
    isPartialResponse: params.isPartialResponse ?? false,
    isTransient: params.isTransient ?? false,
    model: params.model,
    participantId: params.participantId,

    participantIndex: params.participantIndex,
    participantRole: params.participantRole,

    role: MessageRoles.ASSISTANT,
    // Required fields (no defaults)
    roundNumber: params.roundNumber,
    usage: params.usage ?? {
      completionTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
    },

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
    ...existing,
    ...updates,
  } as ParticipantMetadataParams);
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
      completionTokens: 0,
      promptTokens: 0,
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
          completionTokens,
          promptTokens,
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
    errorCategory: error.errorCategory,
    errorMessage: error.message,
    errorType: error.errorType,
    hasError: true,
    isPartialResponse: false,
    isTransient: error.isTransient ?? false,
    responseBody: error.responseBody,
    statusCode: error.statusCode,
  });
}
