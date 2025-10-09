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
// Transformation Functions
// ============================================================================

/**
 * Convert backend ChatMessage to AI SDK UIMessage format
 *
 * @param message - ChatMessage from backend schema
 * @returns UIMessage in AI SDK format
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

  return {
    id: message.id,
    role: message.role,
    parts,
    // ✅ Pass through backend metadata as-is (already typed correctly from schema)
    metadata: message.metadata || undefined,
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
