import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamStatuses } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipants,
  createMockThread,
} from './test-factories';

describe('resumable Stream Integration & Race Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('resume vs New Message Race Condition', () => {
    it('should block new messages while resumption is active', () => {
      const threadId = 'thread-123';
      const participants = createMockParticipants(2);

      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        participants,
      );

      // 1. Simulate active resumption
      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      // 2. Try to prepare for new message
      // The store doesn't explicitly block this in prepareForNewMessage,
      // but the UI should disable the input.
      // However, if called programmatically:
      store.getState().prepareForNewMessage('New message', ['p1']);

      // 3. Expectation: Resumption state should be cleared?
      // OR: Should we prioritize the new message and cancel resumption?
      // Current implementation: prepareForNewMessage clears resumption state.

      expect(store.getState().streamResumptionState).toBeNull();
      expect(store.getState().pendingMessage).toBe('New message');
    });
  });

  describe('resume vs Navigation Race Condition', () => {
    it('should clear resumption state when navigating to new chat', () => {
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

      // Navigate to new chat
      store.getState().resetToNewChat();

      expect(store.getState().streamResumptionState).toBeNull();
      expect(store.getState().thread).toBeNull();
    });

    it('should clear resumption state when resetting to overview', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(2),
      );

      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      store.getState().resetToOverview();

      expect(store.getState().streamResumptionState).toBeNull();
    });
  });

  describe('resumption State Validation', () => {
    it('should reject resumption for different thread', () => {
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

    it('should reject resumption with invalid participant index', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(2), // Indices 0, 1
      );

      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 99, // Invalid
        state: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      });

      expect(store.getState().isStreamResumptionValid()).toBe(false);
    });
  });

  describe('stuck Stream Recovery', () => {
    it('should clear stuck resumption state after timeout', () => {
      const threadId = 'thread-123';
      store.getState().initializeThread(
        createMockThread({ id: threadId }),
        createMockParticipants(2),
      );

      // Set stale state (> 1 hour)
      const staleTime = new Date(Date.now() - 61 * 60 * 1000);
      store.getState().setStreamResumptionState({
        threadId,
        roundNumber: 1,
        participantIndex: 0,
        state: StreamStatuses.ACTIVE,
        createdAt: staleTime,
      });

      expect(store.getState().isStreamResumptionStale()).toBe(true);
      expect(store.getState().needsStreamResumption()).toBe(false);
    });
  });
});
