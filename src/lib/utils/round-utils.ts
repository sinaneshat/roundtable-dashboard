/**
 * Round Number Calculation Utilities
 *
 * Centralized logic for calculating and inferring round numbers in chat threads.
 * Eliminates duplication across ChatThreadScreen and ChatOverviewScreen.
 *
 * ✅ SINGLE SOURCE OF TRUTH: Round number calculation logic
 * ✅ CONSISTENT INFERENCE: Same algorithm used everywhere
 * ✅ TYPE-SAFE: Proper TypeScript types for all functions
 *
 * Used by:
 * - /src/containers/screens/chat/ChatThreadScreen.tsx
 * - /src/containers/screens/chat/ChatOverviewScreen.tsx
 * - Backend analysis creation logic
 *
 * Reference: COMPREHENSIVE REFACTORING ANALYSIS:3.3
 */

import type { UIMessage } from 'ai';

/**
 * Calculate the next round number based on existing messages
 *
 * Round number increments with each USER message:
 * - Round 1: First user message + participants' responses
 * - Round 2: Second user message + participants' responses
 * - Round N: Nth user message + participants' responses
 *
 * @param messages - Array of UIMessage objects
 * @returns The next round number (1-based)
 *
 * @example
 * const userMessages = messages.filter(m => m.role === 'user')
 * const nextRound = calculateNextRoundNumber(messages) // userMessages.length + 1
 */
export function calculateNextRoundNumber(messages: UIMessage[]): number {
  const userMessages = messages.filter(m => m.role === 'user');
  return userMessages.length + 1;
}

/**
 * Infer round number for a message that doesn't have explicit metadata
 *
 * During streaming, messages may not have roundNumber in metadata yet.
 * This function infers the round number based on message position and role.
 *
 * Algorithm:
 * - User messages increment the round counter
 * - Assistant messages belong to the current round (after last user message)
 * - First round is always 1
 *
 * @param message - Message to infer round number for
 * @param allMessages - All messages in the conversation (for context)
 * @returns Inferred round number
 *
 * @example
 * const roundNumber = inferRoundNumber(message, messages)
 */
export function inferRoundNumber(message: UIMessage, allMessages: UIMessage[]): number {
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const explicitRound = metadata?.roundNumber as number | undefined;

  // If message has explicit roundNumber, use it
  if (explicitRound) {
    return explicitRound;
  }

  // Infer from message position
  let inferredRound = 1;
  let lastUserRound = 0;

  const messageIndex = allMessages.findIndex(m => m.id === message.id);
  const messagesUpToThis = allMessages.slice(0, messageIndex + 1);

  messagesUpToThis.forEach((msg) => {
    const msgMetadata = msg.metadata as Record<string, unknown> | undefined;
    const msgRound = msgMetadata?.roundNumber as number | undefined;

    if (msgRound) {
      // Message has explicit round - track it
      if (msg.role === 'user') {
        lastUserRound = msgRound;
        inferredRound = msgRound;
      }
    } else {
    // Intentionally empty
      // Message doesn't have explicit round - infer it
      if (msg.role === 'user') {
        inferredRound = lastUserRound + 1;
        lastUserRound = inferredRound;
      } else {
        // Intentionally empty
        // Assistant message belongs to current round
        inferredRound = inferredRound || 1;
      }
    }
  });

  return inferredRound;
}

/**
 * Get the maximum round number in a conversation
 *
 * Scans all messages and returns the highest round number found,
 * using inference for messages without explicit metadata.
 *
 * @param messages - All messages in the conversation
 * @returns Maximum round number (minimum 1)
 *
 * @example
 * const maxRound = getMaxRoundNumber(messages)
 * const isLastRound = currentRound === maxRound
 */
export function getMaxRoundNumber(messages: UIMessage[]): number {
  let max = 0;
  let inferredRoundNumber = 1;
  let lastUserMessageRound = 0;

  messages.forEach((message) => {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    let roundNumber = metadata?.roundNumber as number | undefined;

    // Infer round number if not explicit
    if (!roundNumber) {
      if (message.role === 'user') {
        inferredRoundNumber = lastUserMessageRound + 1;
        lastUserMessageRound = inferredRoundNumber;
        roundNumber = inferredRoundNumber;
      } else {
        // Intentionally empty
        roundNumber = inferredRoundNumber || 1;
      }
    } else if (message.role === 'user') {
      lastUserMessageRound = roundNumber;
      inferredRoundNumber = roundNumber;
    }

    if (roundNumber > max) {
      max = roundNumber;
    }
  });

  return Math.max(max, 1); // Minimum round is 1
}

/**
 * Group messages by round number
 *
 * Creates a Map of round number to messages, inferring round numbers
 * for messages without explicit metadata.
 *
 * ✅ STREAMING FIX: Deduplicates messages by ID to prevent duplicate UI elements during streaming
 * ✅ STABILITY FIX: Prioritizes explicit roundNumber in metadata to maintain grouping during participant/mode changes
 * ✅ ALIGNMENT FIX: Sequential round numbering (1, 2, 3...) with no gaps, matching user message order
 *
 * @param messages - All messages to group
 * @returns Map of round number to message array (deduplicated)
 *
 * @example
 * const messagesByRound = groupMessagesByRound(messages)
 * const round1Messages = messagesByRound.get(1) || []
 */
export function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  const grouped = new Map<number, UIMessage[]>();
  const seenMessageIds = new Set<string>(); // ✅ FIX: Track message IDs to prevent duplicates

  // ✅ CRITICAL FIX: Build stable round mapping that matches database state
  // The key insight: Round numbers MUST match what's stored in analyses/changelogs
  // So we need to respect explicit roundNumbers and fill gaps sequentially

  const userMessageRounds = new Map<string, number>();

  // ✅ FIRST PASS: Collect all explicit round numbers from ALL messages (not just user)
  // This ensures we know what rounds exist in the database
  const explicitRounds = new Set<number>();
  messages.forEach((message) => {
    const metadata = message.metadata as Record<string, unknown> | undefined;
    const explicitRound = metadata?.roundNumber as number | undefined;
    if (explicitRound) {
      explicitRounds.add(explicitRound);
      if (message.role === 'user') {
        userMessageRounds.set(message.id, explicitRound);
      }
    }
  });

  // ✅ SECOND PASS: Assign sequential rounds to user messages without explicit metadata
  // Ensure sequential numbering (1, 2, 3...) with no gaps
  let nextAvailableRound = 1;
  messages.forEach((message) => {
    if (message.role === 'user' && !userMessageRounds.has(message.id)) {
      // Find next sequential round that's not taken
      while (explicitRounds.has(nextAvailableRound) || Array.from(userMessageRounds.values()).includes(nextAvailableRound)) {
        nextAvailableRound++;
      }
      userMessageRounds.set(message.id, nextAvailableRound);
      explicitRounds.add(nextAvailableRound);
      nextAvailableRound++;
    }
  });

  // ✅ THIRD PASS: Group all messages by their determined round number
  let currentRoundForAssistants = 1;

  messages.forEach((message) => {
    // ✅ FIX: Skip duplicate messages (same ID already processed)
    // This prevents duplicate like/dislike buttons during streaming
    if (seenMessageIds.has(message.id)) {
      return;
    }
    seenMessageIds.add(message.id);

    let roundNumber: number;

    if (message.role === 'user') {
      // ✅ STABLE: User messages always use their pre-determined round
      roundNumber = userMessageRounds.get(message.id) ?? 1;
      currentRoundForAssistants = roundNumber;
    } else {
    // Intentionally empty
      // ✅ PRIORITIZE EXPLICIT: Check metadata first
      const metadata = message.metadata as Record<string, unknown> | undefined;
      const explicitRound = metadata?.roundNumber as number | undefined;

      if (explicitRound) {
        // Trust explicit roundNumber - this is set during streaming or from database
        roundNumber = explicitRound;
        // ✅ FIX: Update current round tracker so subsequent messages without metadata group correctly
        currentRoundForAssistants = explicitRound;
      } else {
        // Intentionally empty
        // Infer: Assistant messages belong to the current round (after last user message)
        roundNumber = currentRoundForAssistants || 1;
      }
    }

    if (!grouped.has(roundNumber)) {
      grouped.set(roundNumber, []);
    }
    grouped.get(roundNumber)!.push(message);
  });

  return grouped;
}

/**
 * Check if a round is the last round in the conversation
 *
 * @param roundNumber - Round to check
 * @param messages - All messages in conversation
 * @returns True if this is the last round
 *
 * @example
 * const showRetry = isLastRound(roundNumber, messages)
 */
export function isLastRound(roundNumber: number, messages: UIMessage[]): boolean {
  const maxRound = getMaxRoundNumber(messages);
  return roundNumber === maxRound;
}
