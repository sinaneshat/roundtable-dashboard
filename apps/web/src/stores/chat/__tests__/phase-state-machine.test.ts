/**
 * Phase State Machine Tests
 *
 * Tests for the chat phase state machine transitions.
 * Per FLOW_DOCUMENTATION.md:
 * - Simple phase machine: IDLE → PARTICIPANTS → MODERATOR → COMPLETE → IDLE
 * - Pre-search happens BEFORE participants in rounds with web search
 * - Phase transitions are triggered by completion callbacks
 *
 * @see docs/FLOW_DOCUMENTATION.md Section "Phase Transitions"
 */

import { MessageStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
} from '@/lib/testing';

import { createChatStore } from '../store';
import type { EntityStatus } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Setup
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

function setupStore(participantCount: number = 2, enableWebSearch: boolean = false) {
  const store = createChatStore();
  const participants = createMockParticipants(participantCount);
  const thread = createMockThread({ enableWebSearch, id: 'thread-phase' });

  store.setState({ participants, thread });
  store.getState().setEnableWebSearch(enableWebSearch);

  return { participants, store, thread };
}

// ============================================================================
// SCENARIO: Basic Phase Flow (IDLE → PARTICIPANTS → MODERATOR → COMPLETE)
// ============================================================================

describe('basic Phase Flow', () => {
  it('should start in IDLE phase', () => {
    const { store } = setupStore();

    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should transition IDLE → PARTICIPANTS on startRound', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });

  it('should transition PARTICIPANTS → MODERATOR when all participants complete', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Complete P0
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS); // Still waiting

    // Complete P1
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should transition MODERATOR → COMPLETE on onModeratorComplete', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Complete participants
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Complete moderator
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should transition COMPLETE → IDLE on prepareForNewMessage', () => {
    const { store } = setupStore(2);

    // Complete a full round
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Prepare for next round
    store.getState().prepareForNewMessage();

    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });
});

// ============================================================================
// SCENARIO: Phase Transitions with Varying Participant Counts
// ============================================================================

describe('phase Transitions with Varying Participant Counts', () => {
  it('should handle single participant correctly', () => {
    const { store } = setupStore(1);

    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // Complete the only participant
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle 5 participants correctly', () => {
    const { store } = setupStore(5);

    store.getState().startRound(0, 5);
    store.getState().initializeSubscriptions(0, 5);

    // Complete 4 participants - should still be in PARTICIPANTS
    for (let i = 0; i < 4; i++) {
      store.getState().updateEntitySubscriptionStatus(i, 'complete' as EntityStatus, 100);
      store.getState().onParticipantComplete(i);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    }

    // Complete last participant - should transition to MODERATOR
    store.getState().updateEntitySubscriptionStatus(4, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(4);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO: Out-of-Order Participant Completion
// ============================================================================

describe('out-of-Order Participant Completion', () => {
  it('should handle P2 completing before P1', () => {
    const { store } = setupStore(3);

    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // P0 completes first
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P2 completes before P1 (out of order)
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P1 completes last
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle all participants completing in reverse order', () => {
    const { store } = setupStore(3);

    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // Complete in reverse order: P2 → P1 → P0
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO: Error Status Handling
// ============================================================================

describe('error Status Handling in Phase Transitions', () => {
  it('should treat error status as complete for phase transition', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 errors out
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 50, 'API Error');
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P1 completes normally
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);

    // Should transition despite error (graceful degradation)
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle all participants erroring', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Both error
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 10, 'Error 1');
    store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus, 20, 'Error 2');
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    // Should still transition to moderator
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO: Multi-Round Phase Cycling
// ============================================================================

describe('multi-Round Phase Cycling', () => {
  it('should correctly cycle through phases for multiple rounds', () => {
    const { store } = setupStore(2);

    // Round 0
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    store.getState().startRound(0, 2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    store.getState().prepareForNewMessage();
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // Round 1
    store.getState().startRound(1, 2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().initializeSubscriptions(1, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should track current round number correctly', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    expect(store.getState().currentRoundNumber).toBe(0);

    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    store.getState().startRound(1, 2);
    expect(store.getState().currentRoundNumber).toBe(1);

    store.getState().initializeSubscriptions(1, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    store.getState().startRound(2, 2);
    expect(store.getState().currentRoundNumber).toBe(2);
  });
});

// ============================================================================
// SCENARIO: isStreaming Flag Management
// ============================================================================

describe('isStreaming Flag Management', () => {
  it('should set isStreaming=true on startRound', () => {
    const { store } = setupStore(2);

    expect(store.getState().isStreaming).toBe(false);

    store.getState().startRound(0, 2);

    expect(store.getState().isStreaming).toBe(true);
  });

  it('should set isStreaming=false on onModeratorComplete', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    expect(store.getState().isStreaming).toBe(true);

    store.getState().onModeratorComplete();

    expect(store.getState().isStreaming).toBe(false);
  });

  it('should keep isStreaming=true during MODERATOR phase', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    expect(store.getState().isStreaming).toBe(true);
  });
});

// ============================================================================
// SCENARIO: currentParticipantIndex Management
// ============================================================================

describe('currentParticipantIndex Management', () => {
  it('should start at 0 on startRound', () => {
    const { store } = setupStore(3);

    store.getState().startRound(0, 3);

    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should be set to last participant index on transition to MODERATOR', () => {
    const { store } = setupStore(3);

    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onParticipantComplete(2);

    // Should be set to last participant index (2 for 3 participants)
    expect(store.getState().currentParticipantIndex).toBe(2);
  });
});

// ============================================================================
// SCENARIO: waitingToStartStreaming Flag
// ============================================================================

describe('waitingToStartStreaming Flag', () => {
  it('should be false after startRound', () => {
    const { store } = setupStore(2);

    // Simulate waiting state
    store.setState({ waitingToStartStreaming: true });

    store.getState().startRound(0, 2);

    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// SCENARIO: Idempotent Phase Transitions
// ============================================================================

describe('idempotent Phase Transitions', () => {
  it('should handle duplicate onParticipantComplete calls gracefully', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Complete P0 multiple times (shouldn't break)
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(0);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // Complete P1
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle multiple onModeratorComplete calls gracefully', () => {
    const { store } = setupStore(2);

    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);

    store.getState().onModeratorComplete();
    store.getState().onModeratorComplete();
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// SCENARIO: Phase Preserved During Active Streaming
// ============================================================================

describe('phase Preserved During Hydration', () => {
  it('should preserve PARTICIPANTS phase during initializeThread if streaming', () => {
    const { store, thread, participants } = setupStore(2);

    // Simulate active streaming
    store.setState({
      isStreaming: true,
      phase: ChatPhases.PARTICIPANTS,
    });

    // Hydration happens
    store.getState().initializeThread(thread, participants, []);

    // Phase should be preserved
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });

  it('should preserve MODERATOR phase during initializeThread if streaming', () => {
    const { store, thread, participants } = setupStore(2);

    store.setState({
      isStreaming: true,
      phase: ChatPhases.MODERATOR,
    });

    store.getState().initializeThread(thread, participants, []);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});
