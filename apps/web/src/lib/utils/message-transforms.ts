/**
 * Message Transformation Utilities
 *
 * **CONSOLIDATED MODULE**: Core message operations for format conversion,
 * filtering, and manipulation. Single source of truth for message transformations.
 *
 * Design Principles:
 * - Use generics for reusable, type-safe operations
 * - Accept predicates for flexible filtering
 * - Use function composition for complex operations
 * - Avoid High Knowledge Cost (HKC) implementations
 *
 * Consolidates:
 * - Format conversion, error creation, type guards, round/participant filtering
 * - Metadata extraction delegated to metadata.ts (single source of truth)
 *
 * @module lib/utils/message-transforms
 */

import type { ErrorType, FinishReason, UIMessageErrorType } from '@roundtable/shared';
import {
  ErrorTypeSchema,
  FinishReasons,
  FinishReasonSchema,
  MessagePartTypes,
  MessageRoles,
  TextPartStates,
  UIMessageErrorTypeSchema,
  UIMessageRoles,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { z } from 'zod';

import type { ErrorMetadata } from '@/lib/schemas/error-schemas';
import { ErrorMetadataSchema } from '@/lib/schemas/error-schemas';
import type { ParticipantContext } from '@/lib/schemas/participant-schemas';
import type {
  ApiMessage,
  DbAssistantMessageMetadata,
  DbMessageMetadata,
  DbPreSearchMessageMetadata,
} from '@/services/api';
import { UsageSchema } from '@/services/api';

import {
  buildAssistantMetadata,
  enrichMessageWithParticipant,
  getAssistantMetadata,
  getParticipantId,
  getParticipantMetadata,
  getPreSearchMetadata,
  getRoundNumber,
  getUserMetadata,
  hasParticipantEnrichment,
  isPreSearch,
  normalizeOpenRouterError,
} from './metadata';

/**
 * Message input type - uses ApiMessage inferred from backend Hono response
 * (SINGLE SOURCE OF TRUTH via RPC type inference)
 */
export type MessageInputType = ApiMessage;

// ============================================================================
// TYPE GUARD SCHEMAS - For narrowed UIMessage types
// ============================================================================

/**
 * Schema for UIMessage with pre-search metadata
 */
const _UIMessageWithPreSearchMetadataSchema = z.custom<UIMessage>().and(
  z.object({ metadata: z.custom<DbPreSearchMessageMetadata>() }),
);
type UIMessageWithPreSearchMetadata = z.infer<typeof _UIMessageWithPreSearchMetadataSchema>;

/**
 * Schema for UIMessage with participant metadata
 */
const _UIMessageWithParticipantMetadataSchema = z.custom<UIMessage>().and(
  z.object({ metadata: z.custom<DbAssistantMessageMetadata>() }),
);
type UIMessageWithParticipantMetadata = z.infer<typeof _UIMessageWithParticipantMetadataSchema>;

const UNKNOWN_FALLBACK = 'unknown' as const;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard: Check if message role is valid for UIMessage
 *
 * AI SDK UIMessage only supports 'user', 'assistant', and 'system' roles.
 * Tool messages are handled separately.
 */
function isUIMessageRole(
  role: string,
): role is 'user' | 'assistant' | 'system' {
  return (
    role === MessageRoles.USER
    || role === MessageRoles.ASSISTANT
    || role === UIMessageRoles.SYSTEM
  );
}

/**
 * Type guard: Check if UIMessage is pre-search message
 *
 * Uses Zod schema validation for runtime type safety.
 * Pre-search messages contain web search results.
 */
export function isPreSearchMessage(
  message: UIMessage,
): message is UIMessageWithPreSearchMetadata {
  const metadata = getPreSearchMetadata(message.metadata);
  return metadata !== null;
}

/**
 * Type guard: Check if UIMessage is participant message
 *
 * Uses type guard for runtime type safety.
 * Participant messages are assistant messages with full tracking metadata.
 */
export function isParticipantMessage(
  message: UIMessage,
): message is UIMessageWithParticipantMetadata {
  if (!message.metadata || message.role !== MessageRoles.ASSISTANT) {
    return false;
  }
  const metadata = getParticipantMetadata(message.metadata);
  return metadata !== null;
}

// ============================================================================
// Format Conversion
// ============================================================================

function normalizeMessagePartStates<T extends unknown[]>(parts: T): T {
  if (!parts?.length) {
    return parts;
  }

  return parts.map((part) => {
    if (typeof part === 'object' && part !== null && 'state' in part && part.state === TextPartStates.STREAMING) {
      return { ...part, state: TextPartStates.DONE };
    }
    return part;
  }) as T;
}

/**
 * Convert a single backend ApiMessage to AI SDK UIMessage format
 *
 * Transforms database message format into AI SDK's UIMessage structure.
 * Handles date serialization and metadata enrichment.
 *
 * Accepts MessageInputType (ApiMessage inferred from backend Hono response - SINGLE SOURCE OF TRUTH)
 */
export function chatMessageToUIMessage(
  message: MessageInputType,
): UIMessage {
  if (!isUIMessageRole(message.role)) {
    throw new Error(
      `Invalid message role for UI: ${message.role}. Tool messages should be filtered out.`,
    );
  }

  // API responses always return createdAt as strings (JSON serialization)
  // No Date object handling needed - JSON.stringify converts Date to ISO string
  const createdAt = message.createdAt;

  const isPreSearchMsg = isPreSearch(message.metadata);

  const metadata = isPreSearchMsg
    ? message.metadata
    : message.roundNumber !== null && message.roundNumber !== undefined
      ? {
          ...(message.metadata || {}),
          createdAt,
          participantId: message.participantId || undefined,
          role: message.role,
          roundNumber: message.roundNumber,
        }
      : null;

  // normalizeMessagePartStates preserves array type while normalizing part states
  // Type assertion is safe: function returns same type as input (generic T)
  const normalizedParts = normalizeMessagePartStates(
    message.parts || [],
  ) as UIMessage['parts'];

  return {
    id: message.id,
    metadata,
    parts: normalizedParts,
    role: message.role,
  };
}

/**
 * Convert array of backend ApiMessages to AI SDK UIMessage format
 *
 * Batch conversion with participant enrichment. Ensures all messages have
 * roundNumber in metadata to prevent display issues.
 *
 * Accepts MessageInputType[] (ApiMessage[] inferred from backend Hono response - SINGLE SOURCE OF TRUTH)
 *
 * @param messages - Array of ApiMessage objects from API response
 * @param participants - Optional participants for enrichment
 * @returns Array of UIMessages with complete metadata
 */
export function chatMessagesToUIMessages(
  messages: MessageInputType[],
  participants?: ParticipantContext[],
): UIMessage[] {
  // Filter out tool messages and convert
  const uiMessages = messages
    .filter(m => m.role !== MessageRoles.TOOL)
    .map(chatMessageToUIMessage);

  // Create participant lookup for enrichment
  const participantMap = participants
    ? new Map(participants.map(p => [p.id, p]))
    : null;

  let currentRound = 0;
  const messagesWithRoundNumber = uiMessages.map((message) => {
    const explicitRound = getRoundNumber(message.metadata);
    const hasRoundNumber
      = explicitRound !== null
        && explicitRound !== undefined
        && explicitRound >= 0;

    if (hasRoundNumber && explicitRound !== null) {
      if (message.role === MessageRoles.USER && explicitRound > currentRound) {
        currentRound = explicitRound;
      }

      // Enrich messages that have roundNumber but missing participant metadata
      if (participantMap && message.role === MessageRoles.ASSISTANT) {
        const isPreSearchMsg = isPreSearch(message.metadata);

        if (!isPreSearchMsg) {
          const participantId = getParticipantId(message.metadata);
          const participant = participantId
            ? participantMap.get(participantId)
            : null;

          if (participant && !hasParticipantEnrichment(message.metadata)) {
            const metadataForEnrichment = buildAssistantMetadata(
              getAssistantMetadata(message.metadata) || {},
              {
                model: participant.modelId,
                participantId: participant.id,
                participantIndex: 0,
                participantRole: participant.role,
                roundNumber: explicitRound,
              },
            );

            return {
              ...message,
              metadata: enrichMessageWithParticipant(
                metadataForEnrichment,
                {
                  id: participant.id,
                  index: 0,
                  modelId: participant.modelId,
                  role: participant.role ?? null,
                },
              ),
            };
          }
        }
      }

      return message;
    }

    if (message.role === MessageRoles.ASSISTANT) {
      const validMetadata = getAssistantMetadata(message.metadata);
      if (validMetadata) {
        return {
          ...message,
          metadata: {
            ...validMetadata,
            roundNumber: currentRound ?? 0,
          },
        };
      }
    } else if (message.role === MessageRoles.USER) {
      const validMetadata = getUserMetadata(message.metadata);
      if (validMetadata) {
        const result = {
          ...message,
          metadata: {
            ...validMetadata,
            roundNumber: currentRound ?? 0,
          },
        };
        currentRound += 1;
        return result;
      }
    }

    let enrichedMetadata: DbMessageMetadata | null;

    if (participantMap && message.role === MessageRoles.ASSISTANT) {
      const isPreSearchMsg = isPreSearch(message.metadata);

      if (!isPreSearchMsg) {
        const participantId = getParticipantId(message.metadata);
        const participant = participantId
          ? participantMap.get(participantId)
          : null;

        if (participant) {
          enrichedMetadata = buildAssistantMetadata(
            getAssistantMetadata(message.metadata) || {},
            {
              model: participant.modelId,
              participantId: participant.id,
              participantRole: participant.role,
              roundNumber: currentRound ?? 0,
            },
          );
        } else {
          enrichedMetadata = null;
        }
      } else {
        enrichedMetadata = getPreSearchMetadata(message.metadata);
      }
    } else {
      enrichedMetadata = null;
    }

    if (message.role === MessageRoles.USER) {
      currentRound += 1;
    }

    return {
      ...message,
      metadata: enrichedMetadata,
    };
  });

  return messagesWithRoundNumber;
}

// ============================================================================
// Message Filtering
// ============================================================================

/**
 * Generic filter function using predicate
 *
 * Provides flexible, composable filtering with type safety.
 *
 * @example
 * ```typescript
 * const userMessages = filterMessages(messages, m => m.role === 'user');
 * const round2Messages = filterMessages(messages, m => getRoundNumber(m.metadata) === 2);
 * ```
 */
export function filterMessages<T extends UIMessage>(
  messages: T[],
  predicate: (message: T) => boolean,
): T[] {
  return messages.filter(predicate);
}

/**
 * Filter messages by role
 */
export function filterByRole(
  messages: UIMessage[],
  role: UIMessage['role'],
): UIMessage[] {
  return filterMessages(messages, m => m.role === role);
}

/**
 * Filter messages by round number
 */
export function filterByRound(
  messages: UIMessage[],
  roundNumber: number,
): UIMessage[] {
  return filterMessages(
    messages,
    m => getRoundNumber(m.metadata) === roundNumber,
  );
}

export function filterNonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (message.role === MessageRoles.ASSISTANT) {
      return true;
    }

    if (message.role === MessageRoles.USER) {
      const textParts = message.parts?.filter(
        part =>
          part.type === MessagePartTypes.TEXT
          && 'text' in part
          && part.text.trim().length > 0,
      );
      return textParts && textParts.length > 0;
    }

    return false;
  });
}

/**
 * Get all participant messages for a specific round
 *
 * Filters for assistant messages in the specified round,
 * excluding pre-search messages.
 */
export function getParticipantMessagesForRound(
  messages: UIMessage[],
  roundNumber: number,
): UIMessage[] {
  const filtered = messages.filter((m) => {
    if (m.role !== MessageRoles.ASSISTANT) {
      return false;
    }

    if (m.id?.startsWith('pre-search-')) {
      return false;
    }
    if (isPreSearch(m.metadata)) {
      return false;
    }

    if (
      m.metadata
      && typeof m.metadata === 'object'
      && 'role' in m.metadata
      && m.metadata.role === UIMessageRoles.SYSTEM
    ) {
      return false;
    }

    if (getParticipantId(m.metadata) === null) {
      return false;
    }

    return getRoundNumber(m.metadata) === roundNumber;
  });

  return filtered;
}

/**
 * Extract participant message IDs from messages
 *
 * Returns unique message IDs from messages with participant metadata.
 */
export function getParticipantMessageIds(messages: UIMessage[]): string[] {
  return Array.from(
    new Set(
      messages
        .filter(m => getParticipantId(m.metadata) !== null)
        .map(m => m.id),
    ),
  );
}

// ============================================================================
// Convenience Filters
// ============================================================================

/**
 * Get all user messages
 */
export function getUserMessages(messages: UIMessage[]): UIMessage[] {
  return filterByRole(messages, MessageRoles.USER);
}

/**
 * Get all assistant messages
 */
export function getAssistantMessages(messages: UIMessage[]): UIMessage[] {
  return filterByRole(messages, MessageRoles.ASSISTANT);
}

/**
 * Get the highest round number from messages
 */
export function getLatestRoundNumber(messages: UIMessage[]): number {
  const roundNumbers = messages
    .map(m => getRoundNumber(m.metadata))
    .filter((round): round is number => round !== undefined && round !== null);

  return roundNumbers.length > 0 ? Math.max(...roundNumbers) : 0;
}

// ============================================================================
// Error Message Creation
// ============================================================================

/**
 * Create a structured error UIMessage for a participant
 *
 * Creates assistant message with error metadata when participant
 * fails to generate a response.
 */
export function createErrorUIMessage(
  participant: ParticipantContext,
  currentIndex: number,
  errorMessage: string,
  errorType: UIMessageErrorType = UIMessageErrorTypeSchema.enum.failed,
  errorMetadata?: ErrorMetadata,
  roundNumber?: number,
): UIMessage {
  const validatedMetadata = errorMetadata
    ? ErrorMetadataSchema.safeParse(errorMetadata)
    : { data: undefined, success: false as const };

  const metadata = validatedMetadata.success ? validatedMetadata.data : errorMetadata;

  // openRouterError can be string or record from error schema, normalize to record format
  const openRouterError = normalizeOpenRouterError(metadata?.openRouterError);

  const errorMeta = buildAssistantMetadata(
    {},
    {
      errorCategory: metadata?.errorCategory || errorType,
      errorMessage,
      errorType,
      hasError: true,
      model: participant.modelId,
      openRouterCode: metadata?.openRouterCode,
      openRouterError,
      participantId: participant.id,
      participantIndex: currentIndex,
      participantRole: participant.role,
      providerMessage:
        metadata?.providerMessage
        || metadata?.rawErrorMessage
        || errorMessage,
      rawErrorMessage: metadata?.rawErrorMessage,
      roundNumber,
      statusCode: metadata?.statusCode,
    },
  );

  return {
    id: `error-${crypto.randomUUID()}-${currentIndex}`,
    metadata: errorMeta,
    parts: [{ text: '', type: MessagePartTypes.TEXT }],
    role: MessageRoles.ASSISTANT,
  };
}

/**
 * Merge participant metadata into message metadata
 *
 * Enriches message metadata with participant information.
 * Automatically detects empty responses and backend errors.
 */
export function mergeParticipantMetadata(
  message: UIMessage,
  participant: ParticipantContext,
  currentIndex: number,
  roundNumber: number,
  options?: { hasGeneratedText?: boolean; forceError?: boolean; errorCode?: string },
): DbAssistantMessageMetadata {
  const validatedMetadata = getAssistantMetadata(message.metadata);

  const hasBackendErrorFlag = validatedMetadata?.hasError === true || options?.forceError === true;
  const hasBackendNoErrorFlag = validatedMetadata?.hasError === false && !options?.forceError;
  const skipPartsCheck = options?.hasGeneratedText === true;

  const textParts = message.parts?.filter(
    p => p.type === MessagePartTypes.TEXT || p.type === MessagePartTypes.REASONING,
  ) || [];
  const hasTextContent = textParts.some(
    part => 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0,
  );
  const hasToolCalls = message.parts?.some(p => p.type === MessagePartTypes.TOOL_CALL) || false;
  const hasOutputTokens = (typeof validatedMetadata?.usage?.completionTokens === 'number' ? validatedMetadata.usage.completionTokens : 0) > 0;
  const hasAnyContent = skipPartsCheck || hasTextContent || hasToolCalls || hasOutputTokens;
  const hasSuccessfulFinish = validatedMetadata?.finishReason === FinishReasons.STOP;
  const hasNoErrorSignal = hasBackendNoErrorFlag || skipPartsCheck || hasSuccessfulFinish || hasAnyContent;
  const hasError = hasBackendErrorFlag || !hasNoErrorSignal;

  let errorMessage: string | undefined;
  if (validatedMetadata?.errorMessage && typeof validatedMetadata.errorMessage === 'string') {
    errorMessage = validatedMetadata.errorMessage;
  }
  if (!hasAnyContent && !errorMessage && hasError) {
    errorMessage = `The model (${participant.modelId}) did not generate a response.`;
  }

  const usageResult = UsageSchema.partial().safeParse(validatedMetadata?.usage);
  const usage = {
    completionTokens: usageResult.success ? (usageResult.data.completionTokens ?? 0) : 0,
    promptTokens: usageResult.success ? (usageResult.data.promptTokens ?? 0) : 0,
    totalTokens: usageResult.success ? (usageResult.data.totalTokens ?? 0) : 0,
  };

  const finishReasonRaw = validatedMetadata?.finishReason ? String(validatedMetadata.finishReason) : UNKNOWN_FALLBACK;
  const finishReasonResult = FinishReasonSchema.safeParse(finishReasonRaw);
  const safeFinishReason: FinishReason = finishReasonResult.success ? finishReasonResult.data : UNKNOWN_FALLBACK;

  const errorTypeRaw = options?.errorCode
    ?? (typeof validatedMetadata?.errorType === 'string'
      ? validatedMetadata.errorType
      : !hasAnyContent && hasError
          ? 'empty_response'
          : UNKNOWN_FALLBACK);
  const errorTypeResult = ErrorTypeSchema.safeParse(errorTypeRaw);
  const safeErrorType: ErrorType = errorTypeResult.success ? errorTypeResult.data : UNKNOWN_FALLBACK;

  const backendParticipantId = validatedMetadata?.participantId;
  const effectiveParticipantId = (typeof backendParticipantId === 'string' && backendParticipantId.length > 0)
    ? backendParticipantId
    : participant.id;

  return buildAssistantMetadata(
    {
      finishReason: safeFinishReason,
      isPartialResponse: validatedMetadata?.isPartialResponse === true,
      isTransient: validatedMetadata?.isTransient === true,
      usage,
      ...(validatedMetadata?.createdAt && typeof validatedMetadata.createdAt === 'string' && {
        createdAt: validatedMetadata.createdAt,
      }),
      // Citation fields - preserve from backend streaming metadata
      ...(validatedMetadata?.availableSources && {
        availableSources: validatedMetadata.availableSources,
      }),
      ...(validatedMetadata?.citations && {
        citations: validatedMetadata.citations,
      }),
      ...(validatedMetadata?.reasoningDuration !== undefined && {
        reasoningDuration: validatedMetadata.reasoningDuration,
      }),
    },
    {
      hasError,
      model: participant.modelId,
      participantId: effectiveParticipantId,
      participantIndex: currentIndex,
      participantRole: participant.role,
      roundNumber,
      ...(hasError && { errorMessage, errorType: safeErrorType }),
    },
  );
}
