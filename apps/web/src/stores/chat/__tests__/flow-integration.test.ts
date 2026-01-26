/**
 * Flow Integration Tests
 *
 * End-to-end flow tests based on FLOW_DOCUMENTATION.md scenarios.
 * Tests the complete round lifecycle including timing and race conditions.
 *
 * Key Scenarios from FLOW_DOCUMENTATION.md:
 *
 * ROUND 1 (No Web Search):
 *   Frame 1→2: User Sends → Placeholders Appear
 *   Frame 3→4: P0 Streams → P1 Starts (Baton Passing)
 *   Frame 5→6: All Done → Moderator → Complete
 *
 * ROUND 2 (With Web Search + Changelog):
 *   Frame 7→8: Config Changed → Changelog + PreSearch
 *   Frame 9→11: PreSearch Done → Participants Stream
 *   Frame 12: Round 2 Complete
 *
 * ROUND 3 (No Changelog, With Web Search):
 *   Same flow as Round 2 but no changelog
 *
 * RESUMPTION SCENARIOS:
 *   - User refreshes mid-P1
 *   - User returns after round complete
 *   - User returns mid-moderator
 *
 * RACE CONDITIONS:
 *   - Out-of-order completion
 *   - Duplicate callbacks
 *   - Concurrent round changes
 *
 * @see docs/FLOW_DOCUMENTATION.md
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockParticipants, createMockThread } from '@/lib/testing';

import { createChatStore } from '../store';
import { SUBSCRIPTION_DEFAULTS } from '../store-defaults';
import type { EntityStatus, SubscriptionState } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Helpers
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

function setupRoundWithParticipants(
  store: TestStore,
  participantCount: number,
  roundNumber = 0,
) {
  const participants = createMockParticipants(participantCount);
  store.setState({ participants });
  store.getState().startRound(roundNumber, participantCount);
  store.getState().initializeSubscriptions(roundNumber, participantCount);
  return participants;
}

function completeParticipant(
  store: TestStore,
  index: number,
  lastSeq = 100,
) {
  store.getState().updateEntitySubscriptionStatus(index, 'complete' as EntityStatus, lastSeq);
  store.getState().onParticipantComplete(index);
}

function completeAllParticipants(
  store: TestStore,
  participantCount: number,
) {
  for (let i = 0; i < participantCount; i++) {
    completeParticipant(store, i, 100 + i * 10);
  }
}

function streamingParticipant(
  store: TestStore,
  index: number,
  lastSeq = 50,
) {
  store.getState().updateEntitySubscriptionStatus(index, 'streaming' as EntityStatus, lastSeq);
}

// ============================================================================
// Round 1: No Web Search Flow (Frames 1-6)
// ============================================================================

describe('Round 1: No Web Search Flow (FLOW_DOCUMENTATION.md Frames 1-6)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('Frame 1→2: User Sends → ALL Placeholders Appear', () => {
    it('should transition IDLE → PARTICIPANTS when user sends message', () => {
      expect(store.getState().phase).toBe(ChatPhases.IDLE);

      setupRoundWithParticipants(store, 2);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      expect(store.getState().currentRoundNumber).toBe(0);
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should initialize all participants with idle status', () => {
      setupRoundWithParticipants(store, 3);

      const subState = store.getState().subscriptionState;
      expect(subState.participants).toHaveLength(3);
      expect(subState.participants.every(p => p.status === 'idle')).toBe(true);
    });

    it('should set currentParticipantIndex to 0', () => {
      setupRoundWithParticipants(store, 2);

      expect(store.getState().currentParticipantIndex).toBe(0);
    });

    it('should reset waitingToStartStreaming', () => {
      store.getState().setWaitingToStartStreaming(true);

      setupRoundWithParticipants(store, 2);

      expect(store.getState().waitingToStartStreaming).toBe(false);
    });
  });

  describe('Frame 3→4: P0 Streams → P0 Done → P1 Starts (Baton Passing)', () => {
    it('should track P0 streaming status', () => {
      setupRoundWithParticipants(store, 2);

      streamingParticipant(store, 0, 25);

      expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });

    it('should NOT transition to MODERATOR when only P0 completes', () => {
      setupRoundWithParticipants(store, 2);

      streamingParticipant(store, 0);
      completeParticipant(store, 0);

      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
      expect(store.getState().subscriptionState.participants[1]?.status).toBe('idle');
    });

    it('should allow P1 to start streaming after P0 completes', () => {
      setupRoundWithParticipants(store, 2);

      // P0 flow
      streamingParticipant(store, 0);
      completeParticipant(store, 0);

      // P1 starts (baton passed)
      streamingParticipant(store, 1);

      expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
      expect(store.getState().subscriptionState.participants[1]?.status).toBe('streaming');
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });
  });

  describe('Frame 5→6: All Done → Moderator → Complete', () => {
    it('should transition to MODERATOR when all participants complete', () => {
      setupRoundWithParticipants(store, 2);

      completeAllParticipants(store, 2);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should transition to COMPLETE when moderator completes', () => {
      setupRoundWithParticipants(store, 2);

      completeAllParticipants(store, 2);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

      store.getState().onModeratorComplete();

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should re-enable input (isStreaming = false) when round completes', () => {
      setupRoundWithParticipants(store, 2);
      expect(store.getState().isStreaming).toBe(true);

      completeAllParticipants(store, 2);
      store.getState().onModeratorComplete();

      expect(store.getState().isStreaming).toBe(false);
    });
  });
});

// ============================================================================
// Round 2: With Web Search + Changelog (Frames 7-12)
// ============================================================================

describe('Round 2: With Web Search (FLOW_DOCUMENTATION.md Frames 7-12)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('Frame 7→8: Config Changed → PreSearch Phase', () => {
    it('should track presearch status when web search enabled', () => {
      setupRoundWithParticipants(store, 2);

      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 10);

      expect(store.getState().subscriptionState.presearch.status).toBe('streaming');
    });

    it('should complete presearch before participants proceed', () => {
      setupRoundWithParticipants(store, 2);

      // Presearch streaming
      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus);
      expect(store.getState().subscriptionState.presearch.status).toBe('streaming');

      // Presearch complete
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 50);
      expect(store.getState().subscriptionState.presearch.status).toBe('complete');
      expect(store.getState().subscriptionState.presearch.lastSeq).toBe(50);
    });

    it('should handle disabled presearch status', () => {
      setupRoundWithParticipants(store, 2);

      store.getState().updateEntitySubscriptionStatus('presearch', 'disabled' as EntityStatus);

      expect(store.getState().subscriptionState.presearch.status).toBe('disabled');
    });
  });

  describe('Frame 9→11: PreSearch Done → Participants Stream', () => {
    it('should allow participants to stream after presearch completes', () => {
      setupRoundWithParticipants(store, 2);

      // Presearch complete
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 30);

      // P0 starts
      streamingParticipant(store, 0);

      expect(store.getState().subscriptionState.presearch.status).toBe('complete');
      expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
    });
  });

  describe('Frame 12: Round 2 Complete', () => {
    it('should complete round 2 same as round 1', () => {
      // Round 1 complete
      setupRoundWithParticipants(store, 2, 0);
      completeAllParticipants(store, 2);
      store.getState().onModeratorComplete();
      store.getState().prepareForNewMessage();

      // Round 2 starts
      setupRoundWithParticipants(store, 2, 1);
      expect(store.getState().currentRoundNumber).toBe(1);

      // Round 2 complete
      completeAllParticipants(store, 2);
      store.getState().onModeratorComplete();

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
      expect(store.getState().currentRoundNumber).toBe(1);
    });
  });
});

// ============================================================================
// Multi-Round Sequence
// ============================================================================

describe('Multi-Round Sequence (FLOW_DOCUMENTATION.md Complete Timeline)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle 3 complete rounds in sequence', () => {
    const participants = createMockParticipants(2);
    store.setState({ participants });

    // Round 0
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    expect(store.getState().subscriptionState.activeRoundNumber).toBe(0);

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Prepare for Round 1
    store.getState().prepareForNewMessage();
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // Round 1
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);
    expect(store.getState().subscriptionState.activeRoundNumber).toBe(1);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Prepare for Round 2
    store.getState().prepareForNewMessage();

    // Round 2
    store.getState().startRound(2, 2);
    store.getState().initializeSubscriptions(2, 2);
    expect(store.getState().subscriptionState.activeRoundNumber).toBe(2);

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().currentRoundNumber).toBe(2);
  });

  it('should handle changing participant count between rounds', () => {
    // Round 0: 2 participants
    const p2 = createMockParticipants(2);
    store.setState({ participants: p2 });
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1: 3 participants (added one)
    const p3 = createMockParticipants(3);
    store.setState({ participants: p3 });
    store.getState().startRound(1, 3);
    store.getState().initializeSubscriptions(1, 3);

    expect(store.getState().subscriptionState.participants).toHaveLength(3);

    completeAllParticipants(store, 3);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 2: 1 participant (removed two)
    const p1 = createMockParticipants(1);
    store.setState({ participants: p1 });
    store.getState().startRound(2, 1);
    store.getState().initializeSubscriptions(2, 1);

    expect(store.getState().subscriptionState.participants).toHaveLength(1);

    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});

// ============================================================================
// Resumption Scenarios
// ============================================================================

describe('Resumption Scenarios (FLOW_DOCUMENTATION.md Stream Resumption)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('Scenario 1: User refreshes mid-P1', () => {
    it('should preserve P0 complete state', () => {
      setupRoundWithParticipants(store, 2);

      // P0 complete (from D1)
      completeParticipant(store, 0, 100);

      // P1 mid-stream (will resume from lastSeq)
      streamingParticipant(store, 1, 23);

      // Verify state
      expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
      expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(100);
      expect(store.getState().subscriptionState.participants[1]?.status).toBe('streaming');
      expect(store.getState().subscriptionState.participants[1]?.lastSeq).toBe(23);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    });

    it('should track lastSeq for resumption', () => {
      setupRoundWithParticipants(store, 2);

      // Simulate progressive streaming
      store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 20);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 30);

      expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(30);
    });
  });

  describe('Scenario 2: User returns after round complete', () => {
    it('should show all messages from D1 (complete state)', () => {
      setupRoundWithParticipants(store, 2);

      // Complete round
      completeAllParticipants(store, 2);
      store.getState().onModeratorComplete();

      // All entities should be in complete state
      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
      expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
      expect(store.getState().subscriptionState.participants[1]?.status).toBe('complete');
    });
  });

  describe('Scenario 3: User returns mid-moderator', () => {
    it('should show all participants complete, moderator resumable', () => {
      setupRoundWithParticipants(store, 2);

      // All participants complete
      completeAllParticipants(store, 2);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

      // Moderator mid-stream
      store.getState().updateEntitySubscriptionStatus('moderator', 'streaming' as EntityStatus, 45);

      expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
      expect(store.getState().subscriptionState.participants[1]?.status).toBe('complete');
      expect(store.getState().subscriptionState.moderator.status).toBe('streaming');
      expect(store.getState().subscriptionState.moderator.lastSeq).toBe(45);
    });
  });
});

// ============================================================================
// Race Condition Scenarios
// ============================================================================

describe('Race Condition Scenarios', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('Out-of-Order Completion', () => {
    it('should handle P2 completing before P0', () => {
      setupRoundWithParticipants(store, 3);

      // P2 completes first (out of order)
      completeParticipant(store, 2, 100);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      // P0 completes second
      completeParticipant(store, 0, 110);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      // P1 completes last
      completeParticipant(store, 1, 120);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should handle completion in any order', () => {
      setupRoundWithParticipants(store, 5);

      // Complete in order: 4, 1, 3, 0, 2
      const completionOrder = [4, 1, 3, 0, 2];

      for (let i = 0; i < completionOrder.length - 1; i++) {
        completeParticipant(store, completionOrder[i]!, 100 + i);
        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
      }

      // Last one should trigger MODERATOR
      completeParticipant(store, completionOrder[4]!, 104);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });
  });

  describe('Duplicate Callbacks', () => {
    it('should handle duplicate onParticipantComplete calls', () => {
      setupRoundWithParticipants(store, 2);

      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);

      // First callback
      store.getState().onParticipantComplete(1);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

      // Duplicate callback (should be no-op)
      store.getState().onParticipantComplete(1);
      store.getState().onParticipantComplete(0);

      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should handle duplicate onModeratorComplete calls', () => {
      setupRoundWithParticipants(store, 1);
      completeParticipant(store, 0);

      store.getState().onModeratorComplete();
      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

      // Duplicate call
      store.getState().onModeratorComplete();

      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
      expect(store.getState().isStreaming).toBe(false);
    });
  });

  describe('Concurrent Round Changes', () => {
    it('should handle rapid round transitions', () => {
      const participants = createMockParticipants(2);
      store.setState({ participants });

      for (let round = 0; round < 10; round++) {
        store.getState().startRound(round, 2);
        store.getState().initializeSubscriptions(round, 2);

        expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
        expect(store.getState().currentRoundNumber).toBe(round);

        completeAllParticipants(store, 2);
        store.getState().onModeratorComplete();

        expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

        store.getState().prepareForNewMessage();
      }

      expect(store.getState().phase).toBe(ChatPhases.IDLE);
    });

    it('should reset subscription state on new round', () => {
      setupRoundWithParticipants(store, 2, 0);

      // Set some state
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
      store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 50);
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 30);

      // Start new round
      store.getState().initializeSubscriptions(1, 2);

      // All state should be reset
      expect(store.getState().subscriptionState.activeRoundNumber).toBe(1);
      expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');
      expect(store.getState().subscriptionState.participants[1]?.status).toBe('idle');
      expect(store.getState().subscriptionState.presearch.status).toBe('idle');
    });
  });

  describe('Interleaved Status Updates', () => {
    it('should handle presearch + participant updates interleaved', () => {
      setupRoundWithParticipants(store, 2);

      // Interleaved updates
      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 1);
      store.getState().updateEntitySubscriptionStatus(0, 'waiting' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 10);
      store.getState().updateEntitySubscriptionStatus(1, 'waiting' as EntityStatus);
      store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 20);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 1);

      const subState = store.getState().subscriptionState;
      expect(subState.presearch.status).toBe('complete');
      expect(subState.presearch.lastSeq).toBe(20);
      expect(subState.participants[0]?.status).toBe('streaming');
      expect(subState.participants[1]?.status).toBe('waiting');
    });

    it('should maintain state consistency during rapid updates', () => {
      setupRoundWithParticipants(store, 3);

      // Rapid updates to different entities
      for (let seq = 1; seq <= 100; seq++) {
        const participantIndex = seq % 3;
        store.getState().updateEntitySubscriptionStatus(
          participantIndex,
          'streaming' as EntityStatus,
          seq,
        );
      }

      // Final state should be consistent
      const subState = store.getState().subscriptionState;
      expect(subState.participants[0]?.status).toBe('streaming');
      expect(subState.participants[1]?.status).toBe('streaming');
      expect(subState.participants[2]?.status).toBe('streaming');
      // Last update was seq 100 to participant 100 % 3 = 1
      expect(subState.participants[1]?.lastSeq).toBe(100);
    });
  });

  describe('Error State Handling', () => {
    it('should treat error as terminal state for phase transition', () => {
      setupRoundWithParticipants(store, 2);

      // P0 errors, P1 completes
      store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 10, 'Network error');
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);

      store.getState().onParticipantComplete(1);

      // Should still transition to MODERATOR (error is terminal)
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });

    it('should track error messages', () => {
      setupRoundWithParticipants(store, 2);

      store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 5, 'API timeout');

      expect(store.getState().subscriptionState.participants[0]?.status).toBe('error');
      expect(store.getState().subscriptionState.participants[0]?.errorMessage).toBe('API timeout');
    });

    it('should handle all participants erroring', () => {
      setupRoundWithParticipants(store, 2);

      store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 5, 'Error 1');
      store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus, 10, 'Error 2');

      store.getState().onParticipantComplete(1);

      // Should still transition (all terminal states)
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    });
  });
});

// ============================================================================
// Streaming Text Accumulation (via Message Placeholders)
// ============================================================================

describe('Streaming Text Accumulation', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should accumulate streaming text for participants via message placeholders', () => {
    setupRoundWithParticipants(store, 2, 0);

    // Append text chunks - signature is (participantIndex, text, roundNumber)
    store.getState().appendEntityStreamingText(0, 'Hello ', 0);
    store.getState().appendEntityStreamingText(0, 'World!', 0);

    // Text is stored in messages array as streaming placeholders
    const messages = store.getState().messages;
    const streamingMsg = messages.find(m => m.id === 'streaming_p0_r0');
    expect(streamingMsg).toBeDefined();
    expect(streamingMsg?.parts[0]).toHaveProperty('text', 'Hello World!');
  });

  it('should accumulate streaming text for moderator via message placeholders', () => {
    setupRoundWithParticipants(store, 1, 0);
    completeParticipant(store, 0);

    // Append moderator text
    store.getState().appendModeratorStreamingText('Summary: ', 0);
    store.getState().appendModeratorStreamingText('All participants agreed.', 0);

    const messages = store.getState().messages;
    const streamingMsg = messages.find(m => m.id === 'streaming_moderator_r0');
    expect(streamingMsg).toBeDefined();
    expect(streamingMsg?.parts[0]).toHaveProperty('text', 'Summary: All participants agreed.');
  });

  it('should create separate streaming placeholders per round', () => {
    setupRoundWithParticipants(store, 2, 0);

    store.getState().appendEntityStreamingText(0, 'Round 0 text', 0);

    // Verify round 0 placeholder
    const r0Msg = store.getState().messages.find(m => m.id === 'streaming_p0_r0');
    expect(r0Msg).toBeDefined();

    // Start new round
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 2, 1);

    store.getState().appendEntityStreamingText(0, 'Round 1 text', 1);

    // Verify round 1 placeholder is separate
    const r1Msg = store.getState().messages.find(m => m.id === 'streaming_p0_r1');
    expect(r1Msg).toBeDefined();
    expect(r1Msg?.parts[0]).toHaveProperty('text', 'Round 1 text');
  });

  it('should handle multiple participants streaming text independently', () => {
    setupRoundWithParticipants(store, 3, 0);

    store.getState().appendEntityStreamingText(0, 'P0: ', 0);
    store.getState().appendEntityStreamingText(1, 'P1: ', 0);
    store.getState().appendEntityStreamingText(0, 'Hello', 0);
    store.getState().appendEntityStreamingText(2, 'P2: ', 0);
    store.getState().appendEntityStreamingText(1, 'World', 0);
    store.getState().appendEntityStreamingText(2, 'Foo', 0);

    const messages = store.getState().messages;
    const p0Msg = messages.find(m => m.id === 'streaming_p0_r0');
    const p1Msg = messages.find(m => m.id === 'streaming_p1_r0');
    const p2Msg = messages.find(m => m.id === 'streaming_p2_r0');

    expect(p0Msg?.parts[0]).toHaveProperty('text', 'P0: Hello');
    expect(p1Msg?.parts[0]).toHaveProperty('text', 'P1: World');
    expect(p2Msg?.parts[0]).toHaveProperty('text', 'P2: Foo');
  });

  it('should skip empty text chunks', () => {
    setupRoundWithParticipants(store, 2, 0);

    store.getState().appendEntityStreamingText(0, 'Hello', 0);
    store.getState().appendEntityStreamingText(0, '', 0); // Empty chunk
    store.getState().appendEntityStreamingText(0, ' World', 0);

    const messages = store.getState().messages;
    const streamingMsg = messages.find(m => m.id === 'streaming_p0_r0');
    expect(streamingMsg?.parts[0]).toHaveProperty('text', 'Hello World');
  });
});

// ============================================================================
// Phase Guard Tests
// ============================================================================

describe('Phase Guards', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should NOT transition from IDLE to MODERATOR directly', () => {
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // onParticipantComplete should not change phase if not in PARTICIPANTS
    store.getState().onParticipantComplete(0);

    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should NOT transition from COMPLETE back to MODERATOR', () => {
    setupRoundWithParticipants(store, 1);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Late callback should be no-op
    store.getState().onParticipantComplete(0);

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should guard against incomplete participant array triggering MODERATOR', () => {
    setupRoundWithParticipants(store, 3);

    // Only 2 of 3 are complete
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    // P2 is still idle

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });

  it('should guard against streaming status blocking MODERATOR transition', () => {
    setupRoundWithParticipants(store, 2);

    completeParticipant(store, 0);
    streamingParticipant(store, 1); // Still streaming

    store.getState().onParticipantComplete(0);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });
});

// ============================================================================
// Backend Phase State Machine Validation
// ============================================================================

describe('Backend Phase State Machine (FLOW_DOCUMENTATION.md)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should follow PENDING → PRESEARCH → PARTICIPANTS → MODERATOR → DONE', () => {
    setupRoundWithParticipants(store, 2);

    // PRESEARCH phase (if enabled)
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus);
    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 20);

    // PARTICIPANTS phase
    streamingParticipant(store, 0);
    completeParticipant(store, 0);
    streamingParticipant(store, 1);
    completeParticipant(store, 1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // MODERATOR phase
    store.getState().updateEntitySubscriptionStatus('moderator', 'streaming' as EntityStatus);
    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 100);
    store.getState().onModeratorComplete();

    // DONE phase
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should skip PRESEARCH phase when web search is disabled', () => {
    setupRoundWithParticipants(store, 2);

    // No presearch updates - go straight to participants
    streamingParticipant(store, 0);
    completeParticipant(store, 0);
    streamingParticipant(store, 1);
    completeParticipant(store, 1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});
