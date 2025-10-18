/**
 * Message Transformation Utilities
 *
 * ✅ AI SDK v5 OFFICIAL PATTERN: Transforms between API types and AI SDK types
 *
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/validate-ui-messages
 *
 * These transforms are necessary for AI SDK v5 compatibility:
 * - ChatMessage (from schema) → UIMessage (AI SDK format)
 * - Metadata validation using AI SDK patterns
 */

import type { UIMessage } from 'ai';

import type { ChatMessage, UIMessageMetadata } from '@/api/routes/chat/schema';
import { UIMessageMetadataSchema } from '@/api/routes/chat/schema';

// ============================================================================
// METADATA VALIDATION (AI SDK v5 Official Pattern)
// ============================================================================

/**
 * ✅ AI SDK v5 PATTERN: Runtime-safe metadata extraction with Zod validation
 * Uses safeParse for graceful handling of invalid data
 *
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/validate-ui-messages
 *
 * @param metadata - UIMessage metadata field (unknown - from AI SDK UIMessage type)
 * @returns Validated and typed metadata, or undefined if invalid/missing
 */
export function getMessageMetadata(
  metadata: unknown,
): UIMessageMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const result = UIMessageMetadataSchema.safeParse(metadata);

  if (!result.success) {
    // Return raw metadata as fallback to prevent data loss
    return metadata as UIMessageMetadata;
  }

  return result.data;
}

// ============================================================================
// MESSAGE TRANSFORMATIONS
// ============================================================================

/**
 * Convert backend ChatMessage to AI SDK UIMessage format
 *
 * @param message - ChatMessage from RPC response (dates can be ISO strings or Date objects)
 * @returns UIMessage in AI SDK format with properly typed metadata
 */
export function chatMessageToUIMessage(message: ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date })): UIMessage {
  const parts: UIMessage['parts'] = [];

  // ✅ CRITICAL FIX: Always add text part, even if empty
  // This ensures messages with errors (empty content) still render their message cards
  // The MessageErrorDetails component will display error information from metadata
  // Previously, empty content would result in parts: [], causing the message to not render
  parts.push({ type: 'text', text: message.content || '' });

  // ✅ CRITICAL FIX: Only add reasoning part if it has non-empty content
  // This prevents empty reasoning boxes from showing for non-reasoning models
  // ✅ TYPE SAFETY: Check if reasoning is a string before calling .trim()
  if (message.reasoning && typeof message.reasoning === 'string' && message.reasoning.trim().length > 0) {
    parts.push({ type: 'reasoning', text: message.reasoning });
  }

  // Build properly typed metadata
  // ✅ Include createdAt from message
  // Handle null metadata from database by using empty object as base
  const baseMetadata = (message.metadata || {}) as Record<string, unknown>;

  // ✅ Ensure createdAt is a string (convert Date to ISO string if needed)
  const createdAtString = message.createdAt instanceof Date
    ? message.createdAt.toISOString()
    : message.createdAt;

  const metadata: UIMessageMetadata = {
    ...baseMetadata, // Spread metadata from backend
    participantId: message.participantId || undefined, // Override with top-level participantId (convert null to undefined)
    createdAt: createdAtString, // Add timestamp for timeline sorting (as string)
    roundNumber: message.roundNumber, // ✅ EVENT-BASED ROUND TRACKING: Include roundNumber for frontend grouping
  };

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
 * @param messages - Array of ChatMessage from RPC response (dates can be ISO strings or Date objects)
 * @returns Array of UIMessages in AI SDK format
 */
export function chatMessagesToUIMessages(messages: (ChatMessage | (Omit<ChatMessage, 'createdAt'> & { createdAt: string | Date }))[]): UIMessage[] {
  return messages.map(chatMessageToUIMessage);
}

// ============================================================================
// MESSAGE FILTERING
// ============================================================================

/**
 * ✅ SHARED UTILITY: Filter out empty user messages
 *
 * Filters out user messages that have no non-empty text parts.
 * This is necessary for UI display and AI model consumption.
 *
 * Used in:
 * - Frontend: chat-message-list.tsx (UI display)
 * - Backend: chat handler (before sending to AI model)
 *
 * @param messages - Array of UIMessages to filter
 * @returns Filtered array with only non-empty messages
 */
export function filterNonEmptyMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter((message) => {
    // Keep all assistant messages
    if (message.role === 'assistant') {
      return true;
    }

    // For user messages, only keep if they have non-empty text parts
    if (message.role === 'user') {
      const textParts = message.parts?.filter(part =>
        part.type === 'text' && 'text' in part && part.text.trim().length > 0,
      );
      return textParts && textParts.length > 0;
    }

    return false;
  });
}

/**
 * ✅ DEDUPLICATION UTILITY: Remove duplicate consecutive user messages
 *
 * When startRound() is called, it may create a duplicate user message
 * because the AI SDK always adds a new message when calling sendMessage().
 * This utility removes consecutive user messages with identical content.
 *
 * @param messages - Array of UIMessages to deduplicate
 * @returns Filtered array without consecutive duplicate user messages
 */
export function deduplicateConsecutiveUserMessages(messages: UIMessage[]): UIMessage[] {
  const result: UIMessage[] = [];
  let lastUserMessageText: string | null = null;

  for (const message of messages) {
    if (message.role === 'user') {
      // Extract text from user message
      const textPart = message.parts?.find(p => p.type === 'text' && 'text' in p);
      const text = textPart && 'text' in textPart ? textPart.text.trim() : '';

      // Skip if this is a duplicate of the last user message
      if (text && text === lastUserMessageText) {
        continue;
      }

      lastUserMessageText = text;
    } else {
      // Reset on non-user messages (so we only check consecutive user messages)
      lastUserMessageText = null;
    }

    result.push(message);
  }

  return result;
}
