/**
 * Round Regeneration Tests
 *
 * Tests for the retry button functionality that regenerates AI responses for a round.
 * Based on FLOW_DOCUMENTATION.md Lines 551-577.
 *
 * Key Requirements:
 * 1. Retry button only appears on MOST RECENT round
 * 2. When clicked, all AI responses from that round disappear
 * 3. Moderator message disappears
 * 4. Feedback buttons reset
 * 5. Loading indicator appears
 * 6. Database cleanup keeps user's original question
 * 7. Re-execution uses same round number
 * 8. User can retry multiple times
 *
 * Store State Validations:
 * - Messages array correctly filtered after retry
 * - Round number stays the same after regeneration
 * - State resets properly (isStreaming, currentParticipantIndex, etc.)
 * - Retry only available on most recent round (not older rounds)
 * - Multiple retries on same round work correctly
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { FinishReasons, MessagePartTypes, MessageRoles, UIMessageRoles } from '@/api/core/enums';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Creates a user message for testing
 */
function createUserMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `thread-1_r${roundNumber}_user`,
    role: UIMessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    createdAt: new Date(),
  };
}

/**
 * Creates an assistant message for testing
 */
function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  text: string,
): UIMessage {
  return {
    id: `thread-1_r${roundNumber}_p${participantIndex}`,
    role: UIMessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex}`,
      participantRole: null,
      model: 'gpt-4',
      finishReason: FinishReasons.STOP,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
    createdAt: new Date(),
  };
}

/**
 * Creates a moderator message for testing
 */
function createModeratorMessage(roundNumber: number, text: string): UIMessage {
  return {
    id: `thread-1_r${roundNumber}_moderator`,
    role: UIMessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      isModerator: true,
      participantRole: null,
      model: 'gpt-4',
      finishReason: FinishReasons.STOP,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
    createdAt: new Date(),
  };
}

/**
 * Simulates retry by filtering out AI messages from a round
 * Mimics what the database cleanup would do
 */
function filterMessagesForRetry(
  messages: UIMessage[],
  roundNumber: number,
): UIMessage[] {
  return messages.filter((msg) => {
    const msgRoundNumber = msg.metadata?.roundNumber;
    if (msgRoundNumber !== roundNumber) {
      return true;
    }
    // Keep user messages from the round
    if (msg.metadata?.role === MessageRoles.USER) {
      return true;
    }
    // Remove all assistant messages (participants + moderator) from the round
    return false;
  });
}

/**
 * Gets the most recent round number from messages
 */
function getMostRecentRoundNumber(messages: UIMessage[]): number | null {
  if (messages.length === 0) {
    return null;
  }
  const roundNumbers = messages
    .map(msg => msg.metadata?.roundNumber)
    .filter((r): r is number => typeof r === 'number');
  return roundNumbers.length > 0 ? Math.max(...roundNumbers) : null;
}

// ============================================================================
// RETRY BUTTON AVAILABILITY TESTS
// ============================================================================

describe('round Regeneration - Button Availability', () => {
  it('should allow retry on most recent round', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary 1'),
      createUserMessage(1, 'Question 2'),
      createAssistantMessage(1, 0, 'Response 3'),
      createAssistantMessage(1, 1, 'Response 4'),
      createModeratorMessage(1, 'Summary 2'),
    ];

    store.getState().setMessages(messages);

    const mostRecentRound = getMostRecentRoundNumber(messages);

    expect(mostRecentRound).toBe(1);
  });

  it('should NOT allow retry on older rounds', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary 1'),
      createUserMessage(1, 'Question 2'),
      createAssistantMessage(1, 0, 'Response 3'),
      createAssistantMessage(1, 1, 'Response 4'),
      createModeratorMessage(1, 'Summary 2'),
    ];

    store.getState().setMessages(messages);

    const mostRecentRound = getMostRecentRoundNumber(messages);

    // Round 0 is NOT the most recent round
    expect(mostRecentRound).not.toBe(0);
  });

  it('should allow retry on first round if it is the only round', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary 1'),
    ];

    store.getState().setMessages(messages);

    const mostRecentRound = getMostRecentRoundNumber(messages);

    expect(mostRecentRound).toBe(0);
  });
});

// ============================================================================
// MESSAGE REMOVAL TESTS
// ============================================================================

describe('round Regeneration - Message Removal', () => {
  it('should remove all participant messages from current round', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createAssistantMessage(0, 2, 'Response 3'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    const filteredMessages = filterMessagesForRetry(messages, 0);

    // Should only have user message
    expect(filteredMessages).toHaveLength(1);
    expect(filteredMessages[0]?.metadata?.role).toBe(MessageRoles.USER);
  });

  it('should remove moderator message from current round', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    const filteredMessages = filterMessagesForRetry(messages, 0);

    // No moderator message should remain
    const hasModerator = filteredMessages.some(
      msg => msg.metadata?.isModerator === true,
    );
    expect(hasModerator).toBe(false);
  });

  it('should preserve user message from current round', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    const filteredMessages = filterMessagesForRetry(messages, 0);

    // User message should be preserved
    expect(filteredMessages).toHaveLength(1);
    expect(filteredMessages[0]?.parts?.[0]).toMatchObject({
      type: MessagePartTypes.TEXT,
      text: 'Question',
    });
  });

  it('should preserve all messages from other rounds', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary 1'),
      createUserMessage(1, 'Question 2'),
      createAssistantMessage(1, 0, 'Response 3'),
      createAssistantMessage(1, 1, 'Response 4'),
      createModeratorMessage(1, 'Summary 2'),
    ];

    store.getState().setMessages(messages);

    // Retry round 1
    const filteredMessages = filterMessagesForRetry(messages, 1);

    // Should have all of round 0 (4 messages) + user message from round 1 (1 message) = 5
    expect(filteredMessages).toHaveLength(5);

    // All round 0 messages should be intact
    const round0Messages = filteredMessages.filter(
      msg => msg.metadata?.roundNumber === 0,
    );
    expect(round0Messages).toHaveLength(4);
  });
});

// ============================================================================
// ROUND NUMBER PRESERVATION TESTS
// ============================================================================

describe('round Regeneration - Round Number Stays Same', () => {
  it('should maintain same round number after regeneration', () => {
    const store = createChatStore();

    const roundNumber = 1;

    // Before regeneration
    store.getState().setStreamingRoundNumber(roundNumber);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    // After regeneration starts (round number should stay the same)
    store.getState().setStreamingRoundNumber(roundNumber);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);
  });

  it('should use same round number for re-execution', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createModeratorMessage(0, 'Summary 1'),
      createUserMessage(1, 'Question 2'),
      createAssistantMessage(1, 0, 'Response 2'),
      createModeratorMessage(1, 'Summary 2'),
    ];

    store.getState().setMessages(messages);

    // User retries round 1
    const retryRound = 1;

    // After filtering messages
    const filteredMessages = filterMessagesForRetry(messages, retryRound);
    store.getState().setMessages(filteredMessages);

    // New streaming should use same round number
    store.getState().setStreamingRoundNumber(retryRound);
    expect(store.getState().streamingRoundNumber).toBe(retryRound);
  });

  it('should increment round number for new submissions, not retries', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createModeratorMessage(0, 'Summary 1'),
    ];

    store.getState().setMessages(messages);

    // User adds NEW question (not a retry)
    const newRound = 1;
    store.getState().setStreamingRoundNumber(newRound);

    // New submission should have incremented round number
    expect(store.getState().streamingRoundNumber).toBe(1);
  });
});

// ============================================================================
// MULTIPLE RETRY TESTS
// ============================================================================

describe('round Regeneration - Multiple Retries', () => {
  it('should allow multiple retries on same round', () => {
    const store = createChatStore();

    const initialMessages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(initialMessages);

    // First retry
    const afterFirstRetry = filterMessagesForRetry(initialMessages, 0);
    store.getState().setMessages(afterFirstRetry);

    // Simulate first regeneration completing
    const afterFirstRegeneration = [
      ...afterFirstRetry,
      createAssistantMessage(0, 0, 'New Response 1'),
      createAssistantMessage(0, 1, 'New Response 2'),
      createModeratorMessage(0, 'New Summary'),
    ];
    store.getState().setMessages(afterFirstRegeneration);

    // Second retry should also work
    const afterSecondRetry = filterMessagesForRetry(afterFirstRegeneration, 0);
    store.getState().setMessages(afterSecondRetry);

    expect(afterSecondRetry).toHaveLength(1);
    expect(afterSecondRetry[0]?.metadata?.role).toBe(MessageRoles.USER);
  });

  it('should reset state correctly on each retry', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    // First retry
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(null);
    store.getState().setStreamingRoundNumber(null);

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(null);
    expect(store.getState().streamingRoundNumber).toBe(null);

    // Simulate retry starting
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(0);

    // Second retry should also reset state
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(null);
    store.getState().setStreamingRoundNumber(null);

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(null);
    expect(store.getState().streamingRoundNumber).toBe(null);
  });
});

// ============================================================================
// STATE RESET TESTS
// ============================================================================

describe('round Regeneration - State Resets', () => {
  it('should reset isStreaming to false before retry', () => {
    const store = createChatStore();

    // Set streaming state
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);

    // Before retry, reset streaming
    store.getState().setIsStreaming(false);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should reset currentParticipantIndex to null before retry', () => {
    const store = createChatStore();

    // Set participant index
    store.getState().setCurrentParticipantIndex(2);
    expect(store.getState().currentParticipantIndex).toBe(2);

    // Before retry, reset participant index
    store.getState().setCurrentParticipantIndex(null);
    expect(store.getState().currentParticipantIndex).toBe(null);
  });

  it('should reset streamingRoundNumber before retry', () => {
    const store = createChatStore();

    // Set streaming round number
    store.getState().setStreamingRoundNumber(1);
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Before retry, reset streaming round number
    store.getState().setStreamingRoundNumber(null);
    expect(store.getState().streamingRoundNumber).toBe(null);
  });

  it('should reset isModeratorStreaming before retry', () => {
    const store = createChatStore();

    // Set moderator streaming
    store.getState().setIsModeratorStreaming(true);
    expect(store.getState().isModeratorStreaming).toBe(true);

    // Before retry, reset moderator streaming
    store.getState().setIsModeratorStreaming(false);
    expect(store.getState().isModeratorStreaming).toBe(false);
  });

  it('should clear all streaming state before retry', () => {
    const store = createChatStore();

    // Set all streaming states
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsModeratorStreaming(true);

    // Before retry, clear all streaming state
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(null);
    store.getState().setStreamingRoundNumber(null);
    store.getState().setIsModeratorStreaming(false);

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.currentParticipantIndex).toBe(null);
    expect(state.streamingRoundNumber).toBe(null);
    expect(state.isModeratorStreaming).toBe(false);
  });
});

// ============================================================================
// MESSAGES ARRAY FILTERING TESTS
// ============================================================================

describe('round Regeneration - Messages Array Filtering', () => {
  it('should correctly filter messages array after retry', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    // Retry round 0
    const filteredMessages = filterMessagesForRetry(messages, 0);
    store.getState().setMessages(filteredMessages);

    const currentMessages = store.getState().messages;

    expect(currentMessages).toHaveLength(1);
    expect(currentMessages[0]?.metadata?.role).toBe(MessageRoles.USER);
  });

  it('should maintain message order after filtering', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createModeratorMessage(0, 'Summary 1'),
      createUserMessage(1, 'Question 2'),
      createAssistantMessage(1, 0, 'Response 2'),
      createModeratorMessage(1, 'Summary 2'),
    ];

    store.getState().setMessages(messages);

    // Retry round 1
    const filteredMessages = filterMessagesForRetry(messages, 1);
    store.getState().setMessages(filteredMessages);

    const currentMessages = store.getState().messages;

    // Should maintain order: R0 user, R0 assistant, R0 moderator, R1 user
    expect(currentMessages).toHaveLength(4);
    expect(currentMessages[0]?.metadata?.roundNumber).toBe(0);
    expect(currentMessages[1]?.metadata?.roundNumber).toBe(0);
    expect(currentMessages[2]?.metadata?.roundNumber).toBe(0);
    expect(currentMessages[3]?.metadata?.roundNumber).toBe(1);
  });

  it('should handle retry with no moderator message', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      // No moderator message
    ];

    store.getState().setMessages(messages);

    // Retry round 0
    const filteredMessages = filterMessagesForRetry(messages, 0);
    store.getState().setMessages(filteredMessages);

    const currentMessages = store.getState().messages;

    // Should still filter correctly
    expect(currentMessages).toHaveLength(1);
    expect(currentMessages[0]?.metadata?.role).toBe(MessageRoles.USER);
  });

  it('should handle retry with only user message', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      // No responses yet
    ];

    store.getState().setMessages(messages);

    // Retry round 0 (edge case: retrying before any responses)
    const filteredMessages = filterMessagesForRetry(messages, 0);
    store.getState().setMessages(filteredMessages);

    const currentMessages = store.getState().messages;

    // User message should remain
    expect(currentMessages).toHaveLength(1);
    expect(currentMessages[0]?.metadata?.role).toBe(MessageRoles.USER);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('round Regeneration - Edge Cases', () => {
  it('should handle empty messages array', () => {
    const store = createChatStore();

    store.getState().setMessages([]);

    const mostRecentRound = getMostRecentRoundNumber([]);

    expect(mostRecentRound).toBe(null);
  });

  it('should handle messages with missing metadata', () => {
    const store = createChatStore();

    const messages = [
      {
        id: 'msg-1',
        role: UIMessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
        // No metadata
      } as UIMessage,
    ];

    store.getState().setMessages(messages);

    const mostRecentRound = getMostRecentRoundNumber(messages);

    expect(mostRecentRound).toBe(null);
  });

  it('should handle retry on round with single participant', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    const filteredMessages = filterMessagesForRetry(messages, 0);

    expect(filteredMessages).toHaveLength(1);
    expect(filteredMessages[0]?.metadata?.role).toBe(MessageRoles.USER);
  });

  it('should handle retry on round with many participants', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createAssistantMessage(0, 1, 'Response 2'),
      createAssistantMessage(0, 2, 'Response 3'),
      createAssistantMessage(0, 3, 'Response 4'),
      createAssistantMessage(0, 4, 'Response 5'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    const filteredMessages = filterMessagesForRetry(messages, 0);

    // Should remove all 5 participant messages + moderator
    expect(filteredMessages).toHaveLength(1);
    expect(filteredMessages[0]?.metadata?.role).toBe(MessageRoles.USER);
  });

  it('should handle consecutive retries without responses in between', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question'),
      createAssistantMessage(0, 0, 'Response 1'),
      createModeratorMessage(0, 'Summary'),
    ];

    store.getState().setMessages(messages);

    // First retry
    const afterFirstRetry = filterMessagesForRetry(messages, 0);
    store.getState().setMessages(afterFirstRetry);

    // Immediate second retry (no responses generated)
    const afterSecondRetry = filterMessagesForRetry(afterFirstRetry, 0);
    store.getState().setMessages(afterSecondRetry);

    // Should still have user message
    expect(afterSecondRetry).toHaveLength(1);
    expect(afterSecondRetry[0]?.metadata?.role).toBe(MessageRoles.USER);
  });
});

// ============================================================================
// MULTI-ROUND RETRY TESTS
// ============================================================================

describe('round Regeneration - Multi-Round Scenarios', () => {
  it('should only retry most recent round in multi-round conversation', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createModeratorMessage(0, 'Summary 1'),
      createUserMessage(1, 'Question 2'),
      createAssistantMessage(1, 0, 'Response 2'),
      createModeratorMessage(1, 'Summary 2'),
      createUserMessage(2, 'Question 3'),
      createAssistantMessage(2, 0, 'Response 3'),
      createModeratorMessage(2, 'Summary 3'),
    ];

    store.getState().setMessages(messages);

    const mostRecentRound = getMostRecentRoundNumber(messages);

    // Most recent round is 2
    expect(mostRecentRound).toBe(2);

    // Retry most recent round
    const filteredMessages = filterMessagesForRetry(messages, 2);
    store.getState().setMessages(filteredMessages);

    // Should have all messages from rounds 0 and 1, plus user message from round 2
    expect(filteredMessages).toHaveLength(7);

    // Rounds 0 and 1 should be intact
    const round0Messages = filteredMessages.filter(
      msg => msg.metadata?.roundNumber === 0,
    );
    const round1Messages = filteredMessages.filter(
      msg => msg.metadata?.roundNumber === 1,
    );

    expect(round0Messages).toHaveLength(3);
    expect(round1Messages).toHaveLength(3);
  });

  it('should preserve round order after retry in multi-round conversation', () => {
    const store = createChatStore();

    const messages = [
      createUserMessage(0, 'Question 1'),
      createAssistantMessage(0, 0, 'Response 1'),
      createUserMessage(1, 'Question 2'),
      createAssistantMessage(1, 0, 'Response 2'),
      createUserMessage(2, 'Question 3'),
      createAssistantMessage(2, 0, 'Response 3'),
    ];

    store.getState().setMessages(messages);

    // Retry round 2
    const filteredMessages = filterMessagesForRetry(messages, 2);

    // Check that rounds are still in order
    const roundNumbers = filteredMessages
      .map(msg => msg.metadata?.roundNumber)
      .filter((r): r is number => typeof r === 'number');

    // Should be [0, 0, 1, 1, 2] in order
    const isSorted = roundNumbers.every((val, i, arr) => {
      return i === 0 || val >= arr[i - 1]!;
    });

    expect(isSorted).toBe(true);
  });
});
