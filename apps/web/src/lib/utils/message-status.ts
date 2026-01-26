/**
 * Message Status & Parts Utilities
 *
 * **CONSOLIDATED MODULE**: Status determination and message parts analysis.
 * Single source of truth for message display state and content detection.
 *
 * Design Principles:
 * - Simple, focused functions for single responsibilities
 * - Use type guards for safe metadata access
 * - Prefer composition over complex conditionals
 * - Avoid High Knowledge Cost (HKC) implementations
 *
 * Consolidates:
 * - message-status.ts: Status determination logic
 * - use-message-parts.ts: Parts filtering and analysis
 *
 * @module lib/utils/message-status
 */

import type { MessageStatus } from '@roundtable/shared';
import { MessagePartTypes, MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';

import { getAssistantMetadata } from './metadata';

// ============================================================================
// Message Parts Analysis
// ============================================================================

/**
 * Message parts analysis result
 */
export type MessagePartsAnalysis = {
  /** Text and reasoning parts only (for simple text display) */
  textParts: UIMessage['parts'];
  /** Text, reasoning, tool-call, and tool-result parts (for full UI) */
  displayableParts: UIMessage['parts'];
  /** Source URL and source document parts (for citations) */
  sourceParts: UIMessage['parts'];
  /** Whether message has any non-empty text content */
  hasTextContent: boolean;
  /** Whether message has any tool calls */
  hasToolCalls: boolean;
  /** Whether message has ANY displayable content (text or tools) */
  hasAnyContent: boolean;
};

/**
 * Extract and analyze message parts
 *
 * Provides pre-filtered part arrays and derived state flags.
 * Use this for message content analysis, status determination,
 * and rendering decisions.
 *
 * @param message - UIMessage to analyze
 * @returns Parts analysis with filtered arrays and boolean flags
 *
 * @example
 * ```typescript
 * const analysis = getMessageParts(message);
 *
 * // Simple text display
 * if (analysis.textParts.length > 0) {
 *   renderTextOnly(analysis.textParts);
 * }
 *
 * // Full UI with tools
 * if (analysis.displayableParts.length > 0) {
 *   renderFullMessage(analysis.displayableParts);
 * }
 *
 * // Status determination
 * const status = getMessageStatus({
 *   message,
 *   isStreaming,
 *   hasAnyContent: analysis.hasAnyContent,
 * });
 * ```
 */
export function getMessageParts(message: UIMessage): MessagePartsAnalysis {
  // Text-only parts (text + reasoning)
  const textParts = message.parts.filter(
    p =>
      (p.type === MessagePartTypes.TEXT || p.type === MessagePartTypes.REASONING)
      && 'text' in p
      && typeof p.text === 'string',
  );

  // Displayable parts (text + reasoning + tools)
  const displayableParts = message.parts.filter(
    p =>
      p.type === MessagePartTypes.TEXT
      || p.type === MessagePartTypes.REASONING
      || p.type === MessagePartTypes.TOOL_CALL
      || p.type === MessagePartTypes.TOOL_RESULT,
  );

  // Source parts for citations
  const sourceParts = message.parts.filter(
    p =>
      'type' in p
      && (p.type === MessagePartTypes.SOURCE_URL || p.type === MessagePartTypes.SOURCE_DOCUMENT),
  );

  // Derived state flags - ✅ V8 FIX: Include REASONING type for models like Gemini Flash
  const hasTextContent = message.parts.some(
    p => (p.type === MessagePartTypes.TEXT || p.type === MessagePartTypes.REASONING)
      && 'text' in p
      && typeof p.text === 'string'
      && p.text.trim().length > 0,
  );

  const hasToolCalls = message.parts.some(p => p.type === MessagePartTypes.TOOL_CALL);
  const hasAnyContent = hasTextContent || hasToolCalls;

  return {
    displayableParts,
    hasAnyContent,
    hasTextContent,
    hasToolCalls,
    sourceParts,
    textParts,
  };
}

// ============================================================================
// Message Status Determination
// ============================================================================

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
 * Determine message display status
 *
 * Status priority hierarchy:
 * 1. **Error** - Message has error metadata
 * 2. **Pending** - Streaming but no content rendered yet (thinking)
 * 3. **Streaming** - Streaming with content visible
 * 4. **Complete** - Default state for non-streaming messages
 *
 * @param input - Message and streaming state
 * @param input.message - The UIMessage to analyze
 * @param input.isStreaming - Whether message is currently streaming
 * @param input.hasAnyContent - Whether message has any rendered content
 * @returns MessageStatus enum value
 *
 * @example
 * ```typescript
 * // During streaming - no content yet
 * const status = getMessageStatus({
 *   message,
 *   isStreaming: true,
 *   hasAnyContent: false
 * }); // Returns 'pending'
 *
 * // During streaming - with content
 * const status = getMessageStatus({
 *   message,
 *   isStreaming: true,
 *   hasAnyContent: true
 * }); // Returns 'streaming'
 *
 * // Completed message
 * const status = getMessageStatus({ message }); // Returns 'complete'
 *
 * // Error state
 * const errorMsg = { ...message, metadata: { hasError: true } };
 * const status = getMessageStatus({ message: errorMsg }); // Returns 'failed'
 * ```
 */
export function getMessageStatus({
  hasAnyContent = true,
  isStreaming = false,
  message,
}: MessageStatusInput): MessageStatus {
  // Extract metadata using type-safe utility
  // getAssistantMetadata already returns AssistantMessageMetadata | null with validation
  const assistantMetadata = getAssistantMetadata(message.metadata);

  // Priority 1: Check for error state
  const hasError = assistantMetadata?.hasError === true;

  if (hasError) {
    return MessageStatuses.FAILED;
  }

  // Priority 2: Streaming but no content yet = thinking
  if (isStreaming && !hasAnyContent) {
    return MessageStatuses.PENDING;
  }

  // Priority 3: Streaming with content = actively streaming
  if (isStreaming) {
    return MessageStatuses.STREAMING;
  }

  // Priority 4: Default complete state
  return MessageStatuses.COMPLETE;
}

/**
 * Combined parts analysis and status determination
 *
 * Convenience function that performs both operations in one call.
 * Useful when you need both the parts breakdown and status.
 *
 * @param message - UIMessage to analyze
 * @param isStreaming - Whether message is currently streaming
 * @returns Object with parts analysis and status
 *
 * @example
 * ```typescript
 * const { parts, status } = analyzeMessage(message, isStreaming);
 *
 * if (status === 'failed') {
 *   renderError(message);
 * } else if (status === 'pending') {
 *   renderThinking();
 * } else if (parts.displayableParts.length > 0) {
 *   renderMessage(parts.displayableParts);
 * }
 * ```
 */
export function analyzeMessage(
  message: UIMessage,
  isStreaming = false,
): { parts: MessagePartsAnalysis; status: MessageStatus } {
  const parts = getMessageParts(message);
  const status = getMessageStatus({
    hasAnyContent: parts.hasAnyContent,
    isStreaming,
    message,
  });

  return { parts, status };
}
