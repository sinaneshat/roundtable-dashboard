/**
 * Message Parts Processing Hook
 *
 * Consolidated message parts filtering and analysis used across all chat screens.
 * Replaces duplicated inline filtering logic in ChatMessageList and PublicChatThreadScreen.
 *
 * Works with AI SDK's UIMessagePart types (broader than our MessagePart schema).
 *
 * Used by:
 * - ChatMessageList (full displayable parts for participant messages)
 * - PublicChatThreadScreen (text-only parts for read-only view)
 */

import type { UIMessage } from 'ai';
import { useMemo } from 'react';

/**
 * Message parts filtering mode
 *
 * - `displayable`: text + reasoning + tool-call + tool-result (full UI rendering)
 * - `text-only`: text + reasoning only (public/simplified view)
 * - `all`: No filtering (raw parts array)
 */
export type MessagePartsFilter = 'displayable' | 'text-only' | 'all';

/**
 * Input options for useMessageParts hook
 */
export type UseMessagePartsOptions = {
  /** The message to process */
  message: UIMessage;
  /** Filter mode for parts (default: 'displayable') */
  filter?: MessagePartsFilter;
};

/**
 * Return value from useMessageParts hook
 *
 * Note: Returns AI SDK's UIMessagePart types (not our MessagePart schema)
 * This is intentional as we're working with UI messages from the AI SDK
 */
export type UseMessagePartsReturn = {
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
 * Extract and filter message parts for rendering with memoization
 *
 * Provides pre-filtered part arrays and derived state flags:
 * - textParts: For simple text/reasoning display (PublicChatThreadScreen)
 * - displayableParts: For full UI with tools (ChatMessageList)
 * - sourceParts: For citation display
 * - hasAnyContent: For determining 'thinking' vs 'streaming' status
 *
 * Performance:
 * - Memoized per message.parts reference
 * - Only recomputes when parts array changes
 * - Prevents filtering on every render
 *
 * @param options - Message and filter mode
 * @returns Filtered parts and derived state
 *
 * @example
 * ```typescript
 * // Full displayable parts for chat UI
 * const { displayableParts, hasAnyContent } = useMessageParts({ message });
 *
 * // Text-only for public view
 * const { textParts } = useMessageParts({ message, filter: 'text-only' });
 *
 * // Check content for status determination
 * const { hasAnyContent } = useMessageParts({ message });
 * const status = getMessageStatus({ message, isStreaming, hasAnyContent });
 * ```
 */
export function useMessageParts({
  message,
  filter = 'displayable',
}: UseMessagePartsOptions): UseMessagePartsReturn {
  return useMemo(() => {
    // Text-only parts (text + reasoning)
    // Used by PublicChatThreadScreen and simple text display
    const textParts = message.parts.filter(
      p =>
        (p.type === 'text' || p.type === 'reasoning')
        && 'text' in p
        && typeof p.text === 'string',
    );

    // Displayable parts (text + reasoning + tools)
    // Used by ChatMessageList for full participant message rendering
    const displayableParts = message.parts.filter(
      p =>
        p.type === 'text'
        || p.type === 'reasoning'
        || p.type === 'tool-call'
        || p.type === 'tool-result',
    );

    // Source parts for citation display
    // Used for showing sources/references
    const sourceParts = message.parts.filter(
      p =>
        'type' in p && (p.type === 'source-url' || p.type === 'source-document'),
    );

    // Derived state flags
    // Note: We check text content manually since hasText expects MessagePart[]
    const hasTextContent = message.parts.some(p => p.type === 'text' && 'text' in p && typeof p.text === 'string' && p.text.trim().length > 0);
    const hasToolCalls = message.parts.some(p => p.type === 'tool-call');

    // Combined content check for status determination
    // Used by getMessageStatus to distinguish 'thinking' from 'streaming'
    const hasAnyContent = hasTextContent || hasToolCalls;

    return {
      textParts,
      displayableParts,
      sourceParts,
      hasTextContent,
      hasToolCalls,
      hasAnyContent,
    };
  }, [message.parts]); // Only recompute when parts array reference changes
}
