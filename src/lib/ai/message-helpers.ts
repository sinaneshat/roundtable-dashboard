/**
 * Message Transformation Helpers
 *
 * ✅ OFFICIAL AI SDK PATTERN: ChatMessage → UIMessage transformation
 * Centralizes the logic for converting backend message format to AI SDK UIMessage format
 *
 * See: https://github.com/vercel/ai/blob/main/content/docs/04-ai-sdk-ui/02-chatbot.mdx
 */

import type { UIMessage } from 'ai';

import type { ChatMessage } from '@/api/routes/chat/schema';

// ============================================================================
// Message Metadata Type
// ============================================================================

/**
 * Structured type for message metadata stored in UIMessage
 * This extends the base metadata from ChatMessage with additional fields
 * needed for UI rendering and participant tracking
 */
export type MessageMetadata = {
  // Backend metadata fields (from ChatMessage schema)
  model?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  // Additional fields for UI state management
  participantId?: string | null;
  participantIndex?: number;
  role?: string;
  createdAt?: string;
  error?: string;
  [key: string]: unknown; // Allow additional fields
};

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
  // ✅ Include createdAt from top-level message field for timeline sorting
  const metadata: MessageMetadata = {
    ...message.metadata,
    participantId: message.participantId,
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
