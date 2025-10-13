/**
 * Message Transformation Helpers
 *
 * ✅ OFFICIAL AI SDK PATTERN: ChatMessage → UIMessage transformation
 * Centralizes the logic for converting backend message format to AI SDK UIMessage format
 *
 * ✅ ZOD INFERENCE PATTERN: Types inferred from Zod schemas (no hardcoded types)
 * Follows backend pattern of using Zod for validation and type inference
 *
 * ✅ SINGLE SOURCE OF TRUTH: All metadata schemas imported from src/lib/schemas/message-metadata.ts
 *
 * See: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/02-chatbot.mdx
 */

import type { UIMessage } from 'ai';

import type { ChatMessage } from '@/api/routes/chat/schema';
import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';
import {
  UIMessageMetadataSchema,
  validateMessageMetadata,
} from '@/lib/schemas/message-metadata';

// ============================================================================
// Metadata Validation Helper (Re-exported from shared schema)
// ============================================================================

/**
 * ✅ ZOD VALIDATION: Runtime-safe metadata extraction with proper validation
 * Parses and validates metadata from UIMessage using Zod schema
 *
 * @param metadata - UIMessage metadata field (unknown - from AI SDK UIMessage type)
 * @returns Validated and typed metadata, or undefined if invalid/missing
 */
export function getMessageMetadata(
  metadata: unknown,
): UIMessageMetadata | undefined {
  return validateMessageMetadata(metadata, UIMessageMetadataSchema);
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Convert backend ChatMessage to AI SDK UIMessage format
 *
 * @param message - ChatMessage from backend schema
 * @returns UIMessage in AI SDK format with properly typed metadata
 */
export function chatMessageToUIMessage(message: ChatMessage): UIMessage {
  const parts: UIMessage['parts'] = [];

  // Add text content part
  if (message.content) {
    parts.push({ type: 'text', text: message.content });
  }

  // Add reasoning part (if present)
  if (message.reasoning) {
    parts.push({ type: 'reasoning', text: message.reasoning });
  }

  // Build properly typed metadata
  // ✅ Include createdAt from message
  // Handle null metadata from database by using empty object as base
  const baseMetadata = (message.metadata || {}) as Record<string, unknown>;
  const metadata: UIMessageMetadata = {
    ...baseMetadata, // Spread metadata from backend
    participantId: message.participantId, // Override with top-level participantId
    createdAt: message.createdAt, // Add timestamp for timeline sorting
  };

  // Debug: Log transformation for first few messages
  if (message.role === 'assistant') {
    console.warn('[chatMessageToUIMessage] Transforming message:', {
      messageId: message.id,
      rawParticipantId: message.participantId,
      rawMetadata: message.metadata,
      transformedMetadata: metadata,
      hasParticipantId: !!metadata.participantId,
    });
  }

  return {
    id: message.id,
    role: message.role,
    parts,
    metadata,
  };
}

/**
 * Convert array of backend ChatMessages to AI SDK UIMessage format
 *
 * @param messages - Array of ChatMessage from backend schema
 * @returns Array of UIMessages in AI SDK format
 */
export function chatMessagesToUIMessages(messages: ChatMessage[]): UIMessage[] {
  console.warn('[chatMessagesToUIMessages] Converting messages:', {
    count: messages.length,
    firstMessage: messages[0]
      ? {
          id: messages[0].id,
          role: messages[0].role,
          participantId: messages[0].participantId,
          hasMetadata: !!messages[0].metadata,
          metadata: messages[0].metadata,
        }
      : null,
  });

  const result = messages.map(chatMessageToUIMessage);

  console.warn('[chatMessagesToUIMessages] Conversion complete:', {
    count: result.length,
    firstUIMessage: result[0]
      ? {
          id: result[0].id,
          role: result[0].role,
          metadata: result[0].metadata,
          hasParticipantId: !!getMessageMetadata(result[0].metadata)?.participantId,
        }
      : null,
  });

  return result;
}

// ============================================================================
// Round Detection
// ============================================================================

/**
 * A conversation round consists of:
 * - A user message
 * - All participant responses to that user message
 */
export type ConversationRound = {
  /** Index of the user message that started this round */
  userMessageIndex: number;
  /** Index of the last message in this round */
  endMessageIndex: number;
  /** The user message that started this round */
  userMessage: UIMessage;
  /** All participant responses in this round */
  participantMessages: UIMessage[];
};

/**
 * Check if a message index is the last message in its round
 *
 * @param messageIndex - Index of the message to check
 * @param rounds - Array of conversation rounds
 * @returns True if this is the last message in a round
 */
export function isLastMessageInRound(
  messageIndex: number,
  rounds: ConversationRound[],
): boolean {
  return rounds.some(round => round.endMessageIndex === messageIndex);
}

/**
 * Get the round that a message belongs to
 *
 * @param messageIndex - Index of the message
 * @param rounds - Array of conversation rounds
 * @returns The round containing this message, or undefined
 */
export function getRoundForMessage(
  messageIndex: number,
  rounds: ConversationRound[],
): ConversationRound | undefined {
  return rounds.find(
    round =>
      messageIndex >= round.userMessageIndex && messageIndex <= round.endMessageIndex,
  );
}

// ============================================================================
// REMOVED: Variant/Regeneration System
// ============================================================================
// The enrichRoundsWithVariants function has been removed as part of eliminating
// the regeneration/branching feature. Rounds no longer track variant information.
