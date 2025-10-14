/**
 * Message Transformation Utilities
 *
 * ✅ AI SDK INTEGRATION: Transforms between API types and AI SDK types
 * ✅ RPC-INFERRED TYPES: Import runtime types from services
 *
 * These transforms are necessary for AI SDK v5 compatibility:
 * - Message (from RPC) → UIMessage (AI SDK format)
 * - Metadata validation and extraction
 */

import type { UIMessage } from 'ai';

import type { UIMessageMetadata } from '@/lib/schemas/message-metadata';
import {
  UIMessageMetadataSchema,
  validateMessageMetadata,
} from '@/lib/schemas/message-metadata';
import type { ChatMessage } from '@/types/chat';

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
 * @param message - ChatMessage from RPC response (dates as ISO strings)
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

  // ✅ RPC types have string dates (already serialized by JSON)
  const createdAtString = message.createdAt;

  const metadata: UIMessageMetadata = {
    ...baseMetadata, // Spread metadata from backend
    participantId: message.participantId, // Override with top-level participantId
    createdAt: createdAtString, // Add timestamp for timeline sorting (as string)
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
 * @param messages - Array of ChatMessage from RPC response (dates as ISO strings)
 * @returns Array of UIMessages in AI SDK format
 */
export function chatMessagesToUIMessages(messages: ChatMessage[]): UIMessage[] {
  return messages.map(chatMessageToUIMessage);
}
