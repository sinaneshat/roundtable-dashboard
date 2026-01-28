/**
 * Web Search Participant Isolation Tests
 *
 * Tests to verify that web search results DO NOT "leak" as new participants.
 *
 * CRITICAL BUG BEING TESTED:
 * - Web search was "leaking" and creating a new participant called "gemini 2.5 flash"
 * - Web search results should be CONTEXT for existing participants, NOT new participants
 * - All participants (P1+) should see web search results in their system prompt BEFORE responding
 *
 * Per FLOW_DOCUMENTATION.md:
 * - P0 runs IN PARALLEL with pre-search (does NOT see search results)
 * - P1+ participants receive web search context via system prompt injection
 * - Web search is NOT a participant - it's CONTEXT data
 *
 * @see docs/FLOW_DOCUMENTATION.md Section 2 - Web Search Functionality
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
// Test Setup Helpers
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

function setupRoundWithWebSearch(
  store: TestStore,
  participantCount: number,
  roundNumber = 0,
  webSearchEnabled = true,
) {
  const participants = createMockParticipants(participantCount);
  const thread = createMockThread({
    enableWebSearch: webSearchEnabled,
    id: 'thread-test',
  });

  store.setState({ participants, thread });
  store.getState().setEnableWebSearch(webSearchEnabled);

  // Initialize round
  store.getState().startRound(roundNumber, participantCount);
  store.getState().initializeSubscriptions(roundNumber, participantCount);

  return { participants, thread };
}

function addPreSearchForRound(
  store: TestStore,
  roundNumber: number,
  status: typeof MessageStatuses.PENDING | typeof MessageStatuses.STREAMING | typeof MessageStatuses.COMPLETE = MessageStatuses.COMPLETE,
) {
  const preSearch = createMockStoredPreSearch(roundNumber, status, {
    searchData: status === MessageStatuses.COMPLETE
      ? {
          failureCount: 0,
          queries: [
            { index: 0, query: 'test query', rationale: 'test', searchDepth: 'basic', total: 1 },
          ],
          results: [
            {
              index: 0,
              query: 'test query',
              results: [
                {
                  content: 'Test search content',
                  domain: 'example.com',
                  title: 'Test Result',
                  url: 'https://example.com/test',
                },
              ],
            },
          ],
          successCount: 1,
          summary: 'Search complete',
          totalResults: 1,
          totalTime: 500,
        }
      : undefined,
    threadId: 'thread-test',
  });

  store.getState().addPreSearch(preSearch);
  return preSearch;
}

function completeParticipant(store: TestStore, index: number) {
  store.getState().updateEntitySubscriptionStatus(index, 'complete' as EntityStatus, 100);
  store.getState().onParticipantComplete(index);
}

// ============================================================================
// SCENARIO 1: Web Search Does NOT Create New Participants
// ============================================================================

describe('scenario 1: Web Search Does NOT Create New Participants', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should NOT add participants when web search is enabled', () => {
    // Setup 2 participants with web search
    const { participants: _participants } = setupRoundWithWebSearch(store, 2, 0, true);

    // Verify initial participant count
    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().subscriptionState.participants).toHaveLength(2);

    // Add pre-search (simulating web search)
    addPreSearchForRound(store, 0);

    // CRITICAL: Participant count should remain unchanged after web search
    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().subscriptionState.participants).toHaveLength(2);

    // Verify no "gemini" participant was added
    const participantIds = store.getState().participants.map(p => p.modelId);
    expect(participantIds).not.toContain('google/gemini-2.5-flash');
    expect(participantIds).not.toContain('google/gemini-2.0-flash-001');
  });

  it('should NOT create subscription for web search as if it were a participant', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Pre-search phase
    store.setState({ phase: ChatPhases.PRESEARCH });
    addPreSearchForRound(store, 0, MessageStatuses.STREAMING);

    // Subscription state should only have 2 participants
    const subState = store.getState().subscriptionState;
    expect(subState.participants).toHaveLength(2);

    // Pre-search has its own separate tracking, NOT in participants array
    expect(subState.presearch.status).toBeDefined();
  });

  it('should maintain participant count through PRESEARCH → PARTICIPANTS → MODERATOR phases', () => {
    const { participants: _participants } = setupRoundWithWebSearch(store, 3, 0, true);

    // Add pre-search
    addPreSearchForRound(store, 0, MessageStatuses.PENDING);
    store.setState({ phase: ChatPhases.PRESEARCH });

    expect(store.getState().participants).toHaveLength(3);

    // Complete pre-search
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    store.setState({ phase: ChatPhases.PARTICIPANTS });

    // Still 3 participants
    expect(store.getState().participants).toHaveLength(3);

    // Complete all participants
    for (let i = 0; i < 3; i++) {
      completeParticipant(store, i);
    }

    // Transition to moderator
    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);

    // Still 3 participants (not 4 with web search added)
    expect(store.getState().participants).toHaveLength(3);
  });

  it('should NOT confuse pre-search data with participant messages', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Add completed pre-search with search results
    addPreSearchForRound(store, 0, MessageStatuses.COMPLETE);

    // Pre-search data should be in preSearches array, NOT in messages
    const preSearches = store.getState().preSearches;
    expect(preSearches).toHaveLength(1);
    expect(preSearches[0].roundNumber).toBe(0);

    // Verify the search data is stored in pre-search, not as a message
    expect(preSearches[0].searchData).toBeDefined();
    expect(preSearches[0].searchData?.results).toHaveLength(1);
  });
});

// ============================================================================
// SCENARIO 2: Web Search Context Flows to Participants (Not As Participant)
// ============================================================================

describe('scenario 2: Web Search Context Flows to Participants', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should track pre-search separately from participant subscriptions', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    const subState = store.getState().subscriptionState;

    // Pre-search has its own tracking in subscriptionState
    expect(subState.presearch).toBeDefined();
    expect(subState.presearch.status).toBe('idle');

    // Participants are tracked separately
    expect(subState.participants).toHaveLength(2);
  });

  it('should complete PRESEARCH phase without adding participants', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Start pre-search phase
    store.setState({ phase: ChatPhases.PRESEARCH });
    addPreSearchForRound(store, 0, MessageStatuses.PENDING);

    const initialParticipantCount = store.getState().participants.length;

    // Stream pre-search
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
    expect(store.getState().participants).toHaveLength(initialParticipantCount);

    // Complete pre-search
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    expect(store.getState().participants).toHaveLength(initialParticipantCount);
  });

  it('should allow participants to access completed pre-search data', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Complete pre-search
    addPreSearchForRound(store, 0, MessageStatuses.COMPLETE);

    // Verify search data is accessible
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
    expect(preSearch?.searchData?.results).toBeDefined();
    expect(preSearch?.searchData?.results?.length).toBeGreaterThan(0);
  });

  it('should keep pre-search data separate from participant responses', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Add pre-search with specific data
    const preSearch = addPreSearchForRound(store, 0, MessageStatuses.COMPLETE);

    // Store some mock participant state
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);

    // Pre-search data should still be intact
    const storedPreSearch = store.getState().preSearches.find(ps => ps.id === preSearch.id);
    expect(storedPreSearch?.searchData?.results).toHaveLength(1);

    // Participant state should be independent
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
  });
});

// ============================================================================
// SCENARIO 3: P0 vs P1+ Web Search Context Handling
// ============================================================================

describe('scenario 3: P0 vs P1+ Web Search Context Handling', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should allow P0 to stream in parallel with pre-search', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Both pre-search and P0 can be active simultaneously
    addPreSearchForRound(store, 0, MessageStatuses.STREAMING);
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 25);

    // Both should be streaming
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
  });

  it('should NOT require pre-search to complete before P0 starts', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Add pending pre-search
    addPreSearchForRound(store, 0, MessageStatuses.PENDING);

    // P0 can start without pre-search being complete
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 10);
    expect(store.getState().subscriptionState.participants[0]?.status).toBe('streaming');
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);
  });

  it('should track P0 completion independently of pre-search', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    addPreSearchForRound(store, 0, MessageStatuses.STREAMING);

    // P0 completes while pre-search still streaming
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);
    completeParticipant(store, 0);

    expect(store.getState().subscriptionState.participants[0]?.status).toBe('complete');
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
  });

  it('should ensure P1+ waits for pre-search context (baton from backend)', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Pre-search pending
    addPreSearchForRound(store, 0, MessageStatuses.PENDING);

    // P0 can start and complete
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);
    completeParticipant(store, 0);

    // P1 subscription status shows participant is idle/waiting
    // (actual blocking is enforced by backend baton passing)
    expect(store.getState().subscriptionState.participants[1]?.status).toBe('idle');
  });
});

// ============================================================================
// SCENARIO 4: Multi-Round Web Search Toggle Does NOT Leak Participants
// ============================================================================

describe('scenario 4: Multi-Round Web Search Toggle Does NOT Leak Participants', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should maintain consistent participant count: Round 1 (no search) → Round 2 (with search)', () => {
    // Round 1: No web search
    const { participants: _participants } = setupRoundWithWebSearch(store, 2, 0, false);
    expect(store.getState().participants).toHaveLength(2);

    // Complete Round 1
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();

    // Round 2: Enable web search
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);

    // Add pre-search for round 2
    addPreSearchForRound(store, 1, MessageStatuses.COMPLETE);

    // CRITICAL: Still only 2 participants
    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().subscriptionState.participants).toHaveLength(2);
  });

  it('should maintain consistent participant count: Round 1 (with search) → Round 2 (no search)', () => {
    // Round 1: With web search
    setupRoundWithWebSearch(store, 2, 0, true);
    addPreSearchForRound(store, 0, MessageStatuses.COMPLETE);

    expect(store.getState().participants).toHaveLength(2);

    // Complete Round 1
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();

    // Round 2: Disable web search
    store.getState().setEnableWebSearch(false);
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);

    // CRITICAL: Still only 2 participants
    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().preSearches.filter(ps => ps.roundNumber === 1)).toHaveLength(0);
  });

  it('should handle: Round 1 (off) → Round 2 (on) → Round 3 (off) → Round 4 (on)', () => {
    setupRoundWithWebSearch(store, 2, 0, false);
    const initialCount = store.getState().participants.length;

    // Round 1: No search
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();
    expect(store.getState().participants).toHaveLength(initialCount);

    // Round 2: With search
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);
    addPreSearchForRound(store, 1, MessageStatuses.COMPLETE);
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();
    expect(store.getState().participants).toHaveLength(initialCount);

    // Round 3: No search
    store.getState().setEnableWebSearch(false);
    store.getState().startRound(2, 2);
    store.getState().initializeSubscriptions(2, 2);
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();
    expect(store.getState().participants).toHaveLength(initialCount);

    // Round 4: With search
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(3, 2);
    store.getState().initializeSubscriptions(3, 2);
    addPreSearchForRound(store, 3, MessageStatuses.COMPLETE);
    expect(store.getState().participants).toHaveLength(initialCount);
  });

  it('should NOT accumulate pre-search participants over multiple rounds', () => {
    setupRoundWithWebSearch(store, 2, 0, true);
    const initialCount = store.getState().participants.length;

    // Execute 5 rounds with web search enabled
    for (let round = 0; round < 5; round++) {
      if (round > 0) {
        store.getState().startRound(round, 2);
        store.getState().initializeSubscriptions(round, 2);
      }

      addPreSearchForRound(store, round, MessageStatuses.COMPLETE);
      completeParticipant(store, 0);
      completeParticipant(store, 1);
      store.getState().onModeratorComplete();

      // Participant count should NEVER grow
      expect(store.getState().participants).toHaveLength(initialCount);
    }

    // We should have 5 pre-searches (one per round)
    expect(store.getState().preSearches).toHaveLength(5);
    // But still only 2 participants
    expect(store.getState().participants).toHaveLength(2);
  });
});

// ============================================================================
// SCENARIO 5: Fallback Config Does NOT Leak as Participant
// ============================================================================

describe('scenario 5: Fallback Config Does NOT Leak as Participant', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should NOT add fallback models to participants when auto-mode analysis fails', () => {
    setupRoundWithWebSearch(store, 2, 0, true);
    const initialCount = store.getState().participants.length;

    // Simulate some error condition that might trigger fallback
    // The AUTO_MODE_FALLBACK_CONFIG contains hardcoded models like 'google/gemini-2.0-flash-001'
    // These should NEVER be added to the participant list

    // Complete the round
    addPreSearchForRound(store, 0, MessageStatuses.COMPLETE);
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();

    // Verify no fallback models were added
    const participantModelIds = store.getState().participants.map(p => p.modelId);
    expect(participantModelIds).not.toContain('google/gemini-2.0-flash-001');
    expect(participantModelIds).not.toContain('openai/gpt-4o-mini'); // Fallback default
    expect(store.getState().participants).toHaveLength(initialCount);
  });

  it('should keep web search model (GOOGLE_GEMINI_2_5_FLASH) separate from participants', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Add pre-search (which uses GOOGLE_GEMINI_2_5_FLASH internally)
    addPreSearchForRound(store, 0, MessageStatuses.COMPLETE);

    // The web search model should NOT appear in participants
    const participantModelIds = store.getState().participants.map(p => p.modelId);
    expect(participantModelIds).not.toContain('google/gemini-2.5-flash');
  });

  it('should verify participants only contain user-configured models', () => {
    // Setup with specific models
    const thread = createMockThread({
      enableWebSearch: true,
      id: 'thread-test',
    });
    const participants = [
      { ...createMockParticipants(1)[0], modelId: 'anthropic/claude-sonnet-4' },
      { ...createMockParticipants(1)[0], id: 'participant-1', modelId: 'openai/gpt-5', priority: 1 },
    ];

    store.setState({ participants, thread });
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Add pre-search
    addPreSearchForRound(store, 0, MessageStatuses.COMPLETE);

    // Complete round
    completeParticipant(store, 0);
    completeParticipant(store, 1);
    store.getState().onModeratorComplete();

    // Verify only user-configured models exist
    const finalModelIds = store.getState().participants.map(p => p.modelId);
    expect(finalModelIds).toEqual(['anthropic/claude-sonnet-4', 'openai/gpt-5']);
    expect(finalModelIds).toHaveLength(2);
  });
});

// ============================================================================
// SCENARIO 6: Pre-Search Error Handling Does NOT Create Participants
// ============================================================================

describe('scenario 6: Pre-Search Error Handling Does NOT Create Participants', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should NOT add participants when pre-search fails', () => {
    setupRoundWithWebSearch(store, 2, 0, true);
    const initialCount = store.getState().participants.length;

    // Add failed pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: 'Web search service unavailable',
      id: 'presearch-failed',
      roundNumber: 0,
      searchData: null,
      status: MessageStatuses.FAILED,
      threadId: 'thread-test',
      userQuery: 'test query',
    });

    // Participant count unchanged
    expect(store.getState().participants).toHaveLength(initialCount);
  });

  it('should allow round to continue with original participants when pre-search fails', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Add failed pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: 'Timeout',
      id: 'presearch-failed',
      roundNumber: 0,
      searchData: null,
      status: MessageStatuses.FAILED,
      threadId: 'thread-test',
      userQuery: 'test query',
    });

    // Participants should still work
    store.getState().updateEntitySubscriptionStatus(0, 'streaming' as EntityStatus, 50);
    completeParticipant(store, 0);
    store.getState().updateEntitySubscriptionStatus(1, 'streaming' as EntityStatus, 50);
    completeParticipant(store, 1);

    expect(store.getState().phase).toBe(ChatPhases.MODERATOR);
    expect(store.getState().participants).toHaveLength(2);
  });

  it('should gracefully handle pre-search STREAMING → FAILED transition', () => {
    setupRoundWithWebSearch(store, 2, 0, true);

    // Start pre-search
    addPreSearchForRound(store, 0, MessageStatuses.PENDING);
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

    // Fail mid-stream
    store.getState().updatePreSearchStatus(0, MessageStatuses.FAILED);

    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.FAILED);
    // No additional participants
    expect(store.getState().participants).toHaveLength(2);
  });
});
