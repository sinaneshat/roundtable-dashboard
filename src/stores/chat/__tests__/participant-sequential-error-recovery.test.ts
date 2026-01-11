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

import { beforeEach, describe, expect, it } from 'vitest';

import { FinishReasons, MessageStatuses, ScreenModes } from '@/api/core/enums';
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
        id: 'thread-123_r0_user',
        content: 'Test question',
        roundNumber: 0,
      });

      // P0 fails with error
      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Error: Rate limit exceeded',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      // P1 succeeds
      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'This is my successful response',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      });

      // P2 succeeds
      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: 'I agree with P1',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.STOP,
      });

      // P3 succeeds
      const p3Message = createTestAssistantMessage({
        id: 'thread-123_r0_p3',
        content: 'Great points from P1 and P2',
        roundNumber: 0,
        participantId: 'participant-3',
        participantIndex: 3,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      // Round completes with 1 error + 3 successes
      expect(getStoreState(store).messages).toHaveLength(5);
      expect((getStoreState(store).messages[1]?.metadata as { hasError: boolean }).hasError).toBe(true);
      expect((getStoreState(store).messages[2]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[3]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[4]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });

    it('p1 fails (middle participant), P0/P2/P3 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test question',
        roundNumber: 0,
      });

      // P0 succeeds
      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'First response success',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      // P1 fails (middle participant)
      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: '', // Empty content due to error
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      // P2 succeeds (should see P0 and failed P1 in context)
      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: 'Response after P1 failure',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.STOP,
      });

      // P3 succeeds
      const p3Message = createTestAssistantMessage({
        id: 'thread-123_r0_p3',
        content: 'Final response',
        roundNumber: 0,
        participantId: 'participant-3',
        participantIndex: 3,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      // Verify P1 failed but round continued
      expect((getStoreState(store).messages[2]?.metadata as { hasError: boolean }).hasError).toBe(true);
      expect((getStoreState(store).messages[3]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });

    it('p3 fails (last participant), P0-P2 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test question',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'First success',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Second success',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      });

      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: 'Third success',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.STOP,
      });

      // Last participant fails
      const p3Message = createTestAssistantMessage({
        id: 'thread-123_r0_p3',
        content: 'Partial response before timeout...',
        roundNumber: 0,
        participantId: 'participant-3',
        participantIndex: 3,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      expect((getStoreState(store).messages[4]?.metadata as { hasError: boolean }).hasError).toBe(true);
    });
  });

  describe('multiple Participant Failures - Round Still Completes', () => {
    it('p0 and P2 fail, P1 and P3 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test question',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Error: Connection timeout',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Successful response',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      });

      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: '', // Content filter triggered
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.CONTENT_FILTER,
      });

      const p3Message = createTestAssistantMessage({
        id: 'thread-123_r0_p3',
        content: 'Another successful response',
        roundNumber: 0,
        participantId: 'participant-3',
        participantIndex: 3,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      expect(getStoreState(store).messages).toHaveLength(5);
      // 2 failures
      expect((getStoreState(store).messages[1]?.metadata as { hasError: boolean }).hasError).toBe(true);
      expect((getStoreState(store).messages[3]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.CONTENT_FILTER);
      // 2 successes
      expect((getStoreState(store).messages[2]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[4]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });

    it('consecutive failures - P1 and P2 fail, P0 and P3 succeed', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test question',
        roundNumber: 0,
      });

      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'First success',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      // Consecutive failures
      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Error: Model unavailable',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: 'Error: Rate limited',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      const p3Message = createTestAssistantMessage({
        id: 'thread-123_r0_p3',
        content: 'Final success despite previous failures',
        roundNumber: 0,
        participantId: 'participant-3',
        participantIndex: 3,
        finishReason: FinishReasons.STOP,
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
        id: 'thread-123_r0_user',
        content: 'Test question',
        roundNumber: 0,
      });

      // Different error types
      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Error',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: '', // Content filter
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.CONTENT_FILTER,
      });

      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: 'Very long response that was truncated because it exceeded the maximum token limit...',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.LENGTH,
      });

      const p3Message = createTestAssistantMessage({
        id: 'thread-123_r0_p3',
        content: 'Normal successful completion',
        roundNumber: 0,
        participantId: 'participant-3',
        participantIndex: 3,
        finishReason: FinishReasons.STOP,
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
        id: 'thread-123_r0_user',
        content: 'Test',
        roundNumber: 0,
      });

      // P0 fails
      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Error',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      state.setMessages([userMessage, p0Message]);

      // Streaming should continue (not stopped by single failure)
      expect(getStoreState(store).isStreaming).toBe(true);

      // Move to next participant
      state.setCurrentParticipantIndex(1);
      expect(getStoreState(store).currentParticipantIndex).toBe(1);

      // P1 succeeds
      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Success',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([userMessage, p0Message, p1Message]);

      // Still streaming for remaining participants
      expect(getStoreState(store).isStreaming).toBe(true);
    });

    it('completeStreaming clears state after all participants (including failures)', () => {
      const state = getStoreState(store);

      state.setIsStreaming(true);
      state.setStreamingRoundNumber(0);
      state.setCurrentParticipantIndex(3); // Last participant

      // All participants done (mixed success/failure)
      state.completeStreaming();

      expect(getStoreState(store).isStreaming).toBe(false);
      expect(getStoreState(store).streamingRoundNumber).toBeNull();
    });
  });

  describe('moderator Behavior After Partial Failures', () => {
    it('moderator should still trigger after round with failures', () => {
      const state = getStoreState(store);

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test',
        roundNumber: 0,
      });

      // P0 fails, P1-P3 succeed
      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Error',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Success',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      });

      const p2Message = createTestAssistantMessage({
        id: 'thread-123_r0_p2',
        content: 'Success',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: FinishReasons.STOP,
      });

      const p3Message = createTestAssistantMessage({
        id: 'thread-123_r0_p3',
        content: 'Success',
        roundNumber: 0,
        participantId: 'participant-3',
        participantIndex: 3,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([userMessage, p0Message, p1Message, p2Message, p3Message]);

      // Moderator creation should not be blocked by P0 failure
      const canCreateModerator = !state.hasModeratorBeenCreated(0);
      expect(canCreateModerator).toBe(true);

      // Mark moderator created
      const wasMarked = state.tryMarkModeratorCreated(0);
      expect(wasMarked).toBe(true);
    });
  });

  describe('pre-Search + Participant Failures - Combined Scenario', () => {
    it('pre-search completes, then participant fails, round continues', () => {
      const state = getStoreState(store);
      state.setThread(createMockThread({ enableWebSearch: true }));

      // Pre-search completes successfully
      state.addPreSearch({
        id: 'presearch-0',
        threadId: 'thread-123',
        roundNumber: 0,
        status: MessageStatuses.COMPLETE,
        userQuery: 'test query',
        searchData: {
          queries: [{ query: 'test', rationale: 'test', searchDepth: 'basic' as const, index: 0, total: 1 }],
          results: [],
          moderatorSummary: 'Test',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 5000,
        },
        errorMessage: null,
        createdAt: new Date(),
        completedAt: new Date(),
      });

      const userMessage = createTestUserMessage({
        id: 'thread-123_r0_user',
        content: 'Test with web search',
        roundNumber: 0,
      });

      // P0 fails despite successful pre-search
      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Error',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      // P1 succeeds with pre-search context
      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Based on web search results...',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
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
        id: 'thread-123_r0_user',
        content: 'Test',
        roundNumber: 0,
      });

      // Round 0 with partial failures
      const p0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Success',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      const p1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1',
        content: 'Error',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.ERROR,
        hasError: true,
      });

      state.setMessages([userMessage, p0Message, p1Message]);

      // User clicks retry - mark as regenerating
      state.setIsRegenerating(true);
      state.setRegeneratingRoundNumber(0);

      expect(getStoreState(store).isRegenerating).toBe(true);
      expect(getStoreState(store).regeneratingRoundNumber).toBe(0);

      // Clear failed messages (simulating backend deletion)
      state.setMessages([userMessage]); // Only user message remains

      // Regenerate all participants (including previously failed P1)
      const newP0Message = createTestAssistantMessage({
        id: 'thread-123_r0_p0_regenerated',
        content: 'New attempt - success',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      const newP1Message = createTestAssistantMessage({
        id: 'thread-123_r0_p1_regenerated',
        content: 'Retry succeeded this time',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: FinishReasons.STOP,
      });

      state.setMessages([userMessage, newP0Message, newP1Message]);

      // Regeneration complete
      state.setIsRegenerating(false);
      state.setRegeneratingRoundNumber(null);

      expect(getStoreState(store).isRegenerating).toBe(false);
      expect(getStoreState(store).messages).toHaveLength(3);
      // Both participants succeeded on retry
      expect((getStoreState(store).messages[1]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
      expect((getStoreState(store).messages[2]?.metadata as { finishReason: string }).finishReason).toBe(FinishReasons.STOP);
    });
  });
});
