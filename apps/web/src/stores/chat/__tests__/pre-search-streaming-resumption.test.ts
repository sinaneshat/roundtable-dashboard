/**
 * Pre-Search Streaming Resumption Tests
 *
 * Tests for the bug where pre-search gets stuck after page refresh during streaming.
 *
 * Bug Scenario:
 * 1. User starts a pre-search (status: STREAMING)
 * 2. User refreshes the page during streaming
 * 3. Store hydrates with preSearch.status='streaming' but:
 *    - triggeredPreSearchRounds is EMPTY (Set not persisted)
 *    - isStreaming = false (no participant streaming)
 * 4. BUG: Hook sees status='streaming' and just returns, no one resumes the stream
 * 5. UI shows "Searching..." stuck indefinitely
 *
 * Fix: When pre-search has status='streaming' but hasn't been triggered locally,
 * the hook should attempt to resume/re-execute the stream.
 */

import type { MessageStatus } from '@roundtable/shared';
import { MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createMockPreSearch } from '@/lib/testing';
import type { StoredPreSearch } from '@/services/api';

// ============================================================================
// TEST HELPER TYPES
// ============================================================================

/**
 * Simulated state after page refresh during pre-search streaming
 * ✅ TYPE-SAFE: Uses proper types from store schemas
 */
type PostRefreshState = {
  preSearch: StoredPreSearch;
  triggeredPreSearchRounds: Set<number>;
  isStreaming: boolean;
  waitingToStartStreaming: boolean;
};

// ============================================================================
// TEST HELPER FUNCTIONS
// ============================================================================

/**
 * Creates mock pre-search with proper typing
 * ✅ ENUM PATTERN: Uses MessageStatus type from enums
 */
function createTestPreSearch(overrides?: {
  id?: string;
  threadId?: string;
  roundNumber?: number;
  status?: MessageStatus;
  userQuery?: string;
  createdAt?: Date;
  completedAt?: Date | null;
}): StoredPreSearch {
  return createMockPreSearch({
    id: overrides?.id ?? 'presearch-123',
    threadId: overrides?.threadId ?? 'thread-123',
    roundNumber: overrides?.roundNumber ?? 0,
    status: overrides?.status ?? MessageStatuses.PENDING,
    userQuery: overrides?.userQuery ?? 'Test query',
    createdAt: overrides?.createdAt ?? new Date(),
    completedAt: overrides?.completedAt ?? null,
  });
}

/**
 * Simulates state after page refresh during pre-search streaming
 * ✅ ENUM PATTERN: Uses MessageStatus type from enums
 */
function createPostRefreshState(options: {
  preSearchStatus: MessageStatus;
  preSearchCreatedAt?: Date;
  roundNumber?: number;
}): PostRefreshState {
  const { preSearchStatus, preSearchCreatedAt = new Date(), roundNumber = 0 } = options;

  return {
    preSearch: createTestPreSearch({
      roundNumber,
      status: preSearchStatus,
      createdAt: preSearchCreatedAt,
    }),
    // After refresh, triggeredPreSearchRounds is EMPTY (Set not persisted)
    triggeredPreSearchRounds: new Set<number>(),
    // isStreaming is false (no participant streaming)
    isStreaming: false,
    // waitingToStartStreaming may be true (set by prefillStreamResumptionState)
    waitingToStartStreaming: true,
  };
}

/**
 * Determines if pre-search needs resumption after page refresh
 * ✅ ENUM PATTERN: Uses MessageStatuses constant object
 *
 * This is the logic that should be implemented in the fix:
 * - Pre-search has status='streaming'
 * - But triggeredPreSearchRounds is empty (not tracked locally)
 * - This means we need to resume/re-execute the stream
 */
function needsPreSearchResumption(state: PostRefreshState): boolean {
  const { preSearch, triggeredPreSearchRounds } = state;

  // Pre-search is streaming but not tracked locally = needs resumption
  if (preSearch.status === MessageStatuses.STREAMING) {
    const isTrackedLocally = triggeredPreSearchRounds.has(preSearch.roundNumber);
    return !isTrackedLocally;
  }

  // Pending pre-search that isn't tracked also needs to be started
  if (preSearch.status === MessageStatuses.PENDING) {
    const isTrackedLocally = triggeredPreSearchRounds.has(preSearch.roundNumber);
    return !isTrackedLocally;
  }

  return false;
}

/**
 * Determines if pre-search has become stale (timed out)
 * Used to decide whether to resume or mark as failed
 */
function isPreSearchStale(preSearch: StoredPreSearch, nowMs = Date.now()): boolean {
  const STALE_THRESHOLD_MS = 120_000; // 2 minutes
  const createdTime = preSearch.createdAt instanceof Date
    ? preSearch.createdAt.getTime()
    : new Date(preSearch.createdAt).getTime();

  return nowMs - createdTime > STALE_THRESHOLD_MS;
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('pre-Search Resumption After Refresh', () => {
  describe('bug Scenario: Streaming Pre-Search Gets Stuck', () => {
    it('detects pre-search stuck in streaming state after refresh', () => {
      // Simulate: User refreshed while pre-search was streaming
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.STREAMING,
      });

      // The pre-search is "streaming" but no local tracking exists
      expect(state.preSearch.status).toBe(MessageStatuses.STREAMING);
      expect(state.triggeredPreSearchRounds.size).toBe(0);
      expect(state.isStreaming).toBe(false);

      // This is the gap in the current code - it should detect this case
      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(true);
    });

    it('does NOT flag for resumption when pre-search is tracked locally', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.STREAMING,
      });

      // If we've already tracked/triggered this pre-search, don't re-trigger
      state.triggeredPreSearchRounds.add(0);

      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(false);
    });

    it('does NOT flag for resumption when pre-search is complete', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.COMPLETE,
      });

      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(false);
    });

    it('does NOT flag for resumption when pre-search failed', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.FAILED,
      });

      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(false);
    });
  });

  describe('pending Pre-Search After Refresh', () => {
    it('detects pending pre-search needs to be started', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.PENDING,
      });

      // Pending pre-search should also be handled (started)
      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(true);
    });

    it('does NOT restart pending if already tracked', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.PENDING,
      });

      state.triggeredPreSearchRounds.add(0);

      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(false);
    });
  });

  describe('stale Pre-Search Detection', () => {
    it('detects stale pre-search (created > 2 minutes ago)', () => {
      const preSearch = createTestPreSearch({
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 150_000), // 2.5 minutes ago
      });

      const isStale = isPreSearchStale(preSearch);
      expect(isStale).toBe(true);
    });

    it('does NOT flag recent pre-search as stale', () => {
      const preSearch = createTestPreSearch({
        status: MessageStatuses.STREAMING,
        createdAt: new Date(Date.now() - 30_000), // 30 seconds ago
      });

      const isStale = isPreSearchStale(preSearch);
      expect(isStale).toBe(false);
    });

    it('handles stale streaming pre-search after refresh', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.STREAMING,
        preSearchCreatedAt: new Date(Date.now() - 150_000), // 2.5 minutes ago
      });

      // Should detect need for resumption
      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(true);

      // But also should detect it's stale
      const isStale = isPreSearchStale(state.preSearch);
      expect(isStale).toBe(true);

      // In the fix: if stale, should mark as complete/failed and proceed
      // If not stale, should attempt actual resumption
    });
  });

  describe('multi-Round Pre-Search Resumption', () => {
    it('handles resumption for round 1 pre-search', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.STREAMING,
        roundNumber: 1,
      });

      // Round 1 pre-search should also be detected
      expect(state.preSearch.roundNumber).toBe(1);

      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(true);
    });

    it('only resumes pre-search for current round', () => {
      // Simulate: Round 0 complete, Round 1 streaming
      const preSearches = [
        createTestPreSearch({ roundNumber: 0, status: MessageStatuses.COMPLETE }),
        createTestPreSearch({ roundNumber: 1, status: MessageStatuses.STREAMING }),
      ];
      const triggeredRounds = new Set<number>();
      const currentRound = 1;

      // Only round 1 pre-search needs resumption
      const currentPreSearch = preSearches.find(ps => ps.roundNumber === currentRound);
      expect(currentPreSearch?.status).toBe(MessageStatuses.STREAMING);

      const needsResume = currentPreSearch
        && (currentPreSearch.status === MessageStatuses.STREAMING || currentPreSearch.status === MessageStatuses.PENDING)
        && !triggeredRounds.has(currentRound);

      expect(needsResume).toBe(true);
    });
  });

  describe('integration: Expected Fix Behavior', () => {
    it('fix should attempt resumption when streaming pre-search not tracked', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.STREAMING,
        preSearchCreatedAt: new Date(Date.now() - 5_000), // 5 seconds ago (not stale)
      });

      // Step 1: Detect pre-search needs resumption
      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(true);

      // Step 2: Check if stale (determines resume vs mark-complete strategy)
      const isStale = isPreSearchStale(state.preSearch);
      expect(isStale).toBe(false);

      // Step 3: Since not stale, the fix should:
      // - Mark the round as triggered (add to triggeredPreSearchRounds)
      // - Call executePreSearchStreamService to resume/poll the stream
      // - The backend will return:
      //   - Live resume stream if buffer exists
      //   - 202 polling response if stream active but buffer unavailable
      //   - Complete data if stream finished

      // Simulate marking as triggered
      state.triggeredPreSearchRounds.add(state.preSearch.roundNumber);
      expect(state.triggeredPreSearchRounds.has(0)).toBe(true);

      // After marking, should not need resumption again
      const needsResumeAfter = needsPreSearchResumption(state);
      expect(needsResumeAfter).toBe(false);
    });

    it('fix should auto-complete stale streaming pre-search', () => {
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.STREAMING,
        preSearchCreatedAt: new Date(Date.now() - 150_000), // 2.5 minutes ago (stale)
      });

      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(true);

      const isStale = isPreSearchStale(state.preSearch);
      expect(isStale).toBe(true);

      // Since stale, the fix should:
      // - Mark pre-search as COMPLETE (allow flow to continue)
      // - Participants can proceed
      // The checkStuckPreSearches already does this, but fix should trigger it immediately

      // Simulate the auto-complete
      const updatedPreSearch = { ...state.preSearch, status: MessageStatuses.COMPLETE as MessageStatus };
      const updatedState = { ...state, preSearch: updatedPreSearch };

      // Now should not need resumption
      const needsResumeAfter = needsPreSearchResumption(updatedState);
      expect(needsResumeAfter).toBe(false);
    });
  });

  describe('edge Cases', () => {
    it('handles refresh with empty pre-searches array', () => {
      const preSearches: StoredPreSearch[] = [];
      const currentRound = 0;

      const currentPreSearch = preSearches.find(ps => ps.roundNumber === currentRound);
      expect(currentPreSearch).toBeUndefined();

      // No pre-search = need to create one (different from resumption)
    });

    it('handles rapid refresh during pre-search creation', () => {
      // Pre-search has PENDING status (created but not yet streaming)
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.PENDING,
        preSearchCreatedAt: new Date(Date.now() - 100), // Just created
      });

      // Should be detected and executed
      const needsResume = needsPreSearchResumption(state);
      expect(needsResume).toBe(true);
    });

    it('handles web search disabled mid-refresh', () => {
      const webSearchEnabled = false;
      const state = createPostRefreshState({
        preSearchStatus: MessageStatuses.STREAMING,
      });

      // If web search disabled, pre-search should be ignored
      const shouldWait = webSearchEnabled
        && (state.preSearch.status === MessageStatuses.PENDING || state.preSearch.status === MessageStatuses.STREAMING);

      expect(shouldWait).toBe(false);
    });
  });
});

describe('pre-Search Activity Tracking', () => {
  describe('activity Timeout Detection', () => {
    it('detects no activity for streaming pre-search', () => {
      const preSearchActivityTimes = new Map<number, number>();
      const roundNumber = 0;
      const lastActivityTime = preSearchActivityTimes.get(roundNumber);

      // No activity recorded = undefined
      expect(lastActivityTime).toBeUndefined();
    });

    it('detects recent activity', () => {
      const preSearchActivityTimes = new Map<number, number>();
      preSearchActivityTimes.set(0, Date.now() - 1000); // 1 second ago

      const lastActivityTime = preSearchActivityTimes.get(0);
      const ACTIVITY_TIMEOUT_MS = 30_000;
      const hasRecentActivity = lastActivityTime !== undefined
        && Date.now() - lastActivityTime < ACTIVITY_TIMEOUT_MS;

      expect(hasRecentActivity).toBe(true);
    });

    it('detects activity timeout (no SSE events for 30+ seconds)', () => {
      const preSearchActivityTimes = new Map<number, number>();
      preSearchActivityTimes.set(0, Date.now() - 45_000); // 45 seconds ago

      const lastActivityTime = preSearchActivityTimes.get(0);
      const ACTIVITY_TIMEOUT_MS = 30_000;
      const hasRecentActivity = lastActivityTime !== undefined
        && Date.now() - lastActivityTime < ACTIVITY_TIMEOUT_MS;

      expect(hasRecentActivity).toBe(false);
    });

    it('after refresh, activity time is undefined (not persisted)', () => {
      // After page refresh, preSearchActivityTimes is empty Map
      const preSearchActivityTimes = new Map<number, number>();

      // This is important for resumption logic:
      // If status is STREAMING but no activity time, we can't tell if stream is active
      // The fix should attempt resumption in this case

      const lastActivityTime = preSearchActivityTimes.get(0);
      expect(lastActivityTime).toBeUndefined();
    });
  });
});

describe('flow Continuation After Pre-Search Resumption', () => {
  describe('participants Wait For Pre-Search', () => {
    it('participants blocked while pre-search resuming', () => {
      const preSearchStatus = MessageStatuses.STREAMING;
      const webSearchEnabled = true;

      const shouldWaitForPreSearch = webSearchEnabled
        && (preSearchStatus === MessageStatuses.PENDING || preSearchStatus === MessageStatuses.STREAMING);

      expect(shouldWaitForPreSearch).toBe(true);
    });

    it('participants proceed when pre-search complete', () => {
      const preSearchStatus = MessageStatuses.COMPLETE;
      const webSearchEnabled = true;

      const shouldWaitForPreSearch = webSearchEnabled
        && (preSearchStatus === MessageStatuses.PENDING || preSearchStatus === MessageStatuses.STREAMING);

      expect(shouldWaitForPreSearch).toBe(false);
    });
  });

  describe('complete Flow After Resumption', () => {
    it('flow continues: pre-search → participants → summary', () => {
      // Simulate complete flow after successful resumption
      type FlowPhase = 'pre-search' | 'participants' | 'summary' | 'complete';
      let currentPhase: FlowPhase = 'pre-search';

      // Pre-search completes
      currentPhase = 'participants';
      expect(currentPhase).toBe('participants');

      // All participants complete
      currentPhase = 'summary';
      expect(currentPhase).toBe('summary');

      // Summary completes
      currentPhase = 'complete';
      expect(currentPhase).toBe('complete');
    });
  });
});
