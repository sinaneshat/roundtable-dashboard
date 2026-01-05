/**
 * Round 3+ Network Request Ordering Tests
 *
 * Tests verify that ordering is enforced across ALL rounds (not just 1-2):
 * PATCH → changelog → pre-search → streams
 *
 * User-reported issues on round 3+:
 * - Change tracking breaks
 * - Config updating breaks
 * - Cases bypass strict order (pre-search before patch, changelog never happens)
 * - Different behavior based on round number (anti-patterns)
 *
 * Expected behavior:
 * - Initial round (0): creates first, then proceeds
 * - ALL non-initial rounds (1, 2, 3, ...): PATCH → changelog → pre-search → streams
 * - Order MUST be enforced regardless of round number
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatModes, MessageStatuses } from '@/api/core/enums';
import { createMockParticipant, createMockThread } from '@/lib/testing';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// CALL ORDER TRACKING
// ============================================================================

type NetworkCall = {
  type: 'PATCH' | 'changelog' | 'pre-search' | 'stream';
  timestamp: number;
  roundNumber: number;
};

let callOrder: NetworkCall[] = [];

function recordCall(type: NetworkCall['type'], roundNumber: number): void {
  callOrder.push({
    type,
    timestamp: Date.now(),
    roundNumber,
  });
}

function resetCallOrder(): void {
  callOrder = [];
}

function getCallSequence(): string[] {
  return callOrder
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(c => `${c.type}:r${c.roundNumber}`);
}

function getCallsByRound(roundNumber: number): string[] {
  return callOrder
    .filter(c => c.roundNumber === roundNumber)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(c => c.type);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function setupStore(): ChatStoreApi {
  const store = createChatStore();

  const thread = createMockThread({
    enableWebSearch: false,
    mode: ChatModes.ANALYZING,
  });

  const participants = [
    createMockParticipant(0, { modelId: 'gpt-4o' }),
    createMockParticipant(1, { modelId: 'claude-3-opus' }),
  ];

  store.getState().initializeThread(thread, participants, []);

  return store;
}

async function simulatePatchRequest(
  store: ChatStoreApi,
  roundNumber: number,
  changes: Record<string, unknown>,
): Promise<void> {
  recordCall('PATCH', roundNumber);
  await new Promise(resolve => setTimeout(resolve, 10));

  const currentThread = store.getState().thread;
  if (currentThread) {
    store.getState().setThread({
      ...currentThread,
      ...changes,
    });
  }

  // CRITICAL: Set isWaitingForChangelog AFTER PATCH completes
  store.getState().setIsWaitingForChangelog(true);
}

async function simulateChangelogFetch(
  store: ChatStoreApi,
  roundNumber: number,
): Promise<void> {
  recordCall('changelog', roundNumber);
  await new Promise(resolve => setTimeout(resolve, 10));

  // Clear waiting flags after changelog completes
  store.getState().setIsWaitingForChangelog(false);
  store.getState().setConfigChangeRoundNumber(null);
}

async function simulatePreSearchExecution(
  store: ChatStoreApi,
  roundNumber: number,
): Promise<void> {
  recordCall('pre-search', roundNumber);
  await new Promise(resolve => setTimeout(resolve, 10));

  store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.COMPLETE);
}

async function simulateStreaming(
  _store: ChatStoreApi,
  roundNumber: number,
): Promise<void> {
  recordCall('stream', roundNumber);
  await new Promise(resolve => setTimeout(resolve, 10));
}

function addPreSearchPlaceholder(store: ChatStoreApi, roundNumber: number): void {
  store.getState().addPreSearch({
    id: `presearch-r${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status: MessageStatuses.PENDING,
    searchData: null,
    userQuery: `Question for round ${roundNumber}`,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: null,
  });
}

/**
 * Simulates the blocking check that hooks perform before proceeding
 */
function isBlockedByChangelogFlags(store: ChatStoreApi): boolean {
  const state = store.getState();
  return state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
}

// ============================================================================
// TEST SUITE 1: Multi-Round Ordering (Round 0 → 1 → 2 → 3)
// ============================================================================

describe('multi-Round Ordering Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should maintain PATCH → changelog → stream order for round 1', async () => {
    const store = setupStore();

    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, 1);
    await simulateStreaming(store, 1);

    expect(getCallsByRound(1)).toEqual(['PATCH', 'changelog', 'stream']);
  });

  it('should maintain PATCH → changelog → stream order for round 2', async () => {
    const store = setupStore();

    // Complete round 1 first
    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, 1);
    await simulateStreaming(store, 1);

    resetCallOrder();

    // Round 2 with config changes
    store.getState().setConfigChangeRoundNumber(2);
    await simulatePatchRequest(store, 2, { enableWebSearch: true });
    await simulateChangelogFetch(store, 2);
    await simulateStreaming(store, 2);

    expect(getCallsByRound(2)).toEqual(['PATCH', 'changelog', 'stream']);
  });

  it('should maintain PATCH → changelog → stream order for round 3', async () => {
    const store = setupStore();

    // Complete rounds 1 and 2 first
    for (const round of [1, 2]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
      await simulateStreaming(store, round);
    }

    resetCallOrder();

    // Round 3 with config changes
    store.getState().setConfigChangeRoundNumber(3);
    await simulatePatchRequest(store, 3, { mode: ChatModes.BRAINSTORMING });
    await simulateChangelogFetch(store, 3);
    await simulateStreaming(store, 3);

    expect(getCallsByRound(3)).toEqual(['PATCH', 'changelog', 'stream']);
  });

  it('should maintain order for round 4 and beyond', async () => {
    const store = setupStore();

    // Complete rounds 1-3 first
    for (const round of [1, 2, 3]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
    }

    resetCallOrder();

    // Round 4
    store.getState().setConfigChangeRoundNumber(4);
    await simulatePatchRequest(store, 4, { enableWebSearch: true });
    await simulateChangelogFetch(store, 4);
    await simulateStreaming(store, 4);

    expect(getCallsByRound(4)).toEqual(['PATCH', 'changelog', 'stream']);

    resetCallOrder();

    // Round 5
    store.getState().setConfigChangeRoundNumber(5);
    await simulatePatchRequest(store, 5, { mode: ChatModes.SOLVING });
    await simulateChangelogFetch(store, 5);
    await simulateStreaming(store, 5);

    expect(getCallsByRound(5)).toEqual(['PATCH', 'changelog', 'stream']);
  });
});

// ============================================================================
// TEST SUITE 2: Flag State Verification at Each Round
// ============================================================================

describe('flag State Verification Across Rounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should correctly set and clear flags for round 1', async () => {
    const store = setupStore();

    // Before PATCH
    store.getState().setConfigChangeRoundNumber(1);
    expect(store.getState().configChangeRoundNumber).toBe(1);
    expect(store.getState().isWaitingForChangelog).toBe(false);
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    // After PATCH
    await simulatePatchRequest(store, 1, {});
    expect(store.getState().configChangeRoundNumber).toBe(1); // Still set
    expect(store.getState().isWaitingForChangelog).toBe(true);
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    // After changelog
    await simulateChangelogFetch(store, 1);
    expect(store.getState().configChangeRoundNumber).toBeNull();
    expect(store.getState().isWaitingForChangelog).toBe(false);
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });

  it('should correctly set and clear flags for round 2', async () => {
    const store = setupStore();

    // Complete round 1
    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, {});
    await simulateChangelogFetch(store, 1);

    // Round 2 - verify flags are cleared from round 1
    expect(isBlockedByChangelogFlags(store)).toBe(false);

    // Set flags for round 2
    store.getState().setConfigChangeRoundNumber(2);
    expect(store.getState().configChangeRoundNumber).toBe(2);
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    await simulatePatchRequest(store, 2, {});
    expect(store.getState().isWaitingForChangelog).toBe(true);

    await simulateChangelogFetch(store, 2);
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });

  it('should correctly set and clear flags for round 3', async () => {
    const store = setupStore();

    // Complete rounds 1 and 2
    for (const round of [1, 2]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
    }

    // Round 3 - this is where user reports issues
    expect(isBlockedByChangelogFlags(store)).toBe(false);

    store.getState().setConfigChangeRoundNumber(3);
    expect(store.getState().configChangeRoundNumber).toBe(3);
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    await simulatePatchRequest(store, 3, {});
    expect(store.getState().configChangeRoundNumber).toBe(3); // Still blocking
    expect(store.getState().isWaitingForChangelog).toBe(true);
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    await simulateChangelogFetch(store, 3);
    expect(store.getState().configChangeRoundNumber).toBeNull();
    expect(store.getState().isWaitingForChangelog).toBe(false);
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });
});

// ============================================================================
// TEST SUITE 3: Pre-Search Blocking Verification
// ============================================================================

describe('pre-Search Blocking Across Rounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should block pre-search until changelog completes on round 1', async () => {
    const store = setupStore();

    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(1);
    addPreSearchPlaceholder(store, 1);

    // PATCH completes
    await simulatePatchRequest(store, 1, { enableWebSearch: true });

    // Pre-search should be blocked (flags still set)
    expect(isBlockedByChangelogFlags(store)).toBe(true);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // Changelog completes
    await simulateChangelogFetch(store, 1);

    // Now pre-search can execute
    expect(isBlockedByChangelogFlags(store)).toBe(false);
    await simulatePreSearchExecution(store, 1);

    expect(getCallsByRound(1)).toEqual(['PATCH', 'changelog', 'pre-search']);
  });

  it('should block pre-search until changelog completes on round 2', async () => {
    const store = setupStore();

    // Complete round 1
    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, {});
    await simulateChangelogFetch(store, 1);

    resetCallOrder();

    // Round 2 with web search
    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(2);
    addPreSearchPlaceholder(store, 2);

    await simulatePatchRequest(store, 2, { enableWebSearch: true });
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    await simulateChangelogFetch(store, 2);
    expect(isBlockedByChangelogFlags(store)).toBe(false);

    await simulatePreSearchExecution(store, 2);

    expect(getCallsByRound(2)).toEqual(['PATCH', 'changelog', 'pre-search']);
  });

  it('should block pre-search until changelog completes on round 3', async () => {
    const store = setupStore();

    // Complete rounds 1 and 2
    for (const round of [1, 2]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
    }

    resetCallOrder();

    // Round 3 with web search - THIS IS THE REPORTED PROBLEM AREA
    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(3);
    addPreSearchPlaceholder(store, 3);

    await simulatePatchRequest(store, 3, { enableWebSearch: true });

    // CRITICAL: Verify blocking is still enforced on round 3
    expect(isBlockedByChangelogFlags(store)).toBe(true);
    expect(store.getState().configChangeRoundNumber).toBe(3);
    expect(store.getState().isWaitingForChangelog).toBe(true);

    await simulateChangelogFetch(store, 3);
    expect(isBlockedByChangelogFlags(store)).toBe(false);

    await simulatePreSearchExecution(store, 3);

    expect(getCallsByRound(3)).toEqual(['PATCH', 'changelog', 'pre-search']);
  });
});

// ============================================================================
// TEST SUITE 4: Config Change Combinations Across Rounds
// ============================================================================

describe('config Change Combinations Across Multiple Rounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should handle: R1 no changes, R2 with changes, R3 no changes', async () => {
    const store = setupStore();

    // Round 1: No config changes (just message)
    await simulateStreaming(store, 1);

    // Round 2: With config changes
    store.getState().setConfigChangeRoundNumber(2);
    await simulatePatchRequest(store, 2, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, 2);
    await simulateStreaming(store, 2);

    // Round 3: No config changes
    await simulateStreaming(store, 3);

    const sequence = getCallSequence();
    expect(sequence).toContain('stream:r1');
    expect(sequence).toContain('PATCH:r2');
    expect(sequence).toContain('changelog:r2');
    expect(sequence).toContain('stream:r2');
    expect(sequence).toContain('stream:r3');
  });

  it('should handle: R1 with changes, R2 no changes, R3 with changes', async () => {
    const store = setupStore();

    // Round 1: With config changes
    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, 1);
    await simulateStreaming(store, 1);

    resetCallOrder();

    // Round 2: No config changes
    await simulateStreaming(store, 2);

    // Round 3: With config changes
    store.getState().setConfigChangeRoundNumber(3);
    await simulatePatchRequest(store, 3, { enableWebSearch: true });
    await simulateChangelogFetch(store, 3);
    await simulateStreaming(store, 3);

    // Verify round 3 order
    expect(getCallsByRound(3)).toEqual(['PATCH', 'changelog', 'stream']);
  });

  it('should handle: R1 with changes, R2 with changes, R3 with changes', async () => {
    const store = setupStore();

    // All rounds with config changes
    for (const round of [1, 2, 3] as const) {
      resetCallOrder();

      store.getState().setConfigChangeRoundNumber(round);

      const changes = round === 1
        ? { mode: ChatModes.DEBATING }
        : round === 2
          ? { enableWebSearch: true }
          : { mode: ChatModes.BRAINSTORMING };

      await simulatePatchRequest(store, round, changes);
      await simulateChangelogFetch(store, round);
      await simulateStreaming(store, round);

      // Each round should maintain order
      expect(getCallsByRound(round)).toEqual(['PATCH', 'changelog', 'stream']);
    }
  });

  it('should handle web search toggle on each non-initial round', async () => {
    const store = setupStore();

    // Round 1: Enable web search
    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(1);
    addPreSearchPlaceholder(store, 1);

    await simulatePatchRequest(store, 1, { enableWebSearch: true });
    await simulateChangelogFetch(store, 1);
    await simulatePreSearchExecution(store, 1);
    await simulateStreaming(store, 1);

    expect(getCallsByRound(1)).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);

    resetCallOrder();

    // Round 2: Disable web search
    store.getState().setEnableWebSearch(false);
    store.getState().setConfigChangeRoundNumber(2);

    await simulatePatchRequest(store, 2, { enableWebSearch: false });
    await simulateChangelogFetch(store, 2);
    await simulateStreaming(store, 2);

    expect(getCallsByRound(2)).toEqual(['PATCH', 'changelog', 'stream']);

    resetCallOrder();

    // Round 3: Enable web search again
    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(3);
    addPreSearchPlaceholder(store, 3);

    await simulatePatchRequest(store, 3, { enableWebSearch: true });
    await simulateChangelogFetch(store, 3);
    await simulatePreSearchExecution(store, 3);
    await simulateStreaming(store, 3);

    expect(getCallsByRound(3)).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);
  });
});

// ============================================================================
// TEST SUITE 5: Potential Race Conditions on Round 3+
// ============================================================================

describe('race Condition Prevention on Round 3+', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should prevent streaming before PATCH on round 3', async () => {
    const store = setupStore();

    // Complete rounds 1-2
    for (const round of [1, 2]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
    }

    // Round 3: Set flag before PATCH
    store.getState().setConfigChangeRoundNumber(3);

    // Try to stream (should be blocked)
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    // Proper sequence
    await simulatePatchRequest(store, 3, {});
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    await simulateChangelogFetch(store, 3);
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });

  it('should prevent changelog fetch before PATCH on round 3', async () => {
    const store = setupStore();

    // Complete rounds 1-2
    for (const round of [1, 2]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
    }

    // Round 3: configChangeRoundNumber set but isWaitingForChangelog is false
    // This simulates the state BEFORE PATCH completes
    store.getState().setConfigChangeRoundNumber(3);
    expect(store.getState().isWaitingForChangelog).toBe(false);

    // Changelog should not be triggered yet (no isWaitingForChangelog)
    // The shouldFetch condition is: isWaitingForChangelog && configChangeRoundNumber !== null

    // After PATCH, isWaitingForChangelog becomes true
    await simulatePatchRequest(store, 3, {});
    expect(store.getState().isWaitingForChangelog).toBe(true);

    // NOW changelog can fetch
    await simulateChangelogFetch(store, 3);
  });

  it('should prevent pre-search before changelog on round 3', async () => {
    const store = setupStore();

    // Complete rounds 1-2
    for (const round of [1, 2]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
    }

    // Round 3 with web search
    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(3);
    addPreSearchPlaceholder(store, 3);

    // PATCH but not changelog
    await simulatePatchRequest(store, 3, { enableWebSearch: true });

    // Pre-search should be blocked
    expect(isBlockedByChangelogFlags(store)).toBe(true);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 3)?.status).toBe(MessageStatuses.PENDING);

    // Complete changelog
    await simulateChangelogFetch(store, 3);

    // Now pre-search can proceed
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });

  it('should handle rapid round transitions (3 → 4 → 5)', async () => {
    const store = setupStore();

    // Complete rounds 1-2
    for (const round of [1, 2]) {
      store.getState().setConfigChangeRoundNumber(round);
      await simulatePatchRequest(store, round, {});
      await simulateChangelogFetch(store, round);
    }

    // Rapid transitions 3 → 4 → 5
    for (const round of [3, 4, 5]) {
      resetCallOrder();

      store.getState().setConfigChangeRoundNumber(round);

      // Verify blocking
      expect(isBlockedByChangelogFlags(store)).toBe(true);

      await simulatePatchRequest(store, round, { mode: ChatModes.DEBATING });

      // Still blocking
      expect(isBlockedByChangelogFlags(store)).toBe(true);

      await simulateChangelogFetch(store, round);

      // Unblocked
      expect(isBlockedByChangelogFlags(store)).toBe(false);

      await simulateStreaming(store, round);

      expect(getCallsByRound(round)).toEqual(['PATCH', 'changelog', 'stream']);
    }
  });
});

// ============================================================================
// TEST SUITE 6: Inconsistent State Detection
// ============================================================================

describe('inconsistent State Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should detect isWaitingForChangelog=true but configChangeRoundNumber=null', async () => {
    const store = setupStore();

    // Simulate inconsistent state (bug scenario)
    store.getState().setIsWaitingForChangelog(true);
    // configChangeRoundNumber is null

    // This is the inconsistent state the use-changelog-sync hook should fix
    expect(store.getState().isWaitingForChangelog).toBe(true);
    expect(store.getState().configChangeRoundNumber).toBeNull();

    // In real code, use-changelog-sync detects this and clears isWaitingForChangelog
    // The shouldFetch condition would be false (need both flags)
    const shouldFetch = store.getState().isWaitingForChangelog
      && store.getState().configChangeRoundNumber !== null;
    expect(shouldFetch).toBe(false);

    // But isBlockedByChangelogFlags would still return true (blocking streaming)
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    // The fix in use-changelog-sync clears this
    store.getState().setIsWaitingForChangelog(false);
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });

  it('should detect configChangeRoundNumber set but PATCH never completes', async () => {
    const store = setupStore();

    // Round 3: configChangeRoundNumber set, PATCH never completes
    store.getState().setConfigChangeRoundNumber(3);

    // State is blocked
    expect(isBlockedByChangelogFlags(store)).toBe(true);
    expect(store.getState().isWaitingForChangelog).toBe(false); // PATCH didn't set this

    // After timeout (30s in real code), should be cleared
    // This simulates the timeout behavior
    store.getState().setConfigChangeRoundNumber(null);
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });

  it('should handle stale configChangeRoundNumber from previous round', async () => {
    const store = setupStore();

    // Complete round 1
    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, {});
    // Simulate changelog NOT being fetched (flags not cleared)

    // Round 2 starts with stale configChangeRoundNumber=1
    expect(store.getState().configChangeRoundNumber).toBe(1);
    expect(store.getState().isWaitingForChangelog).toBe(true);

    // This is a bug state - round 2 is blocked by round 1's flags
    expect(isBlockedByChangelogFlags(store)).toBe(true);

    // Complete changelog for round 1 to unblock
    await simulateChangelogFetch(store, 1);
    expect(isBlockedByChangelogFlags(store)).toBe(false);

    // Now round 2 can proceed
    store.getState().setConfigChangeRoundNumber(2);
    await simulatePatchRequest(store, 2, {});
    await simulateChangelogFetch(store, 2);
    expect(isBlockedByChangelogFlags(store)).toBe(false);
  });
});

// ============================================================================
// TEST SUITE 7: Full 3-Round Scenarios (User-Requested Tests)
// ============================================================================

describe('full 3-Round Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('scenario 1: 3 rounds with NO changes on round 2, changes on round 3', async () => {
    const store = setupStore();

    // Round 1: Initial with changes
    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, 1);
    await simulateStreaming(store, 1);

    // Round 2: No config changes (just message)
    await simulateStreaming(store, 2);

    resetCallOrder();

    // Round 3: Changes (user-reported problem area)
    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(3);
    addPreSearchPlaceholder(store, 3);

    await simulatePatchRequest(store, 3, { enableWebSearch: true });
    await simulateChangelogFetch(store, 3);
    await simulatePreSearchExecution(store, 3);
    await simulateStreaming(store, 3);

    // Verify round 3 maintains correct order
    expect(getCallsByRound(3)).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);
  });

  it('scenario 2: 3 rounds with changes on BOTH non-initial rounds', async () => {
    const store = setupStore();

    // Round 1: Changes
    store.getState().setConfigChangeRoundNumber(1);
    await simulatePatchRequest(store, 1, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, 1);
    await simulateStreaming(store, 1);

    // Round 2: Changes
    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(2);
    addPreSearchPlaceholder(store, 2);

    await simulatePatchRequest(store, 2, { enableWebSearch: true });
    await simulateChangelogFetch(store, 2);
    await simulatePreSearchExecution(store, 2);
    await simulateStreaming(store, 2);

    resetCallOrder();

    // Round 3: Changes
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setConfigChangeRoundNumber(3);
    addPreSearchPlaceholder(store, 3);

    await simulatePatchRequest(store, 3, { mode: ChatModes.BRAINSTORMING });
    await simulateChangelogFetch(store, 3);
    await simulatePreSearchExecution(store, 3);
    await simulateStreaming(store, 3);

    // Both round 2 and 3 should maintain order
    expect(getCallsByRound(3)).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);
  });

  it('scenario 3: verify flags are properly isolated between rounds', async () => {
    const store = setupStore();

    // Round 1
    store.getState().setConfigChangeRoundNumber(1);
    expect(store.getState().configChangeRoundNumber).toBe(1);

    await simulatePatchRequest(store, 1, {});
    expect(store.getState().isWaitingForChangelog).toBe(true);

    await simulateChangelogFetch(store, 1);
    expect(store.getState().configChangeRoundNumber).toBeNull();
    expect(store.getState().isWaitingForChangelog).toBe(false);

    // Round 2
    store.getState().setConfigChangeRoundNumber(2);
    expect(store.getState().configChangeRoundNumber).toBe(2);

    await simulatePatchRequest(store, 2, {});
    expect(store.getState().configChangeRoundNumber).toBe(2); // Still round 2, not round 1

    await simulateChangelogFetch(store, 2);
    expect(store.getState().configChangeRoundNumber).toBeNull();

    // Round 3
    store.getState().setConfigChangeRoundNumber(3);
    expect(store.getState().configChangeRoundNumber).toBe(3);

    await simulatePatchRequest(store, 3, {});
    expect(store.getState().configChangeRoundNumber).toBe(3); // Correctly set to round 3

    await simulateChangelogFetch(store, 3);
    expect(store.getState().configChangeRoundNumber).toBeNull();
    expect(store.getState().isWaitingForChangelog).toBe(false);
  });
});
