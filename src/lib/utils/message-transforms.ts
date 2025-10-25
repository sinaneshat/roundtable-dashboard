/**
 * Message Transformation Utilities
 *
 * Provides utilities for transforming, validating, and manipulating messages
 * between backend ChatMessage format and AI SDK UIMessage format.
 *
 * @module lib/utils/message-transforms
 */

import type { UIMessage } from 'ai';

import type { ChatMessage } from '@/api/routes/chat/schema';
import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';
import { UIMessageMetadataSchema } from '@/lib/schemas/message-metadata';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Error types for UIMessage error metadata
 */
export type UIMessageErrorType
  = | 'provider_rate_limit'
    | 'provider_network'
    | 'model_not_found'
    | 'model_content_filter'
    | 'authentication'
    | 'validation'
    | 'silent_failure'
    | 'empty_response'
    | 'error'
    | 'unknown';

/**
 * Options for message deduplication behavior
 */
export type DeduplicateOptions = {
  /**
   * Deduplication strategy:
   * - 'by-id': Remove duplicate message IDs (default, streaming-safe)
   * - 'consecutive-text': Remove consecutive user messages with same text
   * - 'both': Apply both strategies sequentially
   */
  mode?: 'by-id' | 'consecutive-text' | 'both';
};

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
 * Validates metadata against UIMessageMetadataSchema and returns typed metadata.
 * Falls back to raw metadata if parsing fails (for backwards compatibility).
 *
 * **Use this when:**
 * - Accessing metadata fields safely across the app
 * - Ensuring metadata conforms to expected schema
 *
 * @param metadata - Raw metadata object from message
 * @returns Parsed UIMessageMetadata or undefined if no metadata
 *
 * @example
 * ```typescript
 * const metadata = getMessageMetadata(message.metadata);
 * if (metadata?.participantId) {
 *   console.log('Participant:', metadata.participantId);
 * }
 * ```
 */
export function getMessageMetadata(metadata: unknown): UIMessageMetadata | undefined {
  if (!metadata)
    return undefined;

  const result = UIMessageMetadataSchema.safeParse(metadata);
  return result.success ? result.data : (metadata as UIMessageMetadata);
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
 * **Use this when:**
 * - Fetching messages from database for display
 * - Converting stored messages to AI SDK format
 * - Single message conversions
 *
 * **Pattern:** Database ChatMessage → UIMessage (AI SDK format)
 *
 * @param message - Backend ChatMessage from database
 * @returns UIMessage compatible with AI SDK
 *
 * @example
 * ```typescript
 * // Single message conversion
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

  const metadata: UIMessageMetadata = {
    ...(message.metadata || {}),
    participantId: message.participantId || undefined,
    createdAt,
    roundNumber: message.roundNumber,
  };

  return {
    id: message.id,
    role: message.role,
    // ✅ TYPE ASSERTION: Database stores simplified tool parts, but they're compatible with UIMessage
    // AI SDK v5 expects tool parts to have 'state' field, but our DB schema is a valid subset
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
 * **Use this when:**
 * - Loading thread history from database
 * - Bulk message conversions
 * - Initial page load with messages
 *
 * **Pattern:** Database ChatMessage[] → UIMessage[] (AI SDK format)
 *
 * @param messages - Array of backend ChatMessages from database
 * @returns Array of UIMessages compatible with AI SDK
 *
 * @example
 * ```typescript
 * // Batch conversion for thread history
 * const dbMessages = await db.query.chatMessage.findMany(...);
 * const uiMessages = chatMessagesToUIMessages(dbMessages);
 * setMessages(uiMessages);
 * ```
 */
export function chatMessagesToUIMessages(
  messages: (ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }))[],
): UIMessage[] {
  return messages.map(chatMessageToUIMessage);
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
 * **Use this when:**
 * - Before persisting messages to database
 * - Before displaying messages in UI
 * - Cleaning up message arrays to avoid clutter
 *
 * **Note:** Assistant messages are always kept because:
 * - Error messages may have empty text content
 * - Tool calls and reasoning parts may be the only content
 *
 * @param messages - Array of UIMessages to filter
 * @returns Array containing only messages with content
 *
 * @example
 * ```typescript
 * // Filter before saving or display
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
// Message Deduplication
// ============================================================================

/**
 * Check if a message is complete (has metadata, content, or error)
 *
 * Used during deduplication to prefer complete messages over partial ones.
 * During AI SDK v5 streaming, partial messages may arrive before complete versions.
 *
 * A message is complete if it has:
 * - Round number metadata
 * - Parts array with content
 * - Either text content, tool calls, reasoning, OR an error flag
 *
 * @internal
 * @param msg - UIMessage to check
 * @returns true if message is considered complete
 */
function isMessageComplete(msg: UIMessage): boolean {
  const metadata = msg.metadata as Record<string, unknown> | undefined;
  const hasMetadata = metadata && 'roundNumber' in metadata;
  const hasParts = msg.parts && msg.parts.length > 0;

  const hasContent = msg.parts?.some(p =>
    (p.type === 'text' && 'text' in p && p.text.trim().length > 0)
    || p.type === 'tool-call'
    || p.type === 'reasoning'
    || p.type === 'tool-result',
  ) ?? false;

  const hasError = metadata?.hasError === true;

  return Boolean(hasMetadata && hasParts && (hasContent || hasError));
}

/**
 * Deduplicate messages by ID, preferring complete versions
 *
 * **Primary deduplication strategy** - applies ID-based deduplication with
 * smart completeness handling for streaming scenarios.
 *
 * **Streaming Fix:**
 * During AI SDK v5 streaming, partial messages arrive first, then complete
 * versions with the same ID. This function keeps the more complete version.
 *
 * **Performance:** O(n) using Map-based deduplication
 *
 * @internal
 * @param messages - Messages array (may contain duplicate IDs)
 * @returns Deduplicated messages (unique by ID, complete versions preferred)
 */
function deduplicateById(messages: UIMessage[]): UIMessage[] {
  const messageMap = new Map<string, UIMessage>();

  // First pass: Build map with best version of each message
  messages.forEach((msg) => {
    const existing = messageMap.get(msg.id);

    if (!existing) {
      // First occurrence - add it
      messageMap.set(msg.id, msg);
    } else {
      // Duplicate found - keep the more complete version
      const existingComplete = isMessageComplete(existing);
      const newComplete = isMessageComplete(msg);

      if (newComplete && !existingComplete) {
        // New version is more complete - replace
        messageMap.set(msg.id, msg);
      }
      // Otherwise keep existing version (both complete, both incomplete, or existing is more complete)
    }
  });

  // Second pass: Return in original insertion order, using best version from map
  const seen = new Set<string>();
  const result: UIMessage[] = [];
  messages.forEach((msg) => {
    if (!seen.has(msg.id)) {
      seen.add(msg.id);
      result.push(messageMap.get(msg.id)!);
    }
  });

  return result;
}

/**
 * Deduplicate consecutive user messages with identical text content
 *
 * **Secondary deduplication strategy** - removes consecutive user messages
 * that have the same text content but different IDs.
 *
 * **Edge Case:** Handles retry or startRound scenarios where consecutive
 * user messages with identical text but different IDs may be created.
 *
 * **Note:** Only deduplicates *consecutive* messages, not all duplicates.
 *
 * @internal
 * @param messages - Messages array (may have consecutive duplicate text)
 * @returns Messages with consecutive duplicate user text removed
 */
function deduplicateByConsecutiveText(messages: UIMessage[]): UIMessage[] {
  const result: UIMessage[] = [];
  let lastUserMessageText: string | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      const textPart = message.parts?.find(p => p.type === 'text' && 'text' in p);
      const text = textPart && 'text' in textPart ? textPart.text.trim() : '';

      // Skip if same text as previous user message
      if (text && text === lastUserMessageText)
        continue;
      lastUserMessageText = text;
    } else {
      // Reset tracking when encountering non-user message
      lastUserMessageText = null;
    }

    result.push(message);
  }

  return result;
}

/**
 * Deduplicate messages with configurable strategy
 *
 * Unified deduplication function that handles multiple strategies:
 * - **by-id** (default): Remove duplicate IDs, prefer complete messages (streaming-safe)
 * - **consecutive-text**: Remove consecutive user messages with same text
 * - **both**: Apply both strategies sequentially
 *
 * **Use this when:**
 * - After streaming updates (use 'by-id' to handle partial → complete transitions)
 * - After state updates (use 'by-id' to remove duplicate message objects)
 * - After retry operations (use 'consecutive-text' to remove duplicate user inputs)
 * - For comprehensive cleanup (use 'both')
 *
 * **Apply at these points:**
 * - ChatContext.initializeThread()
 * - useMultiParticipantChat.onFinish()
 * - useMultiParticipantChat.onError()
 * - useMultiParticipantChat.retry()
 * - Any message array update
 *
 * @param messages - Messages array to deduplicate
 * @param options - Deduplication options (defaults to 'by-id')
 * @returns Deduplicated messages array
 *
 * @example
 * ```typescript
 * // Default: Remove duplicate IDs (streaming-safe)
 * const uniqueMessages = deduplicateMessages(messages);
 *
 * // Remove consecutive duplicate user text
 * const cleaned = deduplicateMessages(messages, { mode: 'consecutive-text' });
 *
 * // Apply both strategies
 * const fullyDeduped = deduplicateMessages(messages, { mode: 'both' });
 * ```
 */
export function deduplicateMessages(
  messages: UIMessage[],
  options: DeduplicateOptions = {},
): UIMessage[] {
  const { mode = 'by-id' } = options;

  switch (mode) {
    case 'by-id':
      return deduplicateById(messages);

    case 'consecutive-text':
      return deduplicateByConsecutiveText(messages);

    case 'both':
      // Apply ID deduplication first, then consecutive text deduplication
      return deduplicateByConsecutiveText(deduplicateById(messages));

    default:
      return deduplicateById(messages);
  }
}

/**
 * @deprecated Use deduplicateMessages({ mode: 'consecutive-text' }) instead
 *
 * Legacy function maintained for backwards compatibility.
 * Will be removed in a future version.
 */
export function deduplicateConsecutiveUserMessages(messages: UIMessage[]): UIMessage[] {
  return deduplicateMessages(messages, { mode: 'consecutive-text' });
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
 * **Use this when:**
 * - AI model request fails (network, rate limit, content filter)
 * - Empty response from model
 * - Authentication or validation errors
 * - Any participant-level error during streaming
 *
 * **Pattern:** Error information → UIMessage with error metadata
 *
 * @param participant - Participant information (id, modelId, role)
 * @param currentIndex - Participant index in the conversation
 * @param errorMessage - Human-readable error message
 * @param errorType - Error category (defaults to 'error')
 * @param errorMetadata - Additional error context
 * @param roundNumber - Round number where error occurred
 * @returns UIMessage with error metadata
 *
 * @example
 * ```typescript
 * // Network error
 * const errorMsg = createErrorUIMessage(
 *   participant,
 *   0,
 *   'Connection timeout',
 *   'provider_network',
 *   { statusCode: 504, rawErrorMessage: 'Gateway timeout' },
 *   currentRound
 * );
 *
 * // Rate limit error
 * const rateLimitMsg = createErrorUIMessage(
 *   participant,
 *   0,
 *   'Rate limit exceeded',
 *   'provider_rate_limit',
 *   { statusCode: 429 },
 *   currentRound
 * );
 * ```
 */
export function createErrorUIMessage(
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
  errorMessage: string,
  errorType: UIMessageErrorType = 'error',
  errorMetadata?: {
    errorCategory?: string;
    statusCode?: number;
    rawErrorMessage?: string;
    openRouterError?: string;
    openRouterCode?: string;
    providerMessage?: string;
  },
  roundNumber?: number,
): UIMessage {
  return {
    id: `error-${crypto.randomUUID()}-${currentIndex}`,
    role: 'assistant',
    parts: [{ type: 'text', text: '' }],
    metadata: {
      participantId: participant.id,
      participantIndex: currentIndex,
      ...(participant.role && { participantRole: participant.role }),
      model: participant.modelId,
      hasError: true,
      errorType,
      errorMessage,
      errorCategory: errorMetadata?.errorCategory || errorType,
      statusCode: errorMetadata?.statusCode,
      rawErrorMessage: errorMetadata?.rawErrorMessage,
      providerMessage: errorMetadata?.providerMessage || errorMetadata?.rawErrorMessage || errorMessage,
      openRouterError: errorMetadata?.openRouterError,
      openRouterCode: errorMetadata?.openRouterCode,
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
 * **Use this when:**
 * - Processing streaming responses
 * - Enriching messages with participant context
 * - Detecting and handling empty model responses
 *
 * **Pattern:** UIMessage + Participant info → Enriched metadata
 *
 * @param message - UIMessage to enrich
 * @param participant - Participant information (id, modelId, role)
 * @param currentIndex - Participant index in the conversation
 * @returns Enriched metadata object
 *
 * @example
 * ```typescript
 * // Enrich message with participant metadata
 * const enrichedMetadata = mergeParticipantMetadata(
 *   streamedMessage,
 *   participant,
 *   0
 * );
 *
 * const enrichedMessage = {
 *   ...streamedMessage,
 *   metadata: enrichedMetadata
 * };
 * ```
 */
export function mergeParticipantMetadata(
  message: UIMessage,
  participant: { id: string; modelId: string; role: string | null },
  currentIndex: number,
): Record<string, unknown> {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const hasBackendError = metadata?.hasError === true || !!metadata?.error || !!metadata?.errorMessage;

  const textParts = message.parts?.filter(p => p.type === 'text') || [];
  const hasTextContent = textParts.some(
    part => 'text' in part && typeof part.text === 'string' && part.text.trim().length > 0,
  );

  const isEmptyResponse = textParts.length === 0 || !hasTextContent;
  const hasError = hasBackendError || isEmptyResponse;

  let errorMessage = metadata?.errorMessage as string | undefined;
  if (isEmptyResponse && !errorMessage) {
    errorMessage = `The model (${participant.modelId}) did not generate a response. This can happen due to content filtering, model limitations, or API issues.`;
  }

  return {
    ...(metadata || {}),
    participantId: participant.id,
    participantIndex: currentIndex,
    ...(participant.role && { participantRole: participant.role }),
    model: participant.modelId,
    // ✅ Explicitly preserve critical metadata fields
    ...(metadata?.roundNumber !== undefined && { roundNumber: metadata.roundNumber }),
    ...(hasError && {
      hasError: true,
      errorType: metadata?.errorType || (isEmptyResponse ? 'empty_response' : 'unknown'),
      errorMessage,
      providerMessage: metadata?.providerMessage || metadata?.openRouterError || errorMessage,
      openRouterError: metadata?.openRouterError,
    }),
  };
}

// ============================================================================
// Message Validation
// ============================================================================

/**
 * Message Validator - validates message order and conversation flow
 *
 * Encapsulates message validation logic with clear validation rules.
 * Use this class for all message order and structure validation.
 *
 * **Validation Rules** (from FLOW_DOCUMENTATION.md Part 7):
 * 1. Round numbers must be in ascending order (no backward jumps)
 * 2. Each round must start with exactly one user message
 * 3. User message must appear before assistant messages in each round
 * 4. No round skipping (round numbers should be sequential: 1, 2, 3...)
 * 5. No multiple user messages within the same round
 *
 * **Use this when:**
 * - Before preserving message state during streaming optimization
 * - Before persisting messages to database
 * - Debugging conversation flow issues
 * - Validating message arrays after mutations
 *
 * @example
 * ```typescript
 * const validator = new MessageValidator(messages);
 * const validation = validator.validate();
 *
 * if (!validation.isValid) {
 *   console.error('Message order errors:', validation.errors);
 *   // Trigger full rebuild instead of optimization
 *   return;
 * }
 *
 * // Safe to proceed with optimization
 * await saveMessages(messages);
 * ```
 */
export class MessageValidator {
  private messages: UIMessage[];

  constructor(messages: UIMessage[]) {
    this.messages = messages;
  }

  /**
   * Extract round number from message metadata
   *
   * @param message - UIMessage to extract round from
   * @returns Round number (defaults to 1 if not found)
   */
  private extractRoundNumber(message: UIMessage): number {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    if (metadata && typeof metadata.roundNumber === 'number' && metadata.roundNumber >= 1) {
      return metadata.roundNumber;
    }
    return 1; // Default fallback
  }

  /**
   * Validate message order and conversation flow
   *
   * Checks all validation rules and returns detailed error messages.
   *
   * @returns Validation result with isValid flag and error messages
   */
  validate(): MessageOrderValidation {
    const errors: string[] = [];

    // Track state as we iterate through messages
    let lastRound = 0;
    let userMessageSeenInCurrentRound = false;
    let expectedNextRound = 1;
    const roundsEncountered = new Set<number>();

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      if (!msg)
        continue; // Skip if message is undefined

      const round = this.extractRoundNumber(msg);

      // Rule 1: Check round progression (no backward jumps)
      if (round < lastRound) {
        errors.push(
          `Message ${i} (id: ${msg.id}, role: ${msg.role}): Round ${round} appears after round ${lastRound} (backward jump)`,
        );
      }

      // Detect round transition
      if (round > lastRound) {
        // Check for round skipping (gap detection)
        if (round > expectedNextRound) {
          errors.push(
            `Message ${i} (id: ${msg.id}): Round ${round} skips from ${lastRound} (expected ${expectedNextRound})`,
          );
        }

        // Update tracking for new round
        lastRound = round;
        userMessageSeenInCurrentRound = false;
        expectedNextRound = round + 1;
      }

      // Track encountered rounds
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

    // Additional validation: Check for sequential rounds (no gaps)
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
}

/**
 * Validate message order is correct for conversation flow
 *
 * Convenience function that creates a MessageValidator and runs validation.
 * For repeated validations, consider using MessageValidator class directly.
 *
 * **Use this when:**
 * - Quick validation checks
 * - One-time validation before operations
 * - Debugging message order issues
 *
 * @param messages - Array of UIMessages to validate
 * @returns Validation result with isValid flag and error messages
 *
 * @example
 * ```typescript
 * const validation = validateMessageOrder(messages);
 * if (!validation.isValid) {
 *   console.error('Message order errors:', validation.errors);
 *   // Trigger full rebuild instead of optimization
 * }
 * ```
 */
export function validateMessageOrder(messages: UIMessage[]): MessageOrderValidation {
  const validator = new MessageValidator(messages);
  return validator.validate();
}
