/**
 * Round Number Utilities
 *
 * SINGLE SOURCE OF TRUTH PATTERN:
 * - Round numbers are set ONCE in message metadata when user sends message
 * - Round numbers are NEVER recalculated after being set
 * - All reads use getCurrentRoundNumber() to read from metadata
 * - calculateNextRoundNumber() is ONLY used during initial message creation
 *
 * CRITICAL PRINCIPLES:
 * 1. Message metadata.roundNumber is the ONLY source of truth
 * 2. Round numbers are IMMUTABLE after being set
 * 3. NO logic should count messages to derive round numbers
 * 4. Always read from metadata, never recalculate
 * 5. ✅ 0-BASED INDEXING: First round is round 0, first participant is p0
 */

import type { UIMessage } from 'ai';

import { MessageRoles } from '@/api/core/enums';
import {
  calculateNextRound,
  DEFAULT_ROUND_NUMBER,
  NO_ROUND_SENTINEL,
} from '@/lib/schemas/round-schemas';

import { getRoundNumber } from './metadata';

/**
 * Calculate next round number for NEW user message creation
 *
 * USAGE: ONLY use this when creating a NEW user message BEFORE metadata is set
 * - Called in sendMessage() to determine what round number to assign
 * - NOT for reading existing round numbers (use getCurrentRoundNumber instead)
 *
 * IMPORTANT: This should be called ONCE per round, then metadata becomes source of truth
 *
 * CORRECT LOGIC:
 * - Reads the maximum roundNumber from existing user message metadata
 * - Returns that max + 1 for the next round
 * - Does NOT count messages (which would be wrong for incomplete rounds)
 * - ✅ 0-BASED: First round is 0, second is 1, etc.
 *
 * @param messages - Current messages array
 * @returns The next round number (max existing roundNumber + 1, or 0 if no messages)
 */
export function calculateNextRoundNumber(messages: UIMessage[]): number {
  // Find the highest round number from user messages
  let maxRoundNumber = NO_ROUND_SENTINEL;

  messages.forEach((message) => {
    if (message.role === MessageRoles.USER) {
      // Use type-safe metadata extraction (handles unknown metadata from AI SDK)
      const roundNumber = getRoundNumber(message.metadata) ?? NO_ROUND_SENTINEL;
      if (roundNumber > maxRoundNumber) {
        maxRoundNumber = roundNumber;
      }
    }
  });

  // ✅ 0-BASED: Return max + 1, or 0 if no user messages exist
  return calculateNextRound(maxRoundNumber);
}

/**
 * Get maximum round number from existing messages
 *
 * USAGE: Use when you need to know the highest round number across all messages
 * - Useful for determining if a round is the last round
 * - Used for UI display logic
 *
 * READS FROM: Message metadata.roundNumber (single source of truth)
 * NEVER recalculates or derives round numbers from message counts
 *
 * @param messages - Current messages array
 * @returns The maximum round number found in metadata, or 0 if none found (✅ 0-BASED)
 */
export function getMaxRoundNumber(messages: UIMessage[]): number {
  let max = NO_ROUND_SENTINEL;

  messages.forEach((message) => {
    // Use type-safe metadata extraction (handles unknown metadata from AI SDK)
    const roundNumber = getRoundNumber(message.metadata) ?? NO_ROUND_SENTINEL;
    if (roundNumber > max) {
      max = roundNumber;
    }
  });

  // ✅ 0-BASED: Return max, or 0 if no messages (first round is 0)
  return max >= 0 ? max : DEFAULT_ROUND_NUMBER;
}

/**
 * Extract round number from message metadata safely
 * Can accept either a UIMessage or raw metadata
 *
 * USAGE: Extract round number from a specific message or metadata
 * - Reads directly from message.metadata.roundNumber
 * - Returns defensive fallback of 0 if metadata missing (✅ 0-BASED)
 *
 * SINGLE SOURCE OF TRUTH: Reads from metadata, never recalculates
 *
 * @param messageOrMetadata - The message or metadata to extract round number from
 * @param defaultValue - Default value if metadata is invalid (default: 0, ✅ 0-BASED)
 * @returns The round number from metadata, or default if missing
 */
export function getRoundNumberFromMetadata(
  messageOrMetadata: UIMessage | unknown,
  defaultValue = DEFAULT_ROUND_NUMBER,
): number {
  // If it's a UIMessage, extract metadata using type-safe utility
  if (messageOrMetadata && typeof messageOrMetadata === 'object' && 'metadata' in messageOrMetadata) {
    const roundNumber = getRoundNumber((messageOrMetadata as UIMessage).metadata);
    return roundNumber ?? defaultValue;
  }
  // Otherwise treat it as raw metadata
  const roundNumber = getRoundNumber(messageOrMetadata);
  return roundNumber ?? defaultValue;
}

/**
 * Get current round number from the last user message
 *
 * USAGE: Primary function for reading the current round number
 * - Use this in onRoundComplete callbacks
 * - Use this when you need to know what round you're in
 * - Use this for creating summaries, changelogs, feedback
 *
 * SINGLE SOURCE OF TRUTH: Reads from last user message metadata
 * NEVER recalculates by counting messages
 * ✅ 0-BASED: First round is 0
 *
 * @param messages - Current messages array
 * @returns The round number from the last user message, or 0 if no user messages (✅ 0-BASED)
 */
export function getCurrentRoundNumber(messages: UIMessage[]): number {
  const lastUserMessage = messages.findLast(m => m.role === MessageRoles.USER);
  if (!lastUserMessage)
    return DEFAULT_ROUND_NUMBER;
  return getRoundNumberFromMetadata(lastUserMessage);
}

/**
 * Group messages by round number
 * Implements three-pass algorithm as documented in FLOW_DOCUMENTATION.md:
 * 1. First Pass: Determine round number for each message (explicit from metadata or inferred)
 * 2. Second Pass: Group all messages by determined round
 * 3. Third Pass: Deduplication - Remove duplicate messages by ID
 *
 * CRITICAL LOGIC FOR INCOMPLETE ROUNDS:
 * - All messages SHOULD have roundNumber in metadata (set by backend)
 * - User messages ALWAYS have roundNumber (set during message creation)
 * - Assistant messages inherit roundNumber from their associated user message
 * - If metadata is missing (defensive fallback), infer by looking backward for nearest user message
 * - This ensures incomplete rounds (where not all participants have responded) are grouped correctly
 *
 * EXAMPLE (✅ 0-BASED):
 * Given messages: [User(round=0), Assistant1(round=0), Assistant2(round=0), User(round=1), Assistant1(round=1)]
 * - Round 0: Complete (all 3 messages)
 * - Round 1: Incomplete (only 2 messages, but correctly grouped as round 1)
 */
export function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  // PASS 1: Determine round number for each message
  // For each message, determine its round number:
  // - If it has roundNumber in metadata, use it directly
  // - Otherwise, infer from the most recent user message BEFORE this message
  const messageRounds = new Map<number, number>();
  const inferredMessages: Array<{ messageId: string; role: string; index: number; inferredRound: number }> = [];

  messages.forEach((message, index) => {
    // ✅ SINGLE SOURCE OF TRUTH: Use extraction utility for type-safe metadata access
    const explicitRoundNumber = getRoundNumber(message.metadata);

    if (explicitRoundNumber !== undefined && explicitRoundNumber !== null) {
      // Message has explicit round number in metadata - use it directly
      messageRounds.set(index, explicitRoundNumber);
    } else {
      // No explicit round number - infer from context

      if (message.role === MessageRoles.USER) {
        // User message without explicit round number (shouldn't happen, but defensive)
        // Look for the last user message before this one to determine next round
        let inferredRound = DEFAULT_ROUND_NUMBER;

        for (let i = index - 1; i >= 0; i--) {
          const prevMessage = messages[i];
          if (prevMessage && prevMessage.role === MessageRoles.USER) {
            const prevRound = messageRounds.get(i);
            if (prevRound !== undefined) {
              inferredRound = prevRound + 1;
              break;
            }
          }
        }

        messageRounds.set(index, inferredRound);
        // ✅ LOGGING: Track when round number inference is used
        inferredMessages.push({
          messageId: message.id,
          role: message.role,
          index,
          inferredRound,
        });
      } else {
        // Assistant/system message without explicit round number
        // Infer from the most recent user message BEFORE this message
        let inferredRound = DEFAULT_ROUND_NUMBER;

        for (let i = index - 1; i >= 0; i--) {
          const prevMessage = messages[i];
          if (prevMessage && prevMessage.role === MessageRoles.USER) {
            const userRound = messageRounds.get(i);
            if (userRound !== undefined) {
              inferredRound = userRound;
              break;
            }
          }
        }

        messageRounds.set(index, inferredRound);
        // ✅ LOGGING: Track when round number inference is used
        inferredMessages.push({
          messageId: message.id,
          role: message.role,
          index,
          inferredRound,
        });
      }
    }
  });

  // Round number inference used when messages don't have explicit roundNumber in metadata

  // PASS 2: Group all messages by determined round
  const grouped = new Map<number, UIMessage[]>();
  messages.forEach((message, index) => {
    const roundNumber = messageRounds.get(index) ?? DEFAULT_ROUND_NUMBER;

    if (!grouped.has(roundNumber)) {
      grouped.set(roundNumber, []);
    }
    grouped.get(roundNumber)!.push(message);
  });

  // PASS 3: Deduplication - Remove duplicate messages by ID
  const deduped = new Map<number, UIMessage[]>();
  const duplicatesFoundInRounds: Array<{ roundNumber: number; duplicateCount: number; duplicateIds: string[] }> = [];

  grouped.forEach((roundMessages, roundNumber) => {
    const seenMessageIds = new Set<string>();
    const uniqueMessages: UIMessage[] = [];
    const duplicateIds: string[] = [];

    roundMessages.forEach((message) => {
      if (!seenMessageIds.has(message.id)) {
        seenMessageIds.add(message.id);
        uniqueMessages.push(message);
      } else {
        // ✅ LOGGING: Track duplicates during round grouping
        duplicateIds.push(message.id);
      }
    });

    if (duplicateIds.length > 0) {
      duplicatesFoundInRounds.push({
        roundNumber,
        duplicateCount: duplicateIds.length,
        duplicateIds,
      });
    }

    deduped.set(roundNumber, uniqueMessages);
  });

  // Duplicates are automatically filtered during the deduplication pass

  return deduped;
}

/**
 * Check if round number is the last round
 */
export function isLastRound(roundNumber: number, messages: UIMessage[]): boolean {
  return roundNumber === getMaxRoundNumber(messages);
}
