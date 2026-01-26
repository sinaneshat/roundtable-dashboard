/**
 * Web Search Round 2 Ordering Tests
 *
 * Tests the CRITICAL ordering bug when web search is enabled on round 2:
 * - BUG: addPreSearch was called BEFORE setConfigChangeRoundNumber
 * - This caused effects to see configChangeRoundNumber=null and not block
 * - Pre-search executed before PATCH, changelog never happened
 *
 * FIX: setConfigChangeRoundNumber MUST be called BEFORE addPreSearch
 * Order: block flag → pre-search placeholder → waitingToStart → PATCH → changelog → execute pre-search → streams
 */

import { ChatModes, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockParticipant, createMockThread } from '@/lib/testing';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// CALL ORDER TRACKING
// ============================================================================

type CallType = 'setConfigChangeRoundNumber' | 'addPreSearch' | 'setWaitingToStartStreaming' | 'PATCH' | 'changelog' | 'pre-search-execute' | 'stream';

type RecordedCall = {
  type: CallType;
  timestamp: number;
  roundNumber: number;
  data?: unknown;
};

let callOrder: RecordedCall[] = [];

function recordCall(type: CallType, roundNumber: number, data?: unknown): void {
  callOrder.push({
    data,
    roundNumber,
    timestamp: Date.now(),
    type,
  });
}

function resetCallOrder(): void {
  callOrder = [];
}

function getCallSequence(): string[] {
  return callOrder
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(c => c.type);
}

// ============================================================================
// MOCK STORE WITH CALL TRACKING
// ============================================================================

function createTrackedStore(): ChatStoreApi {
  const store = createChatStore();

  // Wrap the actions we want to track
  const originalSetConfigChangeRoundNumber = store.getState().setConfigChangeRoundNumber;
  const originalAddPreSearch = store.getState().addPreSearch;
  const originalSetWaitingToStartStreaming = store.getState().setWaitingToStartStreaming;

  store.setState({
    addPreSearch: (preSearch) => {
      recordCall('addPreSearch', preSearch.roundNumber, { status: preSearch.status });
      originalAddPreSearch(preSearch);
    },
    setConfigChangeRoundNumber: (roundNumber: number | null) => {
      if (roundNumber !== null) {
        recordCall('setConfigChangeRoundNumber', roundNumber);
      }
      originalSetConfigChangeRoundNumber(roundNumber);
    },
    setWaitingToStartStreaming: (waiting: boolean) => {
      if (waiting) {
        const state = store.getState();
        const round = state.streamingRoundNumber ?? 0;
        recordCall('setWaitingToStartStreaming', round);
      }
      originalSetWaitingToStartStreaming(waiting);
    },
  });

  return store;
}

function setupStoreForRound2(store: ChatStoreApi): void {
  const thread = createMockThread({
    enableWebSearch: false, // Web search was OFF on round 0
    mode: ChatModes.ANALYZING,
  });

  const participants = [
    createMockParticipant(0, { modelId: 'gpt-4o' }),
    createMockParticipant(1, { modelId: 'claude-3-opus' }),
  ];

  store.getState().initializeThread(thread, participants, []);
  store.getState().setScreenMode(ScreenModes.THREAD); // Round 2 is on THREAD screen
}

// ============================================================================
// TESTS
// ============================================================================

describe('web Search Enabled on Round 2 - State Update Order', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should set configChangeRoundNumber BEFORE addPreSearch', () => {
    const store = createTrackedStore();
    setupStoreForRound2(store);

    const roundNumber = 2;

    // Simulate the CORRECT order from handleUpdateThreadAndSend after fix:
    // 1. Set blocking flag FIRST
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // 2. Add pre-search placeholder AFTER blocking flag
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test query',
    });

    // 3. Set waiting to start
    store.getState().setStreamingRoundNumber(roundNumber);
    store.getState().setWaitingToStartStreaming(true);

    const sequence = getCallSequence();

    // CRITICAL: configChangeRoundNumber MUST be set BEFORE addPreSearch
    const configIndex = sequence.indexOf('setConfigChangeRoundNumber');
    const preSearchIndex = sequence.indexOf('addPreSearch');
    const waitingIndex = sequence.indexOf('setWaitingToStartStreaming');

    expect(configIndex).toBeLessThan(preSearchIndex);
    expect(preSearchIndex).toBeLessThan(waitingIndex);
    expect(sequence).toEqual([
      'setConfigChangeRoundNumber',
      'addPreSearch',
      'setWaitingToStartStreaming',
    ]);
  });

  it('should have configChangeRoundNumber set when addPreSearch triggers effects', () => {
    const store = createTrackedStore();
    setupStoreForRound2(store);

    const roundNumber = 2;

    // Simulate the CORRECT order
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // At this point, ANY effect triggered by subsequent state changes
    // should see configChangeRoundNumber !== null
    expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

    // Now add pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test query',
    });

    // configChangeRoundNumber should STILL be set
    expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

    // Effects checking for blocking should see this
    const isBlocked = store.getState().configChangeRoundNumber !== null
      || store.getState().isWaitingForChangelog;
    expect(isBlocked).toBeTruthy();
  });

  it('should block pre-search execution until PATCH and changelog complete', () => {
    const store = createTrackedStore();
    setupStoreForRound2(store);

    const roundNumber = 2;

    // 1. Set blocking flag
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // 2. Add pre-search placeholder
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test query',
    });

    // 3. Set waiting to start
    store.getState().setStreamingRoundNumber(roundNumber);
    store.getState().setWaitingToStartStreaming(true);

    // At this point:
    // - configChangeRoundNumber is set → BLOCKING
    // - isWaitingForChangelog is false → PATCH not done yet
    // - Pre-search should NOT execute yet

    const isBlocked = store.getState().configChangeRoundNumber !== null
      || store.getState().isWaitingForChangelog;
    expect(isBlocked).toBeTruthy();

    // Simulate PATCH completion
    store.getState().setIsWaitingForChangelog(true);

    // Still blocked (waiting for changelog)
    expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
    expect(store.getState().isWaitingForChangelog).toBeTruthy();

    // Simulate changelog completion
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    // NOW unblocked
    const isUnblocked = store.getState().configChangeRoundNumber === null
      && !store.getState().isWaitingForChangelog;
    expect(isUnblocked).toBeTruthy();
  });
});

describe('web Search Round 2 - Full Flow Simulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should maintain correct order: blockFlag → preSearch → waitingToStart → PATCH → changelog → executePreSearch → stream', async () => {
    const store = createTrackedStore();
    setupStoreForRound2(store);

    const roundNumber = 2;

    // === SYNCHRONOUS STATE UPDATES (in handleUpdateThreadAndSend) ===

    // 1. Set blocking flag FIRST (CRITICAL ORDER)
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // 2. Add pre-search placeholder
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test query',
    });

    // 3. Set waiting to start
    store.getState().setStreamingRoundNumber(roundNumber);
    store.getState().setWaitingToStartStreaming(true);

    // === ASYNC OPERATIONS ===

    // 4. PATCH request (simulated)
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    recordCall('PATCH', roundNumber);

    // 5. After PATCH, set changelog flag
    store.getState().setIsWaitingForChangelog(true);

    // 6. Changelog fetch (simulated)
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    recordCall('changelog', roundNumber);

    // 7. Clear blocking flags
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    // 8. NOW pre-search can execute
    recordCall('pre-search-execute', roundNumber);
    store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.COMPLETE);

    // 9. Stream can start
    recordCall('stream', roundNumber);

    // Verify the complete sequence
    const sequence = getCallSequence();

    // Critical assertions:
    // 1. setConfigChangeRoundNumber BEFORE addPreSearch
    expect(sequence.indexOf('setConfigChangeRoundNumber')).toBeLessThan(sequence.indexOf('addPreSearch'));

    // 2. PATCH after sync state updates
    expect(sequence.indexOf('PATCH')).toBeGreaterThan(sequence.indexOf('setWaitingToStartStreaming'));

    // 3. changelog after PATCH
    expect(sequence.indexOf('changelog')).toBeGreaterThan(sequence.indexOf('PATCH'));

    // 4. pre-search-execute after changelog
    expect(sequence.indexOf('pre-search-execute')).toBeGreaterThan(sequence.indexOf('changelog'));

    // 5. stream after pre-search-execute
    expect(sequence.indexOf('stream')).toBeGreaterThan(sequence.indexOf('pre-search-execute'));
  });

  it('should NOT allow pre-search to execute before PATCH completes', () => {
    const store = createTrackedStore();
    setupStoreForRound2(store);

    const roundNumber = 2;

    // Set blocking flag FIRST
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Add pre-search placeholder
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test query',
    });

    store.getState().setStreamingRoundNumber(roundNumber);
    store.getState().setWaitingToStartStreaming(true);

    // At this point, PATCH has NOT completed yet
    // configChangeRoundNumber is still set
    // isWaitingForChangelog is still false (PATCH not done)

    // Check if effects would be blocked
    const shouldBlock = store.getState().configChangeRoundNumber !== null
      || store.getState().isWaitingForChangelog;

    expect(shouldBlock).toBeTruthy();
    expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
    expect(store.getState().isWaitingForChangelog).toBeFalsy();

    // Pre-search should still be PENDING (not executed)
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);
  });

  it('should NOT allow pre-search to execute before changelog completes', async () => {
    const store = createTrackedStore();
    setupStoreForRound2(store);

    const roundNumber = 2;

    // Set blocking flag FIRST
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Add pre-search placeholder
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test query',
    });

    store.getState().setStreamingRoundNumber(roundNumber);
    store.getState().setWaitingToStartStreaming(true);

    // Simulate PATCH completion
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    store.getState().setIsWaitingForChangelog(true);

    // At this point:
    // - PATCH is done
    // - configChangeRoundNumber is STILL set
    // - isWaitingForChangelog is true

    const shouldBlock = store.getState().configChangeRoundNumber !== null
      || store.getState().isWaitingForChangelog;

    expect(shouldBlock).toBeTruthy();
    expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
    expect(store.getState().isWaitingForChangelog).toBeTruthy();

    // Pre-search should still be PENDING
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);
  });
});

describe('blocking Check Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  /**
   * This test verifies the exact blocking condition used in hooks:
   * if (isWaitingForChangelog || configChangeRoundNumber !== null)
   */
  it('should correctly evaluate blocking condition at each stage', () => {
    const store = createChatStore();
    setupStoreForRound2(store);

    const roundNumber = 2;

    const checkBlocking = () => store.getState().isWaitingForChangelog
      || store.getState().configChangeRoundNumber !== null;

    // Stage 1: Initial state - NOT blocked
    expect(checkBlocking()).toBeFalsy();

    // Stage 2: Set configChangeRoundNumber - BLOCKED
    store.getState().setConfigChangeRoundNumber(roundNumber);
    expect(checkBlocking()).toBeTruthy();

    // Stage 3: Add pre-search (configChangeRoundNumber still set) - BLOCKED
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test query',
    });
    expect(checkBlocking()).toBeTruthy();

    // Stage 4: Set waitingToStart - BLOCKED
    store.getState().setWaitingToStartStreaming(true);
    expect(checkBlocking()).toBeTruthy();

    // Stage 5: PATCH completes, set isWaitingForChangelog - BLOCKED
    store.getState().setIsWaitingForChangelog(true);
    expect(checkBlocking()).toBeTruthy();

    // Stage 6: Changelog completes, clear flags - NOT BLOCKED
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);
    expect(checkBlocking()).toBeFalsy();
  });
});
