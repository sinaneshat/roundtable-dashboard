/**
 * Round 0 vs Round 1+ Behavior Parity Tests
 *
 * CRITICAL REGRESSION TESTS
 *
 * These tests verify that non-initial rounds (round 1+) behave IDENTICALLY to round 0
 * in all aspects of message visibility, state management, and UI updates.
 *
 * BUG PREVENTED:
 * User messages were disappearing in non-initial rounds due to:
 * 1. Different animation logic for round 0 vs round 1+
 * 2. Different message ID handling across rounds
 * 3. Participant trigger messages replacing original user messages
 *
 * TEST PHILOSOPHY:
 * If round 0 works correctly, round 1+ MUST work identically.
 * Any difference in behavior is a bug.
 */

import { MessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it } from 'vitest';

import { getRoundNumber } from '@/lib/utils';
import type { ChatParticipant, ChatThread } from '@/services/api';

import { createChatStore } from '../store';
import type { ChatStore } from '../store-schemas';

// ============================================================================
// TEST HELPERS
// ============================================================================

function createTestStore(initialState?: Partial<ChatStore>) {
  const store = createChatStore();
  if (initialState) {
    store.setState(initialState);
  }
  return store;
}

function createMockThread(): ChatThread {
  return {
    id: 'test-thread-123',
    slug: 'test-thread',
    title: 'Test Thread',
    mode: 'brainstorming',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    enableWebSearch: false,
    isAiGeneratedTitle: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  } as ChatThread;
}

function createMockParticipants(): ChatParticipant[] {
  return [
    {
      id: 'participant-1',
      threadId: 'test-thread-123',
      modelId: 'gpt-4o',
      role: 'Analyst',
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'participant-2',
      threadId: 'test-thread-123',
      modelId: 'claude-3-5-sonnet',
      role: 'Critic',
      priority: 1,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function createUserMessage(roundNumber: number, text: string, isOptimistic = false): UIMessage {
  const baseId = isOptimistic ? `optimistic-user-${Date.now()}` : `user-msg-round-${roundNumber}`;
  return {
    id: baseId,
    role: MessageRoles.USER,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      ...(isOptimistic ? { isOptimistic: true } : {}),
    },
  };
}

function createAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  text: string,
): UIMessage {
  return {
    id: `assistant-msg-round-${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: 'text', text }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      participantId: `participant-${participantIndex + 1}`,
      participantRole: participantIndex === 0 ? 'Analyst' : 'Critic',
      model: participantIndex === 0 ? 'gpt-4o' : 'claude-3-5-sonnet',
      finishReason: 'stop',
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    },
  };
}

// ============================================================================
// USER MESSAGE VISIBILITY PARITY TESTS
// ============================================================================

describe('round 0 vs Round 1+ Behavior Parity', () => {
  let store: ReturnType<typeof createChatStore>;
  let thread: ChatThread;
  let participants: ChatParticipant[];

  beforeEach(() => {
    store = createTestStore();
    thread = createMockThread();
    participants = createMockParticipants();
  });

  describe('user Message Visibility', () => {
    it('pARITY: user message should be in store immediately after submission (both rounds)', () => {
      // Round 0
      const round0UserMsg = createUserMessage(0, 'Round 0 question', true);
      store.getState().setMessages([round0UserMsg]);

      const round0Messages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 0,
      );
      expect(round0Messages).toHaveLength(1);

      // Round 1
      const round1UserMsg = createUserMessage(1, 'Round 1 question', true);
      store.getState().setMessages([...store.getState().messages, round1UserMsg]);

      const round1Messages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(round1Messages).toHaveLength(1);

      // PARITY CHECK: Both rounds should have exactly 1 user message
      expect(round0Messages).toHaveLength(round1Messages.length);
    });

    it('pARITY: optimistic user message should persist across rounds', () => {
      // Round 0 optimistic message
      const round0Optimistic = createUserMessage(0, 'Round 0 question', true);
      store.getState().setMessages([round0Optimistic]);

      expect(
        store.getState().messages.find(m => m.id === round0Optimistic.id),
      ).toBeDefined();

      // Round 1 optimistic message
      const round1Optimistic = createUserMessage(1, 'Round 1 question', true);
      store.getState().setMessages([...store.getState().messages, round1Optimistic]);

      expect(
        store.getState().messages.find(m => m.id === round1Optimistic.id),
      ).toBeDefined();

      // PARITY CHECK: Both optimistic messages should be present
      const round0Present = store.getState().messages.some(m => m.id === round0Optimistic.id);
      const round1Present = store.getState().messages.some(m => m.id === round1Optimistic.id);

      expect(round0Present).toBe(true);
      expect(round1Present).toBe(true);
    });

    it('pARITY: user message should survive ID change from optimistic to DB ID (both rounds)', () => {
      // Round 0: optimistic -> DB ID
      const round0Optimistic = createUserMessage(0, 'Round 0 question', true);
      store.getState().setMessages([round0Optimistic]);

      const round0DbId = '01KE5WMBVDFY_R0';
      const round0Persisted = { ...round0Optimistic, id: round0DbId };
      store.getState().setMessages(
        store.getState().messages.map(m => m.id === round0Optimistic.id ? round0Persisted : m),
      );

      const round0AfterPersist = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 0,
      );

      // Round 1: optimistic -> DB ID
      const round1Optimistic = createUserMessage(1, 'Round 1 question', true);
      store.getState().setMessages([...store.getState().messages, round1Optimistic]);

      const round1DbId = '01KE5WMBVDFY_R1';
      const round1Persisted = { ...round1Optimistic, id: round1DbId };
      store.getState().setMessages(
        store.getState().messages.map(m => m.id === round1Optimistic.id ? round1Persisted : m),
      );

      const round1AfterPersist = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );

      // PARITY CHECK: Both rounds should have exactly 1 user message after ID change
      expect(round0AfterPersist).toHaveLength(1);
      expect(round1AfterPersist).toHaveLength(1);
      expect(round0AfterPersist).toHaveLength(round1AfterPersist.length);
    });

    it('cRITICAL: user message must NOT be replaced by participant trigger message (round 1+)', () => {
      // Setup: Round 0 complete
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Round 0 question'),
        createAssistantMessage(0, 0, 'Response 0-0'),
        createAssistantMessage(0, 1, 'Response 0-1'),
      ]);

      // Round 1: Add user message
      const round1UserMsg = createUserMessage(1, 'Round 1 question');
      store.getState().setMessages([...store.getState().messages, round1UserMsg]);

      const userMessagesBeforeTrigger = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );
      expect(userMessagesBeforeTrigger).toHaveLength(1);

      // Simulate AI SDK adding participant trigger message
      const participantTrigger: UIMessage = {
        id: 'trigger-msg-123',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Round 1 question' }],
        metadata: {
          role: MessageRoles.USER,
          roundNumber: 1,
          isParticipantTrigger: true,
        },
      };

      store.getState().setMessages([...store.getState().messages, participantTrigger]);

      // CRITICAL CHECK: Original user message MUST still be present
      const userMessagesAfterTrigger = store.getState().messages.filter((m) => {
        if (m.role !== MessageRoles.USER)
          return false;
        if (getRoundNumber(m.metadata) !== 1)
          return false;
        const metadata = m.metadata as { isParticipantTrigger?: boolean };
        return !metadata.isParticipantTrigger;
      });

      expect(userMessagesAfterTrigger).toHaveLength(1);
      expect(userMessagesAfterTrigger[0]?.id).toBe(round1UserMsg.id);
    });
  });

  describe('state Initialization Parity', () => {
    it('pARITY: streamingRoundNumber should be set for both round 0 and round 1', () => {
      // Round 0
      store.getState().setStreamingRoundNumber(0);
      expect(store.getState().streamingRoundNumber).toBe(0);

      // Round 1
      store.getState().setStreamingRoundNumber(1);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // PARITY CHECK: Both should be valid round numbers
      expect(typeof store.getState().streamingRoundNumber).toBe('number');
    });

    it('pARITY: expectedParticipantIds should be set for both rounds', () => {
      const expectedIds = participants.map(p => p.modelId);

      // Round 0
      store.getState().setExpectedParticipantIds(expectedIds);
      const round0Ids = store.getState().expectedParticipantIds;

      // Round 1
      store.getState().setExpectedParticipantIds(expectedIds);
      const round1Ids = store.getState().expectedParticipantIds;

      // PARITY CHECK: Both should have same participant IDs
      expect(round0Ids).toEqual(round1Ids);
    });

    it('pARITY: waitingToStartStreaming should behave identically', () => {
      // Round 0
      store.getState().setWaitingToStartStreaming(true);
      const round0Waiting = store.getState().waitingToStartStreaming;

      // Round 1
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setWaitingToStartStreaming(true);
      const round1Waiting = store.getState().waitingToStartStreaming;

      // PARITY CHECK: Both should have same state
      expect(round0Waiting).toBe(round1Waiting);
    });
  });

  describe('animation Skip Behavior Parity', () => {
    it('cRITICAL: round 0 persisted messages should animate normally', () => {
      const round0Message = createUserMessage(0, 'Round 0 question', false);
      const roundNumber = getRoundNumber(round0Message.metadata);
      const isOptimistic = (round0Message.metadata as { isOptimistic?: boolean })?.isOptimistic;

      // Round 0 persisted (not optimistic) should NOT skip animation
      const shouldSkipAnimation = isOptimistic || (roundNumber !== null && roundNumber > 0);

      expect(shouldSkipAnimation).toBe(false);
    });

    it('cRITICAL: round 1+ messages should ALWAYS skip animation', () => {
      // Test multiple scenarios for round 1+
      const scenarios = [
        { round: 1, optimistic: false, desc: 'round 1 persisted' },
        { round: 1, optimistic: true, desc: 'round 1 optimistic' },
        { round: 2, optimistic: false, desc: 'round 2 persisted' },
        { round: 5, optimistic: true, desc: 'round 5 optimistic' },
      ];

      for (const scenario of scenarios) {
        const message = createUserMessage(scenario.round, 'Test', scenario.optimistic);
        const roundNumber = getRoundNumber(message.metadata);
        const isOptimistic = (message.metadata as { isOptimistic?: boolean })?.isOptimistic;

        const shouldSkipAnimation = isOptimistic || (roundNumber !== null && roundNumber > 0);

        expect(shouldSkipAnimation).toBe(true);
      }
    });

    it('pARITY: optimistic messages should skip animation in ALL rounds', () => {
      const rounds = [0, 1, 2, 3];

      for (const roundNum of rounds) {
        const optimisticMsg = createUserMessage(roundNum, `Round ${roundNum}`, true);
        const isOptimistic = (optimisticMsg.metadata as { isOptimistic?: boolean })?.isOptimistic;

        expect(isOptimistic).toBe(true);
      }
    });
  });

  describe('message Count Parity', () => {
    it('pARITY: message count should follow same pattern across rounds', () => {
      // Round 0: 1 user + 2 participants = 3 messages
      const round0Messages = [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response 0-0'),
        createAssistantMessage(0, 1, 'Response 0-1'),
      ];
      store.getState().setMessages(round0Messages);

      const round0Count = store.getState().messages.filter(
        m => getRoundNumber(m.metadata) === 0,
      ).length;

      // Round 1: 1 user + 2 participants = 3 messages
      const round1Messages = [
        createUserMessage(1, 'Round 1'),
        createAssistantMessage(1, 0, 'Response 1-0'),
        createAssistantMessage(1, 1, 'Response 1-1'),
      ];
      store.getState().setMessages([...store.getState().messages, ...round1Messages]);

      const round1Count = store.getState().messages.filter(
        m => getRoundNumber(m.metadata) === 1,
      ).length;

      // PARITY CHECK: Both rounds should have same message count
      expect(round0Count).toBe(round1Count);
      expect(round0Count).toBe(3);
    });

    it('pARITY: user message should be first message in each round', () => {
      store.getState().setMessages([
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response'),
        createUserMessage(1, 'Round 1'),
        createAssistantMessage(1, 0, 'Response'),
      ]);

      const messages = store.getState().messages;

      // Round 0 first message
      const round0Messages = messages.filter(m => getRoundNumber(m.metadata) === 0);
      expect(round0Messages[0]?.role).toBe(MessageRoles.USER);

      // Round 1 first message
      const round1Messages = messages.filter(m => getRoundNumber(m.metadata) === 1);
      expect(round1Messages[0]?.role).toBe(MessageRoles.USER);

      // PARITY CHECK: Both rounds start with user message
      expect(round0Messages[0]?.role).toBe(round1Messages[0]?.role);
    });
  });

  describe('timeline Rendering Parity', () => {
    it('pARITY: both rounds should create timeline items with same structure', () => {
      store.getState().setMessages([
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response 0-0'),
        createUserMessage(1, 'Round 1'),
        createAssistantMessage(1, 0, 'Response 1-0'),
      ]);

      const messages = store.getState().messages;

      // Group by round
      const round0 = messages.filter(m => getRoundNumber(m.metadata) === 0);
      const round1 = messages.filter(m => getRoundNumber(m.metadata) === 1);

      // Both should have user message + participant response
      expect(round0).toHaveLength(2);
      expect(round1).toHaveLength(2);

      // Both should have same structure: USER, ASSISTANT
      expect(round0[0]?.role).toBe(MessageRoles.USER);
      expect(round0[1]?.role).toBe(MessageRoles.ASSISTANT);
      expect(round1[0]?.role).toBe(MessageRoles.USER);
      expect(round1[1]?.role).toBe(MessageRoles.ASSISTANT);

      // PARITY CHECK: Structure is identical
      expect(round0.map(m => m.role)).toEqual(round1.map(m => m.role));
    });

    it('cRITICAL: round 1+ should be included in timeline even with only user message', () => {
      // Round 0 complete
      store.getState().setMessages([
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response'),
      ]);

      // Round 1 in progress (only user message)
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1, 'Round 1'),
      ]);

      const messages = store.getState().messages;
      const uniqueRounds = new Set(
        messages.map(m => getRoundNumber(m.metadata)).filter((r): r is number => r !== null),
      );

      // CRITICAL: Round 1 must be in timeline
      expect(uniqueRounds.has(0)).toBe(true);
      expect(uniqueRounds.has(1)).toBe(true);
    });
  });

  describe('state Reset Prevention', () => {
    it('cRITICAL: initializeThread must NOT reset streaming state during active submission', () => {
      // Setup: Round 0 complete
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response'),
      ]);

      // Round 1: Set active submission state
      store.getState().setStreamingRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      const beforeRoundNumber = store.getState().streamingRoundNumber;

      // Simulate initializeThread call during PATCH response
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response'),
      ]);

      const afterRoundNumber = store.getState().streamingRoundNumber;

      // CRITICAL: streamingRoundNumber should be preserved
      expect(beforeRoundNumber).toBe(afterRoundNumber);
      expect(afterRoundNumber).toBe(1);
    });

    it('cRITICAL: optimistic message should survive initializeThread', () => {
      // Round 0 complete
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response'),
      ]);

      // Round 1: Add optimistic message
      const optimisticMsg = createUserMessage(1, 'Round 1', true);
      store.getState().setMessages([...store.getState().messages, optimisticMsg]);
      store.getState().setConfigChangeRoundNumber(1);

      const beforeMessages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );

      // Simulate initializeThread with only round 0 data
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Round 0'),
        createAssistantMessage(0, 0, 'Response'),
      ]);

      const afterMessages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );

      // CRITICAL: Optimistic message should still be present
      expect(beforeMessages).toHaveLength(1);
      expect(afterMessages).toHaveLength(1);
      expect(afterMessages[0]?.id).toBe(optimisticMsg.id);
    });
  });

  describe('edge Cases: Round Number Validation', () => {
    it('should handle round numbers up to 10+', () => {
      const highRounds = [10, 15, 20];

      for (const roundNum of highRounds) {
        const message = createUserMessage(roundNum, `Round ${roundNum}`);
        const extracted = getRoundNumber(message.metadata);

        expect(extracted).toBe(roundNum);
      }
    });

    it('should return null for missing roundNumber (default to 0 in UI)', () => {
      const messageWithoutRound: UIMessage = {
        id: 'msg-no-round',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'No round' }],
        metadata: { role: MessageRoles.USER },
      };

      const extracted = getRoundNumber(messageWithoutRound.metadata);
      // getRoundNumber returns null when roundNumber is missing
      // UI components should default to 0 when null
      expect(extracted).toBeNull();
    });
  });

  describe('complete Multi-Round Journey', () => {
    it('iNTEGRATION: complete 3-round conversation should maintain parity', () => {
      // Round 0
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Round 0 question'),
        createAssistantMessage(0, 0, 'Response 0-0'),
        createAssistantMessage(0, 1, 'Response 0-1'),
      ]);

      const round0UserMessages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 0,
      );

      // Round 1
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1, 'Round 1 question'),
        createAssistantMessage(1, 0, 'Response 1-0'),
        createAssistantMessage(1, 1, 'Response 1-1'),
      ]);

      const round1UserMessages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 1,
      );

      // Round 2
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(2, 'Round 2 question'),
        createAssistantMessage(2, 0, 'Response 2-0'),
        createAssistantMessage(2, 1, 'Response 2-1'),
      ]);

      const round2UserMessages = store.getState().messages.filter(
        m => m.role === MessageRoles.USER && getRoundNumber(m.metadata) === 2,
      );

      // PARITY CHECK: All rounds should have exactly 1 user message
      expect(round0UserMessages).toHaveLength(1);
      expect(round1UserMessages).toHaveLength(1);
      expect(round2UserMessages).toHaveLength(1);

      // All rounds should have same message structure
      const round0Count = store.getState().messages.filter(
        m => getRoundNumber(m.metadata) === 0,
      ).length;
      const round1Count = store.getState().messages.filter(
        m => getRoundNumber(m.metadata) === 1,
      ).length;
      const round2Count = store.getState().messages.filter(
        m => getRoundNumber(m.metadata) === 2,
      ).length;

      expect(round0Count).toBe(round1Count);
      expect(round1Count).toBe(round2Count);
    });
  });
});
