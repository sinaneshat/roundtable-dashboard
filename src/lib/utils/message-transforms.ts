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

import type { UIMessage } from 'ai';

import type { ErrorType, FinishReason, UIMessageErrorType } from '@/api/core/enums';
import {
  ErrorTypeSchema,
  FinishReasonSchema,
  MessagePartTypes,
  MessageRoles,
  UIMessageErrorTypeSchema,
  UIMessageRoles,
} from '@/api/core/enums';
import type { ChatMessage } from '@/api/routes/chat/schema';
import type {
  DbAssistantMessageMetadata,
  DbMessageMetadata,
  DbPreSearchMessageMetadata,
  DbUserMessageMetadata,
} from '@/db/schemas/chat-metadata';
import {
  DbAssistantMessageMetadataSchema,
  DbPreSearchMessageMetadataSchema,
  UsageSchema,
} from '@/db/schemas/chat-metadata';
import type { ErrorMetadata } from '@/lib/schemas/error-schemas';
import { ErrorMetadataSchema } from '@/lib/schemas/error-schemas';
import type { ParticipantContext } from '@/lib/schemas/participant-schemas';

import {
  buildAssistantMetadata,
  enrichMessageWithParticipant,
  getAssistantMetadata,
  getParticipantId,
  getPreSearchMetadata,
  getRoundNumber,
  getUserMetadata,
  hasParticipantEnrichment,
  isPreSearch,
} from './metadata';

// ============================================================================
// Type Exports
// ============================================================================

export type { UIMessageErrorType };

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
): message is UIMessage & { metadata: DbPreSearchMessageMetadata } {
  if (!message.metadata)
    return false;
  const validation = DbPreSearchMessageMetadataSchema.safeParse(
    message.metadata,
  );
  return validation.success;
}

/**
 * Type guard: Check if UIMessage is participant message
 *
 * Uses Zod schema validation for runtime type safety.
 * Participant messages are assistant messages with full tracking metadata.
 */
export function isParticipantMessage(
  message: UIMessage,
): message is UIMessage & { metadata: DbAssistantMessageMetadata } {
  if (!message.metadata || message.role !== MessageRoles.ASSISTANT)
    return false;
  const validation = DbAssistantMessageMetadataSchema.safeParse(
    message.metadata,
  );
  return (
    validation.success && validation.data && 'participantId' in validation.data
  );
}

// ============================================================================
// Format Conversion
// ============================================================================

/**
 * Normalize message part states to 'done'
 *
 * ✅ STATE CONSISTENCY FIX: When loading messages from server/store, normalize
 * any stale 'streaming' states to 'done'. The 'state' property is a runtime-only
 * AI SDK concept that shouldn't persist across page refreshes.
 *
 * This prevents inconsistency where isStreaming=false but message parts have state='streaming'.
 */
function normalizeMessagePartStates(parts: UIMessage['parts']): UIMessage['parts'] {
  if (!parts || parts.length === 0) {
    return parts;
  }

  return parts.map((part) => {
    // If part has a 'state' property, normalize 'streaming' to 'done'
    if ('state' in part && part.state === 'streaming') {
      return { ...part, state: 'done' as const };
    }
    return part;
  });
}

/**
 * Convert a single backend ChatMessage to AI SDK UIMessage format
 *
 * Transforms database message format into AI SDK's UIMessage structure.
 * Handles date serialization and metadata enrichment.
 */
export function chatMessageToUIMessage(
  message:
    | ChatMessage
    | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }),
): UIMessage {
  if (!isUIMessageRole(message.role)) {
    throw new Error(
      `Invalid message role for UI: ${message.role}. Tool messages should be filtered out.`,
    );
  }

  const createdAt
    = message.createdAt instanceof Date
      ? message.createdAt.toISOString()
      : message.createdAt;

  // ✅ TYPE-SAFE: Check for pre-search metadata without force casting
  const isPreSearchMsg
    = message.metadata !== null
      && typeof message.metadata === 'object'
      && 'isPreSearch' in message.metadata
      && message.metadata.isPreSearch === true;

  // ✅ CRITICAL FIX: Always preserve roundNumber from database column
  // Even when metadata exists, ensure roundNumber from column takes precedence
  // This prevents inconsistencies when metadata is outdated or incomplete
  const metadata = isPreSearchMsg
    ? message.metadata
    : message.roundNumber !== null && message.roundNumber !== undefined
      ? {
          ...(message.metadata || {}),
          role: message.role,
          participantId: message.participantId || undefined,
          createdAt,
          roundNumber: message.roundNumber, // Database column is source of truth
        }
      : null;

  // ✅ STATE CONSISTENCY FIX: Normalize any stale 'streaming' states to 'done'
  const normalizedParts = normalizeMessagePartStates(
    (message.parts || []) as UIMessage['parts'],
  );

  return {
    id: message.id,
    role: message.role,
    parts: normalizedParts,
    metadata,
  };
}

/**
 * Convert array of backend ChatMessages to AI SDK UIMessage format
 *
 * Batch conversion with participant enrichment. Ensures all messages have
 * roundNumber in metadata to prevent display issues.
 *
 * @param messages - Array of backend ChatMessages
 * @param participants - Optional participants for enrichment
 * @returns Array of UIMessages with complete metadata
 */
export function chatMessagesToUIMessages(
  messages: (
    | ChatMessage
    | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date })
  )[],
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

  // Ensure all messages have roundNumber and participant enrichment
  let currentRound = 0;
  const messagesWithRoundNumber = uiMessages.map((message) => {
    const explicitRound = getRoundNumber(message.metadata);
    // ✅ 0-BASED FIX: Accept round 0 as valid (was: explicitRound > 0)
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
            const baseMetadata = getAssistantMetadata(message.metadata);
            // Use buildAssistantMetadata to create valid metadata
            const metadataForEnrichment = buildAssistantMetadata(
              baseMetadata || {},
              {
                roundNumber: explicitRound,
                participantId: participant.id,
                model: participant.modelId,
                participantRole: participant.role,
                participantIndex: 0,
              },
            );

            return {
              ...message,
              metadata: enrichMessageWithParticipant(
                metadataForEnrichment,
                {
                  id: participant.id,
                  modelId: participant.modelId,
                  role: participant.role,
                  index: 0,
                },
              ),
            };
          }
        }
      }

      return message;
    }

    // Message missing roundNumber - assign based on current round
    // ✅ ZOD-FIRST PATTERN: Use validated extraction functions

    // Check if message already has validated metadata
    if (message.role === MessageRoles.ASSISTANT) {
      const validMetadata = getAssistantMetadata(message.metadata);
      if (validMetadata) {
        // Metadata validates, just update roundNumber
        const updated: DbAssistantMessageMetadata = {
          ...validMetadata,
          roundNumber: currentRound ?? 0,
        };

        return {
          ...message,
          metadata: updated,
        };
      }
    } else if (message.role === MessageRoles.USER) {
      const validMetadata = getUserMetadata(message.metadata);
      if (validMetadata) {
        const updated: DbUserMessageMetadata = {
          ...validMetadata,
          roundNumber: currentRound ?? 0,
        };

        currentRound += 1;

        return {
          ...message,
          metadata: updated,
        };
      }
    }

    // Message lacks valid metadata - create minimal metadata
    // This path should rarely execute for database-loaded messages
    let enrichedMetadata: DbMessageMetadata | null;

    if (participantMap && message.role === MessageRoles.ASSISTANT) {
      const isPreSearchMsg = isPreSearch(message.metadata);

      if (!isPreSearchMsg) {
        const participantId = getParticipantId(message.metadata);
        const participant = participantId
          ? participantMap.get(participantId)
          : null;

        if (participant) {
          const existingMetadata = getAssistantMetadata(message.metadata);
          enrichedMetadata = buildAssistantMetadata(existingMetadata || {}, {
            roundNumber: currentRound ?? 0,
            participantId: participant.id,
            model: participant.modelId,
            participantRole: participant.role,
          });
        } else {
          enrichedMetadata = null;
        }
      } else {
        // isPreSearchMsg is true - validate and use pre-search metadata
        const preSearchMeta = getPreSearchMetadata(message.metadata);
        enrichedMetadata = preSearchMeta;
      }
    } else {
      enrichedMetadata = null;
    }

    // ✅ CRITICAL FIX: Increment currentRound AFTER assigning it to the message
    // This ensures the first user message gets roundNumber: 0, not 1
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

/**
 * Filter to participant messages only (excludes pre-search)
 */
export function filterToParticipantMessages(
  messages: UIMessage[],
): Array<UIMessage & { metadata: DbAssistantMessageMetadata }> {
  return messages.filter(isParticipantMessage);
}

/**
 * Filter to pre-search messages only
 */
export function filterToPreSearchMessages(
  messages: UIMessage[],
): Array<UIMessage & { metadata: DbPreSearchMessageMetadata }> {
  return messages.filter(isPreSearchMessage);
}

/**
 * Filter messages with no meaningful content
 *
 * Removes user messages with only empty text.
 * Keeps assistant messages (may have errors or system info).
 */
export function filterNonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    if (message.role === MessageRoles.ASSISTANT)
      return true;

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

    // Multiple checks for defense-in-depth
    if (m.id && m.id.startsWith('pre-search-')) {
      return false;
    }
    if (isPreSearch(m.metadata)) {
      return false;
    }

    // ✅ TYPE-SAFE: Check role field without force casting, using enum constants
    if (
      m.metadata
      && typeof m.metadata === 'object'
      && 'role' in m.metadata
      && m.metadata.role === UIMessageRoles.SYSTEM
    ) {
      return false;
    }

    const participantId = getParticipantId(m.metadata);

    if (participantId == null) {
      return false;
    }

    const msgRound = getRoundNumber(m.metadata);
    const matches = msgRound === roundNumber;

    return matches;
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
        .filter(m => getParticipantId(m.metadata) != null)
        .map(m => m.id),
    ),
  );
}

/**
 * Get participant messages with IDs for a specific round
 *
 * Combined operation for filtering and ID extraction.
 */
export function getParticipantMessagesWithIds(
  messages: UIMessage[],
  roundNumber: number,
): { messages: UIMessage[]; ids: string[] } {
  const filteredMessages = getParticipantMessagesForRound(
    messages,
    roundNumber,
  );
  const ids = getParticipantMessageIds(filteredMessages);
  return { messages: filteredMessages, ids };
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
 * Count messages in a specific round
 */
export function countMessagesInRound(
  messages: UIMessage[],
  roundNumber: number,
): number {
  return getParticipantMessagesForRound(messages, roundNumber).length;
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
    : { success: false, data: undefined };

  const metadata = validatedMetadata.success
    ? validatedMetadata.data
    : errorMetadata;

  const errorMeta = buildAssistantMetadata(
    {},
    {
      participantId: participant.id,
      participantIndex: currentIndex,
      participantRole: participant.role,
      model: participant.modelId,
      roundNumber,
      hasError: true,
      errorType,
      errorMessage,
      additionalFields: {
        errorCategory: metadata?.errorCategory || errorType,
        statusCode: metadata?.statusCode,
        rawErrorMessage: metadata?.rawErrorMessage,
        providerMessage:
          metadata?.providerMessage
          || metadata?.rawErrorMessage
          || errorMessage,
        openRouterError: metadata?.openRouterError,
        openRouterCode: metadata?.openRouterCode,
      },
    },
  );

  return {
    id: `error-${crypto.randomUUID()}-${currentIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text: '' }],
    metadata: errorMeta,
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
  options?: { hasGeneratedText?: boolean },
): Extract<DbMessageMetadata, { role: 'assistant' }> {
  const validatedMetadata = getAssistantMetadata(message.metadata);

  // Trust backend error flags - these are authoritative
  const hasBackendErrorFlag = validatedMetadata?.hasError === true;
  const hasBackendNoErrorFlag = validatedMetadata?.hasError === false;

  // Note: Explicit error type/message detection removed - backend hasError flag is authoritative
  // Previously checked for explicit error types but this caused false positives
  // Now we rely on: backend flags, finish reasons, and content presence

  // Skip parts check when called from onFinish with hasGeneratedText=true
  const skipPartsCheck = options?.hasGeneratedText === true;

  // ✅ RACE CONDITION FIX: Check for REASONING parts (DeepSeek R1, Claude thinking, etc.)
  // AI SDK v5 Pattern: Reasoning models emit type='reasoning' parts before type='text' parts
  const textParts
    = message.parts?.filter(
      p =>
        p.type === MessagePartTypes.TEXT
        || p.type === MessagePartTypes.REASONING,
    ) || [];
  const hasTextContent = textParts.some(
    part =>
      'text' in part
      && typeof part.text === 'string'
      && part.text.trim().length > 0,
  );
  const hasToolCalls
    = message.parts?.some(p => p.type === MessagePartTypes.TOOL_CALL) || false;

  // ✅ CRITICAL FIX: Multiple signals for content presence
  // Signal 1: Has text or reasoning content in parts
  // Signal 2: Has tool calls
  // Signal 3: Output tokens > 0 (backend reported content generation)
  // Signal 4: Caller said content was generated (skipPartsCheck)
  const hasOutputTokens = (validatedMetadata?.usage?.completionTokens ?? 0) > 0;
  const hasAnyContent
    = skipPartsCheck || hasTextContent || hasToolCalls || hasOutputTokens;

  // ✅ CRITICAL FIX: Multiple signals for successful completion
  // Signal 1: finishReason='stop' indicates successful completion
  const hasSuccessfulFinish = validatedMetadata?.finishReason === 'stop';

  // Signal 2: Backend explicitly marked as no error
  const backendMarkedSuccess = hasBackendNoErrorFlag;

  // ✅ RACE CONDITION FIX: Determine hasError with defensive logic
  // Error if: Backend explicitly marked error
  // No error if: Backend marked success, OR caller confirmed content, OR successful finish, OR has content
  // Default: ERROR when no content (stream completed but produced nothing)
  const hasNoErrorSignal
    = backendMarkedSuccess
      || skipPartsCheck
      || hasSuccessfulFinish
      || hasAnyContent;
  const hasError = hasBackendErrorFlag || !hasNoErrorSignal;

  // Generate error message if needed
  let errorMessage: string | undefined;
  if (
    validatedMetadata?.errorMessage
    && typeof validatedMetadata.errorMessage === 'string'
  ) {
    errorMessage = validatedMetadata.errorMessage;
  }
  if (!hasAnyContent && !errorMessage && hasError) {
    errorMessage = `The model (${participant.modelId}) did not generate a response.`;
  }

  // Parse usage data
  const usageResult = UsageSchema.partial().safeParse(validatedMetadata?.usage);
  const usage = {
    promptTokens: usageResult.success
      ? (usageResult.data.promptTokens ?? 0)
      : 0,
    completionTokens: usageResult.success
      ? (usageResult.data.completionTokens ?? 0)
      : 0,
    totalTokens: usageResult.success ? (usageResult.data.totalTokens ?? 0) : 0,
  };

  // Parse finish reason
  const finishReasonRaw = validatedMetadata?.finishReason
    ? String(validatedMetadata.finishReason)
    : 'unknown';
  const finishReasonResult = FinishReasonSchema.safeParse(finishReasonRaw);
  const safeFinishReason: FinishReason = finishReasonResult.success
    ? finishReasonResult.data
    : 'unknown';

  // Parse error type
  const errorTypeRaw
    = typeof validatedMetadata?.errorType === 'string'
      ? validatedMetadata.errorType
      : !hasAnyContent && hasError
          ? 'empty_response'
          : 'unknown';
  const errorTypeResult = ErrorTypeSchema.safeParse(errorTypeRaw);
  const safeErrorType: ErrorType = errorTypeResult.success
    ? errorTypeResult.data
    : 'unknown';

  // ✅ BUG FIX: Prefer backend's participantId over frontend's temp UUID
  // When user applies recommended action, frontend creates participants with temp UUIDs.
  // Backend creates real ULID IDs and includes them in stream metadata.
  // Previously, this function overwrote backend's real ID with frontend's temp UUID.
  // Now we check if backend sent a participantId and prefer it.
  const backendParticipantId = validatedMetadata?.participantId;
  const effectiveParticipantId = (typeof backendParticipantId === 'string' && backendParticipantId.length > 0)
    ? backendParticipantId
    : participant.id;

  return buildAssistantMetadata(
    {
      finishReason: safeFinishReason,
      usage,
      isTransient: validatedMetadata?.isTransient === true,
      isPartialResponse: validatedMetadata?.isPartialResponse === true,
      ...(validatedMetadata?.createdAt
        && typeof validatedMetadata.createdAt === 'string' && {
        createdAt: validatedMetadata.createdAt,
      }),
    },
    {
      participantId: effectiveParticipantId,
      participantIndex: currentIndex,
      participantRole: participant.role,
      model: participant.modelId,
      roundNumber,
      hasError,
      ...(hasError && {
        errorType: safeErrorType,
        errorMessage,
      }),
    },
  ) as Extract<DbMessageMetadata, { role: 'assistant' }>;
}

// ============================================================================
// Message Validation
// ============================================================================

/**
 * Validation result for message order checks
 */
export type MessageOrderValidation = {
  isValid: boolean;
  errors: string[];
};

/**
 * Validate message order for conversation flow
 *
 * Validates proper round-based structure:
 * - Round numbers in ascending order
 * - Each round starts with exactly one user message
 * - User message appears before assistant messages
 * - No round skipping
 */
export function validateMessageOrder(
  messages: UIMessage[],
): MessageOrderValidation {
  const errors: string[] = [];

  let lastRound = 0;
  let userMessageSeenInCurrentRound = false;
  // ✅ 0-BASED FIX: Expect first round to be 0 (was: 1)
  let expectedNextRound = 0;
  const roundsEncountered = new Set<number>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg)
      continue;

    // ✅ 0-BASED FIX: Default to 0 for first round (was: ?? 1)
    const round = getRoundNumber(msg.metadata) ?? 0;

    // Check round progression
    if (round < lastRound) {
      errors.push(
        `Message ${i} (id: ${msg.id}, role: ${msg.role}): Round ${round} appears after round ${lastRound}`,
      );
    }

    // Detect round transition
    if (round > lastRound) {
      if (round > expectedNextRound) {
        errors.push(
          `Message ${i} (id: ${msg.id}): Round ${round} skips from ${lastRound} (expected ${expectedNextRound})`,
        );
      }

      lastRound = round;
      userMessageSeenInCurrentRound = false;
      expectedNextRound = round + 1;
    }

    roundsEncountered.add(round);

    // Check user message position
    if (msg.role === MessageRoles.USER) {
      if (userMessageSeenInCurrentRound) {
        errors.push(
          `Message ${i} (id: ${msg.id}): Multiple user messages in round ${round}`,
        );
      }
      userMessageSeenInCurrentRound = true;
    } else if (msg.role === MessageRoles.ASSISTANT) {
      if (!userMessageSeenInCurrentRound) {
        errors.push(
          `Message ${i} (id: ${msg.id}): Assistant message before user message in round ${round}`,
        );
      }
    }
  }

  // Check sequential rounds
  const sortedRounds = Array.from(roundsEncountered).sort((a, b) => a - b);
  for (let i = 0; i < sortedRounds.length - 1; i++) {
    const current = sortedRounds[i];
    const next = sortedRounds[i + 1];
    if (next && current && next !== current + 1) {
      errors.push(
        `Round gap: ${current} followed by ${next} (missing ${current + 1})`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
