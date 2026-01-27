/**
 * Participant Count Consistency Tests
 *
 * Tests to verify that participant counts are consistent between store state
 * and SSR props when logging/debugging. This addresses the bug where logs showed
 * `pCount=2` when the store actually had 3 participants for round 1.
 *
 * Root cause: The log was mixing data from two different sources:
 * - `state.currentRoundNumber` from the store
 * - `participants` from SSR props (which could be stale)
 *
 * The fix ensures that when logging store state (roundNumber), we use
 * store participants, not SSR props.
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
  createTestChatStore,
  createTestUserMessage,
} from '@/lib/testing';
import type { ChatStoreApi } from '@/stores/chat';
import { ChatPhases } from '@/stores/chat/store-schemas';

describe('participant Count Consistency', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createTestChatStore();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // Store participants vs SSR props participants
  // ===========================================================================

  describe('store.participants vs SSR props consistency', () => {
    it('should have participants in store after initializeThread', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(3, thread.id);
      const messages: UIMessage[] = [];

      store.getState().initializeThread(thread, participants, messages);

      const state = store.getState();
      expect(state.participants).toHaveLength(3);
      expect(state.participants.filter(p => p.isEnabled)).toHaveLength(3);
    });

    it('should have correct enabled participant count after initializeThread', () => {
      const thread = createMockThread({ id: 'thread-123' });
      // Create 3 participants, but only 2 enabled
      const participants = createMockParticipants(3, thread.id);
      const participant2 = participants[2];
      if (participant2) {
        participant2.isEnabled = false;
      }

      store.getState().initializeThread(thread, participants, []);

      const state = store.getState();
      const enabledCount = state.participants.filter(p => p.isEnabled).length;
      expect(enabledCount).toBe(2);
    });

    it('should update participants when setParticipants is called', () => {
      // Initial setup with 2 participants
      const thread = createMockThread({ id: 'thread-123' });
      const initialParticipants = createMockParticipants(2, thread.id);
      store.getState().initializeThread(thread, initialParticipants, []);

      expect(store.getState().participants).toHaveLength(2);

      // User adds a third participant during the session
      const updatedParticipants = createMockParticipants(3, thread.id);
      store.getState().setParticipants(updatedParticipants);

      expect(store.getState().participants).toHaveLength(3);
    });

    it('should update participants when updateParticipants is called', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const initialParticipants = createMockParticipants(2, thread.id);
      store.getState().initializeThread(thread, initialParticipants, []);

      // User adds a third participant
      const updatedParticipants = createMockParticipants(3, thread.id);
      store.getState().updateParticipants(updatedParticipants);

      const state = store.getState();
      expect(state.participants).toHaveLength(3);
      expect(state.participants.filter(p => p.isEnabled)).toHaveLength(3);
    });
  });

  // ===========================================================================
  // Participant count changes between rounds
  // ===========================================================================

  describe('participant count changes between rounds', () => {
    it('should track participant count correctly when adding participant for round 2', () => {
      const thread = createMockThread({ id: 'thread-123' });

      // Round 1: Start with 2 participants
      const round1Participants = createMockParticipants(2, thread.id);
      store.getState().initializeThread(thread, round1Participants, []);
      store.getState().startRound(0, 2);
      store.getState().initializeSubscriptions(0, 2);

      expect(store.getState().participants).toHaveLength(2);
      expect(store.getState().subscriptionState.participants).toHaveLength(2);
      expect(store.getState().currentRoundNumber).toBe(0);

      // Complete round 1
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
      store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
      store.getState().onParticipantComplete(1);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

      // User adds a third participant for round 2
      const round2Participants = createMockParticipants(3, thread.id);
      store.getState().updateParticipants(round2Participants);

      expect(store.getState().participants).toHaveLength(3);

      // Start round 2 with 3 participants
      store.getState().startRound(1, 3);
      store.getState().initializeSubscriptions(1, 3);

      const state = store.getState();
      expect(state.currentRoundNumber).toBe(1);
      expect(state.participants).toHaveLength(3);
      expect(state.subscriptionState.participants).toHaveLength(3);

      // The enabled count should match the subscription count
      const enabledCount = state.participants.filter(p => p.isEnabled).length;
      expect(enabledCount).toBe(3);
    });

    it('should track participant count correctly when removing participant for round 2', () => {
      const thread = createMockThread({ id: 'thread-123' });

      // Round 1: Start with 3 participants
      const round1Participants = createMockParticipants(3, thread.id);
      store.getState().initializeThread(thread, round1Participants, []);
      store.getState().startRound(0, 3);
      store.getState().initializeSubscriptions(0, 3);

      expect(store.getState().participants).toHaveLength(3);

      // User removes a participant for round 2 (disables one)
      const round2Participants = createMockParticipants(3, thread.id);
      const r2Participant2 = round2Participants[2];
      if (r2Participant2) {
        r2Participant2.isEnabled = false;
      }
      store.getState().updateParticipants(round2Participants);

      const state = store.getState();
      const enabledCount = state.participants.filter(p => p.isEnabled).length;
      expect(enabledCount).toBe(2);
    });

    it('should have store.participants count match subscription initialization', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(3, thread.id);

      store.getState().initializeThread(thread, participants, []);

      // When initializing subscriptions, should use the same count as enabled participants
      const enabledCount = store.getState().participants.filter(p => p.isEnabled).length;
      store.getState().initializeSubscriptions(0, enabledCount);

      expect(store.getState().subscriptionState.participants).toHaveLength(enabledCount);
    });
  });

  // ===========================================================================
  // Consistency between currentRoundNumber and participants
  // ===========================================================================

  describe('currentRoundNumber and participants consistency', () => {
    it('should have consistent data when reading from store state', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(3, thread.id);
      const messages: UIMessage[] = [
        createTestUserMessage({
          content: 'Hello',
          id: `${thread.id}_r0_user`,
          roundNumber: 0,
        }),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setCurrentRoundNumber(0);

      const state = store.getState();

      // Both should be from the same source (store state)
      const roundNumber = state.currentRoundNumber;
      const storeParticipantCount = state.participants.filter(p => p.isEnabled).length;

      expect(roundNumber).toBe(0);
      expect(storeParticipantCount).toBe(3);
    });

    it('should track participant changes correctly during streaming', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const initialParticipants = createMockParticipants(2, thread.id);

      // Initialize and start streaming
      store.getState().initializeThread(thread, initialParticipants, []);
      store.getState().startRound(0, 2);
      store.getState().setIsStreaming(true);

      // Verify initial state
      expect(store.getState().currentRoundNumber).toBe(0);
      expect(store.getState().participants.filter(p => p.isEnabled)).toHaveLength(2);
      expect(store.getState().isStreaming).toBe(true);

      // User adds a participant mid-round (this should update store.participants)
      const updatedParticipants = createMockParticipants(3, thread.id);
      store.getState().updateParticipants(updatedParticipants);

      // Store participants should now be 3
      const state = store.getState();
      expect(state.currentRoundNumber).toBe(0);
      expect(state.participants.filter(p => p.isEnabled)).toHaveLength(3);

      // The key insight: when logging, we should use store.participants
      // not props participants to get the current accurate count
    });
  });

  // ===========================================================================
  // getEnabledParticipantCount helper behavior
  // ===========================================================================

  describe('enabled participant count calculation', () => {
    it('should calculate correct enabled count from store participants', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(4, thread.id);
      // Disable 2 of the 4 participants
      const p1 = participants[1];
      const p3 = participants[3];
      if (p1) {
        p1.isEnabled = false;
      }
      if (p3) {
        p3.isEnabled = false;
      }

      store.getState().initializeThread(thread, participants, []);

      const state = store.getState();
      const enabledCount = state.participants.filter(p => p.isEnabled).length;

      expect(state.participants).toHaveLength(4);
      expect(enabledCount).toBe(2);
    });

    it('should return 0 when no participants', () => {
      const thread = createMockThread({ id: 'thread-123' });

      store.getState().initializeThread(thread, [], []);

      const state = store.getState();
      const enabledCount = state.participants.filter(p => p.isEnabled).length;

      expect(enabledCount).toBe(0);
    });

    it('should return 0 when all participants disabled', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(3, thread.id);
      for (const p of participants) {
        p.isEnabled = false;
      }

      store.getState().initializeThread(thread, participants, []);

      const state = store.getState();
      const enabledCount = state.participants.filter(p => p.isEnabled).length;

      expect(enabledCount).toBe(0);
    });
  });
});
