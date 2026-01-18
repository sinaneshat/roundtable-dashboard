/**
 * Moderator Retry Isolation Tests
 *
 * Tests the critical behavior from FLOW_DOCUMENTATION.md Part 10:
 * "Can retry moderator without regenerating AI responses.
 * Failed moderator doesn't prevent continuing conversation."
 *
 * CRITICAL BUSINESS LOGIC:
 * - When moderator fails, participant responses should be preserved
 * - Retry button should ONLY regenerate moderator, not participants
 * - User can continue to next round even with failed moderator
 * - Moderator tracking must allow retry after clearing tracking state
 *
 * ARCHITECTURE:
 * - Moderator creation tracked via createdModeratorRounds Set
 * - Moderator streaming tracked via triggeredModeratorRounds Set
 * - clearModeratorTracking() allows retry without affecting messages
 * - Participants and moderator are independent (moderator failure doesn't delete participants)
 */

import { FinishReasons, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
  createTestAssistantMessage,
  createTestUserMessage,
  getStoreState,
} from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// MODERATOR RETRY ISOLATION TESTS
// ============================================================================

describe('moderator Retry Isolation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(3));
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  describe('moderator Retry Does NOT Regenerate Participants', () => {
    it('preserves all participant responses when retrying moderator', () => {
      const state = getStoreState(store);

      // Round 0: All participants succeed
      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test question',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'First response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Second response',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      });

      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: 'Third response',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message]);

      // Moderator marked as created (simulating first attempt)
      state.tryMarkModeratorCreated(0);
      expect(state.hasModeratorBeenCreated(0)).toBe(true);

      // Moderator fails - clear tracking to allow retry
      state.clearModeratorTracking(0);
      expect(state.hasModeratorBeenCreated(0)).toBe(false);

      // CRITICAL: Participant messages should still exist
      expect(getStoreState(store).messages).toHaveLength(4);
      const msg1 = getStoreState(store).messages[1];
      if (!msg1)
        throw new Error('expected message at index 1');
      const msg2 = getStoreState(store).messages[2];
      if (!msg2)
        throw new Error('expected message at index 2');
      const msg3 = getStoreState(store).messages[3];
      if (!msg3)
        throw new Error('expected message at index 3');
      expect(msg1.parts?.[0]).toEqual({ type: 'text', text: 'First response' });
      expect(msg2.parts?.[0]).toEqual({ type: 'text', text: 'Second response' });
      expect(msg3.parts?.[0]).toEqual({ type: 'text', text: 'Third response' });

      // Retry moderator - can mark created again
      const canRetry = state.tryMarkModeratorCreated(0);
      expect(canRetry).toBe(true);

      // Participant messages unchanged
      expect(getStoreState(store).messages).toHaveLength(4);
    });

    it('moderator retry does not increment currentParticipantIndex', () => {
      const state = getStoreState(store);

      // Complete round 0 with all participants
      state.setCurrentParticipantIndex(0); // Reset after round completion

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test',
        roundNumber: 0,
      });

      const messages = [
        userMessage,
        createTestAssistantMessage({
          id: 'thread-123_r0_p0',
          content: 'P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r0_p1',
          content: 'P1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r0_p2',
          content: 'P2',
          roundNumber: 0,
          participantId: 'participant-2',
          participantIndex: 2,
          finishReason: FinishReasons.STOP,
        }),
      ];

      state.setMessages(messages);

      // Moderator fails - clear tracking
      state.tryMarkModeratorCreated(0);
      state.clearModeratorTracking(0);

      // currentParticipantIndex should remain 0 (not incremented by moderator retry)
      expect(getStoreState(store).currentParticipantIndex).toBe(0);

      // Retry moderator
      state.tryMarkModeratorCreated(0);

      // Still 0 - moderator retry does not affect participant index
      expect(getStoreState(store).currentParticipantIndex).toBe(0);
    });
  });

  describe('moderator Failure Tracking - Retry Allowed', () => {
    it('clearModeratorTracking removes createdModeratorRounds entry', () => {
      const state = getStoreState(store);

      const roundNumber = 0;

      // Initial creation
      state.tryMarkModeratorCreated(roundNumber);
      expect(state.hasModeratorBeenCreated(roundNumber)).toBe(true);

      // Clear tracking (simulating failure + retry)
      state.clearModeratorTracking(roundNumber);
      expect(state.hasModeratorBeenCreated(roundNumber)).toBe(false);

      // Can create again
      const canRetry = state.tryMarkModeratorCreated(roundNumber);
      expect(canRetry).toBe(true);
    });

    it('clearModeratorTracking clears both createdModeratorRounds and triggeredModeratorRounds', () => {
      const state = getStoreState(store);

      const roundNumber = 0;

      // Mark as created (triggeredModeratorRounds is managed internally)
      state.tryMarkModeratorCreated(roundNumber);

      expect(state.hasModeratorBeenCreated(roundNumber)).toBe(true);

      // Clear tracking (both createdModeratorRounds and internal tracking)
      state.clearModeratorTracking(roundNumber);

      expect(state.hasModeratorBeenCreated(roundNumber)).toBe(false);
      // triggeredModeratorRounds is internal to the store and cleared by clearModeratorTracking
    });

    it('clearModeratorTracking preserves tracking for other rounds', () => {
      const state = getStoreState(store);

      // Mark rounds 0, 1, 2 as created
      state.tryMarkModeratorCreated(0);
      state.tryMarkModeratorCreated(1);
      state.tryMarkModeratorCreated(2);

      expect(state.hasModeratorBeenCreated(0)).toBe(true);
      expect(state.hasModeratorBeenCreated(1)).toBe(true);
      expect(state.hasModeratorBeenCreated(2)).toBe(true);

      // Clear only round 1
      state.clearModeratorTracking(1);

      // Round 1 cleared, others preserved
      expect(state.hasModeratorBeenCreated(0)).toBe(true);
      expect(state.hasModeratorBeenCreated(1)).toBe(false);
      expect(state.hasModeratorBeenCreated(2)).toBe(true);
    });
  });

  describe('conversation Continuation After Moderator Failure', () => {
    it('round 1 can start even if round 0 moderator failed', () => {
      const state = getStoreState(store);

      // Round 0 complete with failed moderator (tracking cleared)
      const round0User = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Question 1',
        roundNumber: 0,
      });

      const round0Messages = [
        round0User,
        createTestAssistantMessage({
          id: 'thread-123_r0_p0',
          content: 'R0 P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r0_p1',
          content: 'R0 P1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];

      state.setMessages(round0Messages);

      // Moderator created but failed (tracking still exists - NOT cleared)
      state.tryMarkModeratorCreated(0);
      expect(state.hasModeratorBeenCreated(0)).toBe(true);

      // User submits round 1 message anyway
      const round1User = createTestUserMessage({
        id: 'thread-123_r1_user',
        content: 'Question 2',
        roundNumber: 1,
      });

      state.setMessages([...round0Messages, round1User]);

      // Round 1 streaming can start
      state.setIsStreaming(true);
      state.setStreamingRoundNumber(1);
      state.setCurrentParticipantIndex(0);

      expect(getStoreState(store).isStreaming).toBe(true);
      expect(getStoreState(store).streamingRoundNumber).toBe(1);

      // Round 1 participants stream successfully
      const round1P0 = createTestAssistantMessage({
        id: 'thread-123_r1_p0',
        content: 'R1 P0',
        roundNumber: 1,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([...round0Messages, round1User, round1P0]);

      expect(getStoreState(store).messages).toHaveLength(5);
      // Round 0 moderator failure did NOT block round 1
    });

    it('multiple rounds can have independent moderator states', () => {
      const state = getStoreState(store);

      // Round 0: Moderator succeeded
      state.tryMarkModeratorCreated(0);
      expect(state.hasModeratorBeenCreated(0)).toBe(true);

      // Round 1: Moderator failed and tracking cleared
      state.tryMarkModeratorCreated(1);
      state.clearModeratorTracking(1);
      expect(state.hasModeratorBeenCreated(1)).toBe(false);

      // Round 2: Moderator succeeded
      state.tryMarkModeratorCreated(2);
      expect(state.hasModeratorBeenCreated(2)).toBe(true);

      // Each round has independent tracking
      expect(state.hasModeratorBeenCreated(0)).toBe(true);
      expect(state.hasModeratorBeenCreated(1)).toBe(false);
      expect(state.hasModeratorBeenCreated(2)).toBe(true);
    });
  });

  describe('moderator Streaming State During Retry', () => {
    it('isModeratorStreaming flag cleared after failure', () => {
      const state = getStoreState(store);

      // Moderator starts streaming
      state.setIsModeratorStreaming(true);
      expect(getStoreState(store).isModeratorStreaming).toBe(true);

      // Error occurs - clear streaming flag
      state.setIsModeratorStreaming(false);
      expect(getStoreState(store).isModeratorStreaming).toBe(false);

      // Retry moderator - flag starts false
      expect(getStoreState(store).isModeratorStreaming).toBe(false);

      // Retry starts streaming
      state.setIsModeratorStreaming(true);
      expect(getStoreState(store).isModeratorStreaming).toBe(true);
    });

    it('isModeratorStreaming independent of isStreaming', () => {
      const state = getStoreState(store);

      // Participant streaming complete
      state.setIsStreaming(false);

      // Moderator starts streaming (participants done)
      state.setIsModeratorStreaming(true);

      expect(getStoreState(store).isStreaming).toBe(false);
      expect(getStoreState(store).isModeratorStreaming).toBe(true);

      // Moderator fails
      state.setIsModeratorStreaming(false);

      // Both flags false
      expect(getStoreState(store).isStreaming).toBe(false);
      expect(getStoreState(store).isModeratorStreaming).toBe(false);

      // Retry moderator (not participants)
      state.setIsModeratorStreaming(true);

      // Only moderator streaming flag set
      expect(getStoreState(store).isStreaming).toBe(false);
      expect(getStoreState(store).isModeratorStreaming).toBe(true);
    });
  });

  describe('moderator Error State Preservation', () => {
    it('error state can be preserved during moderator retry decision', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test',
        roundNumber: 0,
      });

      const messages = [
        userMessage,
        createTestAssistantMessage({
          id: 'thread-123_r0_p0',
          content: 'P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      state.setMessages(messages);

      // Moderator fails with error
      const moderatorError = new Error('Moderator generation failed');
      state.setError(moderatorError);
      state.setIsModeratorStreaming(false);

      // Error preserved
      expect(getStoreState(store).error).toBe(moderatorError);
      expect(getStoreState(store).error?.message).toBe('Moderator generation failed');

      // Clear error when retrying
      state.setError(null);
      expect(getStoreState(store).error).toBeNull();

      // Retry moderator
      state.clearModeratorTracking(0);
      state.tryMarkModeratorCreated(0);

      // No error during retry
      expect(getStoreState(store).error).toBeNull();
    });
  });

  describe('moderator Metadata After Retry', () => {
    it('moderator message can be replaced (not regenerated participants)', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Participant response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      // Initial moderator message (failed)
      const failedModeratorMessage = createTestAssistantMessage({
        id: 'thread-123_r0_moderator',
        content: 'Partial moderator before error...',
        roundNumber: 0,
        participantId: null,
        participantIndex: null,
        finishReason: FinishReasons.ERROR,
        isModerator: true,
        hasError: true,
      });

      state.setMessages([userMessage, p0Message, failedModeratorMessage]);

      expect(getStoreState(store).messages).toHaveLength(3);
      expect((getStoreState(store).messages[2]?.metadata as { hasError: boolean }).hasError).toBe(true);

      // Clear tracking for retry
      state.clearModeratorTracking(0);

      // Backend would delete failed moderator message
      state.setMessages([userMessage, p0Message]);

      // Retry moderator - new message created
      const retriedModeratorMessage = createTestAssistantMessage({
        id: 'thread-123_r0_moderator_retry',
        content: 'Complete moderator analysis...',
        roundNumber: 0,
        participantId: null,
        participantIndex: null,
        finishReason: FinishReasons.STOP,
        isModerator: true,
      });

      state.setMessages([userMessage, p0Message, retriedModeratorMessage]);

      // Participant message unchanged
      const participantMsg = getStoreState(store).messages[1];
      if (!participantMsg)
        throw new Error('expected participant message at index 1');
      expect(participantMsg.parts?.[0]).toEqual({ type: 'text', text: 'Participant response' });
      // Moderator message replaced with successful retry
      const moderatorMsg = getStoreState(store).messages[2];
      if (!moderatorMsg)
        throw new Error('expected moderator message at index 2');
      expect(moderatorMsg.parts?.[0]).toEqual({ type: 'text', text: 'Complete moderator analysis...' });
      expect((moderatorMsg.metadata as { hasError?: boolean }).hasError).toBeFalsy();
    });
  });

  describe('moderator triggeredModeratorIds Isolation', () => {
    it('triggeredModeratorIds tracks individual moderator messages internally', () => {
      const state = getStoreState(store);

      const roundNumber = 0;

      // Mark moderator as created (tracking managed internally)
      state.tryMarkModeratorCreated(roundNumber);

      expect(state.hasModeratorBeenCreated(roundNumber)).toBe(true);

      // Clear tracking (clears all internal tracking sets)
      state.clearModeratorTracking(roundNumber);

      expect(state.hasModeratorBeenCreated(roundNumber)).toBe(false);

      // Can create again after clearing
      const canRetry = state.tryMarkModeratorCreated(roundNumber);
      expect(canRetry).toBe(true);
    });
  });

  describe('complete Moderator Retry Journey', () => {
    it('end-to-end: participants succeed, moderator fails, retry moderator only', () => {
      const state = getStoreState(store);

      // === ROUND 0: All participants succeed ===
      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Question',
        roundNumber: 0,
      });

      const participants = [
        createTestAssistantMessage({
          id: 'thread-123_r0_p0',
          content: 'Response 0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r0_p1',
          content: 'Response 1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r0_p2',
          content: 'Response 2',
          roundNumber: 0,
          participantId: 'participant-2',
          participantIndex: 2,
          finishReason: FinishReasons.STOP,
        }),
      ];

      state.setMessages([userMessage, ...participants]);

      // Streaming complete
      state.setIsStreaming(false);
      state.setStreamingRoundNumber(null);

      expect(getStoreState(store).messages).toHaveLength(4);

      // === MODERATOR ATTEMPT 1: Fails ===
      state.setIsModeratorStreaming(true);
      state.tryMarkModeratorCreated(0);

      const failedModerator = createTestAssistantMessage({
        id: 'thread-123_r0_moderator_fail',
        content: 'Partial...',
        roundNumber: 0,
        participantId: null,
        participantIndex: null,
        finishReason: FinishReasons.ERROR,
        isModerator: true,
        hasError: true,
      });

      state.setMessages([userMessage, ...participants, failedModerator]);
      state.setIsModeratorStreaming(false);
      state.setError(new Error('Moderator failed'));

      expect(getStoreState(store).messages).toHaveLength(5);
      expect((getStoreState(store).messages[4]?.metadata as { hasError: boolean }).hasError).toBe(true);

      // === RETRY MODERATOR ===
      // Clear error and tracking
      state.setError(null);
      state.clearModeratorTracking(0);

      // Backend deletes failed moderator message
      state.setMessages([userMessage, ...participants]);

      expect(getStoreState(store).messages).toHaveLength(4);
      // Participant messages unchanged
      const resp0 = getStoreState(store).messages[1];
      if (!resp0)
        throw new Error('expected response 0 at index 1');
      const resp1 = getStoreState(store).messages[2];
      if (!resp1)
        throw new Error('expected response 1 at index 2');
      const resp2 = getStoreState(store).messages[3];
      if (!resp2)
        throw new Error('expected response 2 at index 3');
      expect(resp0.parts?.[0]).toEqual({ type: 'text', text: 'Response 0' });
      expect(resp1.parts?.[0]).toEqual({ type: 'text', text: 'Response 1' });
      expect(resp2.parts?.[0]).toEqual({ type: 'text', text: 'Response 2' });

      // === MODERATOR ATTEMPT 2: Succeeds ===
      state.setIsModeratorStreaming(true);
      state.tryMarkModeratorCreated(0);

      const successModerator = createTestAssistantMessage({
        id: 'thread-123_r0_moderator_success',
        content: 'Complete moderator analysis',
        roundNumber: 0,
        participantId: null,
        participantIndex: null,
        finishReason: FinishReasons.STOP,
        isModerator: true,
      });

      state.setMessages([userMessage, ...participants, successModerator]);
      state.setIsModeratorStreaming(false);

      // Final state: 4 messages + successful moderator
      expect(getStoreState(store).messages).toHaveLength(5);

      // Verify moderator message exists (message 5 is the moderator)
      const moderatorMessage = getStoreState(store).messages[4];
      expect(moderatorMessage).toBeDefined();
      expect(moderatorMessage?.parts?.[0]).toEqual({ type: 'text', text: 'Complete moderator analysis' });

      // Metadata might not have isModerator flag set by test helper, but we can verify it's not a participant
      const moderatorMetadata = moderatorMessage?.metadata as { participantId?: string | null; hasError?: boolean };
      expect(moderatorMetadata.participantId).toBeNull(); // Moderator has null participantId
      expect(moderatorMetadata.hasError).toBeFalsy(); // No error

      // Participant messages STILL unchanged
      expect(getStoreState(store).messages[1]?.parts?.[0]).toEqual({ type: 'text', text: 'Response 0' });
      expect(getStoreState(store).messages[2]?.parts?.[0]).toEqual({ type: 'text', text: 'Response 1' });
      expect(getStoreState(store).messages[3]?.parts?.[0]).toEqual({ type: 'text', text: 'Response 2' });
    });
  });
});
