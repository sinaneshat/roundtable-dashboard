/**
 * streamingRoundNumber Lifecycle Tests
 *
 * Tests the proper lifecycle of `streamingRoundNumber` state:
 * - null initially
 * - set to N when round N starts
 * - stays at N during streaming
 * - reset to null when streaming completes
 * - set to N+1 when next round starts
 *
 * This is critical because keeping stale values can cause:
 * - Wrong round associations in streaming placeholders
 * - Duplicate subscriptions for the same round
 * - Confusion about which round is actively streaming
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '../store';
import type { EntityStatus } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// TEST HELPERS
// ============================================================================

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

// ============================================================================
// INITIAL STATE
// ============================================================================

describe('streamingRoundNumber Initial State', () => {
  it('should be null initially', () => {
    const store = createChatStore();

    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should be null after store reset (resetToNewChat)', () => {
    const store = createChatStore();

    // Set some state
    store.getState().setStreamingRoundNumber(1);
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Reset store
    store.getState().resetToNewChat();

    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should be null after resetToOverview', () => {
    const store = createChatStore();

    store.getState().setStreamingRoundNumber(2);
    store.getState().resetToOverview();

    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should be null after resetForThreadNavigation', () => {
    const store = createChatStore();

    store.getState().setStreamingRoundNumber(3);
    store.getState().resetForThreadNavigation();

    expect(store.getState().streamingRoundNumber).toBeNull();
  });
});

// ============================================================================
// ROUND START (setStreamingRoundNumber)
// ============================================================================

describe('streamingRoundNumber - Round Start', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should be set when setStreamingRoundNumber is called explicitly', () => {
    expect(store.getState().streamingRoundNumber).toBeNull();

    store.getState().setStreamingRoundNumber(0);

    expect(store.getState().streamingRoundNumber).toBe(0);
  });

  it('should be set to 0 for round 0', () => {
    store.getState().setStreamingRoundNumber(0);

    expect(store.getState().streamingRoundNumber).toBe(0);
  });

  it('should be set to 1 for round 1', () => {
    store.getState().setStreamingRoundNumber(1);

    expect(store.getState().streamingRoundNumber).toBe(1);
  });

  it('should be set to any round number', () => {
    store.getState().setStreamingRoundNumber(5);

    expect(store.getState().streamingRoundNumber).toBe(5);
  });

  it('should update when startRegeneration is called', () => {
    expect(store.getState().streamingRoundNumber).toBeNull();

    store.getState().startRegeneration(1);

    expect(store.getState().streamingRoundNumber).toBe(1);
  });
});

// ============================================================================
// DURING STREAMING
// ============================================================================

describe('streamingRoundNumber - During Streaming', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should stay stable during startRound (not modified by startRound)', () => {
    // Note: startRound does NOT set streamingRoundNumber
    // It must be set separately (usually by the submission flow)
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 2);

    expect(store.getState().streamingRoundNumber).toBe(0);
    expect(store.getState().currentRoundNumber).toBe(0);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should stay consistent during participant phase transitions', () => {
    const participants = createMockParticipants(2);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // During streaming, streamingRoundNumber should stay at 0
    expect(store.getState().streamingRoundNumber).toBe(0);

    // P0 starts streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // P0 completes
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // P1 starts streaming
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus);
    expect(store.getState().streamingRoundNumber).toBe(0);
  });

  it('should stay consistent during moderator phase', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);

    // All participants complete
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);

    // Now in MODERATOR phase
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // Moderator streaming
    store.getState().setIsModeratorStreaming(true);
    expect(store.getState().streamingRoundNumber).toBe(0);
  });
});

// ============================================================================
// STREAMING COMPLETE (Reset to null)
// ============================================================================

describe('streamingRoundNumber - Streaming Complete', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should reset to null when completeStreaming is called', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);

    // In MODERATOR phase with streamingRoundNumber = 0
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // Complete streaming
    store.getState().completeStreaming();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should reset to null when completeStreaming is called from PARTICIPANTS phase', () => {
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 2);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // Complete streaming (edge case - normally happens in MODERATOR)
    store.getState().completeStreaming();

    // Phase doesn't change to COMPLETE from PARTICIPANTS, but streaming state is reset
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().streamingRoundNumber).toBeNull();
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should skip reset when already in COMPLETE phase (guard)', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    store.getState().onModeratorComplete();

    // Already in COMPLETE phase, streamingRoundNumber should be as set by onModeratorComplete
    // Note: onModeratorComplete does NOT reset streamingRoundNumber, only completeStreaming does
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Calling completeStreaming again should skip (guard)
    store.getState().completeStreaming();

    // Phase unchanged
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should reset currentParticipantIndex to 0 when completeStreaming is called', () => {
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 3);
    store.getState().setCurrentParticipantIndex(2);

    expect(store.getState().currentParticipantIndex).toBe(2);

    store.getState().completeStreaming();

    expect(store.getState().currentParticipantIndex).toBe(0);
  });
});

// ============================================================================
// MULTI-ROUND LIFECYCLE
// ============================================================================

describe('streamingRoundNumber - Multi-Round Lifecycle', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should have correct lifecycle: null -> 0 -> null -> 1 -> null', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);

    // 1. Initially null
    expect(store.getState().streamingRoundNumber).toBeNull();

    // 2. Set to 0 when round 0 starts
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // 3. Stays at 0 during streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // 4. Complete round 0
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    store.getState().completeStreaming();

    // 5. Reset to null after complete
    expect(store.getState().streamingRoundNumber).toBeNull();

    // 6. Prepare for next round
    store.getState().prepareForNewMessage();
    expect(store.getState().streamingRoundNumber).toBeNull();

    // 7. Set to 1 when round 1 starts
    store.getState().setStreamingRoundNumber(1);
    store.getState().startRound(1, 1);
    store.getState().initializeSubscriptions(1, 1);
    expect(store.getState().streamingRoundNumber).toBe(1);

    // 8. Complete round 1
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    store.getState().completeStreaming();

    // 9. Reset to null again
    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should handle 5 consecutive rounds correctly', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);

    for (let round = 0; round < 5; round++) {
      // Before round starts: should be null
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Start round
      store.getState().setStreamingRoundNumber(round);
      expect(store.getState().streamingRoundNumber).toBe(round);

      store.getState().startRound(round, 1);
      store.getState().initializeSubscriptions(round, 1);

      // During streaming
      expect(store.getState().streamingRoundNumber).toBe(round);

      // Complete
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().onParticipantComplete(0);
      store.getState().completeStreaming();

      // After complete: should be null
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Prepare for next round
      store.getState().prepareForNewMessage();
    }
  });
});

// ============================================================================
// INVARIANTS
// ============================================================================

describe('streamingRoundNumber Invariants', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should never have isStreaming=true with streamingRoundNumber=null', () => {
    const invalidStates: { isStreaming: boolean; streamingRoundNumber: number | null }[] = [];

    const unsubscribe = store.subscribe((state) => {
      if (state.isStreaming && state.streamingRoundNumber === null) {
        invalidStates.push({
          isStreaming: state.isStreaming,
          streamingRoundNumber: state.streamingRoundNumber,
        });
      }
    });

    // Correct flow: set round THEN start streaming
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Complete streaming
    store.getState().completeStreaming();

    unsubscribe();

    // Should NEVER have isStreaming=true with null round
    expect(invalidStates).toHaveLength(0);
  });

  it('should have streamingRoundNumber=null when phase is COMPLETE', () => {
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    store.getState().completeStreaming();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should have streamingRoundNumber=null when phase is IDLE (initially)', () => {
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should match currentRoundNumber during streaming', () => {
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 1);

    expect(store.getState().streamingRoundNumber).toBe(0);
    expect(store.getState().currentRoundNumber).toBe(0);
  });
});

// ============================================================================
// REGENERATION
// ============================================================================

describe('streamingRoundNumber - Regeneration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should be set correctly during regeneration', () => {
    // Complete round 0 first
    const participants = createMockParticipants(1);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().startRound(0, 1);
    store.getState().initializeSubscriptions(0, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(0);
    store.getState().completeStreaming();

    expect(store.getState().streamingRoundNumber).toBeNull();

    // Regenerate round 0
    store.getState().startRegeneration(0);

    expect(store.getState().streamingRoundNumber).toBe(0);
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().isRegenerating).toBe(true);
    expect(store.getState().regeneratingRoundNumber).toBe(0);
  });

  it('should reset when completeRegeneration is called (followed by completeStreaming)', () => {
    store.getState().startRegeneration(1);
    expect(store.getState().streamingRoundNumber).toBe(1);

    // completeRegeneration doesn't reset streamingRoundNumber
    // that's done by completeStreaming
    store.getState().completeRegeneration();
    expect(store.getState().isRegenerating).toBe(false);

    // completeStreaming resets streamingRoundNumber
    store.getState().completeStreaming();
    expect(store.getState().streamingRoundNumber).toBeNull();
  });
});
