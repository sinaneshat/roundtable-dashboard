/**
 * Web Search Mid-Conversation Toggle Tests
 *
 * Tests specifically for the bug report scenario:
 * - Web search being enabled/disabled mid-way through multiple rounds
 * - Ensuring web search NEVER creates new participants
 * - Verifying all participants see web search data in their context
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

// ============================================================================
// Test Setup
// ============================================================================

type TestStore = ReturnType<typeof createChatStore>;

function completeRound(store: TestStore, _roundNumber: number, participantCount: number) {
  for (let i = 0; i < participantCount; i++) {
    store.getState().updateEntitySubscriptionStatus(i, 'complete' as EntityStatus, 100 + i * 10);
    store.getState().onParticipantComplete(i);
  }
  store.getState().onModeratorComplete();
}

// ============================================================================
// SCENARIO: Complex Multi-Round Toggle Patterns
// ============================================================================

describe('complex Multi-Round Web Search Toggle Patterns', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should handle: R0(off) → R1(on) → R2(on) → R3(off) → R4(on) → R5(off)', () => {
    const thread = createMockThread({
      enableWebSearch: false,
      id: 'thread-toggle-test',
    });
    const participants = createMockParticipants(3);

    store.setState({ participants, thread });
    store.getState().setEnableWebSearch(false);

    // Track participant count at each step
    const participantCounts: number[] = [];
    const preSearchCounts: number[] = [];

    // Round 0: OFF
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);
    completeRound(store, 0, 3);
    participantCounts.push(store.getState().participants.length);
    preSearchCounts.push(store.getState().preSearches.length);

    // Round 1: ON
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(1, 3);
    store.getState().initializeSubscriptions(1, 3);
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE, {
      threadId: 'thread-toggle-test',
    }));
    completeRound(store, 1, 3);
    participantCounts.push(store.getState().participants.length);
    preSearchCounts.push(store.getState().preSearches.length);

    // Round 2: ON
    store.getState().startRound(2, 3);
    store.getState().initializeSubscriptions(2, 3);
    store.getState().addPreSearch(createMockStoredPreSearch(2, MessageStatuses.COMPLETE, {
      threadId: 'thread-toggle-test',
    }));
    completeRound(store, 2, 3);
    participantCounts.push(store.getState().participants.length);
    preSearchCounts.push(store.getState().preSearches.length);

    // Round 3: OFF
    store.getState().setEnableWebSearch(false);
    store.getState().startRound(3, 3);
    store.getState().initializeSubscriptions(3, 3);
    completeRound(store, 3, 3);
    participantCounts.push(store.getState().participants.length);
    preSearchCounts.push(store.getState().preSearches.length);

    // Round 4: ON
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(4, 3);
    store.getState().initializeSubscriptions(4, 3);
    store.getState().addPreSearch(createMockStoredPreSearch(4, MessageStatuses.COMPLETE, {
      threadId: 'thread-toggle-test',
    }));
    completeRound(store, 4, 3);
    participantCounts.push(store.getState().participants.length);
    preSearchCounts.push(store.getState().preSearches.length);

    // Round 5: OFF
    store.getState().setEnableWebSearch(false);
    store.getState().startRound(5, 3);
    store.getState().initializeSubscriptions(5, 3);
    completeRound(store, 5, 3);
    participantCounts.push(store.getState().participants.length);
    preSearchCounts.push(store.getState().preSearches.length);

    // CRITICAL: Participant count should NEVER change
    expect(participantCounts).toEqual([3, 3, 3, 3, 3, 3]);

    // Pre-search counts should match toggle pattern
    expect(preSearchCounts).toEqual([0, 1, 2, 2, 3, 3]);

    // Verify final state
    expect(store.getState().participants).toHaveLength(3);
    expect(store.getState().preSearches).toHaveLength(3);
  });

  it('should correctly associate pre-search data with the right round', () => {
    const participants = createMockParticipants(2);
    store.setState({
      participants,
      thread: createMockThread({ enableWebSearch: true, id: 'thread-round-assoc' }),
    });

    // Add pre-searches for specific rounds with distinct data
    store.getState().addPreSearch({
      ...createMockStoredPreSearch(0, MessageStatuses.COMPLETE),
      searchData: {
        failureCount: 0,
        queries: [{ index: 0, query: 'round 0 query', rationale: '', searchDepth: 'basic', total: 1 }],
        results: [],
        successCount: 1,
        summary: 'Round 0 summary',
        totalResults: 10,
        totalTime: 500,
      },
      threadId: 'thread-round-assoc',
    });

    store.getState().addPreSearch({
      ...createMockStoredPreSearch(2, MessageStatuses.COMPLETE),
      searchData: {
        failureCount: 0,
        queries: [{ index: 0, query: 'round 2 query', rationale: '', searchDepth: 'basic', total: 1 }],
        results: [],
        successCount: 1,
        summary: 'Round 2 summary',
        totalResults: 15,
        totalTime: 700,
      },
      threadId: 'thread-round-assoc',
    });

    // Skip round 1 (no web search)
    store.getState().addPreSearch({
      ...createMockStoredPreSearch(4, MessageStatuses.COMPLETE),
      searchData: {
        failureCount: 0,
        queries: [{ index: 0, query: 'round 4 query', rationale: '', searchDepth: 'basic', total: 1 }],
        results: [],
        successCount: 1,
        summary: 'Round 4 summary',
        totalResults: 20,
        totalTime: 900,
      },
      threadId: 'thread-round-assoc',
    });

    // Verify data integrity
    const r0 = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    const r2 = store.getState().preSearches.find(ps => ps.roundNumber === 2);
    const r4 = store.getState().preSearches.find(ps => ps.roundNumber === 4);

    expect(r0?.searchData?.summary).toBe('Round 0 summary');
    expect(r1).toBeUndefined(); // No pre-search for round 1
    expect(r2?.searchData?.summary).toBe('Round 2 summary');
    expect(r4?.searchData?.summary).toBe('Round 4 summary');

    // Participant count unchanged
    expect(store.getState().participants).toHaveLength(2);
  });

  it('should NOT add gemini models as participants when web search completes', () => {
    const participants = [
      { ...createMockParticipants(1)[0], modelId: 'anthropic/claude-sonnet-4' },
      { ...createMockParticipants(1)[0], id: 'p1', modelId: 'openai/gpt-5', priority: 1 },
    ];

    store.setState({
      participants,
      thread: createMockThread({ enableWebSearch: true, id: 'thread-no-gemini' }),
    });

    store.getState().setEnableWebSearch(true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Add pre-search (which internally uses gemini-2.5-flash)
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
      searchData: {
        failureCount: 0,
        queries: [{ index: 0, query: 'test', rationale: '', searchDepth: 'basic', total: 1 }],
        results: [
          {
            index: 0,
            query: 'test',
            results: [
              { content: 'Content', domain: 'test.com', title: 'Test', url: 'https://test.com' },
            ],
          },
        ],
        successCount: 1,
        summary: 'Search done',
        totalResults: 1,
        totalTime: 500,
      },
      threadId: 'thread-no-gemini',
    }));

    // Complete round
    completeRound(store, 0, 2);

    // CRITICAL: Only user-configured models should exist
    const modelIds = store.getState().participants.map(p => p.modelId);
    expect(modelIds).toEqual(['anthropic/claude-sonnet-4', 'openai/gpt-5']);
    expect(modelIds).not.toContain('google/gemini-2.5-flash');
    expect(modelIds).not.toContain('google/gemini-2.0-flash-001');
    expect(store.getState().participants).toHaveLength(2);
  });

  it('should maintain expectedModelIds consistency with web search toggle', () => {
    const participants = createMockParticipants(2);
    store.setState({
      participants,
      thread: createMockThread({ enableWebSearch: false, id: 'thread-model-ids' }),
    });

    // Set expected models
    store.getState().setExpectedModelIds(['gpt-4o', 'claude-3-opus']);

    // Enable web search
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // Add pre-search
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
      threadId: 'thread-model-ids',
    }));

    // Expected models should NOT change
    expect(store.getState().expectedModelIds).toEqual(['gpt-4o', 'claude-3-opus']);
    expect(store.getState().expectedModelIds).not.toContain('google/gemini-2.5-flash');
  });
});

// ============================================================================
// SCENARIO: Error Recovery with Web Search
// ============================================================================

describe('error Recovery with Web Search', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should maintain participant integrity when pre-search fails then succeeds in next round', () => {
    const participants = createMockParticipants(2);
    store.setState({
      participants,
      thread: createMockThread({ enableWebSearch: true, id: 'thread-error-recovery' }),
    });

    // Round 0: Pre-search fails
    store.getState().setEnableWebSearch(true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: 'Search service timeout',
      id: 'presearch-failed',
      roundNumber: 0,
      searchData: null,
      status: MessageStatuses.FAILED,
      threadId: 'thread-error-recovery',
      userQuery: 'test query',
    });

    // Complete round 0 despite failed pre-search
    completeRound(store, 0, 2);
    expect(store.getState().participants).toHaveLength(2);

    // Round 1: Pre-search succeeds
    store.getState().startRound(1, 2);
    store.getState().initializeSubscriptions(1, 2);
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE, {
      threadId: 'thread-error-recovery',
    }));

    completeRound(store, 1, 2);

    // Still only 2 participants
    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().preSearches).toHaveLength(2);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.FAILED);
    expect(store.getState().preSearches[1]?.status).toBe(MessageStatuses.COMPLETE);
  });

  it('should handle pre-search status transitions correctly', () => {
    const participants = createMockParticipants(2);
    store.setState({
      participants,
      thread: createMockThread({ enableWebSearch: true, id: 'thread-status-trans' }),
    });

    store.getState().setEnableWebSearch(true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    // PENDING
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.PENDING, {
      threadId: 'thread-status-trans',
    }));
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);
    expect(store.getState().participants).toHaveLength(2);

    // STREAMING
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    expect(store.getState().participants).toHaveLength(2);

    // COMPLETE
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    store.getState().updatePreSearchData(0, {
      failureCount: 0,
      queries: [],
      results: [],
      successCount: 1,
      summary: 'Done',
      totalResults: 5,
      totalTime: 500,
    });
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    expect(store.getState().participants).toHaveLength(2);
  });
});

// ============================================================================
// SCENARIO: Subscription State Isolation
// ============================================================================

describe('subscription State Isolation from Pre-Search', () => {
  let store: TestStore;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should keep subscriptionState.participants separate from presearch tracking', () => {
    const participants = createMockParticipants(3);
    store.setState({
      participants,
      thread: createMockThread({ enableWebSearch: true, id: 'thread-sub-isolation' }),
    });

    store.getState().setEnableWebSearch(true);
    store.getState().startRound(0, 3);
    store.getState().initializeSubscriptions(0, 3);

    // Add pre-search
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.STREAMING, {
      threadId: 'thread-sub-isolation',
    }));

    // subscriptionState should have exactly 3 participants
    expect(store.getState().subscriptionState.participants).toHaveLength(3);

    // presearch has its own separate tracking
    expect(store.getState().subscriptionState.presearch).toBeDefined();
    expect(store.getState().subscriptionState.presearch.status).toBe('idle');

    // Pre-search array is separate
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
  });

  it('should NOT add pre-search model to participant subscription array', () => {
    const participants = createMockParticipants(2);
    store.setState({
      participants,
      thread: createMockThread({ enableWebSearch: true, id: 'thread-no-presearch-sub' }),
    });

    store.getState().setEnableWebSearch(true);
    store.getState().startRound(0, 2);
    store.getState().initializeSubscriptions(0, 2);

    const initialSubCount = store.getState().subscriptionState.participants.length;

    // Add multiple pre-searches
    store.getState().addPreSearch(createMockStoredPreSearch(0, MessageStatuses.COMPLETE, {
      threadId: 'thread-no-presearch-sub',
    }));
    store.getState().addPreSearch(createMockStoredPreSearch(1, MessageStatuses.COMPLETE, {
      threadId: 'thread-no-presearch-sub',
    }));

    // Subscription participant count should remain unchanged
    expect(store.getState().subscriptionState.participants).toHaveLength(initialSubCount);
  });
});
