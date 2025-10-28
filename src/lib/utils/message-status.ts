/**
 * Message Status Utility
 *
 * Consolidated logic for determining message display status across all chat screens.
 * Replaces duplicated inline logic in ChatMessageList and PublicChatThreadScreen.
 *
 * Single source of truth for message status determination.
 */

import type { UIMessage } from 'ai';

import type { MessageStatus } from '@/lib/schemas/message-schemas';

import { getMessageMetadata } from './message-transforms';

/**
 * Input parameters for message status determination
 */
export type MessageStatusInput = {
  /** The message to analyze */
  message: UIMessage;
  /** Whether the message is currently streaming (default: false) */
  isStreaming?: boolean;
  /** Whether the message has any rendered content yet (default: true) */
  hasAnyContent?: boolean;
};

/**
 * Determine message display status based on streaming state and content
 *
 * Priority hierarchy:
 * 1. Error - If message has error metadata
 * 2. Thinking - Streaming but no content rendered yet
 * 3. Streaming - Streaming with content visible
 * 4. Completed - Default state for non-streaming messages
 *
 * Used by:
 * - ChatMessageList (participant message cards with streaming support)
 * - PublicChatThreadScreen (read-only completed messages)
 *
 * @param input - Message and streaming state
 * @returns MessageStatus enum value
 *
 * @example
 * ```typescript
 * // During streaming
 * const status = getMessageStatus({
 *   message,
 *   isStreaming: true,
 *   hasAnyContent: false
 * }); // Returns 'thinking'
 *
 * // Completed message
 * const status = getMessageStatus({ message }); // Returns 'completed'
 *
 * // Error state
 * const errorMsg = { ...message, metadata: { error: 'Failed' } };
 * const status = getMessageStatus({ message: errorMsg }); // Returns 'error'
 * ```
 */
export function getMessageStatus({
  message,
  isStreaming = false,
  hasAnyContent = true,
}: MessageStatusInput): MessageStatus {
  // Extract metadata using consolidated utility
  const metadata = getMessageMetadata(message.metadata);

  // Priority 1: Check for error state
  // hasError flag or error object in metadata indicates failure
  const hasError = metadata?.hasError === true || !!metadata?.error;

  if (hasError) {
    return 'error';
  }

  // Priority 2: Streaming but no content yet = thinking
  // AI is processing the request but hasn't started emitting tokens
  if (isStreaming && !hasAnyContent) {
    return 'thinking';
  }

  // Priority 3: Streaming with content = actively streaming
  // AI is emitting tokens and content is being rendered
  if (isStreaming) {
    return 'streaming';
  }

  // Priority 4: Default completed state
  // Message is fully rendered and saved
  return 'completed';
}
