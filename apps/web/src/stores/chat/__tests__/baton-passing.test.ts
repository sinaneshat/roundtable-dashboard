/**
 * Baton Passing Tests
 *
 * Tests for turn-based participant completion and handoffs.
 * Per FLOW_DOCUMENTATION.md:
 * - Participants complete one at a time (baton passing)
 * - P0 completes → P1 starts → P1 completes → P2 starts...
 * - All participants complete → Moderator starts
 * - Baton can be passed in any order (out-of-order completion allowed)
 *
 * @see docs/FLOW_DOCUMENTATION.md Section "Turn-Based Streaming"
 */

import { describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
} from '@/lib/testing';

import { createChatStore } from '../store';
import type { EntityStatus } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Setup
// ============================================================================

type _TestStore = ReturnType<typeof createChatStore>;

function setupStore(participantCount = 3) {
  const store = createChatStore();
  const participants = createMockParticipants(participantCount);
  const thread = createMockThread({ id: 'thread-baton' });

  store.setState({ participants, thread });
  store.getState().startRound(0, participantCount);
  store.getState().initializeSubscriptions(0, participantCount);

  return { participants, store, thread };
}

// ============================================================================
// SCENARIO: Sequential Baton Passing (Happy Path)
// ============================================================================

describe('sequential Baton Passing (P0 → P1 → P2 → Moderator)', () => {
  it('should track individual participant completion correctly', () => {
    const { store } = setupStore(3);

    // Initially all idle
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('idle');
    expect(store.getState().subscriptionState.participants[2]?.status).toBe('idle');

    // P0 streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');

    // P0 completes
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');

    // P1 streaming
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('streaming');

    // P1 completes
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('complete');

    // P2 streaming
    store.getState().updateEntitySubscriptionStatus(2, 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.participants[2]?.status).toBe('streaming');

    // P2 completes → Moderator should start
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);
    expect(store.getState().subscriptionState.participants[2]?.status).toBe('complete');
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should remain in PARTICIPANTS phase until all complete', () => {
    const { store } = setupStore(3);

    // P0 completes
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P1 completes
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P2 completes → transitions
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO: Out-of-Order Baton Completion
// ============================================================================

describe('out-of-Order Baton Completion', () => {
  it('should handle P2 completing before P0', () => {
    const { store } = setupStore(3);

    // P2 completes first (unusual but valid)
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P0 completes
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P1 completes last → all done
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle interleaved completion order', () => {
    const { store } = setupStore(4);

    // Complete in order: P1, P3, P0, P2
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(3, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(3);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should count completed participants correctly regardless of order', () => {
    const { store } = setupStore(5);

    // Complete in random order
    const completionOrder = [3, 1, 4, 0, 2];

    completionOrder.forEach((index, i) => {
      store.getState().updateEntitySubscriptionStatus(index, 'complete' as EntityStatus, 100);
      store.getState().onParticipantComplete(index);

      const completedCount = store.getState().subscriptionState.participants.filter(p => p.status === 'complete' || p.status === 'error').length;

      expect(completedCount).toBe(i + 1);
    });

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO: Streaming Status Tracking
// ============================================================================

describe('streaming Status Tracking', () => {
  it('should track lastSeq for each participant independently', () => {
    const { store } = setupStore(3);

    // Different seq values for different participants
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 25);
    store.getState().updateEntitySubscriptionStatus(2, 'streaming' as EntityStatus, 100);

    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(50);
    expect(store.getState().subscriptionState.participants[1]?.lastSeq).toBe(25);
    expect(store.getState().subscriptionState.participants[2]?.lastSeq).toBe(100);
  });

  it('should update lastSeq as streaming progresses', () => {
    const { store } = setupStore(2);

    // P0 streaming progress
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(10);

    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 25);
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(25);

    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(50);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(100);
  });

  it('should preserve lastSeq when transitioning to complete', () => {
    const { store } = setupStore(2);

    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 75);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);

    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(100);
  });
});

// ============================================================================
// SCENARIO: Error Handling in Baton Passing
// ============================================================================

describe('error Handling in Baton Passing', () => {
  it('should treat error as terminal state for phase transition', () => {
    const { store } = setupStore(3);

    // P0 errors
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 50, 'API timeout');
    store.getState().onParticipantComplete(0);

    // P1 completes
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);

    // P2 completes → should transition
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should track error message per participant', () => {
    const { store } = setupStore(2);

    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 10, 'Rate limit exceeded');
    store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus, 20, 'Model unavailable');

    expect(store.getState().subscriptionState.participants[0]?.errorMessage).toBe('Rate limit exceeded');
    expect(store.getState().subscriptionState.participants[1]?.errorMessage).toBe('Model unavailable');
  });

  it('should continue to moderator even if all participants error', () => {
    const { store } = setupStore(2);

    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 10, 'Error 1');
    store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus, 10, 'Error 2');
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO: Moderator Baton Pass
// ============================================================================

describe('moderator Baton Pass', () => {
  it('should transition to moderator after all participants complete', () => {
    const { store } = setupStore(2);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    expect(store.getState().subscriptionState.moderator.status).toBe('idle');
  });

  it('should track moderator streaming status', () => {
    const { store } = setupStore(2);

    // Complete participants
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    // Moderator streams
    store.getState().updateEntitySubscriptionStatus('moderator', 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.moderator.status).toBe('streaming');

    store.getState().updateEntitySubscriptionStatus('moderator', 'streaming' as EntityStatus, 50);
    expect(store.getState().subscriptionState.moderator.lastSeq).toBe(50);

    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 100);
    expect(store.getState().subscriptionState.moderator.status).toBe('complete');
  });

  it('should complete round when moderator finishes', () => {
    const { store } = setupStore(2);

    // Complete participants
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    // Moderator completes
    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 100);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// SCENARIO: Pre-Search Before Participants
// ============================================================================

describe('pre-Search Before Participants', () => {
  it('should track presearch status separately', () => {
    const { store } = setupStore(2);

    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.presearch.status).toBe('streaming');

    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 50);
    expect(store.getState().subscriptionState.presearch.status).toBe('complete');
    expect(store.getState().subscriptionState.presearch.lastSeq).toBe(50);
  });

  it('should allow presearch and participants to have independent status', () => {
    const { store } = setupStore(2);

    // Presearch streaming
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 25);

    // P0 streaming at same time
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);

    expect(store.getState().subscriptionState.presearch.status).toBe('streaming');
    expect(store.getState().subscriptionState.presearch.lastSeq).toBe(25);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(10);
  });
});

// ============================================================================
// SCENARIO: Subscription State Reset Between Rounds
// ============================================================================

describe('subscription State Reset Between Rounds', () => {
  it('should reset subscription state for new round', () => {
    const { store } = setupStore(2);

    // Complete round 0
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Start round 1
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);

    // Subscription state should be reset
    expect(store.getState().subscriptionState.activeRoundNumber).toBe(1);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(0);
    expect(store.getState().subscriptionState.moderator.status).toBe('idle');
    expect(store.getState().subscriptionState.presearch.status).toBe('idle');
  });

  it('should handle different participant counts between rounds', () => {
    const store = createChatStore();
    const participants = createMockParticipants(3);
    const thread = createMockThread({ id: 'thread-baton-count' });
    store.setState({ participants, thread });

    // Round 0 with 3 participants
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);
    expect(store.getState().subscriptionState.participants).toHaveLength(3);

    // Complete and prepare for round 1
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onParticipantComplete(2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1 with 2 participants (user removed one)
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);
    expect(store.getState().subscriptionState.participants).toHaveLength(2);
  });
});

// ============================================================================
// SCENARIO: Concurrent Status Updates
// ============================================================================

describe('concurrent Status Updates', () => {
  it('should handle rapid status updates correctly', () => {
    const { store } = setupStore(2);

    // Rapid P0 updates (simulating real streaming)
    for (let seq = 1; seq <= 50; seq++) {
      store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, seq);
    }

    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(50);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
  });

  it('should handle interleaved updates across participants', () => {
    const { store } = setupStore(3);

    // Interleaved updates
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 5);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 20);
    store.getState().updateEntitySubscriptionStatus(2, 'streaming' as EntityStatus, 15);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 10);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);

    expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(100);
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('streaming');
    expect(store.getState().subscriptionState.participants[1]?.lastSeq).toBe(10);
    expect(store.getState().subscriptionState.participants[2]?.status).toBe('streaming');
    expect(store.getState().subscriptionState.participants[2]?.lastSeq).toBe(15);
  });
});
