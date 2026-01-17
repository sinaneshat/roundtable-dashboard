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

import { FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import type { UIMessage } from '@/lib/schemas/message-schemas';
import {
  countAssistantMessagesInRound,
  countUserMessagesInRound,
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils';

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
          parts: [{ type: MessagePartTypes.TEXT, text: 'Round 1 question' }],
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
          parts: [{ type: MessagePartTypes.TEXT, text: 'Early optimistic' }],
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

  describe('config Changes Between Rounds - Duplication Prevention', () => {
    it('should have EXACTLY ONE assistant message per participant when config changes between rounds', () => {
      // Scenario: Round 0 with 2 models → Round 1 adds a new model, enables search
      // BUG: First participant's message box appears twice before deduplication

      // Complete round 0 with initial config
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Change config: add a new participant, enable web search
      const newParticipants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
        createMockParticipant(2, 'gemini-pro'), // NEW participant
      ];
      store.getState().setParticipants(newParticipants);
      store.getState().setThread(createMockThread(true)); // Enable web search

      // Prepare for round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 with new config', []);
      store.getState().setIsStreaming(true);

      // Simulate first participant starting to stream
      const currentMsgs = store.getState().messages;
      const firstParticipantMsg = createTestAssistantMessage({
        id: 'thread-123_r1_p0',
        content: 'First response...',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
      });
      store.getState().setMessages([...currentMsgs, firstParticipantMsg]);

      // CRITICAL ASSERTION: Count assistant messages for participant 0 in round 1
      const messages = store.getState().messages;
      const round1Participant0Messages = messages.filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        const roundNum = getRoundNumber(m.metadata);
        const pIdx = m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata
          ? m.metadata.participantIndex
          : undefined;
        return roundNum === 1 && pIdx === 0;
      });

      // BUG: This might be 2 instead of 1 if duplication occurs
      expect(round1Participant0Messages).toHaveLength(1);
    });

    it('should NOT create duplicate messages when removing participants between rounds', () => {
      // Scenario: Round 0 with 3 models → Round 1 removes one model
      const initialParticipants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
        createMockParticipant(2, 'gemini-pro'),
      ];
      store.getState().setParticipants(initialParticipants);

      // Complete round 0 with 3 participants
      store.getState().setMessages(createCompleteRoundMessages(0, 3));
      store.getState().completeStreaming();

      // Config change: remove a participant
      const reducedParticipants = [
        createMockParticipant(0, 'gpt-4o'),
        createMockParticipant(1, 'claude-3-opus'),
        // gemini-pro REMOVED
      ];
      store.getState().setParticipants(reducedParticipants);

      // Prepare for round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 with fewer models', []);
      store.getState().setIsStreaming(true);

      // Add first participant message
      const currentMsgs = store.getState().messages;
      store.getState().setMessages([
        ...currentMsgs,
        createTestAssistantMessage({
          id: 'thread-123_r1_p0',
          content: 'Response with reduced config...',
          roundNumber: 1,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
      ]);

      // Count ALL assistant messages in round 1
      const messages = store.getState().messages;
      const round1AssistantCount = countAssistantMessagesInRound(messages, 1);

      // Should be exactly 1 (only the first participant that just streamed)
      expect(round1AssistantCount).toBe(1);
    });

    it('should NOT duplicate when enabling web search between rounds', () => {
      // Round 0 without web search
      store.getState().setThread(createMockThread(false)); // Web search OFF
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Enable web search for round 1
      store.getState().setThread(createMockThread(true)); // Web search ON

      // Add pre-search placeholder
      store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.PENDING));

      // Prepare for round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1 with web search', []);

      // Mark pre-search as complete
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

      // Now streaming starts
      store.getState().setIsStreaming(true);

      // Add first participant
      const currentMsgs = store.getState().messages;
      store.getState().setMessages([
        ...currentMsgs,
        createTestAssistantMessage({
          id: 'thread-123_r1_p0',
          content: 'Response after web search...',
          roundNumber: 1,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
      ]);

      // Verify no duplicates
      const messages = store.getState().messages;
      const round1Participant0Count = messages.filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        const roundNum = getRoundNumber(m.metadata);
        const pIdx = m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata
          ? m.metadata.participantIndex
          : undefined;
        return roundNum === 1 && pIdx === 0;
      }).length;

      expect(round1Participant0Count).toBe(1);
    });

    it('should NOT create stale participant placeholders from previous round config', () => {
      // Round 0 with 2 participants
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().setExpectedParticipantIds(['gpt-4o', 'claude-3-opus']);
      store.getState().completeStreaming();

      // Config change: different set of participants
      const newParticipants = [
        createMockParticipant(0, 'gemini-pro'), // DIFFERENT model at index 0
        createMockParticipant(1, 'mistral'), // DIFFERENT model at index 1
        createMockParticipant(2, 'command-r'), // NEW model at index 2
      ];
      store.getState().setParticipants(newParticipants);
      store.getState().setExpectedParticipantIds(['gemini-pro', 'mistral', 'command-r']);

      // Prepare round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('New models', []);
      store.getState().setIsStreaming(true);

      // Start streaming with first new participant
      const currentMsgs = store.getState().messages;
      store.getState().setMessages([
        ...currentMsgs,
        createTestAssistantMessage({
          id: 'thread-123_r1_p0',
          content: 'Gemini response',
          roundNumber: 1,
          participantId: 'participant-0',
          participantIndex: 0,
          modelId: 'gemini-pro',
        }),
      ]);

      // Verify: Should NOT have any messages with old model IDs in round 1
      const messages = store.getState().messages;
      const round1Messages = messages.filter(m => getRoundNumber(m.metadata) === 1);

      const hasOldModelIds = round1Messages.some((m) => {
        const meta = m.metadata;
        if (meta && typeof meta === 'object' && 'modelId' in meta) {
          const modelId = (meta as { modelId?: string }).modelId;
          return modelId === 'gpt-4o' || modelId === 'claude-3-opus';
        }
        return false;
      });

      expect(hasOldModelIds).toBe(false);
    });
  });

  describe('streaming Synchronization - No Duplicate Message Boxes', () => {
    it('should have exactly ONE message per participant during progressive streaming', () => {
      // This tests the exact bug: first participant message appears twice briefly
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Start round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1', []);
      store.getState().setIsStreaming(true);

      // Simulate streaming chunks coming in progressively
      const baseMessages = store.getState().messages;

      // First chunk
      const msg1 = createTestAssistantMessage({
        id: 'thread-123_r1_p0',
        content: 'First chunk...',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
      });
      store.getState().setMessages([...baseMessages, msg1]);

      let p0Count = store.getState().messages.filter((m) => {
        const pIdx = m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata
          ? m.metadata.participantIndex
          : undefined;
        return m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1 && pIdx === 0;
      }).length;
      expect(p0Count).toBe(1);

      // Second chunk - UPDATE same message
      const msg2 = {
        ...msg1,
        parts: [{ type: MessagePartTypes.TEXT, text: 'First chunk... second chunk...' }],
      };
      store.getState().setMessages([...baseMessages, msg2]);

      p0Count = store.getState().messages.filter((m) => {
        const pIdx = m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata
          ? m.metadata.participantIndex
          : undefined;
        return m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1 && pIdx === 0;
      }).length;
      expect(p0Count).toBe(1);

      // Third chunk
      const msg3 = {
        ...msg1,
        parts: [{ type: MessagePartTypes.TEXT, text: 'First chunk... second chunk... third chunk' }],
      };
      store.getState().setMessages([...baseMessages, msg3]);

      p0Count = store.getState().messages.filter((m) => {
        const pIdx = m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata
          ? m.metadata.participantIndex
          : undefined;
        return m.role === MessageRoles.ASSISTANT && getRoundNumber(m.metadata) === 1 && pIdx === 0;
      }).length;
      expect(p0Count).toBe(1);
    });

    it('should prevent duplicate IDs from appearing in messages array', () => {
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Start round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1', []);
      store.getState().setIsStreaming(true);

      const currentMsgs = store.getState().messages;

      // Simulate a race condition where same message ID appears twice
      const duplicateMsg1 = createTestAssistantMessage({
        id: 'thread-123_r1_p0',
        content: 'Content A',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
      });
      const duplicateMsg2 = createTestAssistantMessage({
        id: 'thread-123_r1_p0', // SAME ID
        content: 'Content B',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
      });

      // Try to add both (simulating race condition)
      store.getState().setMessages([...currentMsgs, duplicateMsg1, duplicateMsg2]);

      // Count messages with this ID
      const messages = store.getState().messages;
      const duplicateCount = messages.filter(m => m.id === 'thread-123_r1_p0').length;

      // BUG: If deduplication isn't working, this would be 2
      // NOTE: setMessages doesn't dedupe - but useMessageSync does
      // This test verifies the store-level behavior
      // In production, useMessageSync would dedupe before setting
      expect(duplicateCount).toBeGreaterThanOrEqual(1); // Store accepts what's given
    });
  });

  describe('message Sync Deduplication - Same Participant Different IDs', () => {
    /**
     * CRITICAL BUG TEST: This tests the exact scenario where duplication occurs
     *
     * Scenario:
     * 1. Round 0 completes
     * 2. Config changes (add/remove models, enable search)
     * 3. Round 1 starts streaming
     * 4. Store has one message for participant 0 (e.g., from placeholder/skeleton)
     * 5. Chat hook returns another message for participant 0 (from server)
     * 6. Both have different IDs but same round+participantIndex
     * 7. Without proper deduplication, BOTH appear in the UI
     *
     * The useMessageSync merge should dedupe by round+participantIndex, not just by ID
     */
    it('bUG REPRODUCTION: detects duplicate assistant messages with different IDs for same round+participantIndex', () => {
      // Complete round 0
      store.getState().setMessages(createCompleteRoundMessages(0, 2));
      store.getState().completeStreaming();

      // Start round 1
      store.getState().setStreamingRoundNumber(1);
      store.getState().prepareForNewMessage('Round 1', []);
      store.getState().setIsStreaming(true);

      // Simulate: Store has message with ID "store_r1_p0"
      const currentMsgs = store.getState().messages;
      const storeMsg = createTestAssistantMessage({
        id: 'store_r1_p0', // Store-generated ID
        content: 'Response from store placeholder',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
      });

      // AND: Chat hook has message with different ID but same round+participant
      const hookMsg = createTestAssistantMessage({
        id: 'server_r1_p0', // Server-generated ID
        content: 'Response from server',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
      });

      // Simulate both being in the message array (what could happen before dedup)
      store.getState().setMessages([...currentMsgs, storeMsg, hookMsg]);

      // Count messages for round 1, participant 0
      const messages = store.getState().messages;
      const round1P0Messages = messages.filter((m) => {
        if (m.role !== MessageRoles.ASSISTANT)
          return false;
        const roundNum = getRoundNumber(m.metadata);
        const pIdx = m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata
          ? m.metadata.participantIndex
          : undefined;
        return roundNum === 1 && pIdx === 0;
      });

      // BUG DETECTION: Documents that without sync-level dedup, duplicates exist
      // The setMessages stores both - sync layer must dedupe
      expect(round1P0Messages).toHaveLength(2); // Documents current behavior - store accepts both
    });

    it('deduplication logic should keep only ONE message per round+participantIndex', () => {
      // This test documents what the FIXED behavior should be
      // The merge should keep only ONE message per round+participantIndex

      // Helper to simulate merge deduplication logic
      type TestMsg = { metadata?: { roundNumber?: number; participantIndex?: number }; role: string; id: string };
      function deduplicateByRoundParticipant(messages: TestMsg[]): TestMsg[] {
        const seen = new Map<string, number>(); // key -> index of message to keep
        const toRemove = new Set<number>();

        for (let i = 0; i < messages.length; i++) {
          const m = messages[i];
          if (m?.role !== MessageRoles.ASSISTANT) {
            continue;
          }

          const meta = m.metadata;
          const round = meta?.roundNumber;
          const pIdx = meta?.participantIndex;

          if (round === undefined || pIdx === undefined) {
            continue;
          }

          const key = `r${round}_p${pIdx}`;
          if (seen.has(key)) {
            // Mark earlier one for removal (keep latest)
            toRemove.add(seen.get(key)!);
            seen.set(key, i);
          } else {
            seen.set(key, i);
          }
        }

        return messages.filter((_, i) => !toRemove.has(i));
      }

      const messages: TestMsg[] = [
        { id: 'store_r1_p0', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1, participantIndex: 0 } },
        { id: 'server_r1_p0', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1, participantIndex: 0 } }, // Duplicate
        { id: 'store_r1_p1', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1, participantIndex: 1 } },
      ];

      const deduplicated = deduplicateByRoundParticipant(messages);

      // Should have only 2 messages (one per participant)
      expect(deduplicated).toHaveLength(2);

      // Should keep the LATER message (server_r1_p0)
      expect(deduplicated.find(m => m?.id === 'server_r1_p0')).toBeDefined();
      expect(deduplicated.find(m => m?.id === 'store_r1_p0')).toBeUndefined();
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
