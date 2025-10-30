/**
 * Message Filtering Utilities
 *
 * **SINGLE SOURCE OF TRUTH**: Consolidates message filtering patterns used across
 * stores, actions, and hooks. Prevents duplication of metadata extraction logic.
 *
 * Following backend-patterns.md: Type-safe operations, single responsibility.
 *
 * @module lib/utils/message-filtering
 */

import type { UIMessage } from 'ai';

import { extractMetadataParticipantId, getRoundNumberFromMessage } from './metadata-extraction';

/**
 * Get all participant (assistant) messages for a specific round
 *
 * **SINGLE SOURCE OF TRUTH**: Replaces duplicated patterns in:
 * - store.ts:549-563
 * - chat-analysis.ts:168-189
 * - analysis-creation.ts:288-295
 *
 * Filters for:
 * 1. Assistant role messages only
 * 2. Messages belonging to the specified round number
 *
 * @param messages - All messages in conversation
 * @param roundNumber - Target round number
 * @returns Filtered assistant messages for the round
 *
 * @example
 * ```typescript
 * const roundMessages = getParticipantMessagesForRound(allMessages, 2);
 * // Returns only assistant messages from round 2
 * ```
 */
export function getParticipantMessagesForRound(
  messages: UIMessage[],
  roundNumber: number,
): UIMessage[] {
  return messages.filter((m) => {
    if (m.role !== 'assistant') {
      return false;
    }
    const msgRound = getRoundNumberFromMessage(m);
    return msgRound === roundNumber;
  });
}

/**
 * Extract participant message IDs from filtered messages
 *
 * **SINGLE SOURCE OF TRUTH**: Replaces duplicated patterns in:
 * - store.ts:556-563
 * - chat-analysis.ts:179-189
 * - analysis-creation.ts:293-295
 *
 * Returns unique message IDs from messages that have participant metadata.
 * Ensures no duplicate IDs in result (uses Set internally).
 *
 * @param messages - Messages to extract IDs from (typically assistant messages)
 * @returns Array of unique message IDs
 *
 * @example
 * ```typescript
 * const roundMessages = getParticipantMessagesForRound(messages, roundNumber);
 * const participantMessageIds = getParticipantMessageIds(roundMessages);
 * // Use for analysis creation: { participantMessageIds }
 * ```
 */
export function getParticipantMessageIds(messages: UIMessage[]): string[] {
  // Use Set to ensure uniqueness, then convert back to array
  return Array.from(
    new Set(
      messages
        .filter((m) => {
          const participantId = extractMetadataParticipantId(m.metadata);
          return participantId != null;
        })
        .map(m => m.id),
    ),
  );
}

/**
 * Get participant messages with IDs for a specific round (combined operation)
 *
 * **CONVENIENCE FUNCTION**: Combines filtering and ID extraction in one call.
 * Use when you need both the messages and their IDs.
 *
 * @param messages - All messages in conversation
 * @param roundNumber - Target round number
 * @returns Object with filtered messages and their IDs
 *
 * @example
 * ```typescript
 * const { messages: roundMessages, ids: participantMessageIds } =
 *   getParticipantMessagesWithIds(allMessages, roundNumber);
 *
 * // Use for analysis
 * await createAnalysis({ participantMessageIds });
 * ```
 */
export function getParticipantMessagesWithIds(
  messages: UIMessage[],
  roundNumber: number,
): { messages: UIMessage[]; ids: string[] } {
  const filteredMessages = getParticipantMessagesForRound(messages, roundNumber);
  const ids = getParticipantMessageIds(filteredMessages);

  return { messages: filteredMessages, ids };
}

/**
 * Filter messages by role
 *
 * @param messages - Messages to filter
 * @param role - Target role ('user' | 'assistant' | 'system')
 * @returns Messages with specified role
 *
 * @example
 * ```typescript
 * const userMessages = getMessagesByRole(messages, 'user');
 * const assistantMessages = getMessagesByRole(messages, 'assistant');
 * ```
 */
export function getMessagesByRole(
  messages: UIMessage[],
  role: UIMessage['role'],
): UIMessage[] {
  return messages.filter(m => m.role === role);
}

/**
 * Get all user messages in conversation
 *
 * **CONVENIENCE FUNCTION**: Shorthand for filtering user messages.
 *
 * @param messages - All messages
 * @returns User messages only
 */
export function getUserMessages(messages: UIMessage[]): UIMessage[] {
  return getMessagesByRole(messages, 'user');
}

/**
 * Get all assistant messages in conversation
 *
 * **CONVENIENCE FUNCTION**: Shorthand for filtering assistant messages.
 *
 * @param messages - All messages
 * @returns Assistant messages only
 */
export function getAssistantMessages(messages: UIMessage[]): UIMessage[] {
  return getMessagesByRole(messages, 'assistant');
}

/**
 * Count messages in a specific round
 *
 * @param messages - All messages
 * @param roundNumber - Target round
 * @returns Count of messages in the round
 *
 * @example
 * ```typescript
 * const roundCount = countMessagesInRound(messages, 2);
 * if (roundCount >= expectedParticipants.length) {
 *   // All participants have responded
 * }
 * ```
 */
export function countMessagesInRound(
  messages: UIMessage[],
  roundNumber: number,
): number {
  return getParticipantMessagesForRound(messages, roundNumber).length;
}

/**
 * Get the highest round number from messages
 *
 * @param messages - All messages
 * @returns Highest round number, or 0 if no rounds found
 *
 * @example
 * ```typescript
 * const latestRound = getLatestRoundNumber(messages);
 * // Use for determining current round
 * ```
 */
export function getLatestRoundNumber(messages: UIMessage[]): number {
  const roundNumbers = messages
    .map(m => getRoundNumberFromMessage(m))
    .filter((round): round is number => round !== undefined);

  return roundNumbers.length > 0 ? Math.max(...roundNumbers) : 0;
}
