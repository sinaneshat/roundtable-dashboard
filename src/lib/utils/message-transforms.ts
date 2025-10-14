/**
 * Message Transformation Utilities
 *
 * ✅ AI SDK INTEGRATION: Transforms between API types and AI SDK types
 * ✅ IMPORTS FROM API: All types come from @/api/routes/chat/schema
 *
 * These transforms are necessary for AI SDK v5 compatibility:
 * - ChatMessage (from API) → UIMessage (AI SDK format)
 * - Metadata validation and extraction
 */

import type { UIMessage } from 'ai';

import type { ChatMessage } from '@/api/routes/chat/schema';
import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';
import {
  UIMessageMetadataSchema,
  validateMessageMetadata,
} from '@/lib/schemas/message-metadata';

// ============================================================================
// METADATA VALIDATION
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
// MESSAGE TRANSFORMATIONS
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
  return messages.map(chatMessageToUIMessage);
}
