/**
 * Message Parts Hook
 *
 * React hook wrapper for message parts analysis with automatic memoization.
 * Delegates to core utility functions from message-status.ts.
 *
 * Use this hook in component scope for optimal performance.
 * For use in callbacks or loops, use `getMessageParts()` from lib/utils directly.
 *
 * @module hooks/utils/use-message-parts
 */

import type { UIMessage } from 'ai';
import { useMemo } from 'react';

import type { MessagePartsAnalysis } from '@/lib/utils/message-status';
import { getMessageParts } from '@/lib/utils/message-status';

/**
 * Hook options
 */
export type UseMessagePartsOptions = {
  /** The message to process */
  message: UIMessage;
};

/**
 * Extract and filter message parts with memoization
 *
 * React hook version with automatic memoization for component scope.
 * Only recomputes when message reference changes.
 *
 * @param options - Message to process
 * @param options.message - The UIMessage to analyze
 * @returns Filtered parts and derived state flags
 *
 * @example
 * ```typescript
 * // In component scope
 * const { displayableParts, hasAnyContent } = useMessageParts({ message });
 *
 * const status = getMessageStatus({ message, isStreaming, hasAnyContent });
 *
 * return (
 *   <MessageCard status={status}>
 *     {displayableParts.map(part => <Part key={part.type} {...part} />)}
 *   </MessageCard>
 * );
 * ```
 */
export function useMessageParts({
  message,
}: UseMessagePartsOptions): MessagePartsAnalysis {
  return useMemo(
    () => getMessageParts(message),
    [message], // Only recompute when message changes
  );
}
