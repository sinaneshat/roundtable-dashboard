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

import { createMockParticipants } from '@/lib/testing';

import { createChatStore } from '../store';
import type { EntityStatus } from '../store-schemas';
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

describe('round 1: No Web Search Flow (FLOW_DOCUMENTATION.md Frames 1-6)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('frame 1→2: User Sends → ALL Placeholders Appear', () => {
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

  describe('frame 3→4: P0 Streams → P0 Done → P1 Starts (Baton Passing)', () => {
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

  describe('frame 5→6: All Done → Moderator → Complete', () => {
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

describe('round 2: With Web Search (FLOW_DOCUMENTATION.md Frames 7-12)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('frame 7→8: Config Changed → PreSearch Phase', () => {
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

  describe('frame 9→11: PreSearch Done → Participants Stream', () => {
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

  describe('frame 12: Round 2 Complete', () => {
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

describe('multi-Round Sequence (FLOW_DOCUMENTATION.md Complete Timeline)', () => {
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

describe('resumption Scenarios (FLOW_DOCUMENTATION.md Stream Resumption)', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('scenario 1: User refreshes mid-P1', () => {
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

  describe('scenario 2: User returns after round complete', () => {
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

  describe('scenario 3: User returns mid-moderator', () => {
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

describe('race Condition Scenarios', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('out-of-Order Completion', () => {
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

  describe('duplicate Callbacks', () => {
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

  describe('concurrent Round Changes', () => {
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

  describe('interleaved Status Updates', () => {
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

  describe('error State Handling', () => {
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

describe('streaming Text Accumulation', () => {
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

describe('phase Guards', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should NOT transition from IDLE to MODERATOR without subscription state', () => {
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // onParticipantComplete without initialized subscriptions won't transition
    // because subscriptionState.participants is empty
    store.getState().onParticipantComplete(0);

    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should transition from IDLE to MODERATOR when subscription state shows all complete', () => {
    // Per existing behavior: phase machine responds to subscription state
    // regardless of current phase
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus);
    store.getState().onParticipantComplete(1);

    // Phase transitions because subscription state shows all complete
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should transition from COMPLETE back to MODERATOR when subscription state shows all complete', () => {
    // Note: This is existing behavior - the phase machine responds to subscription state
    // This could be considered a bug but existing tests depend on it
    setupRoundWithParticipants(store, 1);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Late callback with subscription state showing all complete
    // will transition back to MODERATOR (existing behavior)
    store.getState().onParticipantComplete(0);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
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

describe('backend Phase State Machine (FLOW_DOCUMENTATION.md)', () => {
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

// ============================================================================
// Pre-Search Flow with Gradual UI Updates
// ============================================================================

describe('pre-Search Flow with Gradual UI Updates', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should track presearch streaming status progressively', () => {
    setupRoundWithParticipants(store, 2);

    // Initial presearch state
    expect(store.getState().subscriptionState.presearch.status).toBe('idle');

    // Presearch starts waiting (202 response)
    store.getState().updateEntitySubscriptionStatus('presearch', 'waiting' as EntityStatus);
    expect(store.getState().subscriptionState.presearch.status).toBe('waiting');

    // Presearch starts streaming
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 1);
    expect(store.getState().subscriptionState.presearch.status).toBe('streaming');
    expect(store.getState().subscriptionState.presearch.lastSeq).toBe(1);

    // Presearch updates with more chunks
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 5);
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.presearch.lastSeq).toBe(10);

    // Presearch completes
    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 15);
    expect(store.getState().subscriptionState.presearch.status).toBe('complete');
    expect(store.getState().subscriptionState.presearch.lastSeq).toBe(15);
  });

  it('should handle presearch disabled status', () => {
    setupRoundWithParticipants(store, 2);

    // Presearch returns disabled (no web search for this round)
    store.getState().updateEntitySubscriptionStatus('presearch', 'disabled' as EntityStatus);
    expect(store.getState().subscriptionState.presearch.status).toBe('disabled');

    // Participants should still work
    streamingParticipant(store, 0);
    completeParticipant(store, 0);
    streamingParticipant(store, 1);
    completeParticipant(store, 1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle presearch error gracefully', () => {
    setupRoundWithParticipants(store, 2);

    // Presearch errors out
    store.getState().updateEntitySubscriptionStatus('presearch', 'error' as EntityStatus, 0, 'Network error');
    expect(store.getState().subscriptionState.presearch.status).toBe('error');
    expect(store.getState().subscriptionState.presearch.errorMessage).toBe('Network error');

    // Participants should still work (error doesn't block)
    streamingParticipant(store, 0);
    completeParticipant(store, 0);
    streamingParticipant(store, 1);
    completeParticipant(store, 1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// Web Search Toggle Across Rounds
// ============================================================================

describe('web Search Toggle Across Rounds', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle Round 1 without search → Round 2 with search', () => {
    // Round 1: No web search
    store.getState().setEnableWebSearch(false);
    setupRoundWithParticipants(store, 2, 0);

    // Presearch stays idle (not enabled)
    expect(store.getState().subscriptionState.presearch.status).toBe('idle');

    completeParticipant(store, 0);
    completeParticipant(store, 1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Round 2: Enable web search
    store.getState().setEnableWebSearch(true);
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 2, 1);

    // Now presearch should track status
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 1);
    expect(store.getState().subscriptionState.presearch.status).toBe('streaming');

    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 10);
    expect(store.getState().subscriptionState.presearch.status).toBe('complete');

    // Complete round 2
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should handle Round 1 with search → Round 2 without search', () => {
    // Round 1: With web search
    store.getState().setEnableWebSearch(true);
    setupRoundWithParticipants(store, 2, 0);

    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 10);
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Round 2: Disable web search
    store.getState().setEnableWebSearch(false);
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 2, 1);

    // Presearch should be reset to idle
    expect(store.getState().subscriptionState.presearch.status).toBe('idle');

    // Complete round 2 without presearch
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should handle web search toggle mid-session (Round 1→2→3 toggle)', () => {
    // Round 1: No search
    store.getState().setEnableWebSearch(false);
    setupRoundWithParticipants(store, 1, 0);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    // Round 2: Enable search
    store.getState().setEnableWebSearch(true);
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 1, 1);
    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 10);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    // Round 3: Disable search again
    store.getState().setEnableWebSearch(false);
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 1, 2);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    expect(store.getState().currentRoundNumber).toBe(2);
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});

// ============================================================================
// Continuous Multi-Round Flow
// ============================================================================

describe('continuous Multi-Round Flow', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle 5 consecutive rounds without issues', () => {
    for (let round = 0; round < 5; round++) {
      if (round > 0) {
        store.getState().prepareForNewMessage();
      }

      setupRoundWithParticipants(store, 2, round);
      expect(store.getState().currentRoundNumber).toBe(round);
      expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

      // Complete all participants
      completeParticipant(store, 0);
      completeParticipant(store, 1);
      expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

      // Complete moderator
      store.getState().onModeratorComplete();
      expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    }

    expect(store.getState().currentRoundNumber).toBe(4);
  });

  it('should correctly reset subscription state between rounds', () => {
    // Round 0
    setupRoundWithParticipants(store, 2, 0);
    completeParticipant(store, 0);
    completeParticipant(store, 1);

    const r0SubState = store.getState().subscriptionState;
    expect(r0SubState.activeRoundNumber).toBe(0);
    expect(r0SubState.participants[0]?.status).toBe('complete');

    store.getState().onModeratorComplete();

    // Round 1 - subscription state should be fresh
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 3, 1); // Different participant count

    const r1SubState = store.getState().subscriptionState;
    expect(r1SubState.activeRoundNumber).toBe(1);
    expect(r1SubState.participants).toHaveLength(3);
    expect(r1SubState.participants[0]?.status).toBe('idle');
  });

  it('should handle varying participant counts across rounds', () => {
    // Round 0: 2 participants
    setupRoundWithParticipants(store, 2, 0);
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();

    // Round 1: 5 participants
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 5, 1);
    for (let i = 0; i < 5; i++) {
      completeParticipant(store, i);
    }
    store.getState().onModeratorComplete();

    // Round 2: 1 participant
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 1, 2);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});

// ============================================================================
// Edge Cases and Dead Zones
// ============================================================================

describe('edge Cases and Dead Zones', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle participant completing with error status', () => {
    setupRoundWithParticipants(store, 2);

    // P0 completes normally
    completeParticipant(store, 0);

    // P1 errors
    store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus, 5, 'API Error');

    const subState = store.getState().subscriptionState;
    expect(subState.participants[1]?.status).toBe('error');
    expect(subState.participants[1]?.errorMessage).toBe('API Error');

    // Both complete/error should trigger MODERATOR
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle moderator completing with error status', () => {
    setupRoundWithParticipants(store, 1);
    completeParticipant(store, 0);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Moderator errors
    store.getState().updateEntitySubscriptionStatus('moderator', 'error' as EntityStatus, 10, 'Moderator failed');
    store.getState().onModeratorComplete();

    // Should still transition to COMPLETE
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should handle rapid sequential participant completions', () => {
    setupRoundWithParticipants(store, 5);

    // Complete all at once (simulates race condition)
    for (let i = 0; i < 5; i++) {
      completeParticipant(store, i);
    }

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle out-of-order participant completions', () => {
    setupRoundWithParticipants(store, 3);

    // P2 completes first (out of order)
    completeParticipant(store, 2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P0 completes
    completeParticipant(store, 0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // P1 completes last
    completeParticipant(store, 1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle duplicate completion calls', () => {
    setupRoundWithParticipants(store, 2);

    completeParticipant(store, 0);

    // Duplicate call
    completeParticipant(store, 0);
    completeParticipant(store, 0);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    completeParticipant(store, 1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle multiple onModeratorComplete calls', () => {
    setupRoundWithParticipants(store, 1);
    completeParticipant(store, 0);

    store.getState().onModeratorComplete();
    store.getState().onModeratorComplete();
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });

  it('should track lastSeq correctly across status updates', () => {
    setupRoundWithParticipants(store, 1);

    // Update lastSeq as chunks arrive
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 1);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 5);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 15);

    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(15);
  });

  it('should handle empty subscriptionState gracefully', () => {
    // Before any initialization
    expect(store.getState().subscriptionState.participants).toEqual([]);
    expect(store.getState().subscriptionState.presearch.status).toBe('idle');
    expect(store.getState().subscriptionState.moderator.status).toBe('idle');

    // Calling onParticipantComplete with empty state shouldn't crash
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should reset phase to IDLE after prepareForNewMessage', () => {
    setupRoundWithParticipants(store, 1, 0);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    store.getState().prepareForNewMessage();

    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });
});

// ============================================================================
// Streaming Text Gradual Updates
// ============================================================================

describe('streaming Text Gradual Updates', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should accumulate text chunks progressively', () => {
    setupRoundWithParticipants(store, 2, 0);

    // Simulate gradual text chunks
    const chunks = ['Hello', ' ', 'world', '!', ' How', ' are', ' you', '?'];

    for (const chunk of chunks) {
      store.getState().appendEntityStreamingText(0, chunk, 0);
    }

    const messages = store.getState().messages;
    const streamingMsg = messages.find(m => m.id === 'streaming_p0_r0');
    expect(streamingMsg?.parts[0]).toHaveProperty('text', 'Hello world! How are you?');
  });

  it('should handle concurrent streaming from multiple participants', () => {
    setupRoundWithParticipants(store, 3, 0);

    // Interleaved chunks from different participants
    store.getState().appendEntityStreamingText(0, 'P0: ', 0);
    store.getState().appendEntityStreamingText(1, 'P1: ', 0);
    store.getState().appendEntityStreamingText(2, 'P2: ', 0);
    store.getState().appendEntityStreamingText(0, 'Hello', 0);
    store.getState().appendEntityStreamingText(1, 'Hi', 0);
    store.getState().appendEntityStreamingText(2, 'Hey', 0);

    const messages = store.getState().messages;

    const p0 = messages.find(m => m.id === 'streaming_p0_r0');
    const p1 = messages.find(m => m.id === 'streaming_p1_r0');
    const p2 = messages.find(m => m.id === 'streaming_p2_r0');

    expect(p0?.parts[0]).toHaveProperty('text', 'P0: Hello');
    expect(p1?.parts[0]).toHaveProperty('text', 'P1: Hi');
    expect(p2?.parts[0]).toHaveProperty('text', 'P2: Hey');
  });

  it('should handle moderator streaming text', () => {
    setupRoundWithParticipants(store, 1, 0);
    completeParticipant(store, 0);

    // Moderator streaming
    store.getState().appendModeratorStreamingText('Summary: ', 0);
    store.getState().appendModeratorStreamingText('The discussion covered ', 0);
    store.getState().appendModeratorStreamingText('key points.', 0);

    const messages = store.getState().messages;
    const modMsg = messages.find(m => m.id === 'streaming_moderator_r0');
    expect(modMsg?.parts[0]).toHaveProperty('text', 'Summary: The discussion covered key points.');
  });

  it('should create separate placeholders for each round', () => {
    // Round 0
    setupRoundWithParticipants(store, 1, 0);
    store.getState().appendEntityStreamingText(0, 'Round 0 text', 0);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    // Round 1
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 1, 1);
    store.getState().appendEntityStreamingText(0, 'Round 1 text', 1);

    const messages = store.getState().messages;
    const r0Msg = messages.find(m => m.id === 'streaming_p0_r0');
    const r1Msg = messages.find(m => m.id === 'streaming_p0_r1');

    // Both should exist as separate messages
    expect(r0Msg?.parts[0]).toHaveProperty('text', 'Round 0 text');
    expect(r1Msg?.parts[0]).toHaveProperty('text', 'Round 1 text');
  });
});

// ============================================================================
// Pending Message Cleanup on Round Completion
// ============================================================================

describe('pending Message Cleanup on Round Completion', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should clear pendingMessage when round completes via onModeratorComplete', () => {
    // Setup: Set a pending message and start a round
    store.getState().setPendingMessage('retry');
    expect(store.getState().pendingMessage).toBe('retry');

    setupRoundWithParticipants(store, 2, 0);

    // Complete all participants
    completeAllParticipants(store, 2);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Pending message should still exist before round completes
    expect(store.getState().pendingMessage).toBe('retry');

    // Complete moderator (round completes)
    store.getState().onModeratorComplete();

    // After round completes, pendingMessage should be cleared
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().pendingMessage).toBeNull();
  });

  it('should clear pendingMessage when round completes via completeStreaming in MODERATOR phase', () => {
    // Setup: Set a pending message and start a round
    store.getState().setPendingMessage('test message');
    expect(store.getState().pendingMessage).toBe('test message');

    setupRoundWithParticipants(store, 1, 0);
    completeParticipant(store, 0);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Complete via completeStreaming
    store.getState().completeStreaming();

    // After round completes, pendingMessage should be cleared
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().pendingMessage).toBeNull();
  });

  it('should clear pendingMessage across multiple rounds', () => {
    // Round 0
    store.getState().setPendingMessage('first message');
    setupRoundWithParticipants(store, 1, 0);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    expect(store.getState().pendingMessage).toBeNull();

    // Prepare for Round 1
    store.getState().prepareForNewMessage();

    // Round 1
    store.getState().setPendingMessage('second message');
    expect(store.getState().pendingMessage).toBe('second message');

    setupRoundWithParticipants(store, 1, 1);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    // Should be cleared again
    expect(store.getState().pendingMessage).toBeNull();
  });

  it('should NOT clear pendingMessage when still in PARTICIPANTS phase', () => {
    store.getState().setPendingMessage('waiting message');
    setupRoundWithParticipants(store, 2, 0);

    // Only complete one participant
    completeParticipant(store, 0);

    // Still in PARTICIPANTS phase
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    // pendingMessage should still exist
    expect(store.getState().pendingMessage).toBe('waiting message');
  });

  it('should handle null pendingMessage gracefully on round completion', () => {
    // No pending message set
    expect(store.getState().pendingMessage).toBeNull();

    setupRoundWithParticipants(store, 1, 0);
    completeParticipant(store, 0);
    store.getState().onModeratorComplete();

    // Should still be null (no error)
    expect(store.getState().pendingMessage).toBeNull();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});

// ============================================================================
// Round 2 Submission Flow - Participant Change Between Rounds
// ============================================================================

describe('round 2 Submission: Participant Change Between Rounds', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle 2 participants in round 0 → 3 different participants in round 1', () => {
    // Round 0: 2 participants (gpt-5-nano, deepseek)
    const r0Participants = createMockParticipants(2);
    r0Participants[0]!.modelId = 'gpt-5-nano';
    r0Participants[1]!.modelId = 'deepseek';
    store.setState({ participants: r0Participants });
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    expect(store.getState().subscriptionState.participants).toHaveLength(2);

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1: 3 different participants (gpt-5-mini, gemini-flash, claude-haiku)
    const r1Participants = createMockParticipants(3);
    r1Participants[0]!.modelId = 'gpt-5-mini';
    r1Participants[1]!.modelId = 'gemini-flash';
    r1Participants[2]!.modelId = 'claude-haiku';
    store.setState({ participants: r1Participants });
    store.getState().startRound(1, 3);
    store.getState().initializeSubscriptions(1, 3);

    // Verify subscription state updated to 3 participants
    expect(store.getState().subscriptionState.participants).toHaveLength(3);
    expect(store.getState().subscriptionState.activeRoundNumber).toBe(1);
    expect(store.getState().participants).toHaveLength(3);
    expect(store.getState().participants[0]?.modelId).toBe('gpt-5-mini');
    expect(store.getState().participants[1]?.modelId).toBe('gemini-flash');
    expect(store.getState().participants[2]?.modelId).toBe('claude-haiku');
  });

  it('should verify old messages retain their participant context after participant change', () => {
    // Round 0 with 2 participants
    const r0Participants = createMockParticipants(2);
    r0Participants[0]!.modelId = 'gpt-5-nano';
    r0Participants[0]!.id = 'participant-nano';
    r0Participants[1]!.modelId = 'deepseek';
    r0Participants[1]!.id = 'participant-deepseek';
    store.setState({ participants: r0Participants });
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Add streaming text for round 0 participants
    store.getState().appendEntityStreamingText(0, 'Nano response', 0);
    store.getState().appendEntityStreamingText(1, 'DeepSeek response', 0);

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();

    // Verify round 0 messages have correct participant metadata
    const r0Messages = store.getState().messages;
    const nanoMsg = r0Messages.find(m => m.id === 'streaming_p0_r0');
    const deepseekMsg = r0Messages.find(m => m.id === 'streaming_p1_r0');

    expect(nanoMsg?.metadata?.model).toBe('gpt-5-nano');
    expect(nanoMsg?.metadata?.participantId).toBe('participant-nano');
    expect(deepseekMsg?.metadata?.model).toBe('deepseek');
    expect(deepseekMsg?.metadata?.participantId).toBe('participant-deepseek');

    // Now switch to round 1 with different participants
    store.getState().prepareForNewMessage();
    const r1Participants = createMockParticipants(3);
    r1Participants[0]!.modelId = 'gpt-5-mini';
    r1Participants[1]!.modelId = 'gemini-flash';
    r1Participants[2]!.modelId = 'claude-haiku';
    store.setState({ participants: r1Participants });
    store.getState().startRound(1, 3);
    store.getState().initializeSubscriptions(1, 3);

    // Add streaming text for round 1 participants
    store.getState().appendEntityStreamingText(0, 'Mini response', 1);
    store.getState().appendEntityStreamingText(1, 'Gemini response', 1);
    store.getState().appendEntityStreamingText(2, 'Haiku response', 1);

    // Verify round 0 messages still retain original participant context
    const allMessages = store.getState().messages;
    const oldNanoMsg = allMessages.find(m => m.id === 'streaming_p0_r0');
    const oldDeepseekMsg = allMessages.find(m => m.id === 'streaming_p1_r0');

    // Old messages should still have their original metadata
    expect(oldNanoMsg?.metadata?.model).toBe('gpt-5-nano');
    expect(oldDeepseekMsg?.metadata?.model).toBe('deepseek');

    // New messages should have new participant metadata
    const miniMsg = allMessages.find(m => m.id === 'streaming_p0_r1');
    const geminiMsg = allMessages.find(m => m.id === 'streaming_p1_r1');
    const haikuMsg = allMessages.find(m => m.id === 'streaming_p2_r1');

    expect(miniMsg?.metadata?.model).toBe('gpt-5-mini');
    expect(geminiMsg?.metadata?.model).toBe('gemini-flash');
    expect(haikuMsg?.metadata?.model).toBe('claude-haiku');
  });

  it('should update subscription state correctly when participant count increases', () => {
    // Round 0: 2 participants
    setupRoundWithParticipants(store, 2, 0);

    // Verify initial subscription state
    expect(store.getState().subscriptionState.participants).toHaveLength(2);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('idle');

    // Complete round 0
    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1: 3 participants (added one)
    setupRoundWithParticipants(store, 3, 1);

    // Verify subscription state updated with fresh slots
    expect(store.getState().subscriptionState.participants).toHaveLength(3);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('idle');
    expect(store.getState().subscriptionState.participants[2]?.status).toBe('idle');
    expect(store.getState().subscriptionState.activeRoundNumber).toBe(1);
  });

  it('should update subscription state correctly when participant count decreases', () => {
    // Round 0: 3 participants
    setupRoundWithParticipants(store, 3, 0);
    expect(store.getState().subscriptionState.participants).toHaveLength(3);

    completeAllParticipants(store, 3);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1: 2 participants (removed one)
    setupRoundWithParticipants(store, 2, 1);

    // Verify subscription state updated with fewer slots
    expect(store.getState().subscriptionState.participants).toHaveLength(2);
    expect(store.getState().subscriptionState.participants[2]).toBeUndefined();
  });
});

// ============================================================================
// Round 2 Submission Flow - Message Count Progression
// ============================================================================

describe('round 2 Submission: Message Count Progression', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should track message count: R0 user + 2 participants + moderator = 4 messages', () => {
    setupRoundWithParticipants(store, 2, 0);

    // Add user message placeholder
    store.getState().setMessages([
      {
        id: 'user_r0',
        parts: [{ text: 'What is AI?', type: 'text' }],
        role: 'user',
      },
    ]);

    // Add participant messages
    store.getState().appendEntityStreamingText(0, 'P0 response', 0);
    store.getState().appendEntityStreamingText(1, 'P1 response', 0);

    completeAllParticipants(store, 2);

    // Add moderator message
    store.getState().appendModeratorStreamingText('Summary', 0);
    store.getState().onModeratorComplete();

    // Verify: 1 user + 2 participants + 1 moderator = 4 messages
    const messages = store.getState().messages;
    expect(messages).toHaveLength(4);

    const userMsgs = messages.filter(m => m.role === 'user');
    const assistantMsgs = messages.filter(m => m.role === 'assistant');

    expect(userMsgs).toHaveLength(1);
    expect(assistantMsgs).toHaveLength(3); // 2 participants + 1 moderator
  });

  it('should track message count: R1 adds user + 3 participants + moderator = 9 total', () => {
    // Round 0: 4 messages
    setupRoundWithParticipants(store, 2, 0);

    store.getState().setMessages([
      { id: 'user_r0', parts: [{ text: 'Q1', type: 'text' }], role: 'user' },
    ]);
    store.getState().appendEntityStreamingText(0, 'P0 r0', 0);
    store.getState().appendEntityStreamingText(1, 'P1 r0', 0);
    completeAllParticipants(store, 2);
    store.getState().appendModeratorStreamingText('Mod r0', 0);
    store.getState().onModeratorComplete();

    expect(store.getState().messages).toHaveLength(4);

    // Round 1: Add 5 more messages (user + 3 participants + moderator)
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 3, 1);

    // Add user message for round 1
    const currentMessages = store.getState().messages;
    store.getState().setMessages([
      ...currentMessages,
      { id: 'user_r1', parts: [{ text: 'Q2', type: 'text' }], role: 'user' },
    ]);

    // Add 3 participant messages
    store.getState().appendEntityStreamingText(0, 'P0 r1', 1);
    store.getState().appendEntityStreamingText(1, 'P1 r1', 1);
    store.getState().appendEntityStreamingText(2, 'P2 r1', 1);
    completeAllParticipants(store, 3);

    // Add moderator message
    store.getState().appendModeratorStreamingText('Mod r1', 1);
    store.getState().onModeratorComplete();

    // Verify: 4 (R0) + 5 (R1) = 9 messages total
    const allMessages = store.getState().messages;
    expect(allMessages).toHaveLength(9);

    // Verify message breakdown
    const userMsgs = allMessages.filter(m => m.role === 'user');
    const assistantMsgs = allMessages.filter(m => m.role === 'assistant');

    expect(userMsgs).toHaveLength(2); // 1 per round
    expect(assistantMsgs).toHaveLength(7); // R0: 2+1, R1: 3+1
  });

  it('should correctly track messages per round via roundNumber metadata', () => {
    // Round 0
    setupRoundWithParticipants(store, 2, 0);
    store.getState().appendEntityStreamingText(0, 'R0 P0', 0);
    store.getState().appendEntityStreamingText(1, 'R0 P1', 0);
    completeAllParticipants(store, 2);
    store.getState().appendModeratorStreamingText('R0 Mod', 0);
    store.getState().onModeratorComplete();

    // Round 1
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 3, 1);
    store.getState().appendEntityStreamingText(0, 'R1 P0', 1);
    store.getState().appendEntityStreamingText(1, 'R1 P1', 1);
    store.getState().appendEntityStreamingText(2, 'R1 P2', 1);
    completeAllParticipants(store, 3);
    store.getState().appendModeratorStreamingText('R1 Mod', 1);
    store.getState().onModeratorComplete();

    const messages = store.getState().messages;

    // Filter by round number in metadata
    const r0Msgs = messages.filter(m => m.metadata?.roundNumber === 0);
    const r1Msgs = messages.filter(m => m.metadata?.roundNumber === 1);

    expect(r0Msgs).toHaveLength(3); // 2 participants + moderator
    expect(r1Msgs).toHaveLength(4); // 3 participants + moderator
  });
});

// ============================================================================
// Round 2 Submission Flow - Changelog Integration
// ============================================================================

describe('round 2 Submission: Changelog Integration', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should add changelog items when mode changes between rounds', () => {
    // Round 0: debating mode
    setupRoundWithParticipants(store, 2, 0);
    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();

    expect(store.getState().changelogItems).toHaveLength(0);

    // Round 1: mode changed to analyzing - add changelog
    store.getState().prepareForNewMessage();
    setupRoundWithParticipants(store, 2, 1);

    const modeChangeChangelog = {
      changeType: 'mode_change' as const,
      createdAt: new Date().toISOString(),
      id: 'changelog-1',
      newValue: 'analyzing',
      previousValue: 'debating',
      roundNumber: 1,
      threadId: 'thread-123',
    };

    store.getState().addChangelogItems([modeChangeChangelog]);

    expect(store.getState().changelogItems).toHaveLength(1);
    expect(store.getState().changelogItems[0]?.changeType).toBe('mode_change');
    expect(store.getState().changelogItems[0]?.previousValue).toBe('debating');
    expect(store.getState().changelogItems[0]?.newValue).toBe('analyzing');
  });

  it('should add changelog items when participants are added', () => {
    // Round 0: 2 participants
    setupRoundWithParticipants(store, 2, 0);
    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1: participant added
    setupRoundWithParticipants(store, 3, 1);

    const participantAddedChangelog = {
      changeType: 'participant_added' as const,
      createdAt: new Date().toISOString(),
      id: 'changelog-2',
      newValue: 'claude-haiku',
      previousValue: null,
      roundNumber: 1,
      threadId: 'thread-123',
    };

    store.getState().addChangelogItems([participantAddedChangelog]);

    expect(store.getState().changelogItems).toHaveLength(1);
    expect(store.getState().changelogItems[0]?.changeType).toBe('participant_added');
  });

  it('should add changelog items when participants are removed', () => {
    // Round 0: 3 participants
    setupRoundWithParticipants(store, 3, 0);
    completeAllParticipants(store, 3);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1: participant removed
    setupRoundWithParticipants(store, 2, 1);

    const participantRemovedChangelog = {
      changeType: 'participant_removed' as const,
      createdAt: new Date().toISOString(),
      id: 'changelog-3',
      newValue: null,
      previousValue: 'claude-haiku',
      roundNumber: 1,
      threadId: 'thread-123',
    };

    store.getState().addChangelogItems([participantRemovedChangelog]);

    expect(store.getState().changelogItems).toHaveLength(1);
    expect(store.getState().changelogItems[0]?.changeType).toBe('participant_removed');
  });

  it('should accumulate multiple changelog items across rounds', () => {
    setupRoundWithParticipants(store, 2, 0);
    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    setupRoundWithParticipants(store, 3, 1);

    // Add multiple changelog items
    store.getState().addChangelogItems([
      {
        changeType: 'mode_change' as const,
        createdAt: new Date().toISOString(),
        id: 'changelog-1',
        newValue: 'analyzing',
        previousValue: 'debating',
        roundNumber: 1,
        threadId: 'thread-123',
      },
      {
        changeType: 'participant_added' as const,
        createdAt: new Date().toISOString(),
        id: 'changelog-2',
        newValue: 'claude-haiku',
        previousValue: null,
        roundNumber: 1,
        threadId: 'thread-123',
      },
    ]);

    expect(store.getState().changelogItems).toHaveLength(2);
  });

  it('should not add duplicate changelog items', () => {
    setupRoundWithParticipants(store, 2, 0);

    const changelog = {
      changeType: 'mode_change' as const,
      createdAt: new Date().toISOString(),
      id: 'changelog-1',
      newValue: 'analyzing',
      previousValue: 'debating',
      roundNumber: 0,
      threadId: 'thread-123',
    };

    // Add same changelog twice
    store.getState().addChangelogItems([changelog]);
    store.getState().addChangelogItems([changelog]);

    // Should only have one entry due to ID deduplication
    expect(store.getState().changelogItems).toHaveLength(1);
  });

  it('should clear changelog when navigating to new thread', () => {
    setupRoundWithParticipants(store, 2, 0);

    store.getState().addChangelogItems([
      {
        changeType: 'mode_change' as const,
        createdAt: new Date().toISOString(),
        id: 'changelog-1',
        newValue: 'analyzing',
        previousValue: 'debating',
        roundNumber: 0,
        threadId: 'thread-123',
      },
    ]);

    expect(store.getState().changelogItems).toHaveLength(1);

    // Navigate to new thread (simulates resetForThreadNavigation)
    store.getState().resetForThreadNavigation();

    expect(store.getState().changelogItems).toHaveLength(0);
  });
});

// ============================================================================
// Round 2 Submission Flow - State Cleanup Between Rounds
// ============================================================================

describe('round 2 Submission: State Cleanup Between Rounds', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should clear pendingMessage between rounds via prepareForNewMessage', () => {
    setupRoundWithParticipants(store, 2, 0);

    // Set pending message during round 0
    store.getState().setPendingMessage('This is my question');
    expect(store.getState().pendingMessage).toBe('This is my question');

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();

    // Prepare for new message should clear pending message
    store.getState().prepareForNewMessage();

    expect(store.getState().pendingMessage).toBeNull();
  });

  it('should reset currentParticipantIndex between rounds', () => {
    setupRoundWithParticipants(store, 3, 0);

    // Simulate streaming through participants
    streamingParticipant(store, 0);
    store.getState().setCurrentParticipantIndex(0);
    completeParticipant(store, 0);

    streamingParticipant(store, 1);
    store.getState().setCurrentParticipantIndex(1);
    completeParticipant(store, 1);

    streamingParticipant(store, 2);
    store.getState().setCurrentParticipantIndex(2);
    completeParticipant(store, 2);

    expect(store.getState().currentParticipantIndex).toBe(2);

    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Start new round - should reset to 0
    setupRoundWithParticipants(store, 3, 1);

    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should reinitialize subscription state for new round', () => {
    setupRoundWithParticipants(store, 2, 0);

    // Set various subscription states during round 0
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 25);
    store.getState().updateEntitySubscriptionStatus('moderator', 'streaming' as EntityStatus, 75);

    // Verify state is set
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(50);
    expect(store.getState().subscriptionState.presearch.status).toBe('complete');
    expect(store.getState().subscriptionState.moderator.status).toBe('streaming');

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Initialize subscriptions for new round
    store.getState().initializeSubscriptions(1, 3);

    // All subscription state should be reset
    const subState = store.getState().subscriptionState;
    expect(subState.activeRoundNumber).toBe(1);
    expect(subState.participants).toHaveLength(3);
    expect(subState.participants[0]?.status).toBe('idle');
    expect(subState.participants[0]?.lastSeq).toBe(0);
    expect(subState.participants[1]?.status).toBe('idle');
    expect(subState.participants[2]?.status).toBe('idle');
    expect(subState.presearch.status).toBe('idle');
    expect(subState.presearch.lastSeq).toBe(0);
    expect(subState.moderator.status).toBe('idle');
    expect(subState.moderator.lastSeq).toBe(0);
  });

  it('should reset phase to IDLE between rounds via prepareForNewMessage', () => {
    setupRoundWithParticipants(store, 2, 0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    completeAllParticipants(store, 2);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    store.getState().prepareForNewMessage();
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should reset hasSentPendingMessage between rounds', () => {
    setupRoundWithParticipants(store, 2, 0);

    store.getState().setHasSentPendingMessage(true);
    expect(store.getState().hasSentPendingMessage).toBe(true);

    completeAllParticipants(store, 2);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    expect(store.getState().hasSentPendingMessage).toBe(false);
  });

  it('should preserve messages when preparing for new round', () => {
    setupRoundWithParticipants(store, 2, 0);

    // Add messages during round 0
    store.getState().appendEntityStreamingText(0, 'R0 P0 response', 0);
    store.getState().appendEntityStreamingText(1, 'R0 P1 response', 0);

    completeAllParticipants(store, 2);
    store.getState().appendModeratorStreamingText('R0 moderator', 0);
    store.getState().onModeratorComplete();

    const r0MessageCount = store.getState().messages.length;
    expect(r0MessageCount).toBeGreaterThan(0);

    // Prepare for new message
    store.getState().prepareForNewMessage();

    // Messages should be preserved
    expect(store.getState().messages).toHaveLength(r0MessageCount);
  });

  it('should handle complete state transition lifecycle across multiple rounds', () => {
    // Round 0: Full lifecycle
    setupRoundWithParticipants(store, 2, 0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().isStreaming).toBe(true);

    completeAllParticipants(store, 2);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().isStreaming).toBe(false);

    store.getState().prepareForNewMessage();
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
    expect(store.getState().pendingMessage).toBeNull();

    // Round 1: Full lifecycle with different participant count
    setupRoundWithParticipants(store, 3, 1);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);
    expect(store.getState().subscriptionState.participants).toHaveLength(3);

    completeAllParticipants(store, 3);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    store.getState().onModeratorComplete();
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().currentRoundNumber).toBe(1);

    store.getState().prepareForNewMessage();

    // Round 2: Verify clean state
    setupRoundWithParticipants(store, 1, 2);
    expect(store.getState().subscriptionState.participants).toHaveLength(1);
    expect(store.getState().subscriptionState.activeRoundNumber).toBe(2);
    expect(store.getState().currentRoundNumber).toBe(2);
  });
});

// ============================================================================
// Round 2 Submission Flow - Concurrent Operations and Race Conditions
// ============================================================================

describe('round 2 Submission: Concurrent Operations', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  it('should handle participant completion during subscription state update', () => {
    setupRoundWithParticipants(store, 3, 0);

    // Simulate rapid interleaved updates
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 5);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(2, 'streaming' as EntityStatus, 1);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 80);
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 50);

    // Verify final state is consistent
    const subState = store.getState().subscriptionState;
    expect(subState.participants[0]?.status).toBe('complete');
    expect(subState.participants[0]?.lastSeq).toBe(100);
    expect(subState.participants[1]?.status).toBe('complete');
    expect(subState.participants[1]?.lastSeq).toBe(80);
    expect(subState.participants[2]?.status).toBe('complete');
    expect(subState.participants[2]?.lastSeq).toBe(50);
  });

  it('should correctly determine all-complete state with varying completion orders', () => {
    setupRoundWithParticipants(store, 4, 0);

    // Complete in order: 3, 0, 2, 1
    store.getState().updateEntitySubscriptionStatus(3, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(3);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 110);
    store.getState().onParticipantComplete(0);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 120);
    store.getState().onParticipantComplete(2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    // Last participant completes - should transition to MODERATOR
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 130);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle mixed error and complete states correctly', () => {
    setupRoundWithParticipants(store, 3, 0);

    // P0 completes, P1 errors, P2 completes
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'error' as EntityStatus, 50, 'Network timeout');
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 80);

    // All are in terminal state (complete or error)
    store.getState().onParticipantComplete(2);

    // Should transition to MODERATOR since all participants are in terminal state
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Verify error message is preserved
    expect(store.getState().subscriptionState.participants[1]?.errorMessage).toBe('Network timeout');
  });
});
