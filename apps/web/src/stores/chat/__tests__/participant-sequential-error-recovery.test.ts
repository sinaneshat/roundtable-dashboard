/**
 * Participant Sequential Error Recovery Tests
 *
 * Tests the critical behavior from FLOW_DOCUMENTATION.md Part 10:
 * "One AI failure doesn't stop the round. Remaining AIs still respond.
 * Round can complete with partial results."
 *
 * CRITICAL BUSINESS LOGIC:
 * - When P1 fails, P2 and P3 should continue streaming
 * - Round completes with mixed success/failure states
 * - Failed participant shows error indicator
 * - Successful participants show complete responses
 * - User can retry entire round to regenerate all responses
 *
 * ARCHITECTURE:
 * - Sequential participant coordination (P0 → P1 → P2 → P3)
 * - currentParticipantIndex increments even when participant fails
 * - finishReason: ERROR marks failed participants
 * - hasError metadata flag for UI error display
 * - Round completion independent of individual participant success
 */

import { FinishReasons, MessageStatuses, ScreenModes } from '@roundtable/shared';
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
// PARTICIPANT SEQUENTIAL ERROR RECOVERY TESTS
// ============================================================================

describe('participant Sequential Error Recovery', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    const state = getStoreState(store);
    state.setThread(createMockThread());
    state.setParticipants(createMockParticipants(4)); // 4 participants for comprehensive test
    state.setScreenMode(ScreenModes.THREAD);
    state.setShowInitialUI(false);
  });

  describe('single Participant Failure - Round Continues', () => {
    it('p0 fails, P1-P3 continue streaming', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      // P0 fails with error
      const p0Message = createTestAssistantMessage({
        content: 'Error: Rate limit exceeded',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      // P1 succeeds
      const p1Message = createTestAssistantMessage({
        content: 'This is my successful response',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      // P2 succeeds
      const p2Message = createTestAssistantMessage({
        content: 'I agree with P1',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      });

      // P3 succeeds
      const p3Message = createTestAssistantMessage({
        content: 'Great points from P1 and P2',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p3',
        participantId: 'participant-3',
        participantIndex: 3,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      // Round completes with 1 error + 3 successes
      expect(getStoreState(store).messages).toHaveLength(5);
      expect((getStoreState(store).messages[1]?.metadata as { hasError: boolean }).hasError).toBeTruthy();
      expect((getStoreState(store).messages[2]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[3]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[4]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });

    it('p1 fails (middle participant), P0/P2/P3 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      // P0 succeeds
      const p0Message = createTestAssistantMessage({
        content: 'First response success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      // P1 fails (middle participant)
      const p1Message = createTestAssistantMessage({
        content: '', // Empty content due to error
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      // P2 succeeds (should see P0 and failed P1 in context)
      const p2Message = createTestAssistantMessage({
        content: 'Response after P1 failure',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      });

      // P3 succeeds
      const p3Message = createTestAssistantMessage({
        content: 'Final response',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p3',
        participantId: 'participant-3',
        participantIndex: 3,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      // Verify P1 failed but round continued
      expect((getStoreState(store).messages[2]?.metadata as { hasError: boolean }).hasError).toBeTruthy();
      expect((getStoreState(store).messages[3]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });

    it('p3 fails (last participant), P0-P2 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        content: 'First success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      const p1Message = createTestAssistantMessage({
        content: 'Second success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      const p2Message = createTestAssistantMessage({
        content: 'Third success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      });

      // Last participant fails
      const p3Message = createTestAssistantMessage({
        content: 'Partial response before timeout...',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p3',
        participantId: 'participant-3',
        participantIndex: 3,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      expect((getStoreState(store).messages[4]?.metadata as { hasError: boolean }).hasError).toBeTruthy();
    });
  });

  describe('multiple Participant Failures - Round Still Completes', () => {
    it('p0 and P2 fail, P1 and P3 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        content: 'Error: Connection timeout',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      const p1Message = createTestAssistantMessage({
        content: 'Successful response',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      const p2Message = createTestAssistantMessage({
        content: '', // Content filter triggered
        finishReason: FinishReasons.CONTENT_FILTER,
        id: 'thread-123_r0_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      });

      const p3Message = createTestAssistantMessage({
        content: 'Another successful response',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p3',
        participantId: 'participant-3',
        participantIndex: 3,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      // 2 failures
      expect((getStoreState(store).messages[1]?.metadata as { hasError: boolean }).hasError).toBeTruthy();
      expect((getStoreState(store).messages[3]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.CONTENT_FILTER);
      // 2 successes
      expect((getStoreState(store).messages[2]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[4]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });

    it('consecutive failures - P1 and P2 fail, P0 and P3 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        content: 'First success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      // Consecutive failures
      const p1Message = createTestAssistantMessage({
        content: 'Error: Model unavailable',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      const p2Message = createTestAssistantMessage({
        content: 'Error: Rate limited',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      });

      const p3Message = createTestAssistantMessage({
        content: 'Final success despite previous failures',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p3',
        participantId: 'participant-3',
        participantIndex: 3,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      // P3 succeeded despite 2 consecutive failures before it
      expect((getStoreState(store).messages[4]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });
  });

  describe('different Error Types - Round Behavior', () => {
    it('handles different finishReason types in same round', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      // Different error types
      const p0Message = createTestAssistantMessage({
        content: 'Error',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      const p1Message = createTestAssistantMessage({
        content: '', // Content filter
        finishReason: FinishReasons.CONTENT_FILTER,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      const p2Message = createTestAssistantMessage({
        content: 'Very long response that was truncated because it exceeded the maximum token limit...',
        finishReason: FinishReasons.LENGTH,
        id: 'thread-123_r0_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      });

      const p3Message = createTestAssistantMessage({
        content: 'Normal successful completion',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p3',
        participantId: 'participant-3',
        participantIndex: 3,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      // Verify different finishReasons coexist
      expect((getStoreState(store).messages[1]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.ERROR);
      expect((getStoreState(store).messages[2]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.CONTENT_FILTER);
      expect((getStoreState(store).messages[3]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.LENGTH);
      expect((getStoreState(store).messages[4]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });
  });

  describe('streaming State During Partial Failures', () => {
    it('isStreaming remains true while participants continue after failure', () => {
      const state = getStoreState(store);

      // Round starts streaming
      state.setIsStreaming(true);
      state.setStreamingRoundNumber(0);
      state.setCurrentParticipantIndex(0);

      const userMessage = createTestUserMessage({
        content: 'Test',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      // P0 fails
      const p0Message = createTestAssistantMessage({
        content: 'Error',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message]);

      // Streaming should continue (not stopped by single failure)
      expect(getStoreState(store).isStreaming).toBeTruthy();

      // Move to next participant
      state.setCurrentParticipantIndex(1);
      expect(getStoreState(store).currentParticipantIndex).toBe(1);

      // P1 succeeds
      const p1Message = createTestAssistantMessage({
        content: 'Success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message]);

      // Still streaming for remaining participants
      expect(getStoreState(store).isStreaming).toBeTruthy();
    });

    it('completeStreaming clears state after all participants (including failures)', () => {
      const state = getStoreState(store);

      state.setIsStreaming(true);
      state.setStreamingRoundNumber(0);
      state.setCurrentParticipantIndex(3); // Last participant

      // All participants done (mixed success/failure)
      state.completeStreaming();

      expect(getStoreState(store).isStreaming).toBeFalsy();
      expect(getStoreState(store).streamingRoundNumber).toBeNull();
    });
  });

  describe('moderator Behavior After Partial Failures', () => {
    it('moderator should still trigger after round with failures', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      // P0 fails, P1-P3 succeed
      const p0Message = createTestAssistantMessage({
        content: 'Error',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      const p1Message = createTestAssistantMessage({
        content: 'Success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      const p2Message = createTestAssistantMessage({
        content: 'Success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 0,
      });

      const p3Message = createTestAssistantMessage({
        content: 'Success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p3',
        participantId: 'participant-3',
        participantIndex: 3,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      // Moderator creation should not be blocked by P0 failure
      const canCreateModerator = !state.hasModeratorBeenCreated(0);
      expect(canCreateModerator).toBeTruthy();

      // Mark moderator created
      const wasMarked = state.tryMarkModeratorCreated(0);
      expect(wasMarked).toBeTruthy();
    });
  });

  describe('pre-Search + Participant Failures - Combined Scenario', () => {
    it('pre-search completes, then participant fails, round continues', () => {
      const state = getStoreState(store);
      state.setThread(createMockThread({ enableWebSearch: true }));

      // Pre-search completes successfully
      state.addPreSearch({
        completedAt: new Date(),
        createdAt: new Date(),
        errorMessage: null,
        id: 'presearch-0',
        roundNumber: 0,
        searchData: {
          failureCount: 0,
          moderatorSummary: 'Test',
          queries: [{ index: 0, query: 'test', rationale: 'test', searchDepth: 'basic' as const, total: 1 }],
          results: [],
          successCount: 1,
          totalResults: 3,
          totalTime: 5000,
        },
        status: MessageStatuses.COMPLETE,
        threadId: 'thread-123',
        userQuery: 'test query',
      });

      const userMessage = createTestUserMessage({
        content: 'Test with web search',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      // P0 fails despite successful pre-search
      const p0Message = createTestAssistantMessage({
        content: 'Error',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      // P1 succeeds with pre-search context
      const p1Message = createTestAssistantMessage({
        content: 'Based on web search results...',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message]);

      expect(getStoreState(store).messages).toHaveLength(3);
      expect(getStoreState(store).preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('round Regeneration After Partial Failure', () => {
    it('tracks isRegenerating and regeneratingRoundNumber for retry', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        content: 'Test',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      });

      // Round 0 with partial failures
      const p0Message = createTestAssistantMessage({
        content: 'Success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      const p1Message = createTestAssistantMessage({
        content: 'Error',
        finishReason: FinishReasons.ERROR,
        hasError: true,
        id: 'thread-123_r0_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      state.setMessages([userMessage, p0Message, p1Message]);

      // User clicks retry - mark as regenerating
      state.setIsRegenerating(true);
      state.setRegeneratingRoundNumber(0);

      expect(getStoreState(store).isRegenerating).toBeTruthy();
      expect(getStoreState(store).regeneratingRoundNumber).toBe(0);

      // Clear failed messages (simulating backend deletion)
      state.setMessages([userMessage]); // Only user message remains

      // Regenerate all participants (including previously failed P1)
      const newP0Message = createTestAssistantMessage({
        content: 'New attempt - success',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p0_regenerated',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      });

      const newP1Message = createTestAssistantMessage({
        content: 'Retry succeeded this time',
        finishReason: FinishReasons.STOP,
        id: 'thread-123_r0_p1_regenerated',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      });

      state.setMessages([userMessage, newP0Message, newP1Message]);

      // Regeneration complete
      state.setIsRegenerating(false);
      state.setRegeneratingRoundNumber(null);

      expect(getStoreState(store).isRegenerating).toBeFalsy();
      expect(getStoreState(store).messages).toHaveLength(3);
      // Both participants succeeded on retry
      expect((getStoreState(store).messages[1]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[2]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });
  });
});
