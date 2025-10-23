/**
 * Round Number Utilities
 *
 * Consolidated round number management following single-source-of-truth pattern.
 * All round numbers come from message metadata (set once, never recalculated).
 */

import type { UIMessage } from 'ai';

/**
 * Calculate next round number based on count of user messages
 * Used ONLY when creating new user message (before metadata is set)
 */
export function calculateNextRoundNumber(messages: UIMessage[]): number {
  const userMessages = messages.filter(m => m.role === 'user');
  return userMessages.length + 1;
}

/**
 * Get maximum round number from existing messages
 * Uses metadata as single source of truth
 */
export function getMaxRoundNumber(messages: UIMessage[]): number {
  let max = 0;

  messages.forEach((message) => {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    const roundNumber = metadata?.roundNumber as number;
    if (roundNumber && roundNumber > max) {
      max = roundNumber;
    }
  });

  return max || 1;
}

/**
 * Extract round number from message metadata
 * Returns 1 if metadata missing (defensive fallback)
 */
export function getRoundNumberFromMetadata(message: UIMessage): number {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  return (metadata?.roundNumber as number) || 1;
}

/**
 * Extract round number from last user message
 * Used for operations that need to know current round
 */
export function getCurrentRoundNumber(messages: UIMessage[]): number {
  const lastUserMessage = messages.findLast(m => m.role === 'user');
  if (!lastUserMessage)
    return 1;
  return getRoundNumberFromMetadata(lastUserMessage);
}

/**
 * Group messages by round number
 * Deduplicates messages by ID automatically
 */
export function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  const grouped = new Map<number, UIMessage[]>();
  const seenMessageIds = new Set<string>();

  messages.forEach((message) => {
    if (seenMessageIds.has(message.id))
      return;
    seenMessageIds.add(message.id);

    const roundNumber = getRoundNumberFromMetadata(message);

    if (!grouped.has(roundNumber)) {
      grouped.set(roundNumber, []);
    }
    grouped.get(roundNumber)!.push(message);
  });

  return grouped;
}

/**
 * Check if round number is the last round
 */
export function isLastRound(roundNumber: number, messages: UIMessage[]): boolean {
  return roundNumber === getMaxRoundNumber(messages);
}
