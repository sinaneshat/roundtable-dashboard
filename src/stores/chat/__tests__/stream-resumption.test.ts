import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, StreamStatuses } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipants,
  createMockThread,
} from './test-factories';

describe('stream Resumption Logic', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('streamResumptionSlice', () => {
    it('should correctly determine if resumption is needed', () => {
      const threadId = 'thread-123';
      const participants = createMockParticipants(2);

      // Initialize store
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      // 1. Set resumption state to ACTIVE
      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      // Should need resumption
      expect(store.getState().needsStreamResumption()).toBe(true);
    });

    it('should NOT need resumption if stream is COMPLETED', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(2),
      );

      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.COMPLETED,
        createdAt: new Date(),
      });

      expect(store.getState().needsStreamResumption()).toBe(false);
    });

    it('should NOT need resumption if thread ID mismatch', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(2),
      );

      store.getState().setStreamResumptionState({
        threadId: 'other-thread',
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      expect(store.getState().needsStreamResumption()).toBe(false);
    });

    it('should NOT need resumption if state is stale (> 1 hour)', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(2),
      );

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: twoHoursAgo,
      });

      expect(store.getState().needsStreamResumption()).toBe(false);
    });

    it('should handle resumed stream completion', () => {
      const threadId = 'thread-123';
      const participants = createMockParticipants(3);

      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      // Simulate active stream for participant 0
      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      // Complete the stream
      store.getState().handleResumedStreamComplete(1, 0);

      // Should clear resumption state
      expect(store.getState().streamResumptionState).toBeNull();

      // Should set next participant to trigger (index 1)
      expect(store.getState().getNextParticipantToTrigger()).toBe(1);
    });

    it('should handle resumed stream completion for LAST participant', () => {
      const threadId = 'thread-123';
      const participants = createMockParticipants(3);

      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      // Simulate active stream for participant 2 (last one)
      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 2,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      // Complete the stream
      store.getState().handleResumedStreamComplete(1, 2);

      // Should clear resumption state
      expect(store.getState().streamResumptionState).toBeNull();

      // Should NOT set next participant (null)
      expect(store.getState().getNextParticipantToTrigger()).toBeNull();
    });

    it('should track resumption attempts to prevent infinite loops', () => {
      // First attempt
      const attempt1 = store.getState().markResumptionAttempted(1, 0);
      expect(attempt1).toBe(true);

      // Second attempt (same round/participant)
      const attempt2 = store.getState().markResumptionAttempted(1, 0);
      expect(attempt2).toBe(false);

      // Different participant
      const attempt3 = store.getState().markResumptionAttempted(1, 1);
      expect(attempt3).toBe(true);
    });
  });

  describe('pre-Search Resumption & Timeout', () => {
    it('should timeout stuck pre-searches to unblock flow', () => {
      // Setup stuck pre-search
      const stuckPreSearch = {
        id: 'ps-1',
        threadId: 't-1',
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
        searchData: null,
        errorMessage: null,
        createdAt: new Date(Date.now() - 150000), // 2.5 min ago (exceeds ACTIVITY_TIMEOUT_MS of 120s)
      };

      store.getState().addPreSearch(stuckPreSearch);

      // Run check
      store.getState().checkStuckPreSearches();

      // Should be marked complete
      const updated = store.getState().preSearches[0];
      expect(updated.status).toBe('complete');
    });
  });

  describe('edge Cases & Race Conditions', () => {
    it('should be robust against multiple completion calls (idempotency)', () => {
      const threadId = 'thread-123';
      const participants = createMockParticipants(3);

      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      // First call
      store.getState().handleResumedStreamComplete(1, 0);
      expect(store.getState().streamResumptionState).toBeNull();
      expect(store.getState().getNextParticipantToTrigger()).toBe(1);

      // Second call (should not break anything or double-trigger)
      store.getState().handleResumedStreamComplete(1, 0);
      expect(store.getState().streamResumptionState).toBeNull();
      // Next participant should still be 1 (or null if we clear it, but the implementation sets it based on input)
      // Actually, handleResumedStreamComplete sets nextParticipantToTrigger based on input + 1.
      // So calling it again with same input sets it to same output. This is idempotent.
      expect(store.getState().getNextParticipantToTrigger()).toBe(1);
    });

    it('should invalidate resumption if participant index is out of bounds', () => {
      const threadId = 'thread-123';
      // Only 2 participants (indices 0, 1)
      const participants = createMockParticipants(2);

      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      // Resumption state for index 5 (invalid)
      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 5,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      // Should be invalid
      expect(store.getState().isStreamResumptionValid()).toBe(false);
      expect(store.getState().needsStreamResumption()).toBe(false);
    });

    it('should invalidate resumption if thread ID changes', () => {
      const threadId = 'thread-123';
      const participants = createMockParticipants(2);

      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      expect(store.getState().needsStreamResumption()).toBe(true);

      // Switch thread
      store.getState().initializeThread(
        createMockThread({ id: 'thread-456' }), // Different ID
        participants,
      );

      // Should no longer be valid for current thread
      expect(store.getState().needsStreamResumption()).toBe(false);
      expect(store.getState().isStreamResumptionValid()).toBe(false);
    });
  });
});
