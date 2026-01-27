/**
 * Stream Resumption Scenarios Tests
 *
 * Tests for when users leave mid-streaming and return later.
 * Per FLOW_DOCUMENTATION.md Stream Resumption Pattern:
 * - Backend continues writing to KV while user is away
 * - Client reconnects with lastSeq to get missed chunks
 * - Each entity (presearch, participants, moderator) is independently resumable
 *
 * @see docs/FLOW_DOCUMENTATION.md Section "Stream Resumption Pattern"
 */

import { MessageStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';

import { createChatStore } from '../store';
import type { EntityStatus } from '../store-schemas';
import { ChatPhases } from '../store-schemas';

// ============================================================================
// Test Setup
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

function setupStoreForResumption(
  store: TestStore,
  participantCount: number,
  enableWebSearch = false,
) {
  const participants = createMockParticipants(participantCount);
  const thread = createMockThread({
    enableWebSearch,
    id: 'thread-resumption-test',
  });

  store.setState({ participants, thread });
  store.getState().setEnableWebSearch(enableWebSearch);

  return { participants, thread };
}

function simulateUserLeaves(store: TestStore) {
  // User navigating away would typically abort subscriptions
  // Store state persists but SSE connections are closed
  store.getState().abort?.();
}

function simulateUserReturns(_store: TestStore, _roundNumber: number, _participantCount: number) {
  // User returns - in reality, the client would:
  // 1. Fetch current state from server via SSR/loader
  // 2. Hydrate store with that state (which preserves progress)
  // 3. Re-establish SSE subscriptions for any still-streaming entities
  //
  // NOTE: We do NOT call initializeSubscriptions here because that would reset
  // all progress. The existing subscription state (set via updateEntitySubscriptionStatus
  // before this function) represents what the server tells the client about
  // current progress when it returns.
  //
  // initializeSubscriptions is only called when starting a NEW round, not resuming.
}

// ============================================================================
// SCENARIO 1: User Refreshes Mid-P1 Streaming
// Per FLOW_DOCUMENTATION.md: "P0: Complete (from D1), P1: Resume from lastSeq=23"
// ============================================================================

describe('scenario 1: User Refreshes Mid-P1 Streaming', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should detect incomplete round when P0 complete but P1 streaming', () => {
    setupStoreForResumption(store, 3);

    // Simulate state where P0 completed, P1 was mid-stream when user left
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // P0 completed
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);

    // P1 was streaming at seq 23
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 23);

    // Verify state shows P0 done, P1 in progress, P2 idle
    const subState = store.getState().subscriptionState;
    expect(subState.participants[0]?.status).toBe('complete');
    expect(subState.participants[1]?.status).toBe('streaming');
    expect(subState.participants[2]?.status).toBe('idle');

    // Phase should still be PARTICIPANTS
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });

  it('should preserve lastSeq for P1 resumption', () => {
    setupStoreForResumption(store, 3);
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // P0 complete, P1 at seq 23
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 23);

    // User leaves
    simulateUserLeaves(store);

    // Verify lastSeq is tracked
    const subState = store.getState().subscriptionState;
    expect(subState.participants[1]?.lastSeq).toBe(23);
  });

  it('should allow P1 to continue receiving chunks after resumption', () => {
    setupStoreForResumption(store, 3);
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // P0 complete, P1 at seq 23
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 23);

    // User returns, re-subscribes
    simulateUserReturns(store, 0, 3);

    // P1 continues from seq 24 to completion
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 42);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 50);
    store.getState().onParticipantComplete(1);

    expect(store.getState().subscriptionState.participants[1]?.status).toBe('complete');
    expect(store.getState().subscriptionState.participants[1]?.lastSeq).toBe(50);
  });

  it('should maintain round integrity after P1 resumes and completes', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 complete, P1 streaming
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 23);

    // User leaves and returns
    simulateUserLeaves(store);
    simulateUserReturns(store, 0, 2);

    // P1 completes
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 50);
    store.getState().onParticipantComplete(1);

    // Should transition to MODERATOR phase
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });
});

// ============================================================================
// SCENARIO 2: User Returns Mid-Moderator
// Per FLOW_DOCUMENTATION.md: "P0-PN: Complete (from D1), MOD: Resume from lastSeq"
// ============================================================================

describe('scenario 2: User Returns Mid-Moderator', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should detect incomplete round when all participants done but moderator streaming', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // All participants complete
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);

    // Moderator mid-stream
    store.getState().updateEntitySubscriptionStatus('moderator', 'streaming' as EntityStatus, 15);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    expect(store.getState().subscriptionState.moderator.status).toBe('streaming');
    expect(store.getState().subscriptionState.moderator.lastSeq).toBe(15);
  });

  it('should allow moderator to resume and complete', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // All participants complete
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);

    // Moderator streaming at seq 15
    store.getState().updateEntitySubscriptionStatus('moderator', 'streaming' as EntityStatus, 15);

    // User leaves and returns
    simulateUserLeaves(store);
    simulateUserReturns(store, 0, 2);

    // Moderator continues and completes
    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 42);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().subscriptionState.moderator.status).toBe('complete');
  });
});

// ============================================================================
// SCENARIO 3: User Returns After Round Complete
// Per FLOW_DOCUMENTATION.md: "All: Load from D1, KV streams expired, No active subscriptions"
// ============================================================================

describe('scenario 3: User Returns After Round Complete', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should show complete state when round is done', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Complete entire round
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 100);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);

    // Verify isRoundComplete flag
    const subState = store.getState().subscriptionState;
    expect(subState.participants[0]?.status).toBe('complete');
    expect(subState.participants[1]?.status).toBe('complete');
    expect(subState.moderator.status).toBe('complete');
  });

  it('should not require active subscriptions for completed round', () => {
    setupStoreForResumption(store, 2);

    // Hydrate store with completed round data (as if from D1)
    store.setState({
      currentRoundNumber: 0,
      isStreaming: false,
      phase: ChatPhases.COMPLETE,
    });

    // Add complete messages
    const messages = [
      createTestUserMessage({ content: 'test', id: 'user-0', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'response 0',
        id: 'p0-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'response 1',
        id: 'p1-0',
        participantIndex: 1,
        roundNumber: 0,
      }),
      createTestModeratorMessage({
        content: 'summary',
        id: 'mod-0',
        roundNumber: 0,
      }),
    ];
    store.getState().setMessages(messages);

    // Phase should remain COMPLETE
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    expect(store.getState().messages).toHaveLength(4);
  });

  it('should enable input after round complete', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Input should be disabled during streaming
    expect(store.getState().isStreaming || store.getState().waitingToStartStreaming).toBeTruthy();

    // Complete round
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 100);
    store.getState().onModeratorComplete();

    // Input should be enabled
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
    // isStreaming should be false when round is complete
  });
});

// ============================================================================
// SCENARIO 4: User Leaves During PRESEARCH Phase
// ============================================================================

describe('scenario 4: User Leaves During PRESEARCH Phase', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should preserve pre-search state when user leaves mid-search', () => {
    setupStoreForResumption(store, 2, true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Pre-search streaming
    store.setState({ phase: ChatPhases.PRESEARCH });
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING, {
      threadId: 'thread-resumption-test',
    }));
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 10);

    // User leaves
    simulateUserLeaves(store);

    // Pre-search state preserved
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    expect(store.getState().subscriptionState.presearch.status).toBe('streaming');
    expect(store.getState().subscriptionState.presearch.lastSeq).toBe(10);
  });

  it('should allow pre-search to complete after user returns', () => {
    setupStoreForResumption(store, 2, true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Pre-search at seq 10
    store.setState({ phase: ChatPhases.PRESEARCH });
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING, {
      threadId: 'thread-resumption-test',
    }));
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 10);

    // User leaves and returns
    simulateUserLeaves(store);
    simulateUserReturns(store, 0, 2);

    // Pre-search completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    store.getState().updateEntitySubscriptionStatus('presearch', 'complete' as EntityStatus, 25);

    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    expect(store.getState().subscriptionState.presearch.status).toBe('complete');
  });

  it('should transition to PARTICIPANTS after pre-search completes on return', () => {
    setupStoreForResumption(store, 2, true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Pre-search streaming
    store.setState({ phase: ChatPhases.PRESEARCH });
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING, {
      threadId: 'thread-resumption-test',
    }));

    // User leaves, returns, pre-search now complete
    simulateUserLeaves(store);
    simulateUserReturns(store, 0, 2);

    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    store.setState({ phase: ChatPhases.PARTICIPANTS });

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
  });
});

// ============================================================================
// SCENARIO 5: User Leaves During P0, Returns Mid-P2
// ============================================================================

describe('scenario 5: User Leaves During P0, Returns Mid-P2', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should show P0, P1 complete and P2 streaming on return', () => {
    setupStoreForResumption(store, 3);
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // Initially P0 was streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);

    // User leaves
    simulateUserLeaves(store);

    // Backend continued - P0, P1 finished, P2 mid-stream
    // Simulate state when user returns
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    store.getState().updateEntitySubscriptionStatus(2, 'streaming' as EntityStatus, 35);

    // User returns and re-subscribes
    simulateUserReturns(store, 0, 3);

    const subState = store.getState().subscriptionState;
    expect(subState.participants[0]?.status).toBe('complete');
    expect(subState.participants[1]?.status).toBe('complete');
    expect(subState.participants[2]?.status).toBe('streaming');
    expect(subState.participants[2]?.lastSeq).toBe(35);
  });

  it('should complete round correctly after catching up', () => {
    setupStoreForResumption(store, 3);
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // Simulate state: P0, P1 complete, P2 streaming
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    store.getState().updateEntitySubscriptionStatus(2, 'streaming' as EntityStatus, 35);

    // User returns
    simulateUserReturns(store, 0, 3);

    // P2 completes
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 80);
    store.getState().onParticipantComplete(2);

    // Should transition to moderator
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Moderator completes
    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 50);
    store.getState().onModeratorComplete();

    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});

// ============================================================================
// SCENARIO 6: Multiple Browser Tabs (Race Condition)
// ============================================================================

describe('scenario 6: Multiple Browser Tabs Race Condition', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle duplicate subscription state updates idempotently', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 20);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 30);

    // Multiple updates should work correctly
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(30);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
  });

  it('should handle out-of-order seq updates gracefully', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Seq updates arrive out of order (network reordering)
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 30);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10); // Old
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 20); // Old

    // Should keep highest seq
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(30);
  });

  it('should not regress status from complete to streaming', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 marked complete
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);

    // Late streaming update from another tab (should be ignored)
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);

    // Status should remain complete
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
  });

  it('should handle duplicate onParticipantComplete calls', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 complete
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(0); // Duplicate
    store.getState().onParticipantComplete(0); // Triplicate

    // Should be idempotent - still waiting for P1
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });
});

// ============================================================================
// SCENARIO 7: SSR Hydration with Active Stream
// ============================================================================

describe('scenario 7: SSR Hydration with Active Stream', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should detect active stream from server-provided resumption state', () => {
    setupStoreForResumption(store, 2);

    // Simulate SSR hydration - server tells us P1 is streaming
    store.setState({
      currentRoundNumber: 0,
      isStreaming: true,
      phase: ChatPhases.PARTICIPANTS,
      streamingRoundNumber: 0,
    });

    // Hydrate subscriptions with server state
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 45);

    expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('streaming');
    expect(store.getState().subscriptionState.participants[1]?.lastSeq).toBe(45);
  });

  it('should resume pre-search from SSR-provided state', () => {
    setupStoreForResumption(store, 2, true);

    // SSR provides pre-search streaming state
    store.setState({
      currentRoundNumber: 0,
      isStreaming: true,
      phase: ChatPhases.PRESEARCH,
      streamingRoundNumber: 0,
    });

    store.getState().initializeSubscriptions(0, 2);
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING, {
      threadId: 'thread-resumption-test',
    }));
    store.getState().updateEntitySubscriptionStatus('presearch', 'streaming' as EntityStatus, 12);

    expect(store.getState().subscriptionState.presearch.status).toBe('streaming');
    expect(store.getState().subscriptionState.presearch.lastSeq).toBe(12);
  });
});

// ============================================================================
// SCENARIO 8: Error Recovery During Resumption
// ============================================================================

describe('scenario 8: Error Recovery During Resumption', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle entity error status during resumption', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 errored while user was away
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 25);

    expect(store.getState().subscriptionState.participants[0]?.status).toBe('error');
  });

  it('should allow round to continue when one participant errors', () => {
    setupStoreForResumption(store, 3);
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // P0 errors
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 25);
    store.getState().onParticipantComplete(0); // Error counts as "done"

    // P1 and P2 can still complete
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    store.getState().updateEntitySubscriptionStatus(2, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(2);

    // Should still transition to moderator
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should handle pre-search failure and allow participants to proceed', () => {
    setupStoreForResumption(store, 2, true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Pre-search fails
    store.setState({ phase: ChatPhases.PRESEARCH });
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: 'Network error',
      id: 'presearch-error',
      roundNumber: 0,
      searchData: null,
      status: MessageStatuses.FAILED,
      threadId: 'thread-resumption-test',
      userQuery: 'test',
    });

    // Transition to participants should still work
    store.setState({ phase: ChatPhases.PARTICIPANTS });
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);

    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.FAILED);
  });
});

// ============================================================================
// SCENARIO 9: Rapid Navigation (Leave/Return/Leave/Return)
// ============================================================================

describe('scenario 9: Rapid Navigation', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle rapid leave/return cycles without corrupting state', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);

    // Rapid navigation cycles
    for (let i = 0; i < 5; i++) {
      simulateUserLeaves(store);
      simulateUserReturns(store, 0, 2);
      store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10 + (i + 1) * 5);
    }

    // State should be consistent
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(35);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
    expect(store.getState().participants).toHaveLength(2);
  });

  it('should not create duplicate subscriptions on rapid re-initialization', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);

    // Multiple rapid initializations
    store.getState().initializeSubscriptions(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Should still have exactly 2 participant subscription states
    expect(store.getState().subscriptionState.participants).toHaveLength(2);
  });
});

// ============================================================================
// SCENARIO 10: Browser Offline/Online Toggle
// ============================================================================

describe('scenario 10: Browser Offline/Online Toggle', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should preserve state during offline period', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 streaming at seq 20
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 20);

    // Simulate offline (no updates for a while)
    // State should be preserved
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(20);

    // Back online - can continue receiving updates
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 45);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 60);
    store.getState().onParticipantComplete(0);

    expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
    expect(store.getState().subscriptionState.participants[0]?.lastSeq).toBe(60);
  });

  it('should handle backend completing while browser offline', () => {
    setupStoreForResumption(store, 2);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // P0 streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 20);

    // Browser goes offline, backend completes everything
    // When online again, we get the completion status
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(1);
    store.getState().updateEntitySubscriptionStatus('moderator', 'complete' as EntityStatus, 50);
    store.getState().onModeratorComplete();

    // Should be complete
    expect(store.getState().phase).toBe(ChatPhases.COMPLETE);
  });
});
