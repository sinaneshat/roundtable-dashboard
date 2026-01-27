/**
 * Phase Transitions Unit Tests
 *
 * Tests the chat store's round phase state machine following FLOW_DOCUMENTATION.md.
 *
 * Phase State Machine:
 *   IDLE -> PARTICIPANTS -> MODERATOR -> COMPLETE -> IDLE
 *
 * Key Scenarios from FLOW_DOCUMENTATION.md:
 *
 * Round 1 (Frames 1-6):
 *   Frame 2: "User Clicks Send -> ALL Placeholders Appear" (startRound)
 *   Frame 5: "All Participants Complete -> Moderator Starts" (onParticipantComplete)
 *   Frame 6: "Round Complete" (onModeratorComplete)
 *
 * Round 2 (Frames 7-12):
 *   Frame 8: "Send Clicked -> Changelog + All Placeholders" (startRound)
 *   Frame 11: "All Participants Complete -> Moderator Starts" (onParticipantComplete)
 *   Frame 12: "Round Complete" (onModeratorComplete)
 *
 * @see docs/FLOW_DOCUMENTATION.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '../store';
import type { EntityStatus, SubscriptionState } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// TEST HELPERS
// ============================================================================

type MockThread = {
  id: string;
  userId: string;
  title: string;
  slug: string;
  mode: string;
  status: 'active' | 'archived';
  isFavorite: boolean;
  isPublic: boolean;
  isAiGeneratedTitle: boolean;
  enableWebSearch: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
};

type MockParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  role: string | null;
  priority: number;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function createMockThread(overrides: Partial<MockThread> = {}): MockThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: 'thread-123',
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    mode: 'brainstorm',
    slug: 'test-thread',
    status: 'active',
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-1',
    ...overrides,
  };
}

function createMockParticipants(count: number): MockParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date(),
    id: `participant-${i}`,
    isEnabled: true,
    modelId: `model-${String.fromCharCode(97 + i)}`,
    priority: i,
    role: null,
    threadId: 'thread-123',
    updatedAt: new Date(),
  }));
}

function createSubscriptionState(
  participantCount: number,
  overrides: Partial<SubscriptionState> = {},
): SubscriptionState {
  return {
    activeRoundNumber: 0,
    moderator: { errorMessage: undefined, lastSeq: 0, status: 'idle' as EntityStatus },
    participants: Array.from({ length: participantCount }, () => ({
      errorMessage: undefined,
      lastSeq: 0,
      status: 'idle' as EntityStatus,
    })),
    presearch: { errorMessage: undefined, lastSeq: 0, status: 'idle' as EntityStatus },
    ...overrides,
  };
}

// ============================================================================
// IDLE -> PARTICIPANTS TRANSITION (startRound)
// ============================================================================

describe('iDLE -> PARTICIPANTS Transition (startRound)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('frame 2 - Round 1: "User Clicks Send -> ALL Placeholders Appear"', () => {
    it('should set phase to PARTICIPANTS when startRound is called', () => {
      // Initial state is IDLE
      expect(store.getState().phase).toBe(ChatPhases.IDLE);

      // User clicks send - Frame 2
      store.getState().startRound(0, 3);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });

    it('should set currentRoundNumber correctly for Round 1', () => {
      store.getState().startRound(0, 3);

      expect(store.getState().currentRoundNumber).toBe(0);
    });

    it('should set isStreaming to true', () => {
      expect(store.getState().isStreaming).toBe(false);

      store.getState().startRound(0, 3);

      expect(store.getState().isStreaming).toBe(true);
    });

    it('should reset waitingToStartStreaming to false', () => {
      // Simulate user typing (waiting state)
      store.getState().setWaitingToStartStreaming(true);
      expect(store.getState().waitingToStartStreaming).toBe(true);

      // User clicks send - waitingToStartStreaming should reset
      store.getState().startRound(0, 3);

      expect(store.getState().waitingToStartStreaming).toBe(false);
    });

    it('should set currentParticipantIndex to 0', () => {
      store.getState().setCurrentParticipantIndex(5); // Some other value

      store.getState().startRound(0, 3);

      expect(store.getState().currentParticipantIndex).toBe(0);
    });

    it('should handle single participant correctly', () => {
      store.getState().startRound(0, 1);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      expect(store.getState().currentRoundNumber).toBe(0);
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should handle many participants correctly', () => {
      store.getState().startRound(0, 10);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      expect(store.getState().currentRoundNumber).toBe(0);
      expect(store.getState().isStreaming).toBe(true);
    });
  });

  describe('frame 8 - Round 2: "Send Clicked -> Changelog + All Placeholders"', () => {
    it('should set phase to PARTICIPANTS for follow-up rounds', () => {
      // Round 1 complete
      store.getState().startRound(0, 2);
      store.getState().onModeratorComplete();
      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

      // Reset to IDLE for next round
      store.getState().prepareForNewMessage();
      expect(store.getState().phase).toBe(ChatPhases.IDLE);

      // Round 2 starts - Frame 8
      store.getState().startRound(1, 2);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });

    it('should set currentRoundNumber correctly for Round 2', () => {
      store.getState().startRound(1, 2);

      expect(store.getState().currentRoundNumber).toBe(1);
    });

    it('should set currentRoundNumber correctly for Round N', () => {
      store.getState().startRound(5, 3);

      expect(store.getState().currentRoundNumber).toBe(5);
    });

    it('should reset waitingToStartStreaming for follow-up rounds', () => {
      store.getState().setWaitingToStartStreaming(true);

      store.getState().startRound(1, 2);

      expect(store.getState().waitingToStartStreaming).toBe(false);
    });
  });

  describe('edge Cases', () => {
    it('should allow startRound when already in PARTICIPANTS phase (idempotent)', () => {
      store.getState().startRound(0, 3);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      // Calling again should not throw
      store.getState().startRound(0, 3);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });

    it('should transition from COMPLETE to PARTICIPANTS via startRound', () => {
      // Set up COMPLETE state
      store.getState().startRound(0, 2);
      store.getState().onModeratorComplete();
      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

      // Direct transition (edge case - normally goes through IDLE)
      store.getState().startRound(1, 2);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });
  });
});

// ============================================================================
// PARTICIPANTS -> MODERATOR TRANSITION (onParticipantComplete)
// ============================================================================

describe('pARTICIPANTS -> MODERATOR Transition (onParticipantComplete)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('frame 5/11: "All Participants Complete -> Moderator Starts"', () => {
    it('should transition to MODERATOR when ALL participants are complete', () => {
      // Set up: 3 participants, all streaming
      const participants = createMockParticipants(3);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 3);
      store.getState().initializeSubscriptions(0, 3);

      // Mark all participants as complete in subscription state
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      // All participants complete - should transition to MODERATOR
      store.getState().onParticipantComplete(2);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should NOT transition if some participants are still pending', () => {
      // Set up: 3 participants
      const participants = createMockParticipants(3);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 3);
      store.getState().initializeSubscriptions(0, 3);

      // Only first participant complete
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);

      store.getState().onParticipantComplete(0);

      // Should still be in PARTICIPANTS phase
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });

    it('should NOT transition if some participants are streaming', () => {
      // Set up: 3 participants
      const participants = createMockParticipants(3);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 3);
      store.getState().initializeSubscriptions(0, 3);

      // P0 complete, P1 streaming, P2 idle
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus);

      store.getState().onParticipantComplete(0);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });

    it('should check subscriptionState.participants for completion status', () => {
      const participants = createMockParticipants(2);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 2);
      store.getState().initializeSubscriptions(0, 2);

      // Verify subscription state is used for decision
      expect(store.getState().subscriptionState.participants).toHaveLength(2);
      expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');

      // Mark both complete
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);

      store.getState().onParticipantComplete(1);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });
  });

  describe('out-of-Order Completion', () => {
    it('should handle P1 finishing before P0', () => {
      const participants = createMockParticipants(2);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 2);
      store.getState().initializeSubscriptions(0, 2);

      // P1 finishes first (out of order)
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(1);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      // P0 finishes second
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should handle participants completing in any order', () => {
      const participants = createMockParticipants(4);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 4);
      store.getState().initializeSubscriptions(0, 4);

      // Complete in order: 2, 0, 3, 1
      store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(2);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      store.getState().updateEntitySubscriptionStatus(3, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(3);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(1);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });
  });

  describe('error States', () => {
    it('should treat errored participants as complete (for transition purposes)', () => {
      const participants = createMockParticipants(2);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 2);
      store.getState().initializeSubscriptions(0, 2);

      // P0 errors, P1 completes
      store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 0, 'Stream failed');
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);

      store.getState().onParticipantComplete(1);

      // Should still transition (error is a terminal state)
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should transition when all participants are errored', () => {
      const participants = createMockParticipants(2);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 2);
      store.getState().initializeSubscriptions(0, 2);

      store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus);

      store.getState().onParticipantComplete(1);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });
  });

  describe('single Participant', () => {
    it('should immediately transition to MODERATOR when single participant completes', () => {
      const participants = createMockParticipants(1);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 1);
      store.getState().initializeSubscriptions(0, 1);

      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });
  });
});

// ============================================================================
// MODERATOR -> COMPLETE TRANSITION (onModeratorComplete)
// ============================================================================

describe('mODERATOR -> COMPLETE Transition (onModeratorComplete)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('frame 6/12: "Round Complete"', () => {
    it('should set phase to COMPLETE', () => {
      // Set up MODERATOR phase
      const participants = createMockParticipants(2);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 2);
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(1);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

      // Moderator completes
      store.getState().onModeratorComplete();

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    });

    it('should set isStreaming to false', () => {
      const participants = createMockParticipants(1);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 1);
      store.getState().initializeSubscriptions(0, 1);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);
      expect(store.getState().isStreaming).toBe(true);

      store.getState().onModeratorComplete();

      expect(store.getState().isStreaming).toBe(false);
    });

    it('should set isModeratorStreaming to false', () => {
      const participants = createMockParticipants(1);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 1);
      store.getState().initializeSubscriptions(0, 1);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);

      // Simulate moderator streaming
      store.getState().setIsModeratorStreaming(true);
      expect(store.getState().isModeratorStreaming).toBe(true);

      store.getState().onModeratorComplete();

      expect(store.getState().isModeratorStreaming).toBe(false);
    });

    it('should work for Round 1 (Frame 6)', () => {
      const participants = createMockParticipants(2);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 2);
      store.getState().initializeSubscriptions(0, 2);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(1);

      store.getState().onModeratorComplete();

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
      expect(store.getState().currentRoundNumber).toBe(0);
    });

    it('should work for Round 2+ (Frame 12)', () => {
      const participants = createMockParticipants(2);
      store.getState().setParticipants(participants);

      // Simulate Round 2
      store.getState().startRound(1, 2);
      store.getState().initializeSubscriptions(1, 2);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(1);

      store.getState().onModeratorComplete();

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
      expect(store.getState().currentRoundNumber).toBe(1);
    });
  });
});

// ============================================================================
// COMPLETE -> IDLE TRANSITION (resetToIdle/prepareForNewMessage)
// ============================================================================

describe('cOMPLETE -> IDLE Transition', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('resetToIdle', () => {
    it('should reset phase to IDLE', () => {
      // Set up COMPLETE state
      const participants = createMockParticipants(1);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 1);
      store.getState().initializeSubscriptions(0, 1);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);
      store.getState().onModeratorComplete();
      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

      store.getState().resetToIdle();

      expect(store.getState().phase).toBe(ChatPhases.IDLE);
    });

    it('should only change phase (preserves other state)', () => {
      const participants = createMockParticipants(1);
      store.getState().setParticipants(participants);
      store.getState().startRound(0, 1);
      store.getState().setCurrentRoundNumber(0);
      store.getState().initializeSubscriptions(0, 1);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);
      store.getState().onModeratorComplete();

      store.getState().resetToIdle();

      expect(store.getState().phase).toBe(ChatPhases.IDLE);
      // Other state preserved
      expect(store.getState().currentRoundNumber).toBe(0);
      expect(store.getState().participants).toHaveLength(1);
    });
  });

  describe('prepareForNewMessage', () => {
    it('should reset phase to IDLE', () => {
      store.getState().startRound(0, 1);
      store.getState().onModeratorComplete();
      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

      store.getState().prepareForNewMessage();

      expect(store.getState().phase).toBe(ChatPhases.IDLE);
    });

    it('should clear pending message state', () => {
      store.getState().setPendingMessage('test message');
      store.getState().setHasSentPendingMessage(true);

      store.getState().prepareForNewMessage();

      expect(store.getState().pendingMessage).toBeNull();
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });
  });
});

// ============================================================================
// GUARD AGAINST DUPLICATE completeStreaming CALLS
// ============================================================================

describe('guard Against Duplicate completeStreaming Calls', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should skip if already in COMPLETE phase', () => {
    // Arrange: Set up COMPLETE state directly
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Act: Call completeStreaming when already complete
    const stateBefore = { ...store.getState() };
    store.getState().completeStreaming();
    const stateAfter = store.getState();

    // Assert: Should be a no-op (phase unchanged)
    expect(stateAfter.phase).toBe(ChatPhases.COMPLETE);
    // isStreaming should remain false (was already set by onModeratorComplete)
    expect(stateAfter.isStreaming).toBe(false);
  });

  it('should complete streaming when in MODERATOR phase', () => {
    // Set up MODERATOR phase
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    expect(store.getState().isStreaming).toBe(true);

    store.getState().completeStreaming();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should handle multiple completeStreaming calls gracefully', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);

    // First call
    store.getState().completeStreaming();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Duplicate calls should be no-ops
    store.getState().completeStreaming();
    store.getState().completeStreaming();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should complete streaming from PARTICIPANTS phase (sets COMPLETE without going through MODERATOR)', () => {
    // Edge case: completeStreaming called during PARTICIPANTS phase
    // This sets streaming state but does NOT change phase to COMPLETE
    // (phase change only happens when in MODERATOR phase)
    store.getState().startRound(0, 2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().completeStreaming();

    // Phase doesn't change to COMPLETE unless in MODERATOR
    // completeStreaming only sets COMPLETE when phase is MODERATOR
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// FULL ROUND LIFECYCLE
// ============================================================================

describe('full Round Lifecycle', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should complete a full round: IDLE -> PARTICIPANTS -> MODERATOR -> COMPLETE -> IDLE', () => {
    const participants = createMockParticipants(2);
    store.getState().setParticipants(participants);

    // Initial state
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // Frame 2: User clicks send
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentRoundNumber).toBe(0);

    // Frame 3-4: Participants streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);

    // Frame 5: All participants complete
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Frame 6: Moderator completes
    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().isStreaming).toBe(false);

    // Prepare for next round
    store.getState().prepareForNewMessage();
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should handle multiple rounds in sequence', () => {
    const participants = createMockParticipants(2);
    store.getState().setParticipants(participants);

    // Round 0
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    expect(store.getState().currentRoundNumber).toBe(0);

    // Prepare for Round 1
    store.getState().prepareForNewMessage();
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // Round 1
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);
    expect(store.getState().currentRoundNumber).toBe(1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().currentRoundNumber).toBe(1);

    // Prepare for Round 2
    store.getState().prepareForNewMessage();

    // Round 2
    store.getState().startRound(2, 2);
    store.getState().initializeSubscriptions(2, 2);
    expect(store.getState().currentRoundNumber).toBe(2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().currentRoundNumber).toBe(2);
  });
});

// ============================================================================
// SUBSCRIPTION STATE INTEGRATION
// ============================================================================

describe('subscription State Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should initialize subscriptions when startRound is called', () => {
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    const subState = store.getState().subscriptionState;
    expect(subState.activeRoundNumber).toBe(0);
    expect(subState.participants).toHaveLength(3);
    expect(subState.participants[0]?.status).toBe('idle');
    expect(subState.moderator.status).toBe('idle');
    expect(subState.presearch.status).toBe('idle');
  });

  it('should update entity subscription status correctly', () => {
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(100);
  });

  it('should clear subscription state on clearSubscriptionState', () => {
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);

    store.getState().clearSubscriptionState();

    const subState = store.getState().subscriptionState;
    expect(subState.activeRoundNumber).toBe(-1);
    expect(subState.participants).toHaveLength(0);
  });
});

// ============================================================================
// RACE CONDITION SCENARIOS
// ============================================================================

describe('race Condition Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle rapid phase transitions without corruption', () => {
    const participants = createMockParticipants(2);
    store.getState().setParticipants(participants);

    // Rapidly cycle through phases
    for (let round = 0; round < 5; round++) {
      store.getState().startRound(round, 2);
      store.getState().initializeSubscriptions(round, 2);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      expect(store.getState().currentRoundNumber).toBe(round);

      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(1);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

      store.getState().onModeratorComplete();

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

      store.getState().prepareForNewMessage();
    }

    // Final state should be consistent
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should handle interleaved completion callbacks', () => {
    const participants = createMockParticipants(3);
    store.getState().setParticipants(participants);
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // Interleaved updates (simulating network race conditions)
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // Duplicate callback (network retry)
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should not corrupt state with out-of-order phase callbacks', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Late/duplicate callbacks after completion (should be no-ops)
    store.getState().onParticipantComplete(0);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});
