/**
 * Multi-Round Conversation State Tests
 *
 * Tests for maintaining state across multiple conversation rounds.
 * Per FLOW_DOCUMENTATION.md:
 * - Rounds cycle: IDLE → PARTICIPANTS → MODERATOR → COMPLETE → IDLE
 * - Messages accumulate across rounds
 * - Participant configuration can change between rounds
 * - Web search can be toggled between rounds
 *
 * @see docs/FLOW_DOCUMENTATION.md Section "Multi-Round Flow"
 */

import { MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

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

function setupStore(participantCount = 2, enableWebSearch = false) {
  const store = createChatStore();
  const participants = createMockParticipants(participantCount);
  const thread = createMockThread({ enableWebSearch, id: 'thread-multi-round' });

  store.setState({ participants, thread });
  store.getState().setEnableWebSearch(enableWebSearch);
  store.getState().initializeThread(thread, participants, []);

  return { participants, store, thread };
}

function completeRound(store: TestStore, roundNumber: number, participantCount: number) {
  store.getState().startRound(roundNumber, participantCount);
  store.getState().initializeSubscriptions(roundNumber, participantCount);

  for (let i = 0; i < participantCount; i++) {
    store.getState().updateEntitySubscriptionStatus(i, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(i);
  }

  store.getState().onModeratorComplete();
  store.getState().prepareForNewMessage();
}

// ============================================================================
// SCENARIO: Basic Multi-Round Flow
// ============================================================================

describe('basic Multi-Round Flow', () => {
  it('should complete 3 consecutive rounds successfully', () => {
    const { store } = setupStore(2);

    // Round 0
    completeRound(store, 0, 2);
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // Round 1
    completeRound(store, 1, 2);
    expect(store.getState().phase).toBe(ChatPhases.IDLE);

    // Round 2
    completeRound(store, 2, 2);
    expect(store.getState().phase).toBe(ChatPhases.IDLE);
  });

  it('should track currentRoundNumber correctly across rounds', () => {
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
  });

  it('should accumulate messages across rounds', () => {
    const { store } = setupStore(2);

    // Round 0 messages
    store.getState().startRound(0, 2);
    store.getState().appendEntityStreamingText(1, 'R0 P1 content', 0);
    store.getState().appendModeratorStreamingText('R0 Moderator', 0);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    const r0MessageCount = store.getState().messages.length;

    // Round 1 messages
    store.getState().startRound(1, 2);
    store.getState().appendEntityStreamingText(1, 'R1 P1 content', 1);
    store.getState().appendModeratorStreamingText('R1 Moderator', 1);

    // Messages should accumulate
    expect(store.getState().messages.length).toBeGreaterThan(r0MessageCount);

    // Old messages should still exist
    const r0P1 = store.getState().messages.find(m => m.id === 'streaming_p1_r0');
    expect(r0P1).toBeDefined();
  });
});

// ============================================================================
// SCENARIO: Participant Changes Between Rounds
// ============================================================================

describe('participant Changes Between Rounds', () => {
  it('should handle adding a participant between rounds', () => {
    const { store } = setupStore(2);

    // Round 0 with 2 participants
    completeRound(store, 0, 2);

    // Add participant for round 1
    const newParticipants = createMockParticipants(3);
    store.setState({ participants: newParticipants });

    // Round 1 with 3 participants
    store.getState().startRound(1, 3);
    store.getState().initializeSubscriptions(1, 3);

    expect(store.getState().subscriptionState.participants).toHaveLength(3);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);
  });

  it('should handle removing a participant between rounds', () => {
    const { store } = setupStore(3);

    // Round 0 with 3 participants
    completeRound(store, 0, 3);

    // Remove participant for round 1
    const fewerParticipants = createMockParticipants(2);
    store.setState({ participants: fewerParticipants });

    // Round 1 with 2 participants
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);

    expect(store.getState().subscriptionState.participants).toHaveLength(2);
  });

  it('should reset subscription state when participant count changes', () => {
    const { store } = setupStore(2);

    // Round 0
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Change participants
    const newParticipants = createMockParticipants(4);
    store.setState({ participants: newParticipants });

    // Round 1 should have fresh subscription state
    store.getState().startRound(1, 4);
    store.getState().initializeSubscriptions(1, 4);

    const subState = store.getState().subscriptionState;
    expect(subState.participants).toHaveLength(4);
    subState.participants.forEach((p) => {
      expect(p.status).toBe('idle');
      expect(p.lastSeq).toBe(0);
    });
  });
});

// ============================================================================
// SCENARIO: Web Search Toggle Between Rounds
// ============================================================================

describe('web Search Toggle Between Rounds', () => {
  it('should handle enabling web search in round 2', () => {
    const { store } = setupStore(2, false);

    // Round 0 without web search
    completeRound(store, 0, 2);
    expect(store.getState().preSearches).toHaveLength(0);

    // Enable web search for round 1
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(1, 2);
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE, {
      threadId: 'thread-multi-round',
    }));

    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
  });

  it('should handle disabling web search in later rounds', () => {
    const { store } = setupStore(2, true);

    // Round 0 with web search
    store.getState().startRound(0, 2);
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
      threadId: 'thread-multi-round',
    }));
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Disable web search for round 1
    store.getState().setEnableWebSearch(false);

    // Round 1 without web search
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);

    // Old pre-search should still exist but no new one added
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().enableWebSearch).toBe(false);
  });

  it('should accumulate pre-searches across rounds with web search', () => {
    const { store } = setupStore(2, true);

    // Round 0 with web search
    store.getState().startRound(0, 2);
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
      searchData: { summary: 'R0 search' } as any,
      threadId: 'thread-multi-round',
    }));
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1 with web search
    store.getState().startRound(1, 2);
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE, {
      searchData: { summary: 'R1 search' } as any,
      threadId: 'thread-multi-round',
    }));

    expect(store.getState().preSearches).toHaveLength(2);
    expect(store.getState().preSearches[0]?.roundNumber).toBe(0);
    expect(store.getState().preSearches[1]?.roundNumber).toBe(1);
  });
});

// ============================================================================
// SCENARIO: Changelog Accumulation
// ============================================================================

describe('changelog Accumulation Across Rounds', () => {
  it('should accumulate changelog items across rounds', () => {
    const { store } = setupStore(2);

    // Round 0 changelog
    store.getState().addChangelogItems([
      {
        changeType: 'participants_added' as const,
        createdAt: new Date(),
        details: { addedModels: ['gpt-4o'] },
        id: 'cl-0',
        roundNumber: 0,
        threadId: 'thread-multi-round',
      },
    ]);

    completeRound(store, 0, 2);

    // Round 1 changelog
    store.getState().addChangelogItems([
      {
        changeType: 'web_search_enabled' as const,
        createdAt: new Date(),
        details: {},
        id: 'cl-1',
        roundNumber: 1,
        threadId: 'thread-multi-round',
      },
    ]);

    expect(store.getState().changelogItems).toHaveLength(2);
  });

  it('should not duplicate changelog items', () => {
    const { store } = setupStore(2);

    const item = {
      changeType: 'participants_added' as const,
      createdAt: new Date(),
      details: {},
      id: 'cl-dup',
      roundNumber: 0,
      threadId: 'thread-multi-round',
    };

    store.getState().addChangelogItems([item]);
    store.getState().addChangelogItems([item]);
    store.getState().addChangelogItems([item]);

    expect(store.getState().changelogItems).toHaveLength(1);
  });
});

// ============================================================================
// SCENARIO: Thread State Preservation
// ============================================================================

describe('thread State Preservation', () => {
  it('should preserve thread reference across rounds', () => {
    const { store, thread } = setupStore(2);

    completeRound(store, 0, 2);
    expect(store.getState().thread?.id).toBe(thread.id);

    completeRound(store, 1, 2);
    expect(store.getState().thread?.id).toBe(thread.id);

    completeRound(store, 2, 2);
    expect(store.getState().thread?.id).toBe(thread.id);
  });

  it('should preserve hasInitiallyLoaded across rounds', () => {
    const { store } = setupStore(2);

    expect(store.getState().hasInitiallyLoaded).toBe(true);

    completeRound(store, 0, 2);
    expect(store.getState().hasInitiallyLoaded).toBe(true);

    completeRound(store, 1, 2);
    expect(store.getState().hasInitiallyLoaded).toBe(true);
  });
});

// ============================================================================
// SCENARIO: Streaming State Reset Between Rounds
// ============================================================================

describe('streaming State Reset Between Rounds', () => {
  it('should reset isStreaming after each round', () => {
    const { store } = setupStore(2);

    expect(store.getState().isStreaming).toBe(false);

    store.getState().startRound(0, 2);
    expect(store.getState().isStreaming).toBe(true);

    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();

    expect(store.getState().isStreaming).toBe(false);

    store.getState().prepareForNewMessage();

    store.getState().startRound(1, 2);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should reset streamingRoundNumber between rounds', () => {
    const { store } = setupStore(2);

    store.getState().setStreamingRoundNumber(0);
    completeRound(store, 0, 2);

    store.getState().setStreamingRoundNumber(1);
    expect(store.getState().streamingRoundNumber).toBe(1);
  });
});

// ============================================================================
// SCENARIO: Error Recovery Across Rounds
// ============================================================================

describe('error Recovery Across Rounds', () => {
  it('should continue to next round after participant error', () => {
    const { store } = setupStore(2);

    // Round 0: P0 errors
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 50, 'API Error');
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1 should work normally
    store.getState().startRound(1, 2);
    expect(store.getState().phase).toBe(ChatPhases.PARTICIPANTS);

    store.getState().initializeSubscriptions(1, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
  });

  it('should clear error state for new round', () => {
    const { store } = setupStore(2);

    // Round 0: P0 errors
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().updateEntitySubscriptionStatus(0, 'error' as EntityStatus, 50, 'API Error');
    expect(store.getState().subscriptionState.participants[0]?.errorMessage).toBe('API Error');

    store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
    store.getState().onParticipantComplete(0);
    store.getState().onParticipantComplete(1);
    store.getState().onModeratorComplete();
    store.getState().prepareForNewMessage();

    // Round 1: Fresh subscription state
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);

    // Error should be cleared
    expect(store.getState().subscriptionState.participants[0]?.errorMessage).toBeUndefined();
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('idle');
  });
});

// ============================================================================
// SCENARIO: Form State Across Rounds
// ============================================================================

describe('form State Across Rounds', () => {
  it('should preserve input value during round completion', () => {
    const { store } = setupStore(2);

    store.getState().setInputValue('User question');
    completeRound(store, 0, 2);

    // Note: In real usage, input is cleared on send, not on completion
    expect(store.getState().inputValue).toBe('User question');
  });

  it('should preserve selected mode across rounds', () => {
    const { store } = setupStore(2);

    store.getState().setSelectedMode('debate');
    completeRound(store, 0, 2);
    expect(store.getState().selectedMode).toBe('debate');

    completeRound(store, 1, 2);
    expect(store.getState().selectedMode).toBe('debate');
  });

  it('should preserve enableWebSearch setting across rounds', () => {
    const { store } = setupStore(2, true);

    expect(store.getState().enableWebSearch).toBe(true);

    completeRound(store, 0, 2);
    expect(store.getState().enableWebSearch).toBe(true);

    store.getState().setEnableWebSearch(false);
    completeRound(store, 1, 2);
    expect(store.getState().enableWebSearch).toBe(false);
  });
});

// ============================================================================
// SCENARIO: Many Rounds Stress Test
// ============================================================================

describe('many Rounds Stress Test', () => {
  it('should handle 10 consecutive rounds without issues', () => {
    const { store } = setupStore(2);

    for (let round = 0; round < 10; round++) {
      completeRound(store, round, 2);
      expect(store.getState().phase).toBe(ChatPhases.IDLE);
    }
  });

  it('should track all rounds correctly in stress test', () => {
    const { store } = setupStore(2);

    for (let round = 0; round < 5; round++) {
      store.getState().startRound(round, 2);
      expect(store.getState().currentRoundNumber).toBe(round);

      store.getState().initializeSubscriptions(round, 2);
      store.getState().updateEntitySubscriptionStatus(0, 'complete' as EntityStatus, 100);
      store.getState().updateEntitySubscriptionStatus(1, 'complete' as EntityStatus, 100);
      store.getState().onParticipantComplete(0);
      store.getState().onParticipantComplete(1);
      store.getState().onModeratorComplete();
      store.getState().prepareForNewMessage();
    }
  });
});
