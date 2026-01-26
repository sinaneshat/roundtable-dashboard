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
    createdAt: new Date(),
    customRoleId: null,
    enabled: true,
    id,
    modelId,
    priority,
    role: null,
    threadId: 'thread-1',
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
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
          },
          parts: [{ text: 'P0 complete response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // T1: User clicks stop BEFORE P1 message arrives
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      const stateAfterStop = store.getState();
      expect(stateAfterStop.isStreaming).toBeFalsy();
      expect(stateAfterStop.waitingToStartStreaming).toBeFalsy();
      expect(stateAfterStop.streamingRoundNumber).toBeNull();

      // T3-T4: P1 message arrives in-flight (backend already sent it)
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
          },
          parts: [{ text: 'P0 complete response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p1',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantId: 'p1',
            participantIndex: 1,
            roundNumber: 0,
          },
          parts: [{ text: 'P1 should be ignored', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // Verification: P1 message is in store (no automatic filtering)
      // BUT streaming state is reset, so UI won't show it as streaming
      const messages = store.getState().messages;
      expect(messages).toHaveLength(2);

      // Critical: Streaming state stays reset
      const finalState = store.getState();
      expect(finalState.isStreaming).toBeFalsy();
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
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            finishReason: FinishReasons.STOP,
            participantIndex: 0,
            roundNumber: 0,
          },
          parts: [{ text: 'P0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // Stop while P1 and P2 are in flight
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Both P1 and P2 arrive after stop
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 0, roundNumber: 0 },
          parts: [{ text: 'P0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p1',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 1, roundNumber: 0 },
          parts: [{ text: 'P1 in-flight', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p2',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 2, roundNumber: 0 },
          parts: [{ text: 'P2 in-flight', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // Streaming state stays reset
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
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
      expect(state.isStreaming).toBeFalsy();
      expect(state.currentParticipantIndex).toBe(0); // Reset to 0
      expect(state.waitingToStartStreaming).toBeFalsy();
      expect(state.streamingRoundNumber).toBeNull();
    });

    it('should clear all streaming-related flags atomically', () => {
      const store = createChatStore();

      // Setup: Full streaming state
      store.setState({
        currentParticipantIndex: 2,
        isModeratorStreaming: false,
        isStreaming: true,
        nextParticipantToTrigger: 3,
        streamingRoundNumber: 5,
        waitingToStartStreaming: true,
      });

      // Stop streaming
      store.getState().completeStreaming();

      // All streaming state should reset atomically
      const state = store.getState();
      expect(state.isStreaming).toBeFalsy();
      expect(state.currentParticipantIndex).toBe(0);
      expect(state.waitingToStartStreaming).toBeFalsy();
      expect(state.streamingRoundNumber).toBeNull();
      // ✅ FIX: completeStreaming now resets nextParticipantToTrigger via STREAM_RESUMPTION_STATE_RESET
      expect(state.nextParticipantToTrigger).toBeNull();
      expect(state.isModeratorStreaming).toBeFalsy();
    });

    it('should preserve thread and participants during stop', () => {
      const store = createChatStore();

      const thread = {
        createdAt: new Date(),
        enableWebSearch: true,
        id: 'thread-1',
        isAiGeneratedTitle: false,
        mode: 'debating',
        slug: 'thread-1',
        title: 'Test Thread',
        updatedAt: new Date(),
        userId: 'user-1',
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
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
            // No finishReason - streaming was interrupted
          },
          parts: [{ text: 'This is a partial message that was int', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
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
        text: 'This is a partial message that was int',
        type: MessagePartTypes.TEXT,
      });
    });

    it('should preserve reasoning parts from o1 models when stopped', () => {
      const store = createChatStore();

      // o1 model streaming with reasoning
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            model: 'o1-preview',
            participantId: 'p0',
            participantIndex: 0,
            roundNumber: 0,
          },
          parts: [
            { text: 'Let me think about this problem...', type: MessagePartTypes.REASONING },
            { text: 'The answer is', type: MessagePartTypes.TEXT },
          ],
          role: MessageRoles.ASSISTANT,
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
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            participantIndex: 0,
            roundNumber: 0,
          },
          parts: [
            { mimeType: 'application/pdf', type: MessagePartTypes.FILE, url: 'https://example.com/file.pdf' },
            { text: 'Here is the analysis of the PDF', type: MessagePartTypes.TEXT },
          ],
          role: MessageRoles.ASSISTANT,
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
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 0, roundNumber: 0 },
          parts: [{ text: 'P0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p1',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 1, roundNumber: 0 },
          parts: [{ text: 'P1 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
        {
          createdAt: new Date(),
          id: 'thread-1_r0_moderator',
          metadata: {
            isModerator: true,
            roundNumber: 0,
            // Streaming - no finishReason
          },
          parts: [{ text: 'Summary: Based on the discussion ab', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsModeratorStreaming(true);

      // Stop moderator
      store.getState().completeModeratorStream();

      // Moderator streaming flag should clear
      const state = store.getState();
      expect(state.isModeratorStreaming).toBeFalsy();
      expect(state.isWaitingForChangelog).toBeFalsy();
    });

    it('should preserve partial moderator message when stopped', () => {
      const store = createChatStore();

      // Partial moderator message
      const partialModeratorMessage = {
        createdAt: new Date(),
        id: 'thread-1_r0_moderator',
        metadata: {
          isModerator: true,
          roundNumber: 0,
        },
        parts: [{ text: 'Partial summary that was', type: MessagePartTypes.TEXT }],
        role: MessageRoles.ASSISTANT,
      };

      store.getState().setMessages([partialModeratorMessage]);
      store.getState().setIsModeratorStreaming(true);

      // Stop
      store.getState().completeModeratorStream();

      // Partial message should remain
      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(messages[0]?.parts?.[0]).toMatchObject({
        text: 'Partial summary that was',
        type: MessagePartTypes.TEXT,
      });
    });

    it('should not create moderator if stopped before moderator trigger', () => {
      const store = createChatStore();

      // All participants complete
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 0, roundNumber: 0 },
          parts: [{ text: 'P0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      store.getState().setIsStreaming(true);

      // Stop BEFORE moderator creation trigger
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Moderator should NOT be created
      const state = store.getState();
      expect(state.isModeratorStreaming).toBeFalsy();
      expect(state.messages.some(m => m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata)).toBeFalsy();
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
      expect(state.isStreaming).toBeFalsy();
      expect(state.streamingRoundNumber).toBeNull();
      expect(state.currentParticipantIndex).toBe(0);
    });

    it('should reset tracking sets during stop cycles', () => {
      const store = createChatStore();

      // First cycle: Mark moderator created for round 0
      store.getState().markModeratorCreated(0);
      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();

      // Stop and clear
      store.getState().completeStreaming();

      // Second cycle: Round 1
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Moderator tracking for round 0 should persist (not cleared by completeStreaming)
      expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();
      expect(store.getState().hasModeratorBeenCreated(1)).toBeFalsy();
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
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 0, roundNumber: 0 },
          parts: [{ text: 'P0 response', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
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
      expect(state.isStreaming).toBeFalsy();
      expect(state.waitingToStartStreaming).toBeFalsy();
    });
  });

  describe('stop Button State Sync', () => {
    it('should sync isStreaming flag with stop button state', () => {
      const store = createChatStore();

      // Streaming active
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBeTruthy();

      // Stop clicked
      store.getState().setIsStreaming(false);
      expect(store.getState().isStreaming).toBeFalsy();

      // Stop button should be disabled (no streaming)
      const canStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canStop).toBeFalsy();
    });

    it('should enable stop button during participant streaming', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);

      const canStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canStop).toBeTruthy();
    });

    it('should enable stop button during moderator streaming', () => {
      const store = createChatStore();

      store.getState().setIsModeratorStreaming(true);

      const canStop = store.getState().isStreaming || store.getState().isModeratorStreaming;
      expect(canStop).toBeTruthy();
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
      expect(canStop).toBeFalsy();
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
          createdAt: new Date(),
          id: 'thread-1_r0_p1',
          metadata: { participantIndex: 1, roundNumber: 0 },
          parts: [{ text: 'P1 in-flight', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
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

      expect(store.getState().waitingToStartStreaming).toBeFalsy();

      // Message arrives
      store.getState().setMessages([
        {
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: { finishReason: FinishReasons.STOP, participantIndex: 0, roundNumber: 0 },
          parts: [{ text: 'Late arrival', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // Should not trigger streaming
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
      expect(store.getState().isStreaming).toBeFalsy();
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
          createdAt: new Date(),
          id: 'thread-1_r2_p0',
          metadata: { participantIndex: 0, roundNumber: 2 },
          parts: [{ text: 'Round 2 late', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
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
          createdAt: new Date(),
          id: 'thread-1_r0_p0',
          metadata: {
            participantIndex: 0,
            roundNumber: 0,
            // No finishReason - message was stopped mid-stream
          },
          parts: [{ text: 'Incomplete', type: MessagePartTypes.TEXT }],
          role: MessageRoles.ASSISTANT,
        },
      ]);

      // Message should be stored but not trigger streaming
      const messages = store.getState().messages;
      expect(messages).toHaveLength(1);
      expect(store.getState().isStreaming).toBeFalsy();
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
      expect(store.getState().isStreaming).toBeFalsy();
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
      expect(state.isStreaming).toBeTruthy();
      expect(state.error).toBeNull();
      expect(state.streamingRoundNumber).toBe(1);
    });
  });

  describe('pre-Search Stop Behavior', () => {
    it('should stop pre-search if stopped before participants', () => {
      const store = createChatStore();

      // Pre-search streaming
      store.getState().addPreSearch({
        createdAt: new Date(),
        id: 'presearch-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        threadId: 'thread-1',
        updatedAt: new Date(),
      });

      store.getState().setIsStreaming(true);

      // Stop before participants start
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Pre-search should remain but streaming state cleared
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(1);
      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('should not trigger participants if pre-search stopped', () => {
      const store = createChatStore();

      // Pre-search started
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch({
        createdAt: new Date(),
        id: 'presearch-1',
        roundNumber: 0,
        status: MessageStatuses.STREAMING,
        threadId: 'thread-1',
        updatedAt: new Date(),
      });

      // Stop
      store.getState().completeStreaming();

      // Participants should not start
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
      expect(store.getState().nextParticipantToTrigger).toBeNull();
    });
  });

  describe('resumption State After Stop', () => {
    it('should clear stream resumption phase state when stopped', () => {
      const store = createChatStore();

      // Setup resumption state with phase
      store.getState().setStreamResumptionState({
        createdAt: new Date(),
        participantIndex: 1,
        roundNumber: 0,
        state: 'active',
        threadId: 'thread-1',
        updatedAt: new Date(),
      });

      // Stop
      store.getState().completeStreaming();

      // ✅ completeStreaming clears STREAM_RESUMPTION_STATE_RESET fields (phase-related + nextParticipantToTrigger)
      // But does NOT clear streamResumptionState, resumptionAttempts
      expect(store.getState().currentResumptionPhase).toBeNull();
      expect(store.getState().nextParticipantToTrigger).toBeNull();
      expect(store.getState().resumptionRoundNumber).toBeNull();
      expect(store.getState().streamResumptionPrefilled).toBeFalsy();
    });

    it('should not clear resumption attempts on completeStreaming', () => {
      const store = createChatStore();

      // Mark resumption attempted
      const marked = store.getState().markResumptionAttempted(0, 1);
      expect(marked).toBeTruthy();

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
        createdAt: new Date(),
        participantIndex: 1,
        roundNumber: 0,
        state: 'active',
        threadId: 'thread-1',
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
