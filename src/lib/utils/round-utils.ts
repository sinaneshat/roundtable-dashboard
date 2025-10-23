/**
 * Round Number Utilities
 *
 * All messages have roundNumber in metadata (required field from database).
 * These utilities leverage that fact for simple, reliable grouping.
 */

import type { UIMessage } from 'ai';

export function calculateNextRoundNumber(messages: UIMessage[]): number {
  const userMessages = messages.filter(m => m.role === 'user');
  return userMessages.length + 1;
}

export function getMaxRoundNumber(messages: UIMessage[]): number {
  let max = 0;

  messages.forEach((message) => {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    const roundNumber = metadata?.roundNumber as number;
    if (roundNumber && roundNumber > max) {
      max = roundNumber;
    }
  });

  return Math.max(max, 1);
}

export function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  const grouped = new Map<number, UIMessage[]>();
  const seenMessageIds = new Set<string>();

  messages.forEach((message) => {
    if (seenMessageIds.has(message.id))
      return;
    seenMessageIds.add(message.id);

    const metadata = message.metadata as Record<string, unknown> | undefined;
    const roundNumber = (metadata?.roundNumber as number) || 1;

    if (!grouped.has(roundNumber)) {
      grouped.set(roundNumber, []);
    }
    grouped.get(roundNumber)!.push(message);
  });

  return grouped;
}

export function isLastRound(roundNumber: number, messages: UIMessage[]): boolean {
  return roundNumber === getMaxRoundNumber(messages);
}
