/**
 * Non-Initial Round First Participant Duplication Tests
 *
 * Tests for the bug where message boxes appear duplicated for the first
 * participant in non-initial rounds (round > 0) before deduplication runs.
 *
 * REPORTED BUG:
 * - User message box appears twice for first participant in round 1+
 * - UI waits to show content, then shows 2 message boxes briefly
 * - After a moment, deduplication removes the duplicate
 *
 * ROOT CAUSE HYPOTHESIS:
 * 1. prepareForNewMessage adds optimistic user message for round N
 * 2. AI SDK receives server-confirmed user message
 * 3. Before useMessageSync merges them, both are rendered
 * 4. Timeline shows duplicate message boxes
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { FinishReasons, MessageRoles, MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { UIMessage } from '@/lib/schemas/message-schemas';
import {
  countAssistantMessagesInRound,
  countUserMessagesInRound,
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
  getRoundNumber,
} from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockParticipant(index: number, modelId: string) {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId,
    role: `Role ${index}`,
    priority: index,
    isEnabled: true,
    createdAt: new Date(),
  };
}

function createMockThread(enableWebSearch = false) {
  return {
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    mode: 'debating' as const,
    status: 'active' as const,
    enableWebSearch,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createCompleteRoundMessages(roundNumber: number, participantCount: number): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      id: `thread-123_r${roundNumber}_user`,
      content: `User message round ${roundNumber}`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        id: `thread-123_r${roundNumber}_p${i}`,
        content: `Response R${roundNumber}P${i}`,
        roundNumber,
        participantId: `participant-${i}`,
        participantIndex: i,
        finishReason: FinishReasons.STOP,
      }),
    );
  }

  return messages;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('non-Initial Round First Participant Duplication', () => {
  const participants = [
    createMockParticipant(0, 'gpt-4o'),
    createMockParticipant(1, 'claude-3-opus'),
  ];

  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    store.getState().setThread(createMockThread(true));
    store.getState().setParticipants(participants);
    store.getState().setScreenMode(ScreenModes.THREAD);
  });

  describe('user Message Duplication Prevention', () => {
    it('should have exactly ONE user message when starting round 1 after round 0 completes', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Prepare for round 1 (adds optimistic user message)
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Count user messages in round 1
      const messages = store.getState().messages;
      const round1UserCount = countUserMessagesInRound(messages, 1);

      // CRITICAL ASSERTION: Exactly ONE user message for round 1
      expect(round1UserCount).toBe(1);
    });

    it('should NOT add duplicate user message when prepareForNewMessage called multiple times', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // First prepareForNewMessage call
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);
      const countAfterFirst = countUserMessagesInRound(store.getState().messages, 1);

      // Second prepareForNewMessage call (simulates race condition)
      store.getState().prepareForNewMessage('Round 1 question', []);
      const countAfterSecond = countUserMessagesInRound(store.getState().messages, 1);

      // Third call
      store.getState().prepareForNewMessage('Round 1 question', []);
      const countAfterThird = countUserMessagesInRound(store.getState().messages, 1);

      expect(countAfterFirst).toBe(1);
      expect(countAfterSecond).toBe(1);
      expect(countAfterThird).toBe(1);
    });

    it('should NOT add optimistic message when one already exists for target round', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Manually add optimistic user message for round 1 (simulates early add)
      const messagesBeforeOptimistic = store.getState().messages;
      store.getState().setMessages([
        ...messagesBeforeOptimistic,
        {
          id: `optimistic-user-${Date.now()}-r1`,
          role: MessageRoles.USER,
          parts: [{ type: 'text' as const, text: 'Round 1 question' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 1,
            isOptimistic: true,
          },
        },
      ]);

      const countBeforePrepare = countUserMessagesInRound(store.getState().messages, 1);

      // prepareForNewMessage should detect existing optimistic message
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);

      const countAfterPrepare = countUserMessagesInRound(store.getState().messages, 1);

      expect(countBeforePrepare).toBe(1);
      expect(countAfterPrepare).toBe(1);
    });
  });

  describe('message Box Count During First Participant Streaming', () => {
    it('should have correct total messages when first participant starts streaming in round 1', () => {
      // Complete round 0 (1 user + 2 assistants = 3 messages)
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Start round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);
      store.getState().setIsStreaming(true);

      // Round 1: 1 optimistic user message
      // Total: 3 (r0) + 1 (r1 user) = 4
      expect(store.getState().messages).toHaveLength(4);

      // Add pre-search (doesn't affect message count)
      store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.STREAMING));

      // First participant starts streaming - add streaming message
      const currentMsgs = store.getState().messages;
      store.getState().setMessages([
        ...currentMsgs,
        createTestAssistantMessage({
          id: 'thread-123_r1_p0',
          content: 'Streaming...',
          roundNumber: 1,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
      ]);

      // Total: 4 + 1 streaming assistant = 5
      expect(store.getState().messages).toHaveLength(5);

      // Still exactly 1 user message in round 1
      expect(countUserMessagesInRound(store.getState().messages, 1)).toBe(1);
    });

    it('should have correct message count when merging server user message with optimistic', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Start round 1 with optimistic user message
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Simulate server returning confirmed user message (same content, different ID)
      const currentMsgs = store.getState().messages;
      const serverUserMessage = createTestUserMessage({
        id: 'thread-123_r1_user',
        content: 'Round 1 question',
        roundNumber: 1,
      });

      // This simulates what useMessageSync does - it should deduplicate
      // For now, test that setting messages directly maintains correct count
      // (In production, useMessageSync handles the merge)
      const filteredMsgs = currentMsgs.filter((m) => {
        // Remove optimistic messages for round 1 if server message exists
        if (m.role === MessageRoles.USER) {
          const roundNum = getRoundNumber(m.metadata);
          const isOptimistic = 'isOptimistic' in m.metadata && m.metadata.isOptimistic === true;
          if (roundNum === 1 && isOptimistic) {
            return false; // Remove optimistic, server message will replace it
          }
        }
        return true;
      });

      store.getState().setMessages([...filteredMsgs, serverUserMessage]);

      // Should still have exactly 1 user message in round 1
      expect(countUserMessagesInRound(store.getState().messages, 1)).toBe(1);
    });
  });

  describe('round Transition State', () => {
    it('should correctly track streamingRoundNumber during round transitions', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);
      store.getState().completeStreaming();

      expect(store.getState().isStreaming).toBe(false);

      // Start round 1
      store.getState().setStreamingRoundNumber(1);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // prepareForNewMessage should use streamingRoundNumber for deduplication
      store.getState().prepareForNewMessage('Round 1 question', []);

      // streamingRoundNumber preserved (or correctly calculated)
      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should correctly calculate targetRound for duplication check', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Scenario 1: streamingRoundNumber is set before prepareForNewMessage
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Check: no duplicates for round 1
      expect(countUserMessagesInRound(store.getState().messages, 1)).toBe(1);

      // Complete round 1
      const r1Msgs = store.getState().messages;
      store.getState().setMessages([
        ...r1Msgs,
        createTestAssistantMessage({
          id: 'thread-123_r1_p0',
          content: 'Response R1P0',
          roundNumber: 1,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r1_p1',
          content: 'Response R1P1',
          roundNumber: 1,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ]);
      store.getState().completeStreaming();

      // Scenario 2: Round 2 without explicitly setting streamingRoundNumber
      // prepareForNewMessage should calculate nextRoundNumber = 2
      store.getState().prepareForNewMessage('Round 2 question', []);

      // Check: no duplicates for round 2, should be exactly 1 user message
      expect(countUserMessagesInRound(store.getState().messages, 2)).toBe(1);
    });
  });

  describe('hasOptimisticForTargetRound Detection', () => {
    it('should correctly detect existing optimistic message', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Add optimistic message directly (simulating hasEarlyOptimisticMessage flow)
      store.getState().setHasEarlyOptimisticMessage(true);
      const currentMsgs = store.getState().messages;
      store.getState().setMessages([
        ...currentMsgs,
        {
          id: `optimistic-user-early-r1`,
          role: MessageRoles.USER,
          parts: [{ type: 'text' as const, text: 'Early optimistic' }],
          metadata: {
            role: MessageRoles.USER,
            roundNumber: 1,
            isOptimistic: true,
          },
        },
      ]);
      store.getState().setStreamingRoundNumber(1);

      // prepareForNewMessage should detect this and NOT add another
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Still exactly 1 optimistic user message
      expect(countUserMessagesInRound(store.getState().messages, 1)).toBe(1);
    });

    it('should handle case where streamingRoundNumber differs from calculated nextRoundNumber', () => {
      // Complete rounds 0 and 1
      store.getState().setMessages([
        ...createCompleteRoundMessages(0, 2),
        ...createCompleteRoundMessages(1, 2),
      ]);
      store.getState().completeStreaming();

      // Set streamingRoundNumber to 2 explicitly
      store.getState().setStreamingRoundNumber(2);

      // prepareForNewMessage should use streamingRoundNumber (2), not calculated (also 2)
      store.getState().prepareForNewMessage('Round 2 question', []);

      expect(countUserMessagesInRound(store.getState().messages, 2)).toBe(1);

      // Call again - should still be 1
      store.getState().prepareForNewMessage('Round 2 question again', []);

      expect(countUserMessagesInRound(store.getState().messages, 2)).toBe(1);
    });
  });

  describe('timeline Rendering Correctness', () => {
    it('should have correct message counts per round for timeline rendering', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Start round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Add first participant streaming
      const r1Msgs = store.getState().messages;
      store.getState().setMessages([
        ...r1Msgs,
        createTestAssistantMessage({
          id: 'thread-123_r1_p0',
          content: 'Streaming...',
          roundNumber: 1,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
      ]);

      const messages = store.getState().messages;

      // Round 0: 1 user + 2 assistants = 3
      const round0User = countUserMessagesInRound(messages, 0);
      const round0Assistant = countAssistantMessagesInRound(messages, 0);
      expect(round0User).toBe(1);
      expect(round0Assistant).toBe(2);

      // Round 1: 1 optimistic user + 1 streaming assistant = 2
      const round1User = countUserMessagesInRound(messages, 1);
      const round1Assistant = countAssistantMessagesInRound(messages, 1);
      expect(round1User).toBe(1);
      expect(round1Assistant).toBe(1);

      // Total: 3 + 2 = 5
      expect(messages).toHaveLength(5);
    });
  });
});
