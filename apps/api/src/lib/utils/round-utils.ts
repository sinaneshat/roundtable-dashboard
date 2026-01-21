/**
 * Round Number Utilities
 */

import { MessageRoles } from '@roundtable/shared/enums';
import type { UIMessage } from 'ai';

import {
  calculateNextRound,
  DEFAULT_ROUND_NUMBER,
  NO_ROUND_SENTINEL,
} from '@/lib/schemas/round-schemas';

import { getRoundNumber } from './metadata';

/**
 * Extract round number from message or metadata with default fallback
 *
 * CONVENIENCE WRAPPER: Delegates to getRoundNumber() from metadata.ts
 * - Accepts UIMessage or raw metadata
 * - Provides default value fallback
 *
 * @param messageOrMetadata - UIMessage object or raw metadata
 * @param defaultValue - Default value if roundNumber not found (default: DEFAULT_ROUND_NUMBER)
 * @returns Round number or default value
 *
 * @example
 * const round = getRoundNumberFromMetadata(message); // Uses DEFAULT_ROUND_NUMBER
 * const round = getRoundNumberFromMetadata(message, 0); // Uses 0 as fallback
 * const round = getRoundNumberFromMetadata(message.metadata); // Direct metadata access
 */
export function getRoundNumberFromMetadata(
  messageOrMetadata: UIMessage | unknown,
  defaultValue = DEFAULT_ROUND_NUMBER,
): number {
  if (
    messageOrMetadata
    && typeof messageOrMetadata === 'object'
    && 'metadata' in messageOrMetadata
    && messageOrMetadata.metadata !== null
    && typeof messageOrMetadata.metadata === 'object'
  ) {
    const roundNumber = getRoundNumber(messageOrMetadata.metadata);
    return roundNumber ?? defaultValue;
  }
  const roundNumber = getRoundNumber(messageOrMetadata);
  return roundNumber ?? defaultValue;
}

export function calculateNextRoundNumber(messages: UIMessage[]): number {
  let maxRoundNumber = NO_ROUND_SENTINEL;

  messages.forEach((message) => {
    if (message.role === MessageRoles.USER) {
      const roundNumber = getRoundNumber(message.metadata) ?? NO_ROUND_SENTINEL;
      if (roundNumber > maxRoundNumber) {
        maxRoundNumber = roundNumber;
      }
    }
  });

  return calculateNextRound(maxRoundNumber);
}

export function getMaxRoundNumber(messages: UIMessage[]): number {
  let max = NO_ROUND_SENTINEL;

  messages.forEach((message) => {
    const roundNumber = getRoundNumber(message.metadata) ?? NO_ROUND_SENTINEL;
    if (roundNumber > max) {
      max = roundNumber;
    }
  });

  return max >= 0 ? max : DEFAULT_ROUND_NUMBER;
}

export function getCurrentRoundNumber(messages: readonly UIMessage[]): number {
  // Find last user message (iterate backwards)
  let lastUserMessage: UIMessage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message && message.role === MessageRoles.USER) {
      lastUserMessage = message;
      break;
    }
  }
  if (!lastUserMessage) {
    return DEFAULT_ROUND_NUMBER;
  }
  const roundNumber = getRoundNumber(lastUserMessage.metadata);
  return roundNumber ?? DEFAULT_ROUND_NUMBER;
}

export function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  // ✅ PERF FIX: Single-pass grouping with forward tracking
  // Previously O(n²): Backward scans for each message without explicit round
  // Now O(n): Track last known round as we iterate forward

  const result = new Map<number, UIMessage[]>();
  const seenIds = new Set<string>();

  // Track last known user round for inference (eliminates backward scans)
  let lastKnownUserRound = DEFAULT_ROUND_NUMBER - 1; // Start at -1 so first user msg is round 0

  for (const message of messages) {
    // Deduplicate in same pass (eliminates third loop)
    if (seenIds.has(message.id))
      continue;
    seenIds.add(message.id);

    // Get explicit round number or infer from context
    const explicitRoundNumber = getRoundNumber(message.metadata);
    let roundNumber: number;

    if (explicitRoundNumber !== undefined && explicitRoundNumber !== null) {
      roundNumber = explicitRoundNumber;
      // Update tracking if this is a user message
      if (message.role === MessageRoles.USER) {
        lastKnownUserRound = roundNumber;
      }
    } else {
      // Infer round from last known state (O(1) instead of O(n) backward scan)
      if (message.role === MessageRoles.USER) {
        roundNumber = lastKnownUserRound + 1;
        lastKnownUserRound = roundNumber;
      } else {
        // Assistant messages inherit current user round
        roundNumber = lastKnownUserRound >= 0 ? lastKnownUserRound : DEFAULT_ROUND_NUMBER;
      }
    }

    // Group by round in same pass (eliminates second loop)
    const existing = result.get(roundNumber);
    if (existing) {
      existing.push(message);
    } else {
      result.set(roundNumber, [message]);
    }
  }

  return result;
}
