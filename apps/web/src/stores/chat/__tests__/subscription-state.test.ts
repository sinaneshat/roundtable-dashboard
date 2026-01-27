/**
 * Subscription State Management Tests
 *
 * Tests the chat store's subscription state management following TDD principles.
 * Based on FLOW_DOCUMENTATION.md subscription patterns and baton-passing mechanism.
 *
 * Key scenarios tested:
 * 1. initializeSubscriptions - creates slots for participants with correct initial state
 * 2. updateEntitySubscriptionStatus - updates presearch/moderator/participant status
 * 3. clearSubscriptionState - resets to SUBSCRIPTION_DEFAULTS
 * 4. Phase transitions affected by subscription state (onParticipantComplete)
 * 5. Round number changes and subscription state re-initialization
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockParticipants, createMockThread } from '@/lib/testing';

import { createChatStore } from '../store';
import { SUBSCRIPTION_DEFAULTS } from '../store-defaults';
import type { EntityStatus } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

describe('subscription State Management', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  // ============================================================================
  // 1. initializeSubscriptions
  // ============================================================================

  describe('initializeSubscriptions', () => {
    it('should create participant subscription slots for each participant', () => {
      const participantCount = 3;
      const roundNumber = 0;

      store.getState().initializeSubscriptions(roundNumber, participantCount);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.participants).toHaveLength(participantCount);
    });

    it('should initialize all participant statuses to idle', () => {
      const participantCount = 4;
      const roundNumber = 0;

      store.getState().initializeSubscriptions(roundNumber, participantCount);

      const { subscriptionState } = store.getState();

      subscriptionState.participants.forEach((participant) => {
        expect(participant.status).toBe('idle');
      });
    });

    it('should set activeRoundNumber correctly', () => {
      const roundNumber = 2;
      const participantCount = 3;

      store.getState().initializeSubscriptions(roundNumber, participantCount);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.activeRoundNumber).toBe(roundNumber);
    });

    it('should initialize lastSeq to 0 for all entities', () => {
      const participantCount = 2;
      const roundNumber = 1;

      store.getState().initializeSubscriptions(roundNumber, participantCount);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.presearch.lastSeq).toBe(0);
      expect(subscriptionState.moderator.lastSeq).toBe(0);
      subscriptionState.participants.forEach((participant) => {
        expect(participant.lastSeq).toBe(0);
      });
    });

    it('should initialize presearch status to idle', () => {
      const roundNumber = 0;
      const participantCount = 3;

      store.getState().initializeSubscriptions(roundNumber, participantCount);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.presearch.status).toBe('idle');
      expect(subscriptionState.presearch.errorMessage).toBeUndefined();
    });

    it('should initialize moderator status to idle', () => {
      const roundNumber = 0;
      const participantCount = 3;

      store.getState().initializeSubscriptions(roundNumber, participantCount);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.moderator.status).toBe('idle');
      expect(subscriptionState.moderator.errorMessage).toBeUndefined();
    });

    it('should handle different participant counts correctly', () => {
      // Single participant
      store.getState().initializeSubscriptions(0, 1);
      expect(store.getState().subscriptionState.participants).toHaveLength(1);

      // Reset and try larger count
      store.getState().clearSubscriptionState();
      store.getState().initializeSubscriptions(0, 5);
      expect(store.getState().subscriptionState.participants).toHaveLength(5);
    });

    it('should overwrite previous subscription state on re-initialization', () => {
      // First initialization
      store.getState().initializeSubscriptions(0, 3);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);

      // Re-initialize with different round
      store.getState().initializeSubscriptions(1, 2);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.activeRoundNumber).toBe(1);
      expect(subscriptionState.participants).toHaveLength(2);
      expect(subscriptionState.participants[0]?.status).toBe('idle');
      expect(subscriptionState.participants[0]?.lastSeq).toBe(0);
    });
  });

  // ============================================================================
  // 2. updateEntitySubscriptionStatus
  // ============================================================================

  describe('updateEntitySubscriptionStatus', () => {
    beforeEach(() => {
      store.getState().initializeSubscriptions(0, 3);
    });

    describe('presearch status', () => {
      it('should update presearch status correctly', () => {
        store.getState().updateEntitySubscriptionStatus('presearch', 'streaming');

        const { subscriptionState } = store.getState();

        expect(subscriptionState.presearch.status).toBe('streaming');
      });

      it('should update presearch to complete status', () => {
        store.getState().updateEntitySubscriptionStatus('presearch', 'streaming');
        store.getState().updateEntitySubscriptionStatus('presearch', 'complete', 50);

        const { subscriptionState } = store.getState();

        expect(subscriptionState.presearch.status).toBe('complete');
        expect(subscriptionState.presearch.lastSeq).toBe(50);
      });

      it('should update presearch error status with message', () => {
        const errorMsg = 'Search failed due to network error';

        store.getState().updateEntitySubscriptionStatus('presearch', 'error', 10, errorMsg);

        const { subscriptionState } = store.getState();

        expect(subscriptionState.presearch.status).toBe('error');
        expect(subscriptionState.presearch.errorMessage).toBe(errorMsg);
        expect(subscriptionState.presearch.lastSeq).toBe(10);
      });

      it('should support valid presearch status transitions (terminal states prevent regression)', () => {
        // Test forward transitions (non-terminal states can change freely)
        const forwardTransitions: EntityStatus[] = ['idle', 'waiting', 'streaming'];

        forwardTransitions.forEach((status) => {
          store.getState().updateEntitySubscriptionStatus('presearch', status);
          expect(store.getState().subscriptionState.presearch.status).toBe(status);
        });

        // Terminal state: complete
        store.getState().updateEntitySubscriptionStatus('presearch', 'complete');
        expect(store.getState().subscriptionState.presearch.status).toBe('complete');

        // Once complete, status should NOT regress to non-terminal states
        // (This protects against race conditions from concurrent tabs/reconnects)
        store.getState().updateEntitySubscriptionStatus('presearch', 'streaming');
        expect(store.getState().subscriptionState.presearch.status).toBe('complete');

        // But another terminal state (error) can still be set
        store.getState().updateEntitySubscriptionStatus('presearch', 'error');
        expect(store.getState().subscriptionState.presearch.status).toBe('error');
      });

      it('should support disabled status transition', () => {
        // Test disabled separately (fresh state)
        store.getState().updateEntitySubscriptionStatus('presearch', 'disabled');
        expect(store.getState().subscriptionState.presearch.status).toBe('disabled');
      });
    });

    describe('moderator status', () => {
      it('should update moderator status correctly', () => {
        store.getState().updateEntitySubscriptionStatus('moderator', 'streaming');

        const { subscriptionState } = store.getState();

        expect(subscriptionState.moderator.status).toBe('streaming');
      });

      it('should update moderator to complete with lastSeq', () => {
        store.getState().updateEntitySubscriptionStatus('moderator', 'streaming', 25);
        store.getState().updateEntitySubscriptionStatus('moderator', 'complete', 100);

        const { subscriptionState } = store.getState();

        expect(subscriptionState.moderator.status).toBe('complete');
        expect(subscriptionState.moderator.lastSeq).toBe(100);
      });

      it('should update moderator error status with message', () => {
        const errorMsg = 'Moderator synthesis failed';

        store.getState().updateEntitySubscriptionStatus('moderator', 'error', 5, errorMsg);

        const { subscriptionState } = store.getState();

        expect(subscriptionState.moderator.status).toBe('error');
        expect(subscriptionState.moderator.errorMessage).toBe(errorMsg);
      });

      it('should transition moderator through typical lifecycle', () => {
        // Typical flow: idle -> waiting -> streaming -> complete
        store.getState().updateEntitySubscriptionStatus('moderator', 'waiting');
        expect(store.getState().subscriptionState.moderator.status).toBe('waiting');

        store.getState().updateEntitySubscriptionStatus('moderator', 'streaming', 1);
        expect(store.getState().subscriptionState.moderator.status).toBe('streaming');

        store.getState().updateEntitySubscriptionStatus('moderator', 'complete', 150);
        expect(store.getState().subscriptionState.moderator.status).toBe('complete');
        expect(store.getState().subscriptionState.moderator.lastSeq).toBe(150);
      });
    });

    describe('participant status by index', () => {
      it('should update participant 0 status correctly', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'streaming');

        const { subscriptionState } = store.getState();

        expect(subscriptionState.participants[0]?.status).toBe('streaming');
        expect(subscriptionState.participants[1]?.status).toBe('idle');
        expect(subscriptionState.participants[2]?.status).toBe('idle');
      });

      it('should update participant 1 status correctly', () => {
        store.getState().updateEntitySubscriptionStatus(1, 'complete', 75);

        const { subscriptionState } = store.getState();

        expect(subscriptionState.participants[0]?.status).toBe('idle');
        expect(subscriptionState.participants[1]?.status).toBe('complete');
        expect(subscriptionState.participants[1]?.lastSeq).toBe(75);
        expect(subscriptionState.participants[2]?.status).toBe('idle');
      });

      it('should update last participant correctly', () => {
        store.getState().updateEntitySubscriptionStatus(2, 'streaming', 30);

        const { subscriptionState } = store.getState();

        expect(subscriptionState.participants[2]?.status).toBe('streaming');
        expect(subscriptionState.participants[2]?.lastSeq).toBe(30);
      });

      it('should update lastSeq when provided', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 10);
        expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(10);

        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 20);
        expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(20);
      });

      it('should update errorMessage when provided', () => {
        const errorMsg = 'Participant stream timeout';

        store.getState().updateEntitySubscriptionStatus(1, 'error', 5, errorMsg);

        const { subscriptionState } = store.getState();

        expect(subscriptionState.participants[1]?.status).toBe('error');
        expect(subscriptionState.participants[1]?.errorMessage).toBe(errorMsg);
      });

      it('should not crash for out-of-bounds participant index', () => {
        // Index 10 doesn't exist (we only have 3 participants)
        // Should gracefully handle this
        expect(() => {
          store.getState().updateEntitySubscriptionStatus(10, 'streaming');
        }).not.toThrow();
      });

      it('should track multiple participants independently', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 10);
        store.getState().updateEntitySubscriptionStatus(1, 'waiting');
        store.getState().updateEntitySubscriptionStatus(2, 'idle');

        const { subscriptionState } = store.getState();

        expect(subscriptionState.participants[0]?.status).toBe('streaming');
        expect(subscriptionState.participants[0]?.lastSeq).toBe(10);
        expect(subscriptionState.participants[1]?.status).toBe('waiting');
        expect(subscriptionState.participants[2]?.status).toBe('idle');
      });
    });

    describe('lastSeq tracking', () => {
      it('should preserve lastSeq when not provided in update', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 50);
        store.getState().updateEntitySubscriptionStatus(0, 'complete');

        const { subscriptionState } = store.getState();

        expect(subscriptionState.participants[0]?.lastSeq).toBe(50);
        expect(subscriptionState.participants[0]?.status).toBe('complete');
      });

      it('should enforce monotonically increasing lastSeq (race condition protection)', () => {
        // lastSeq should only increase - this prevents race conditions where
        // out-of-order updates could overwrite newer data with older data
        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 10);
        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 5); // Older seq ignored
        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 20); // Higher seq accepted

        const { subscriptionState } = store.getState();

        expect(subscriptionState.participants[0]?.lastSeq).toBe(20);
      });

      it('should reset lastSeq via initializeSubscriptions for new rounds', () => {
        // To actually reset lastSeq to 0, use initializeSubscriptions (new round)
        store.getState().updateEntitySubscriptionStatus(0, 'streaming', 100);
        expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(100);

        // Initialize for a new round resets everything
        store.getState().initializeSubscriptions(1, 2);
        expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(0);
      });
    });
  });

  // ============================================================================
  // 3. clearSubscriptionState
  // ============================================================================

  describe('clearSubscriptionState', () => {
    it('should reset to SUBSCRIPTION_DEFAULTS', () => {
      // First set up some state
      store.getState().initializeSubscriptions(2, 4);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
      store.getState().updateEntitySubscriptionStatus(1, 'streaming', 50);
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete', 30);

      // Clear
      store.getState().clearSubscriptionState();

      const { subscriptionState } = store.getState();

      expect(subscriptionState).toEqual(SUBSCRIPTION_DEFAULTS);
    });

    it('should clear all participant subscription slots', () => {
      store.getState().initializeSubscriptions(0, 5);
      expect(store.getState().subscriptionState.participants).toHaveLength(5);

      store.getState().clearSubscriptionState();

      expect(store.getState().subscriptionState.participants).toHaveLength(0);
    });

    it('should reset activeRoundNumber to -1', () => {
      store.getState().initializeSubscriptions(3, 2);
      expect(store.getState().subscriptionState.activeRoundNumber).toBe(3);

      store.getState().clearSubscriptionState();

      expect(store.getState().subscriptionState.activeRoundNumber).toBe(-1);
    });

    it('should reset presearch state', () => {
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete', 100, undefined);

      store.getState().clearSubscriptionState();

      const { subscriptionState } = store.getState();

      expect(subscriptionState.presearch.status).toBe('idle');
      expect(subscriptionState.presearch.lastSeq).toBe(0);
      expect(subscriptionState.presearch.errorMessage).toBeUndefined();
    });

    it('should reset moderator state', () => {
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus('moderator', 'streaming', 50);

      store.getState().clearSubscriptionState();

      const { subscriptionState } = store.getState();

      expect(subscriptionState.moderator.status).toBe('idle');
      expect(subscriptionState.moderator.lastSeq).toBe(0);
    });

    it('should be idempotent - multiple clears should have same result', () => {
      store.getState().initializeSubscriptions(1, 3);
      store.getState().clearSubscriptionState();
      const firstClear = store.getState().subscriptionState;

      store.getState().clearSubscriptionState();
      const secondClear = store.getState().subscriptionState;

      expect(firstClear).toEqual(secondClear);
      expect(firstClear).toEqual(SUBSCRIPTION_DEFAULTS);
    });
  });

  // ============================================================================
  // 4. Subscription state affects phase transitions
  // ============================================================================

  describe('subscription state affects phase transitions', () => {
    beforeEach(() => {
      // Set up a realistic streaming scenario
      const participants = createMockParticipants(3);
      const thread = createMockThread();

      store.setState({
        currentRoundNumber: 0,
        isStreaming: true,
        participants,
        phase: ChatPhases.PARTICIPANTS,
        thread,
      });

      store.getState().initializeSubscriptions(0, 3);
    });

    describe('onParticipantComplete checks subscriptionState.participants', () => {
      it('should NOT transition to MODERATOR when only some participants are complete', () => {
        // Mark only P0 as complete
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);

        // Call onParticipantComplete
        store.getState().onParticipantComplete(0);

        const { phase } = store.getState();

        expect(phase).toBe(ChatPhases.PARTICIPANTS);
      });

      it('should transition to MODERATOR when all participants have status complete', () => {
        // Mark all participants as complete
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);

        // Call onParticipantComplete for the last one
        store.getState().onParticipantComplete(2);

        const { phase } = store.getState();

        expect(phase).toBe(ChatPhases.MODERATOR);
      });

      it('should transition to MODERATOR when all participants have status complete or error', () => {
        // P0 complete, P1 error, P2 complete
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(1, 'error', 50, 'API error');
        store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);

        // Call onParticipantComplete
        store.getState().onParticipantComplete(2);

        const { phase } = store.getState();

        expect(phase).toBe(ChatPhases.MODERATOR);
      });

      it('should handle out-of-order completion (P1 finishes before P0)', () => {
        // P1 completes first (out of order)
        store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);

        store.getState().onParticipantComplete(1);

        // Should NOT transition yet
        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

        // Now P0 completes
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().onParticipantComplete(0);

        // Still not all complete
        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

        // Finally P2 completes
        store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);
        store.getState().onParticipantComplete(2);

        // NOW should transition to MODERATOR
        expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
      });

      it('should handle reverse order completion (P2 -> P1 -> P0)', () => {
        // P2 completes first
        store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);
        store.getState().onParticipantComplete(2);
        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

        // P1 completes second
        store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
        store.getState().onParticipantComplete(1);
        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

        // P0 completes last
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().onParticipantComplete(0);
        expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
      });

      it('should NOT transition when some participants are still streaming', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(1, 'streaming', 50);
        store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);

        store.getState().onParticipantComplete(2);

        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      });

      it('should NOT transition when some participants are still waiting', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(2, 'waiting');

        store.getState().onParticipantComplete(1);

        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      });

      it('should NOT transition when some participants are still idle', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
        // P2 is still idle (default)

        store.getState().onParticipantComplete(1);

        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      });
    });

    describe('error handling in phase transitions', () => {
      it('should count error status as complete for transition purposes', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'error', 10, 'Timeout');
        store.getState().updateEntitySubscriptionStatus(1, 'error', 20, 'API error');
        store.getState().updateEntitySubscriptionStatus(2, 'error', 30, 'Network error');

        store.getState().onParticipantComplete(2);

        // All errors still means all "done"
        expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
      });

      it('should handle mixed complete and error states', () => {
        store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
        store.getState().updateEntitySubscriptionStatus(1, 'error', 50, 'Failed');
        store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);

        store.getState().onParticipantComplete(2);

        expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
      });
    });
  });

  // ============================================================================
  // 5. Round number changes reset subscription state
  // ============================================================================

  describe('round number changes reset subscription state', () => {
    it('should re-initialize subscription state when round number increases', () => {
      // Round 0
      store.getState().initializeSubscriptions(0, 3);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
      store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);
      store.getState().updateEntitySubscriptionStatus(2, 'complete', 100);

      expect(store.getState().subscriptionState.activeRoundNumber).toBe(0);

      // Round 1 - should reset
      store.getState().initializeSubscriptions(1, 3);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.activeRoundNumber).toBe(1);
      expect(subscriptionState.participants[0]?.status).toBe('idle');
      expect(subscriptionState.participants[1]?.status).toBe('idle');
      expect(subscriptionState.participants[2]?.status).toBe('idle');
      expect(subscriptionState.presearch.status).toBe('idle');
      expect(subscriptionState.moderator.status).toBe('idle');
    });

    it('should handle participant count changes between rounds', () => {
      // Round 0 with 2 participants
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
      store.getState().updateEntitySubscriptionStatus(1, 'complete', 100);

      expect(store.getState().subscriptionState.participants).toHaveLength(2);

      // Round 1 with 4 participants (added more)
      store.getState().initializeSubscriptions(1, 4);

      expect(store.getState().subscriptionState.participants).toHaveLength(4);
      expect(store.getState().subscriptionState.activeRoundNumber).toBe(1);
    });

    it('should handle participant count decrease between rounds', () => {
      // Round 0 with 5 participants
      store.getState().initializeSubscriptions(0, 5);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);

      // Round 1 with 2 participants (removed some)
      store.getState().initializeSubscriptions(1, 2);

      expect(store.getState().subscriptionState.participants).toHaveLength(2);
    });

    it('should clear presearch state on new round', () => {
      // Round 0 with completed presearch
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete', 50);

      // Round 1
      store.getState().initializeSubscriptions(1, 2);

      expect(store.getState().subscriptionState.presearch.status).toBe('idle');
      expect(store.getState().subscriptionState.presearch.lastSeq).toBe(0);
    });

    it('should clear moderator state on new round', () => {
      // Round 0 with completed moderator
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus('moderator', 'complete', 200);

      // Round 1
      store.getState().initializeSubscriptions(1, 2);

      expect(store.getState().subscriptionState.moderator.status).toBe('idle');
      expect(store.getState().subscriptionState.moderator.lastSeq).toBe(0);
    });
  });

  // ============================================================================
  // Integration: startRound and subscription state
  // ============================================================================

  describe('startRound integration with subscription state', () => {
    it('should start round and allow subscription initialization', () => {
      const roundNumber = 0;
      const participantCount = 3;

      store.getState().startRound(roundNumber, participantCount);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      expect(store.getState().currentRoundNumber).toBe(roundNumber);
      expect(store.getState().isStreaming).toBe(true);

      // Initialize subscriptions for the round
      store.getState().initializeSubscriptions(roundNumber, participantCount);

      expect(store.getState().subscriptionState.activeRoundNumber).toBe(roundNumber);
      expect(store.getState().subscriptionState.participants).toHaveLength(participantCount);
    });
  });

  // ============================================================================
  // Edge cases and error scenarios
  // ============================================================================

  describe('edge cases and error scenarios', () => {
    it('should handle empty participant list', () => {
      store.getState().initializeSubscriptions(0, 0);

      expect(store.getState().subscriptionState.participants).toHaveLength(0);
      expect(store.getState().subscriptionState.activeRoundNumber).toBe(0);
    });

    it('should handle single participant', () => {
      const participants = createMockParticipants(1);

      store.setState({
        currentRoundNumber: 0,
        isStreaming: true,
        participants,
        phase: ChatPhases.PARTICIPANTS,
      });

      store.getState().initializeSubscriptions(0, 1);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);

      store.getState().onParticipantComplete(0);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should handle rapid status updates', () => {
      store.getState().initializeSubscriptions(0, 3);

      // Rapid updates to P0
      store.getState().updateEntitySubscriptionStatus(0, 'waiting');
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 1);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 10);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 20);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 30);

      expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
      expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(30);
    });

    it('should handle updates before initialization', () => {
      // No initialization yet
      expect(() => {
        store.getState().updateEntitySubscriptionStatus(0, 'streaming');
      }).not.toThrow();
    });

    it('should handle disabled status', () => {
      store.getState().initializeSubscriptions(0, 3);
      store.getState().updateEntitySubscriptionStatus(1, 'disabled');

      expect(store.getState().subscriptionState.participants[1]?.status).toBe('disabled');
    });
  });

  // ============================================================================
  // Concurrent access patterns (simulated)
  // ============================================================================

  describe('concurrent access patterns', () => {
    it('should handle multiple entity updates in sequence', () => {
      store.getState().initializeSubscriptions(0, 3);

      // Simulate concurrent-ish updates
      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming', 1);
      store.getState().updateEntitySubscriptionStatus(0, 'waiting');
      store.getState().updateEntitySubscriptionStatus(1, 'waiting');
      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming', 10);
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete', 20);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 1);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.presearch.status).toBe('complete');
      expect(subscriptionState.presearch.lastSeq).toBe(20);
      expect(subscriptionState.participants[0]?.status).toBe('streaming');
      expect(subscriptionState.participants[1]?.status).toBe('waiting');
      expect(subscriptionState.participants[2]?.status).toBe('idle');
    });

    it('should maintain consistency during baton passing', () => {
      const participants = createMockParticipants(3);

      store.setState({
        currentRoundNumber: 0,
        isStreaming: true,
        participants,
        phase: ChatPhases.PARTICIPANTS,
      });

      store.getState().initializeSubscriptions(0, 3);

      // P0 streaming -> complete
      store.getState().updateEntitySubscriptionStatus(0, 'streaming', 1);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 50);

      // P1 picks up baton
      store.getState().updateEntitySubscriptionStatus(1, 'streaming', 1);

      const { subscriptionState } = store.getState();

      expect(subscriptionState.participants[0]?.status).toBe('complete');
      expect(subscriptionState.participants[1]?.status).toBe('streaming');
      expect(subscriptionState.participants[2]?.status).toBe('idle');
    });
  });
});
