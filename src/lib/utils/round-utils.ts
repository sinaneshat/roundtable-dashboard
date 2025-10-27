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
 */

import type { UIMessage } from 'ai';

/**
 * Helper: Safely extract round number from metadata
 * @internal
 */
function safeGetRoundNumber(metadata: unknown, defaultValue = 1): number {
  if (!metadata || typeof metadata !== 'object')
    return defaultValue;
  const m = metadata as Record<string, unknown>;
  if (typeof m.roundNumber === 'number' && m.roundNumber >= 1) {
    return m.roundNumber;
  }
  return defaultValue;
}

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
 *
 * @param messages - Current messages array
 * @returns The next round number (max existing roundNumber + 1)
 */
export function calculateNextRoundNumber(messages: UIMessage[]): number {
  // Find the highest round number from user messages
  let maxRoundNumber = 0;

  messages.forEach((message) => {
    if (message.role === 'user') {
      const roundNumber = safeGetRoundNumber(message.metadata, 0);
      if (roundNumber > maxRoundNumber) {
        maxRoundNumber = roundNumber;
      }
    }
  });

  // Return max + 1, or 1 if no user messages exist
  return maxRoundNumber + 1;
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
 * @returns The maximum round number found in metadata, or 1 if none found
 */
export function getMaxRoundNumber(messages: UIMessage[]): number {
  let max = 0;

  messages.forEach((message) => {
    const roundNumber = safeGetRoundNumber(message.metadata, 0);
    if (roundNumber > max) {
      max = roundNumber;
    }
  });

  return max || 1;
}

/**
 * Extract round number from message metadata safely
 * Can accept either a UIMessage or raw metadata
 *
 * USAGE: Extract round number from a specific message or metadata
 * - Reads directly from message.metadata.roundNumber
 * - Returns defensive fallback of 1 if metadata missing
 *
 * SINGLE SOURCE OF TRUTH: Reads from metadata, never recalculates
 *
 * @param messageOrMetadata - The message or metadata to extract round number from
 * @param defaultValue - Default value if metadata is invalid (default: 1)
 * @returns The round number from metadata, or default if missing
 */
export function getRoundNumberFromMetadata(
  messageOrMetadata: UIMessage | unknown,
  defaultValue = 1,
): number {
  // If it's a UIMessage, extract metadata
  if (messageOrMetadata && typeof messageOrMetadata === 'object' && 'metadata' in messageOrMetadata) {
    return safeGetRoundNumber((messageOrMetadata as UIMessage).metadata, defaultValue);
  }
  // Otherwise treat it as raw metadata
  return safeGetRoundNumber(messageOrMetadata, defaultValue);
}

/**
 * Get current round number from the last user message
 *
 * USAGE: Primary function for reading the current round number
 * - Use this in onRoundComplete callbacks
 * - Use this when you need to know what round you're in
 * - Use this for creating analyses, changelogs, feedback
 *
 * SINGLE SOURCE OF TRUTH: Reads from last user message metadata
 * NEVER recalculates by counting messages
 *
 * @param messages - Current messages array
 * @returns The round number from the last user message, or 1 if no user messages
 */
export function getCurrentRoundNumber(messages: UIMessage[]): number {
  const lastUserMessage = messages.findLast(m => m.role === 'user');
  if (!lastUserMessage)
    return 1;
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
 * EXAMPLE:
 * Given messages: [User(round=1), Assistant1(round=1), Assistant2(round=1), User(round=2), Assistant1(round=2)]
 * - Round 1: Complete (all 3 messages)
 * - Round 2: Incomplete (only 2 messages, but correctly grouped as round 2)
 */
export function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  // PASS 1: Determine round number for each message
  // For each message, determine its round number:
  // - If it has roundNumber in metadata, use it directly
  // - Otherwise, infer from the most recent user message BEFORE this message
  const messageRounds = new Map<number, number>();
  const inferredMessages: Array<{ messageId: string; role: string; index: number; inferredRound: number }> = [];

  messages.forEach((message, index) => {
    // Check if message has explicit round number in metadata
    const hasExplicitRound = message.metadata
      && typeof message.metadata === 'object'
      && 'roundNumber' in message.metadata
      && typeof (message.metadata as Record<string, unknown>).roundNumber === 'number';

    if (hasExplicitRound) {
      // Message has explicit round number in metadata - use it directly
      const explicitRoundNumber = (message.metadata as Record<string, unknown>).roundNumber as number;
      messageRounds.set(index, explicitRoundNumber);
    } else {
      // No explicit round number - infer from context

      if (message.role === 'user') {
        // User message without explicit round number (shouldn't happen, but defensive)
        // Look for the last user message before this one to determine next round
        let inferredRound = 1;

        for (let i = index - 1; i >= 0; i--) {
          const prevMessage = messages[i];
          if (prevMessage && prevMessage.role === 'user') {
            const prevRound = messageRounds.get(i);
            if (prevRound) {
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
        let inferredRound = 1;

        for (let i = index - 1; i >= 0; i--) {
          const prevMessage = messages[i];
          if (prevMessage && prevMessage.role === 'user') {
            const userRound = messageRounds.get(i);
            if (userRound) {
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
    const roundNumber = messageRounds.get(index) || 1;

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
