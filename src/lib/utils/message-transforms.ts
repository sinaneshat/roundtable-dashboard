/**
 * Message Transformation Utilities
 *
 * Provides utilities for transforming and manipulating messages
 * between backend ChatMessage format and AI SDK UIMessage format.
 *
 * Note: AI SDK v5's useChat handles deduplication and validation automatically.
 * This module focuses on format conversion and metadata enrichment.
 *
 * @module lib/utils/message-transforms
 */

import type { UIMessage } from 'ai';

import type { ChatMessage } from '@/api/routes/chat/schema';
import type { ErrorMetadata, UIMessageErrorType } from '@/lib/schemas/error-schemas';
import { ErrorMetadataSchema, UIMessageErrorTypeSchema } from '@/lib/schemas/error-schemas';
import type { ErrorType, FinishReason, MessageMetadata } from '@/lib/schemas/message-metadata';
import { ErrorTypeSchema, FinishReasonSchema, MessageMetadataSchema, UsageSchema } from '@/lib/schemas/message-metadata';

import { extractMetadataParticipantId, extractMetadataRoundNumber } from './metadata-extraction';

// ============================================================================
// Type Definitions
// ============================================================================

// ✅ UIMessageErrorType now imported from error-schemas (single source of truth)
export type { UIMessageErrorType };

/**
 * Validation result for message order checks
 */
export type MessageOrderValidation = {
  /** Whether the message order is valid */
  isValid: boolean;
  /** Specific validation error messages */
  errors: string[];
};

// ============================================================================
// Metadata Extraction
// ============================================================================

/**
 * Safely extract and parse message metadata
 *
 * Validates metadata against MessageMetadataSchema and returns typed metadata.
 * Falls back to raw metadata if parsing fails (for backwards compatibility).
 *
 * @param metadata - Raw metadata object from message
 * @returns Parsed MessageMetadata or undefined if no metadata
 *
 * @example
 * ```typescript
 * const metadata = getMessageMetadata(message.metadata);
 * if (metadata?.participantId) {
 *   const participantId = metadata.participantId;
 * }
 * ```
 */
export function getMessageMetadata(metadata: unknown): MessageMetadata | undefined {
  if (!metadata)
    return undefined;

  const result = MessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : (metadata as MessageMetadata);
}

// ============================================================================
// Message Format Conversion
// ============================================================================

/**
 * Convert a single backend ChatMessage to AI SDK UIMessage format
 *
 * Transforms database message format into the AI SDK's UIMessage structure.
 * Handles date serialization and metadata enrichment automatically.
 *
 * @param message - Backend ChatMessage from database
 * @returns UIMessage compatible with AI SDK
 *
 * @example
 * ```typescript
 * const dbMessage = await db.query.chatMessage.findFirst(...);
 * const uiMessage = chatMessageToUIMessage(dbMessage);
 * ```
 */
export function chatMessageToUIMessage(
  message: ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }),
): UIMessage {
  const createdAt = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt;

  // ✅ STRICT TYPING: Build metadata from database fields
  // Let TypeScript infer the type - it will match PartialMessageMetadata structure
  const metadata = message.roundNumber
    ? {
        ...(message.metadata || {}),
        role: message.role, // ✅ FIX: Add role discriminator for type guard
        participantId: message.participantId || undefined,
        createdAt,
        roundNumber: message.roundNumber,
      }
    : null;

  return {
    id: message.id,
    role: message.role,
    parts: (message.parts || []) as UIMessage['parts'],
    metadata,
  };
}

/**
 * Convert array of backend ChatMessages to AI SDK UIMessage format
 *
 * Batch conversion for multiple messages. Uses chatMessageToUIMessage internally.
 * Preserves message order from database.
 *
 * CRITICAL FIX: Ensures all messages have roundNumber set in metadata.
 * If backend messages are missing roundNumber, assigns them based on user message sequence.
 *
 * ✅ CRITICAL FIX: Enriches messages with participant metadata (model, role, etc.)
 * This ensures backend messages are recognized as "complete" and never need to lookup
 * participant info from current state, preventing duplication issues when participants change.
 *
 * @param messages - Array of backend ChatMessages from database
 * @param participants - Optional array of participants to enrich messages with model info
 * @returns Array of UIMessages compatible with AI SDK
 *
 * @example
 * ```typescript
 * const dbMessages = await db.query.chatMessage.findMany(...);
 * const uiMessages = chatMessagesToUIMessages(dbMessages, participants);
 * setMessages(uiMessages);
 * ```
 */
export function chatMessagesToUIMessages(
  messages: (ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }))[],
  participants?: Array<{ id: string; modelId: string; role: string | null }>,
): UIMessage[] {
  // Convert all messages first
  const uiMessages = messages.map(chatMessageToUIMessage);

  // ✅ CRITICAL FIX: Create participant lookup map for enrichment
  const participantMap = participants
    ? new Map(participants.map(p => [p.id, p]))
    : null;

  // CRITICAL FIX: Ensure all messages have roundNumber in metadata
  // This prevents groupMessagesByRound from having to use inference logic
  // which can fail and cause messages to not be displayed
  let currentRound = 0;
  const messagesWithRoundNumber = uiMessages.map((message) => {
    // Check if message already has roundNumber in metadata
    // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe metadata access
    const explicitRound = extractMetadataRoundNumber(message.metadata);
    const hasRoundNumber = explicitRound !== undefined && explicitRound > 0;

    if (hasRoundNumber) {
      // Update current round tracker
      if (message.role === 'user' && explicitRound > currentRound) {
        currentRound = explicitRound;
      }

      // ✅ CRITICAL FIX: Still enrich messages that already have roundNumber
      // They might be missing model/role metadata needed for "complete" status
      if (participantMap && message.role === 'assistant') {
        // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe participant ID access
        const participantId = extractMetadataParticipantId(message.metadata);
        const participant = participantId ? participantMap.get(participantId) : null;
        const msgMetadata = message.metadata && typeof message.metadata === 'object'
          ? message.metadata as Record<string, unknown>
          : undefined;

        if (participant && msgMetadata && !msgMetadata.model) {
          // Add model and role to metadata if missing
          return {
            ...message,
            metadata: {
              ...msgMetadata,
              role: message.role, // ✅ FIX: Add role discriminator for type guard
              model: participant.modelId,
              ...(participant.role && { participantRole: participant.role }),
            },
          };
        }
      }

      return message;
    }

    // Message missing roundNumber - assign based on current round
    if (message.role === 'user') {
      // New user message starts a new round
      currentRound += 1;
    }

    // ✅ CRITICAL FIX: Enrich message metadata with participant info if available
    // This makes backend messages "complete" so they don't need participant lookups
    const baseMetadata: Record<string, unknown> = {
      ...(message.metadata || {}),
      role: message.role, // ✅ FIX: Add role discriminator for type guard
      roundNumber: currentRound || 1, // Default to round 1 if no rounds yet
    };

    // If we have participant data and this is an assistant message, enrich it
    if (participantMap && message.role === 'assistant') {
      // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe participant ID access
      const participantId = extractMetadataParticipantId(message.metadata);
      const participant = participantId ? participantMap.get(participantId) : null;

      if (participant) {
        // Add model and role to metadata so message is recognized as "complete"
        baseMetadata.model = participant.modelId;
        if (participant.role) {
          baseMetadata.participantRole = participant.role;
        }
      }
    }

    // Assign roundNumber and enriched metadata to message
    const messageWithRound: UIMessage = {
      ...message,
      metadata: baseMetadata,
    };

    return messageWithRound;
  });

  return messagesWithRoundNumber;
}

// ============================================================================
// Message Filtering
// ============================================================================

/**
 * Filter out messages with no meaningful content
 *
 * Removes user messages that contain only empty text parts.
 * Always keeps assistant messages (even if empty) since they may contain
 * error information or system messages.
 *
 * @param messages - Array of UIMessages to filter
 * @returns Array containing only messages with content
 *
 * @example
 * ```typescript
 * const filteredMessages = filterNonEmptyMessages(allMessages);
 * await saveMessages(filteredMessages);
 * ```
 */
export function filterNonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    // Always keep assistant messages (may have errors or tool calls)
    if (message.role === 'assistant')
      return true;

    // Only keep user messages with non-empty text
    if (message.role === 'user') {
      const textParts = message.parts?.filter(
        part => part.type === 'text' && 'text' in part && part.text.trim().length > 0,
      );
      return textParts && textParts.length > 0;
    }

    return false;
  });
}

// ============================================================================
// Error Message Creation
// ============================================================================

/**
 * Create a structured error UIMessage for a participant
 *
 * Creates an assistant message with error metadata when a participant
 * fails to generate a response (rate limits, network errors, etc.).
 *
 * @param participant - Participant information
 * @param participant.id - Unique identifier for the participant
 * @param participant.modelId - Model identifier (e.g., 'openai/gpt-4')
 * @param participant.role - Participant's role in the conversation (nullable)
 * @param currentIndex - Participant index in the conversation
 * @param errorMessage - Human-readable error message
 * @param errorType - Error category (defaults to 'error')
 * @param errorMetadata - Additional error context (validated against ErrorMetadataSchema)
 * @param roundNumber - Round number where error occurred
 * @returns UIMessage with error metadata
 *
 * @example
 * ```typescript
 * const errorMsg = createErrorUIMessage(
 *   participant,
 *   0,
 *   'Connection timeout',
 *   'provider_network',
 *   { statusCode: 504, errorCategory: 'network' },
 *   currentRound
 * );
 * ```
 */
export function createErrorUIMessage(
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
  errorMessage: string,
  errorType: UIMessageErrorType = UIMessageErrorTypeSchema.enum.error,
  errorMetadata?: ErrorMetadata,
  roundNumber?: number,
): UIMessage {
  // Validate metadata if provided
  const validatedMetadata = errorMetadata
    ? ErrorMetadataSchema.safeParse(errorMetadata)
    : { success: false, data: undefined };

  const metadata = validatedMetadata.success ? validatedMetadata.data : errorMetadata;

  return {
    id: `error-${crypto.randomUUID()}-${currentIndex}`,
    role: 'assistant',
    parts: [{ type: 'text', text: '' }],
    metadata: {
      role: 'assistant', // ✅ FIX: Add role discriminator for type guard
      participantId: participant.id,
      participantIndex: currentIndex,
      ...(participant.role && { participantRole: participant.role }),
      model: participant.modelId,
      hasError: true,
      errorType,
      errorMessage,
      errorCategory: metadata?.errorCategory || errorType,
      statusCode: metadata?.statusCode,
      rawErrorMessage: metadata?.rawErrorMessage,
      providerMessage: metadata?.providerMessage || metadata?.rawErrorMessage || errorMessage,
      openRouterError: metadata?.openRouterError,
      openRouterCode: metadata?.openRouterCode,
      roundNumber,
    },
  };
}

/**
 * Merge participant metadata into message metadata
 *
 * Enriches a message's metadata with participant information and error detection.
 * Automatically detects empty responses and backend errors.
 *
 * @param message - UIMessage to enrich
 * @param participant - Participant information
 * @param participant.id - Unique identifier for the participant
 * @param participant.modelId - Model identifier (e.g., 'openai/gpt-4')
 * @param participant.role - Participant's role in the conversation (nullable)
 * @param currentIndex - Participant index in the conversation
 * @returns Enriched metadata object
 *
 * @example
 * ```typescript
 * const enrichedMetadata = mergeParticipantMetadata(
 *   streamedMessage,
 *   participant,
 *   0
 * );
 * ```
 */
/**
 * Merge participant metadata - STRICT TYPING - Returns complete required metadata
 *
 * @param message - UIMessage from AI SDK
 * @param participant - Participant that generated the message
 * @param participant.id - Participant ULID
 * @param participant.modelId - AI model ID
 * @param participant.role - Participant role (nullable)
 * @param currentIndex - Index of current participant
 * @param roundNumber - REQUIRED round number (no longer optional from metadata)
 * @returns MessageMetadata with role discriminator and all required fields
 */
export function mergeParticipantMetadata(
  message: UIMessage,
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
  roundNumber: number,
): Extract<MessageMetadata, { role: 'assistant' }> {
  // Access metadata directly - metadata can contain many fields beyond ErrorMetadata schema
  const metadata = message.metadata && typeof message.metadata === 'object'
    ? message.metadata as Record<string, unknown>
    : undefined;

  const hasBackendError = metadata?.hasError === true || !!metadata?.error || !!metadata?.rawErrorMessage;

  const textParts = message.parts?.filter(p => p.type === 'text') || [];
  const hasTextContent = textParts.some(
    part => 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0,
  );

  const isEmptyResponse = textParts.length === 0 || !hasTextContent;
  const hasError = hasBackendError || isEmptyResponse;

  let errorMessage = typeof metadata?.rawErrorMessage === 'string' ? metadata.rawErrorMessage : undefined;
  if (isEmptyResponse && !errorMessage) {
    errorMessage = `The model (${participant.modelId}) did not generate a response.`;
  }

  // Extract usage or provide defaults
  const usageResult = UsageSchema.partial().safeParse(metadata?.usage);
  const usage = {
    promptTokens: usageResult.success ? (usageResult.data.promptTokens ?? 0) : 0,
    completionTokens: usageResult.success ? (usageResult.data.completionTokens ?? 0) : 0,
    totalTokens: usageResult.success ? (usageResult.data.totalTokens ?? 0) : 0,
  };

  // ✅ STRICT TYPING: Validate finish reason using Zod enum (single source of truth)
  const finishReasonRaw = metadata?.finishReason ? String(metadata.finishReason) : 'unknown';
  const finishReasonResult = FinishReasonSchema.safeParse(finishReasonRaw);
  const safeFinishReason: FinishReason = finishReasonResult.success ? finishReasonResult.data : 'unknown';

  // Extract optional createdAt field
  const createdAt: string | undefined = metadata?.createdAt
    ? (typeof metadata.createdAt === 'string' ? metadata.createdAt : undefined)
    : undefined;

  // ✅ STRICT TYPING: Validate errorType using Zod enum if present
  const errorTypeRaw = typeof metadata?.errorType === 'string' ? metadata.errorType : (isEmptyResponse ? 'empty_response' : 'unknown');
  const errorTypeResult = ErrorTypeSchema.safeParse(errorTypeRaw);
  const safeErrorType: ErrorType = errorTypeResult.success ? errorTypeResult.data : 'unknown';

  // Return complete metadata with ALL required fields
  return {
    role: 'assistant', // ✅ FIX: Add role discriminator for type guard
    roundNumber,
    participantId: participant.id,
    participantIndex: currentIndex,
    participantRole: participant.role,
    model: participant.modelId,
    finishReason: safeFinishReason,
    usage,
    hasError,
    isTransient: metadata?.isTransient === true,
    isPartialResponse: metadata?.isPartialResponse === true,
    ...(hasError && {
      errorType: safeErrorType,
      errorMessage,
    }),
    ...(createdAt && { createdAt }),
  };
}

// ============================================================================
// Message Validation
// ============================================================================

/**
 * Validate message order is correct for conversation flow
 *
 * Validates that messages follow proper round-based conversation structure:
 * - Round numbers in ascending order (no backward jumps)
 * - Each round starts with exactly one user message
 * - User message appears before assistant messages in each round
 * - No round skipping (sequential: 1, 2, 3...)
 *
 * @param messages - Array of UIMessages to validate
 * @returns Validation result with isValid flag and error messages
 *
 * @example
 * ```typescript
 * const validation = validateMessageOrder(messages);
 * if (!validation.isValid) {
 *   throw new Error('Message order errors');
 * }
 * ```
 */
export function validateMessageOrder(messages: UIMessage[]): MessageOrderValidation {
  const errors: string[] = [];

  let lastRound = 0;
  let userMessageSeenInCurrentRound = false;
  let expectedNextRound = 1;
  const roundsEncountered = new Set<number>();

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg)
      continue;

    // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe round number access
    const round = extractMetadataRoundNumber(msg.metadata) ?? 1;

    // Rule 1: Check round progression (no backward jumps)
    if (round < lastRound) {
      errors.push(
        `Message ${i} (id: ${msg.id}, role: ${msg.role}): Round ${round} appears after round ${lastRound} (backward jump)`,
      );
    }

    // Detect round transition
    if (round > lastRound) {
      // Check for round skipping
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

    // Rule 2 & 5: Check user message position within round
    if (msg.role === 'user') {
      if (userMessageSeenInCurrentRound) {
        errors.push(
          `Message ${i} (id: ${msg.id}): Multiple user messages in round ${round} (only one allowed per round)`,
        );
      }
      userMessageSeenInCurrentRound = true;
    } else if (msg.role === 'assistant') {
      // Rule 3: Assistant message before user message in same round
      if (!userMessageSeenInCurrentRound) {
        errors.push(
          `Message ${i} (id: ${msg.id}): Assistant message appears before user message in round ${round}`,
        );
      }
    }
  }

  // Check for sequential rounds (no gaps)
  const sortedRounds = Array.from(roundsEncountered).sort((a, b) => a - b);
  for (let i = 0; i < sortedRounds.length - 1; i++) {
    const current = sortedRounds[i];
    const next = sortedRounds[i + 1];
    if (next && current && next !== current + 1) {
      errors.push(
        `Round sequence gap detected: Round ${current} is followed by round ${next} (missing round ${current + 1})`,
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
