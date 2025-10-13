/**
 * Round Detection Helpers
 *
 * Utilities for detecting conversation rounds and extracting participant messages.
 *
 * A "round" is defined as:
 * - One user message
 * - Followed by N assistant messages (where N = expected participant count)
 *
 * Used by the moderator analysis feature to identify complete rounds.
 */

import type { UIMessage } from 'ai';

import { getMessageMetadata } from './message-helpers';

/**
 * Represents a detected conversation round
 */
export type ConversationRound = {
  roundNumber: number; // 1-indexed
  userMessageId: string;
  userMessageContent: string;
  participantMessageIds: string[];
  participantMessages: Array<{
    id: string;
    content: string;
    participantId: string | null;
    participantIndex: number;
    modelId?: string;
    hasError?: boolean; // Whether this participant message has an error
  }>;
  /** Index in the original messages array where this round starts */
  startIndex: number;
  /** Index in the original messages array where this round ends */
  endIndex: number;
  /** Whether all participants completed successfully without errors */
  isComplete: boolean;
};

/**
 * Detect all complete conversation rounds from messages
 *
 * @param messages - Array of UIMessage objects
 * @param expectedParticipantCount - Number of participants expected per round
 * @returns Array of detected rounds with metadata
 */
export function detectConversationRounds(
  messages: UIMessage[],
  expectedParticipantCount: number,
): ConversationRound[] {
  const rounds: ConversationRound[] = [];
  let roundNumber = 0;
  let i = 0;

  while (i < messages.length) {
    const message = messages[i];

    // Look for user messages as round starts
    if (message?.role === 'user') {
      const userMessageContent = message.parts
        .filter(p => p.type === 'text')
        .map(p => ('text' in p ? p.text : ''))
        .join('');

      // Check if we have enough assistant messages following this user message
      const assistantMessages: ConversationRound['participantMessages'] = [];
      let j = i + 1;

      while (j < messages.length && assistantMessages.length < expectedParticipantCount) {
        const nextMessage = messages[j];

        // Stop if we hit another user message or non-assistant message
        if (!nextMessage || nextMessage.role !== 'assistant') {
          break;
        }

        // Extract content from assistant message
        const content = nextMessage.parts
          .filter(p => p.type === 'text')
          .map(p => ('text' in p ? p.text : ''))
          .join('');

        // Get metadata
        const metadata = getMessageMetadata(nextMessage.metadata);

        // Check if this message has an error
        const hasError = metadata?.hasError === true || !!metadata?.error;

        assistantMessages.push({
          id: nextMessage.id,
          content,
          participantId: metadata?.participantId || null,
          participantIndex: assistantMessages.length, // 0-indexed position in this round
          modelId: metadata?.model,
          hasError,
        });

        j++;
      }

      // Only consider this a complete round if we have the expected number of participants
      if (assistantMessages.length === expectedParticipantCount) {
        roundNumber++;

        // Check if all participants completed without errors
        const isComplete = assistantMessages.every(m => !m.hasError);

        rounds.push({
          roundNumber,
          userMessageId: message.id,
          userMessageContent,
          participantMessageIds: assistantMessages.map(m => m.id),
          participantMessages: assistantMessages,
          startIndex: i,
          endIndex: j - 1,
          isComplete,
        });

        // Move past this round
        i = j;
        continue;
      }
    }

    // Move to next message if not starting a round
    i++;
  }

  return rounds;
}

/**
 * Check if a specific message index is the end of a round
 *
 * @param messageIndex - Index in the messages array
 * @param messages - Array of UIMessage objects
 * @param expectedParticipantCount - Number of participants expected per round
 * @returns The round data if this is the end of a round, null otherwise
 */
export function isEndOfRound(
  messageIndex: number,
  messages: UIMessage[],
  expectedParticipantCount: number,
): ConversationRound | null {
  const rounds = detectConversationRounds(messages, expectedParticipantCount);

  // Find the round that ends at this index
  const round = rounds.find(r => r.endIndex === messageIndex);

  return round || null;
}

/**
 * Get the latest complete round from messages
 *
 * @param messages - Array of UIMessage objects
 * @param expectedParticipantCount - Number of participants expected per round
 * @returns The latest round or null if no rounds detected
 */
export function getLatestRound(
  messages: UIMessage[],
  expectedParticipantCount: number,
): ConversationRound | null {
  const rounds = detectConversationRounds(messages, expectedParticipantCount);

  if (rounds.length === 0) {
    return null;
  }

  return rounds[rounds.length - 1] || null;
}
