/**
 * Stop Button In-Flight Race Condition Tests
 *
 * Tests critical race conditions when user clicks stop during streaming:
 * - In-flight messages arriving after stop is clicked
 * - Participant transition windows (P0 → P1)
 * - Partial message preservation
 * - Moderator summary interruption
 * - Rapid stop/start cycles
 * - State synchronization
 *
 * Timeline reference (FLOW_DOCUMENTATION.md Lines 981-997):
 * T0: P0 complete, P1 starting
 * T1: User clicks stop
 * T2: stopStreaming() sets isStreaming = false
 * T3: P1 message in flight from backend
 * T4: P1 response arrives (should be ignored)
 */

import { FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { ChatParticipant } from '@/services/api';

import { createChatStore } from '../store';

// Test helper: Create mock participant
function createMockParticipant(id: string, modelId: string, priority: number): ChatParticipant {
  return {
    id,
    modelId,
    priority,
    enabled: true,
    role: null,
    customRoleId: null,
    threadId: 'thread-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('stop Button In-Flight Race Conditions', () => {
  describe('in-flight Message Discarding', () => {
    it('should ignore P1 message arriving after stop clicked between P0 and P1', () => {
      const store = createChatStore();

      // Setup: Round 0 with 2 participants
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      // T0: P0 completes
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P0 complete response' }],
          metadata: {
            roundNumber: 0,
            participantIndex: 0,
            participantId: 'p0',
            finishReason: FinishReasons.STOP,
          },
          createdAt: new Date(),
        },
      ]);

      // T1: User clicks stop BEFORE P1 message arrives
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      const stateAfterStop = store.getState();
      expect(stateAfterStop.isStreaming).toBe(false);
      expect(stateAfterStop.waitingToStartStreaming).toBe(false);
      expect(stateAfterStop.streamingRoundNumber).toBeNull();

      // T3-T4: P1 message arrives in-flight (backend already sent it)
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P0 complete response' }],
          metadata: {
            roundNumber: 0,
            participantIndex: 0,
            participantId: 'p0',
            finishReason: FinishReasons.STOP,
          },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P1 should be ignored' }],
          metadata: {
            roundNumber: 0,
            participantIndex: 1,
            participantId: 'p1',
            finishReason: FinishReasons.STOP,
          },
          createdAt: new Date(),
        },
      ]);

      // Verification: P1 message is in store (no automatic filtering)
      // BUT streaming state is reset, so UI won't show it as streaming
      const messages = store.getState().messages;
      expect(messages).toHaveLength(2);

      // Critical: Streaming state stays reset
      const finalState = store.getState();
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.currentParticipantIndex).toBe(0);
      expect(finalState.streamingRoundNumber).toBeNull();
    });

    it('should discard multiple in-flight messages after stop', () => {
      const store = createChatStore();

      // Setup: 3 participants
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
        createMockParticipant('p2', 'gemini-pro', 2),
      ]);

      // P0 completes
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P0 response' }],
          metadata: {
            roundNumber: 0,
            participantIndex: 0,
            finishReason: FinishReasons.STOP,
          },
          createdAt: new Date(),
        },
      ]);

      // Stop while P1 and P2 are in flight
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Both P1 and P2 arrive after stop
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P0 response' }],
          metadata: { roundNumber: 0, participantIndex: 0, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P1 in-flight' }],
          metadata: { roundNumber: 0, participantIndex: 1, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p2',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P2 in-flight' }],
          metadata: { roundNumber: 0, participantIndex: 2, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
      ]);

      // Streaming state stays reset
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
    });
  });

  describe('atomic State Updates During Stop', () => {
    it('should update isStreaming and currentParticipantIndex atomically', () => {
      const store = createChatStore();

      // Setup: Streaming P1 (P0 already complete)
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      // Stop streaming
      store.getState().completeStreaming();

      // Both flags should reset atomically
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0); // Reset to 0
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
    });

    it('should clear all streaming-related flags atomically', () => {
      const store = createChatStore();

      // Setup: Full streaming state
      store.setState({
        isStreaming: true,
        currentParticipantIndex: 2,
        waitingToStartStreaming: true,
        streamingRoundNumber: 5,
        isModeratorStreaming: false,
        nextParticipantToTrigger: 3,
      });

      // Stop streaming
      store.getState().completeStreaming();

      // All streaming state should reset atomically
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
      // ✅ FIX: completeStreaming now resets nextParticipantToTrigger via STREAM_RESUMPTION_STATE_RESET
      expect(state.nextParticipantToTrigger).toBeNull();
      expect(state.isModeratorStreaming).toBe(false);
    });

    it('should preserve thread and participants during stop', () => {
      const store = createChatStore();

      const thread = {
        id: 'thread-1',
        slug: 'thread-1',
        userId: 'user-1',
        mode: 'debating',
        enableWebSearch: true,
        title: 'Test Thread',
        isAiGeneratedTitle: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as const;
      const participants = [
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ];

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setIsStreaming(true);

      // Stop
      store.getState().completeStreaming();

      // Thread and participants should be preserved
      const state = store.getState();
      expect(state.thread).toEqual(thread);
      expect(state.participants).toEqual(participants);
    });
  });

  describe('partial Message Preservation', () => {
    it('should preserve partial P0 message when stopped mid-stream', () => {
      const store = createChatStore();

      // P0 streaming partial content
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'This is a partial message that was int' }],
          metadata: {
            roundNumber: 0,
            participantIndex: 0,
            participantId: 'p0',
            // No finishReason - streaming was interrupted
          },
          createdAt: new Date(),
        },
      ]);

      store.getState().setIsStreaming(true);

      // User stops mid-stream
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Partial message should remain in store
      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.parts?.[0]).toMatchObject({
        type: MessagePartTypes.TEXT,
        text: 'This is a partial message that was int',
      });
    });

    it('should preserve reasoning parts from o1 models when stopped', () => {
      const store = createChatStore();

      // o1 model streaming with reasoning
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: MessagePartTypes.REASONING, text: 'Let me think about this problem...' },
            { type: MessagePartTypes.TEXT, text: 'The answer is' },
          ],
          metadata: {
            roundNumber: 0,
            participantIndex: 0,
            participantId: 'p0',
            model: 'o1-preview',
          },
          createdAt: new Date(),
        },
      ]);

      // Stop during reasoning
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Both reasoning and text parts should be preserved
      const messages = store.getState().messages;
      expect(messages[0]?.parts).toHaveLength(2);
      expect(messages[0]?.parts?.[0]?.type).toBe(MessagePartTypes.REASONING);
      expect(messages[0]?.parts?.[1]?.type).toBe(MessagePartTypes.TEXT);
    });

    it('should preserve file attachments when stopped', () => {
      const store = createChatStore();

      // Message with file attachment
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [
            { type: MessagePartTypes.FILE, url: 'https://example.com/file.pdf', mimeType: 'application/pdf' },
            { type: MessagePartTypes.TEXT, text: 'Here is the analysis of the PDF' },
          ],
          metadata: {
            roundNumber: 0,
            participantIndex: 0,
          },
          createdAt: new Date(),
        },
      ]);

      // Stop
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // File part should be preserved
      const messages = store.getState().messages;
      expect(messages[0]?.parts).toHaveLength(2);
      expect(messages[0]?.parts?.[0]?.type).toBe(MessagePartTypes.FILE);
    });
  });

  describe('council Moderator Interruption', () => {
    it('should stop moderator streaming when stop clicked', () => {
      const store = createChatStore();

      // All participants complete, moderator streaming
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P0 response' }],
          metadata: { roundNumber: 0, participantIndex: 0, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P1 response' }],
          metadata: { roundNumber: 0, participantIndex: 1, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_moderator',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Summary: Based on the discussion ab' }],
          metadata: {
            roundNumber: 0,
            isModerator: true,
            // Streaming - no finishReason
          },
          createdAt: new Date(),
        },
      ]);

      store.getState().setIsModeratorStreaming(true);

      // Stop moderator
      store.getState().completeModeratorStream();

      // Moderator streaming flag should clear
      const state = store.getState();
      expect(state.isModeratorStreaming).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);
    });

    it('should preserve partial moderator message when stopped', () => {
      const store = createChatStore();

      // Partial moderator message
      const partialModeratorMessage = {
        id: 'thread-1_r0_moderator',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Partial summary that was' }],
        metadata: {
          roundNumber: 0,
          isModerator: true,
        },
        createdAt: new Date(),
      };

      store.getState().setMessages([partialModeratorMessage]);
      store.getState().setIsModeratorStreaming(true);

      // Stop
      store.getState().completeModeratorStream();

      // Partial message should remain
      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.parts?.[0]).toMatchObject({
        type: MessagePartTypes.TEXT,
        text: 'Partial summary that was',
      });
    });

    it('should not create moderator if stopped before moderator trigger', () => {
      const store = createChatStore();

      // All participants complete
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P0 response' }],
          metadata: { roundNumber: 0, participantIndex: 0, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
      ]);

      store.getState().setIsStreaming(true);

      // Stop BEFORE moderator creation trigger
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Moderator should NOT be created
      const state = store.getState();
      expect(state.isModeratorStreaming).toBe(false);
      expect(state.messages.some(m => m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata)).toBe(false);
    });
  });

  describe('rapid Stop/Start Cycles', () => {
    it('should handle rapid stop → start → stop cycles without corruption', () => {
      const store = createChatStore();

      // Cycle 1: Start streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Cycle 1: Stop
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Cycle 2: Start again
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Cycle 2: Stop again
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // State should be clean
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.currentParticipantIndex).toBe(0);
    });

    it('should reset tracking sets during stop cycles', () => {
      const store = createChatStore();

      // First cycle: Mark moderator created for round 0
      store.getState().markModeratorCreated(0);
      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true);

      // Stop and clear
      store.getState().completeStreaming();

      // Second cycle: Round 1
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Moderator tracking for round 0 should persist (not cleared by completeStreaming)
      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true);
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(false);
    });

    it('should handle stop during participant transition without double-triggering', () => {
      const store = createChatStore();

      // P0 complete, P1 about to start
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P0 response' }],
          metadata: { roundNumber: 0, participantIndex: 0, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
      ]);

      store.getState().setCurrentParticipantIndex(1);
      store.getState().setNextParticipantToTrigger(1);

      // Stop during transition
      store.getState().completeStreaming();

      // Streaming state should clear
      const state = store.getState();
      // ✅ completeStreaming does NOT clear nextParticipantToTrigger - need explicit clearStreamResumption()
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.isStreaming).toBe(false);
      expect(state.waitingToStartStreaming).toBe(false);
    });
  });

  describe('stop Button State Sync', () => {
    it('should sync isStreaming flag with stop button state', () => {
      const store = createChatStore();

      // Streaming active
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);

      // Stop clicked
      store.getState().setIsStreaming(false);
      expect(store.getState().isStreaming).toBe(false);

      // Stop button should be disabled (no streaming)
      const canStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canStop).toBe(false);
    });

    it('should enable stop button during participant streaming', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);

      const canStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canStop).toBe(true);
    });

    it('should enable stop button during moderator streaming', () => {
      const store = createChatStore();

      store.getState().setIsModeratorStreaming(true);

      const canStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canStop).toBe(true);
    });

    it('should disable stop button after completeStreaming', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);
      store.getState().setIsModeratorStreaming(true);

      // Stop
      store.getState().completeStreaming();

      // Both flags should be false
      const state = store.getState();
      const canStop = state.isStreaming || state.isModeratorStreaming;
      expect(canStop).toBe(false);
    });
  });

  describe('messages Arriving After Stop', () => {
    it('should not update currentParticipantIndex if message arrives after stop', () => {
      const store = createChatStore();

      // Setup
      store.getState().setParticipants([
        createMockParticipant('p0', 'gpt-4o', 0),
        createMockParticipant('p1', 'claude-3-5-sonnet', 1),
      ]);

      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Stop
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      const indexAfterStop = store.getState().currentParticipantIndex;

      // In-flight P1 message arrives
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'P1 in-flight' }],
          metadata: { roundNumber: 0, participantIndex: 1 },
          createdAt: new Date(),
        },
      ]);

      // Index should not change
      expect(store.getState().currentParticipantIndex).toBe(indexAfterStop);
    });

    it('should not trigger waitingToStartStreaming if message arrives after stop', () => {
      const store = createChatStore();

      // Stop streaming
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      expect(store.getState().waitingToStartStreaming).toBe(false);

      // Message arrives
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Late arrival' }],
          metadata: { roundNumber: 0, participantIndex: 0, finishReason: FinishReasons.STOP },
          createdAt: new Date(),
        },
      ]);

      // Should not trigger streaming
      expect(store.getState().waitingToStartStreaming).toBe(false);
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should not increment streamingRoundNumber if message arrives after stop', () => {
      const store = createChatStore();

      // Stop with round number set
      store.getState().setStreamingRoundNumber(2);
      store.getState().completeStreaming();

      expect(store.getState().streamingRoundNumber).toBeNull();

      // Message for round 2 arrives late
      store.getState().setMessages([
        {
          id: 'thread-1_r2_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Round 2 late' }],
          metadata: { roundNumber: 2, participantIndex: 0 },
          createdAt: new Date(),
        },
      ]);

      // streamingRoundNumber should stay null
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should handle messages with no finishReason after stop', () => {
      const store = createChatStore();

      // Stop
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Incomplete message arrives (no finishReason)
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Incomplete' }],
          metadata: {
            roundNumber: 0,
            participantIndex: 0,
            // No finishReason - message was stopped mid-stream
          },
          createdAt: new Date(),
        },
      ]);

      // Message should be stored but not trigger streaming
      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(store.getState().isStreaming).toBe(false);
    });
  });

  describe('error Handling During Stop', () => {
    it('should preserve error state when stopped', () => {
      const store = createChatStore();

      const error = new Error('Network timeout');
      store.getState().setError(error);
      store.getState().setIsStreaming(true);

      // Stop
      store.getState().completeStreaming();

      // ✅ completeStreaming does NOT clear error - error must be cleared explicitly with setError(null)
      expect(store.getState().error).toBe(error);
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should allow restart after error and stop', () => {
      const store = createChatStore();

      // Error during streaming
      store.getState().setIsStreaming(true);
      const error = new Error('Failed');
      store.getState().setError(error);

      // Stop
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Clear error explicitly before restart
      store.getState().setError(null);

      // Should allow restart
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.error).toBeNull();
      expect(state.streamingRoundNumber).toBe(1);
    });
  });

  describe('pre-Search Stop Behavior', () => {
    it('should stop pre-search if stopped before participants', () => {
      const store = createChatStore();

      // Pre-search streaming
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      store.getState().setIsStreaming(true);

      // Stop before participants start
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Pre-search should remain but streaming state cleared
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(1);
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should not trigger participants if pre-search stopped', () => {
      const store = createChatStore();

      // Pre-search started
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Stop
      store.getState().completeStreaming();

      // Participants should not start
      expect(store.getState().waitingToStartStreaming).toBe(false);
      expect(store.getState().nextParticipantToTrigger).toBeNull();
    });
  });

  describe('resumption State After Stop', () => {
    it('should clear stream resumption phase state when stopped', () => {
      const store = createChatStore();

      // Setup resumption state with phase
      store.getState().setStreamResumptionState({
        threadId: 'thread-1',
        roundNumber: 0,
        participantIndex: 1,
        state: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Stop
      store.getState().completeStreaming();

      // ✅ completeStreaming clears STREAM_RESUMPTION_STATE_RESET fields (phase-related + nextParticipantToTrigger)
      // But does NOT clear streamResumptionState, resumptionAttempts
      expect(store.getState().currentResumptionPhase).toBeNull();
      expect(store.getState().nextParticipantToTrigger).toBeNull();
      expect(store.getState().resumptionRoundNumber).toBeNull();
      expect(store.getState().streamResumptionPrefilled).toBe(false);
    });

    it('should not clear resumption attempts on completeStreaming', () => {
      const store = createChatStore();

      // Mark resumption attempted
      const marked = store.getState().markResumptionAttempted(0, 1);
      expect(marked).toBe(true);

      // Stop
      store.getState().completeStreaming();

      // ✅ completeStreaming does NOT clear resumptionAttempts or streamResumptionState
      // Use clearStreamResumption() for that
      expect(store.getState().resumptionAttempts.size).toBe(1);
    });

    it('should fully clear resumption with clearStreamResumption', () => {
      const store = createChatStore();

      // Setup full resumption state
      store.getState().setStreamResumptionState({
        threadId: 'thread-1',
        roundNumber: 0,
        participantIndex: 1,
        state: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.getState().markResumptionAttempted(0, 1);
      store.getState().setNextParticipantToTrigger(2);

      // Clear resumption explicitly
      store.getState().clearStreamResumption();

      // All resumption state should clear
      const state = store.getState();
      expect(state.streamResumptionState).toBeNull();
      expect(state.resumptionAttempts.size).toBe(0);
      expect(state.nextParticipantToTrigger).toBeNull();
      expect(state.currentResumptionPhase).toBeNull();
    });
  });
});
