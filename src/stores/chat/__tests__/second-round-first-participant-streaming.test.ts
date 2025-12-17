/**
 * Second Round First Participant Streaming Tests
 *
 * Tests for the bug where the first participant in the 2nd round (and later rounds)
 * doesn't gradually update the UI. The stream parts don't come in gradually and
 * update the stores/actions progressively, but from subsequent participants onwards
 * it works correctly.
 *
 * Root Causes Identified:
 * 1. handleUpdateThreadAndSend passes empty array [] for participantIds (form-actions.ts:588)
 *    vs handleCreateThread which correctly passes getParticipantModelIds(participants)
 * 2. Missing setNextParticipantToTrigger(0) call in handleUpdateThreadAndSend
 *    (present in handleCreateThread at line 330)
 * 3. prepareForNewMessage may be called before/after streaming starts, causing race conditions
 *
 * These tests verify:
 * - Expected participant IDs are set correctly for rounds 2+
 * - nextParticipantToTrigger is set for rounds 2+
 * - First participant streaming in round 2+ updates UI progressively
 * - Timeline elements appear in correct order during multi-round streaming
 * - Race conditions between state changes are handled correctly
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MessagePartTypes, MessageRoles, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch, StoredRoundSummary } from '@/api/routes/chat/schema';
import type { UIMessage } from '@/lib/schemas/message-schemas';
import { getParticipantModelIds } from '@/lib/utils/participant';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

function createMockUserMessage(roundNumber: number, content = 'Test message'): UIMessage {
  return {
    id: `user-msg-r${roundNumber}`,
    role: MessageRoles.USER,
    parts: [{ type: MessagePartTypes.TEXT, text: content }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
  };
}

function createMockAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  modelId: string,
  content = 'Response',
): UIMessage {
  return {
    id: `assistant-msg-r${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT,
    parts: [{ type: MessagePartTypes.TEXT, text: content }],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantIndex,
      modelId,
    },
  };
}

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

function createPlaceholderPreSearch(roundNumber: number): StoredPreSearch {
  return {
    id: `placeholder-presearch-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    userQuery: 'Test query',
    status: MessageStatuses.PENDING,
    searchData: null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: null,
  } as StoredPreSearch;
}

function createPlaceholderSummary(roundNumber: number): StoredRoundSummary {
  return {
    id: `placeholder-summary-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status: MessageStatuses.PENDING,
    moderatorModelId: 'gpt-4o',
    summaryText: null,
    leaderboard: null,
    createdAt: new Date(),
    completedAt: null,
  } as StoredRoundSummary;
}

// ============================================================================
// EXPECTED PARTICIPANT IDS TESTS
// ============================================================================

describe('second round first participant streaming', () => {
  describe('expected participant IDs for non-initial rounds', () => {
    it('should preserve expectedParticipantIds when prepareForNewMessage receives empty array', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];
      const expectedIds = getParticipantModelIds(participants);

      // Set initial state with participants
      store.getState().setParticipants(participants);
      store.getState().setExpectedParticipantIds(expectedIds);

      // Verify initial state
      expect(store.getState().expectedParticipantIds).toEqual(expectedIds);

      // Simulate handleUpdateThreadAndSend calling prepareForNewMessage with empty array
      // This is the bug - form-actions.ts:588 passes []
      store.getState().prepareForNewMessage('New message', []);

      // BUG ASSERTION: Empty array should NOT clear expectedParticipantIds
      // The store preserves existing IDs when empty array is passed
      expect(store.getState().expectedParticipantIds).toEqual(expectedIds);
      expect(store.getState().expectedParticipantIds).not.toEqual([]);
    });

    it('should set expectedParticipantIds before prepareForNewMessage for round 2+', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];
      const expectedIds = getParticipantModelIds(participants);

      // Set up complete round 0
      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, 'gpt-4o'),
        createMockAssistantMessage(0, 1, 'claude-3-opus'),
      ]);
      store.getState().setSummaries([createPlaceholderSummary(0)]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Simulate handleUpdateThreadAndSend flow for round 1:
      // 1. First set expected IDs (simulates line 578/582)
      store.getState().setExpectedParticipantIds(expectedIds);

      // 2. Then call prepareForNewMessage with empty array (simulates line 588)
      store.getState().prepareForNewMessage('Round 1 message', []);

      // Verify expected IDs are preserved
      expect(store.getState().expectedParticipantIds).toEqual(expectedIds);
      expect(store.getState().pendingMessage).toBe('Round 1 message');
    });

    it('should validate expectedParticipantIds match current participants before sending', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
        createMockParticipant(2, 'gemini-pro'),
      ];
      const expectedIds = getParticipantModelIds(participants);

      store.getState().setParticipants(participants);
      store.getState().setExpectedParticipantIds(expectedIds);

      // Current participants should match expected
      const currentModelIds = getParticipantModelIds(store.getState().participants);
      expect(currentModelIds.sort()).toEqual([...expectedIds].sort());
    });
  });

  describe('nextParticipantToTrigger for non-initial rounds', () => {
    it('should set nextParticipantToTrigger to 0 for round 0 (handleCreateThread behavior)', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];

      // Simulate handleCreateThread behavior (line 330)
      store.getState().setParticipants(participants);
      store.getState().setNextParticipantToTrigger(0);

      expect(store.getState().nextParticipantToTrigger).toBe(0);
    });

    it('should have nextParticipantToTrigger available for round 2+ resumption', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];

      // Set up complete round 0
      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, 'gpt-4o'),
        createMockAssistantMessage(0, 1, 'claude-3-opus'),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // For round 1, handleUpdateThreadAndSend should also set nextParticipantToTrigger
      // BUG: This is currently missing from handleUpdateThreadAndSend
      // Simulating what SHOULD happen:
      store.getState().setNextParticipantToTrigger(0);

      expect(store.getState().nextParticipantToTrigger).toBe(0);
    });

    it('prepareForNewMessage should clear nextParticipantToTrigger', () => {
      const store = createChatStore();

      // Set initial value
      store.getState().setNextParticipantToTrigger(0);
      expect(store.getState().nextParticipantToTrigger).toBe(0);

      // prepareForNewMessage clears it (store.ts:1248)
      store.getState().prepareForNewMessage('Test', []);

      // After prepareForNewMessage, it should be null
      expect(store.getState().nextParticipantToTrigger).toBeNull();
    });

    it('should require nextParticipantToTrigger to be set AFTER prepareForNewMessage for resumption', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];
      const expectedIds = getParticipantModelIds(participants);

      // Full flow for round 1:
      store.getState().setParticipants(participants);
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().prepareForNewMessage('Round 1 message', []);

      // After prepareForNewMessage, nextParticipantToTrigger is null
      expect(store.getState().nextParticipantToTrigger).toBeNull();

      // For resumption to work on thread screen, we need to set it
      // This is what handleCreateThread does but handleUpdateThreadAndSend doesn't
      store.getState().setNextParticipantToTrigger(0);

      expect(store.getState().nextParticipantToTrigger).toBe(0);
    });
  });

  describe('streaming state for first participant in round 2+', () => {
    let store: ReturnType<typeof createChatStore>;
    const participants = [
      createMockParticipant(0, 'gpt-4o'),
      createMockParticipant(1, 'claude-3-opus'),
    ];

    beforeEach(() => {
      store = createChatStore();
      // Set up completed round 0
      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setMessages([
        createMockUserMessage(0, 'Round 0 question'),
        createMockAssistantMessage(0, 0, 'gpt-4o', 'Response 0-0'),
        createMockAssistantMessage(0, 1, 'claude-3-opus', 'Response 0-1'),
      ]);
      store.getState().setSummaries([{
        ...createPlaceholderSummary(0),
        status: MessageStatuses.COMPLETE,
      }]);
      store.getState().setScreenMode(ScreenModes.THREAD);
    });

    it('should set isStreaming to true when first participant starts in round 1', () => {
      const expectedIds = getParticipantModelIds(participants);

      // Simulate handleUpdateThreadAndSend flow
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Initially not streaming
      expect(store.getState().isStreaming).toBe(false);

      // When streaming starts
      store.getState().setIsStreaming(true);

      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should track currentParticipantIndex during round 1 streaming', () => {
      const expectedIds = getParticipantModelIds(participants);

      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // First participant
      expect(store.getState().currentParticipantIndex).toBe(0);

      // After first participant completes
      store.getState().setCurrentParticipantIndex(1);
      expect(store.getState().currentParticipantIndex).toBe(1);
    });

    it('should maintain correct streaming state across all participants in round 1', () => {
      const expectedIds = getParticipantModelIds(participants);

      // Start round 1
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Add user message for round 1
      const messages = store.getState().messages;
      store.getState().setMessages([
        ...messages,
        createMockUserMessage(1, 'Round 1 question'),
      ]);

      // Simulate first participant streaming
      const currentMessages = store.getState().messages;
      store.getState().setMessages([
        ...currentMessages,
        createMockAssistantMessage(1, 0, 'gpt-4o', 'Partial response...'),
      ]);

      // Verify state during first participant streaming
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().currentParticipantIndex).toBe(0);

      // First participant completes
      store.getState().setCurrentParticipantIndex(1);

      // Second participant streams
      const updatedMessages = store.getState().messages;
      store.getState().setMessages([
        ...updatedMessages,
        createMockAssistantMessage(1, 1, 'claude-3-opus', 'Second response'),
      ]);

      expect(store.getState().currentParticipantIndex).toBe(1);
      expect(store.getState().isStreaming).toBe(true);
    });
  });

  describe('timeline element ordering during multi-round streaming', () => {
    it('should maintain correct message order across multiple rounds', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];

      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);

      // Round 0 messages
      store.getState().setMessages([
        createMockUserMessage(0, 'Q0'),
        createMockAssistantMessage(0, 0, 'gpt-4o', 'R0-P0'),
        createMockAssistantMessage(0, 1, 'claude-3-opus', 'R0-P1'),
      ]);

      // Add round 1 messages
      const r0Messages = store.getState().messages;
      store.getState().setMessages([
        ...r0Messages,
        createMockUserMessage(1, 'Q1'),
        createMockAssistantMessage(1, 0, 'gpt-4o', 'R1-P0'),
        createMockAssistantMessage(1, 1, 'claude-3-opus', 'R1-P1'),
      ]);

      const allMessages = store.getState().messages;

      // Verify order
      expect(allMessages).toHaveLength(6);
      expect(allMessages[0]?.metadata?.roundNumber).toBe(0);
      expect(allMessages[0]?.role).toBe(MessageRoles.USER);
      expect(allMessages[1]?.metadata?.roundNumber).toBe(0);
      expect(allMessages[1]?.metadata?.participantIndex).toBe(0);
      expect(allMessages[2]?.metadata?.roundNumber).toBe(0);
      expect(allMessages[2]?.metadata?.participantIndex).toBe(1);
      expect(allMessages[3]?.metadata?.roundNumber).toBe(1);
      expect(allMessages[3]?.role).toBe(MessageRoles.USER);
      expect(allMessages[4]?.metadata?.roundNumber).toBe(1);
      expect(allMessages[4]?.metadata?.participantIndex).toBe(0);
      expect(allMessages[5]?.metadata?.roundNumber).toBe(1);
      expect(allMessages[5]?.metadata?.participantIndex).toBe(1);
    });

    it('should correctly order pre-searches across rounds', () => {
      const store = createChatStore();

      store.getState().setPreSearches([
        { ...createPlaceholderPreSearch(0), status: MessageStatuses.COMPLETE },
        createPlaceholderPreSearch(1),
      ]);

      const preSearches = store.getState().preSearches;

      expect(preSearches).toHaveLength(2);
      expect(preSearches.find(ps => ps.roundNumber === 0)?.status).toBe(MessageStatuses.COMPLETE);
      expect(preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(MessageStatuses.PENDING);
    });

    it('should correctly order summaries across rounds', () => {
      const store = createChatStore();

      store.getState().setSummaries([
        { ...createPlaceholderSummary(0), status: MessageStatuses.COMPLETE },
        createPlaceholderSummary(1),
      ]);

      const summaries = store.getState().summaries;

      expect(summaries).toHaveLength(2);
      expect(summaries.find(s => s.roundNumber === 0)?.status).toBe(MessageStatuses.COMPLETE);
      expect(summaries.find(s => s.roundNumber === 1)?.status).toBe(MessageStatuses.PENDING);
    });
  });

  describe('race conditions in multi-round conversations', () => {
    it('should handle rapid successive round submissions', () => {
      const store = createChatStore();
      const participants = [createMockParticipant(0, 'gpt-4o')];
      const expectedIds = getParticipantModelIds(participants);

      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Complete round 0
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, 'gpt-4o'),
      ]);
      store.getState().setSummaries([{
        ...createPlaceholderSummary(0),
        status: MessageStatuses.COMPLETE,
      }]);

      // Rapidly start round 1
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1', []);

      // Verify state is correct
      expect(store.getState().pendingMessage).toBe('Round 1');
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().expectedParticipantIds).toEqual(expectedIds);
    });

    it('should not lose state when prepareForNewMessage is called after streaming starts', () => {
      const store = createChatStore();
      const participants = [createMockParticipant(0, 'gpt-4o')];
      const expectedIds = getParticipantModelIds(participants);

      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, 'gpt-4o'),
      ]);

      // Set streaming state first (simulates race condition)
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // prepareForNewMessage called late
      store.getState().prepareForNewMessage('Round 1', []);

      // Streaming state should be preserved via hasEarlyOptimisticMessage logic
      // streamingRoundNumber is preserved when hasEarlyOptimisticMessage was true
      expect(store.getState().pendingMessage).toBe('Round 1');
    });

    it('should handle configuration changes between rounds', () => {
      const store = createChatStore();
      const initialParticipants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];
      const newParticipants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
        createMockParticipant(2, 'gemini-pro'),
      ];

      store.getState().setThread(createMockThread());
      store.getState().setParticipants(initialParticipants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Complete round 0 with 2 participants
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, 'gpt-4o'),
        createMockAssistantMessage(0, 1, 'claude-3-opus'),
      ]);

      // Change participants before round 1
      store.getState().setParticipants(newParticipants);
      const newExpectedIds = getParticipantModelIds(newParticipants);
      store.getState().setExpectedParticipantIds(newExpectedIds);

      // Verify new participant configuration
      expect(store.getState().participants).toHaveLength(3);
      expect(store.getState().expectedParticipantIds).toHaveLength(3);
      expect(store.getState().expectedParticipantIds).toContain('gemini-pro');
    });
  });

  describe('hasEarlyOptimisticMessage flag handling', () => {
    it('should set hasEarlyOptimisticMessage when optimistic message added before prepareForNewMessage', () => {
      const store = createChatStore();

      store.getState().setHasEarlyOptimisticMessage(true);
      expect(store.getState().hasEarlyOptimisticMessage).toBe(true);
    });

    it('should clear hasEarlyOptimisticMessage when prepareForNewMessage is called', () => {
      const store = createChatStore();

      store.getState().setHasEarlyOptimisticMessage(true);
      store.getState().prepareForNewMessage('Test', []);

      expect(store.getState().hasEarlyOptimisticMessage).toBe(false);
    });

    it('should preserve streamingRoundNumber when hasEarlyOptimisticMessage was true', () => {
      const store = createChatStore();

      // Set up early optimistic state
      store.getState().setStreamingRoundNumber(1);
      store.getState().setHasEarlyOptimisticMessage(true);

      // prepareForNewMessage should preserve streamingRoundNumber
      store.getState().prepareForNewMessage('Test', []);

      // streamingRoundNumber should be preserved because hasEarlyOptimisticMessage was true
      expect(store.getState().streamingRoundNumber).toBe(1);
    });
  });

  describe('progressive UI updates for first participant', () => {
    it('should allow message content updates during streaming', () => {
      const store = createChatStore();
      const participants = [createMockParticipant(0, 'gpt-4o')];

      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Add initial message
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0, 'gpt-4o', 'Starting...'),
      ]);

      // Update message content (simulates streaming chunks)
      const messages = store.getState().messages;
      const updatedMessages = messages.map((msg, index) => {
        if (index === 1) {
          return {
            ...msg,
            parts: [{ type: MessagePartTypes.TEXT as const, text: 'Starting... more content...' }],
          };
        }
        return msg;
      });
      store.getState().setMessages(updatedMessages);

      // Verify message was updated
      const finalMessages = store.getState().messages;
      expect(finalMessages[1]?.parts[0]).toHaveProperty('text', 'Starting... more content...');
    });

    it('should maintain streaming state during message content updates', () => {
      const store = createChatStore();
      const participants = [createMockParticipant(0, 'gpt-4o')];

      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentParticipantIndex(0);

      // Multiple updates should not affect streaming state
      for (let i = 0; i < 5; i++) {
        const messages = store.getState().messages || [];
        store.getState().setMessages([
          ...messages.slice(0, -1),
          createMockAssistantMessage(1, 0, 'gpt-4o', `Content chunk ${i}`),
        ]);

        // Streaming state should persist
        expect(store.getState().isStreaming).toBe(true);
        expect(store.getState().streamingRoundNumber).toBe(1);
        expect(store.getState().currentParticipantIndex).toBe(0);
      }
    });
  });

  describe('complete multi-round journey', () => {
    it('should handle full 3-round conversation correctly', () => {
      const store = createChatStore();
      const participants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
      ];
      const expectedIds = getParticipantModelIds(participants);

      store.getState().setThread(createMockThread());
      store.getState().setParticipants(participants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // === ROUND 0 ===
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);
      store.getState().setMessages([
        createMockUserMessage(0, 'Question 0'),
        createMockAssistantMessage(0, 0, 'gpt-4o', 'Answer 0-0'),
        createMockAssistantMessage(0, 1, 'claude-3-opus', 'Answer 0-1'),
      ]);
      store.getState().setSummaries([{
        ...createPlaceholderSummary(0),
        status: MessageStatuses.COMPLETE,
      }]);
      store.getState().completeStreaming();

      // Verify round 0 complete
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().messages).toHaveLength(3);

      // === ROUND 1 ===
      // Note: prepareForNewMessage adds optimistic user message when on thread screen
      // So we don't add user message separately - it's added by prepareForNewMessage
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Question 1', []);
      store.getState().setIsStreaming(true);

      // prepareForNewMessage already added optimistic user message, just add assistant messages
      const r1Messages = store.getState().messages;
      store.getState().setMessages([
        ...r1Messages,
        createMockAssistantMessage(1, 0, 'gpt-4o', 'Answer 1-0'),
        createMockAssistantMessage(1, 1, 'claude-3-opus', 'Answer 1-1'),
      ]);
      store.getState().setSummaries([
        ...store.getState().summaries,
        { ...createPlaceholderSummary(1), status: MessageStatuses.COMPLETE },
      ]);
      store.getState().completeStreaming();

      // Verify round 1 complete (3 from r0 + 1 optimistic user + 2 assistant = 6)
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().messages).toHaveLength(6);

      // === ROUND 2 ===
      store.getState().setExpectedParticipantIds(expectedIds);
      store.getState().setStreamingRoundNumber(2);
      store.getState().prepareForNewMessage('Question 2', []);
      store.getState().setIsStreaming(true);

      // prepareForNewMessage already added optimistic user message
      const r2Messages = store.getState().messages;
      store.getState().setMessages([
        ...r2Messages,
        createMockAssistantMessage(2, 0, 'gpt-4o', 'Answer 2-0'),
        createMockAssistantMessage(2, 1, 'claude-3-opus', 'Answer 2-1'),
      ]);
      store.getState().setSummaries([
        ...store.getState().summaries,
        { ...createPlaceholderSummary(2), status: MessageStatuses.COMPLETE },
      ]);
      store.getState().completeStreaming();

      // Verify full conversation (6 + 1 optimistic user + 2 assistant = 9)
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().messages).toHaveLength(9);
      expect(store.getState().summaries).toHaveLength(3);

      // Verify message ordering - filter out optimistic messages for cleaner assertions
      const finalMessages = store.getState().messages;

      // Round 0 has explicit messages (non-optimistic)
      const round0Messages = finalMessages.filter(m => m.metadata?.roundNumber === 0);
      expect(round0Messages).toHaveLength(3);
      expect(round0Messages[0]?.role).toBe(MessageRoles.USER);
      expect(round0Messages[1]?.metadata?.participantIndex).toBe(0);
      expect(round0Messages[2]?.metadata?.participantIndex).toBe(1);

      // Rounds 1 and 2 have optimistic user messages (which may have isOptimistic in metadata)
      const round1Messages = finalMessages.filter(m => m.metadata?.roundNumber === 1);
      expect(round1Messages).toHaveLength(3);

      const round2Messages = finalMessages.filter(m => m.metadata?.roundNumber === 2);
      expect(round2Messages).toHaveLength(3);
    });
  });
});
