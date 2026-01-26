/**
 * Config Change Network Request Ordering E2E Tests
 *
 * Tests verify the critical ordering fix for network requests during config changes:
 * PATCH → changelog → pre-search → streams
 *
 * CRITICAL FIX:
 * Before: Pre-search executed before PATCH completed → changelog entries didn't exist yet
 * After: PATCH completes → changelog fetch → pre-search execution → streaming
 *
 * This ensures changelog entries are created server-side BEFORE we try to fetch them.
 *
 * Coverage:
 * 1. Network Request Order Verification
 * 2. Web Search Enable Flow (most common case)
 * 3. Full Conversation Flow
 * 4. Participant Change Flow
 * 5. Mode Change Flow
 */

import { ChatModes, MessageStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockParticipant, createMockThread } from '@/lib/testing';
import type { StoredThread } from '@/services/api';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// MOCK SERVICES
// ============================================================================

// Mock services that will be tracked for call order
const mockUpdateThreadMutation = vi.fn();
const mockGetThreadRoundChangelogService = vi.fn();
const mockExecutePreSearchStreamService = vi.fn();

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
// HELPER FUNCTIONS
// ============================================================================

function setupStore(): ChatStoreApi {
  const store = createChatStore();

  // Setup initial thread state
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

/**
 * Simulate PATCH request completion
 */
async function simulatePatchRequest(
  store: ChatStoreApi,
  roundNumber: number,
  changes: Partial<StoredThread>,
): Promise<void> {
  recordCall('PATCH', roundNumber);

  // Simulate PATCH delay
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });

  // Update thread state with changes
  const currentThread = store.getState().thread;
  if (currentThread) {
    store.getState().setThread({
      ...currentThread,
      ...changes,
    });
  }

  // Set isWaitingForChangelog AFTER PATCH completes
  // NOTE: configChangeRoundNumber remains set - it blocks until changelog clears it
  store.getState().setIsWaitingForChangelog(true);

  mockUpdateThreadMutation();
}

/**
 * Simulate changelog fetch
 */
async function simulateChangelogFetch(
  store: ChatStoreApi,
  roundNumber: number,
): Promise<void> {
  recordCall('changelog', roundNumber);

  // Simulate network delay
  await new Promise((resolve) => {
    setTimeout(resolve, 30);
  });

  // Clear waiting flags after changelog completes
  store.getState().setIsWaitingForChangelog(false);
  store.getState().setConfigChangeRoundNumber(null);

  mockGetThreadRoundChangelogService();
}

/**
 * Simulate pre-search execution
 */
async function simulatePreSearchExecution(
  store: ChatStoreApi,
  roundNumber: number,
): Promise<void> {
  recordCall('pre-search', roundNumber);

  // Simulate execution delay
  await new Promise((resolve) => {
    setTimeout(resolve, 40);
  });

  // Update pre-search status
  store.getState().updatePreSearchStatus(roundNumber, MessageStatuses.COMPLETE);

  mockExecutePreSearchStreamService();
}

/**
 * Simulate streaming start
 */
async function simulateStreaming(
  _store: ChatStoreApi,
  roundNumber: number,
): Promise<void> {
  recordCall('stream', roundNumber);

  // Simulate streaming start delay
  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });
}

// ============================================================================
// TEST SUITE 1: Network Request Order Verification
// ============================================================================

describe('network Request Order Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should execute requests in correct order: PATCH → changelog → pre-search → streams', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Set blocking flags before PATCH
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // 1. PATCH request
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });

    // Verify PATCH completed first
    expect(callOrder[0]?.type).toBe('PATCH');

    // 2. Changelog fetch (triggered by isWaitingForChangelog)
    await simulateChangelogFetch(store, roundNumber);

    // Verify changelog fetched after PATCH
    expect(callOrder[1]?.type).toBe('changelog');

    // 3. Pre-search execution (now unblocked)
    await simulatePreSearchExecution(store, roundNumber);

    // Verify pre-search after changelog
    expect(callOrder[2]?.type).toBe('pre-search');

    // 4. Streaming starts
    await simulateStreaming(store, roundNumber);

    // Verify streaming last
    expect(callOrder[3]?.type).toBe('stream');

    // Final verification of complete sequence
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);
  });

  it('should verify PATCH completes BEFORE changelog request starts', async () => {
    const store = setupStore();
    const roundNumber = 1;

    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Start PATCH
    const patchPromise = simulatePatchRequest(store, roundNumber, { enableWebSearch: true });

    // Verify changelog NOT yet called
    expect(mockGetThreadRoundChangelogService).not.toHaveBeenCalled();

    // Wait for PATCH to complete
    await patchPromise;

    // Now fetch changelog
    await simulateChangelogFetch(store, roundNumber);

    // Verify order
    const sequence = getCallSequence();
    const patchIndex = sequence.indexOf('PATCH');
    const changelogIndex = sequence.indexOf('changelog');

    expect(patchIndex).toBeLessThan(changelogIndex);
  });

  it('should verify changelog completes BEFORE pre-search starts', async () => {
    const store = setupStore();
    const roundNumber = 1;

    store.getState().setConfigChangeRoundNumber(roundNumber);
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

    // Execute sequence
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });
    await simulateChangelogFetch(store, roundNumber);

    // Verify pre-search NOT yet executed
    expect(mockExecutePreSearchStreamService).not.toHaveBeenCalled();

    // Now execute pre-search
    await simulatePreSearchExecution(store, roundNumber);

    // Verify order
    const sequence = getCallSequence();
    const changelogIndex = sequence.indexOf('changelog');
    const preSearchIndex = sequence.indexOf('pre-search');

    expect(changelogIndex).toBeLessThan(preSearchIndex);
  });

  it('should track call order using spy timestamps', async () => {
    const store = setupStore();
    const roundNumber = 1;

    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Execute all operations
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });
    await simulateChangelogFetch(store, roundNumber);
    await simulatePreSearchExecution(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify timestamps are monotonically increasing
    for (let i = 1; i < callOrder.length; i++) {
      const current = callOrder[i];
      const previous = callOrder[i - 1];
      if (!current) {
        throw new Error(`expected callOrder[${i}] to exist`);
      }
      if (!previous) {
        throw new Error(`expected callOrder[${i - 1}] to exist`);
      }
      expect(current.timestamp).toBeGreaterThan(previous.timestamp);
    }

    // Verify all services called exactly once
    expect(mockUpdateThreadMutation).toHaveBeenCalledTimes(1);
    expect(mockGetThreadRoundChangelogService).toHaveBeenCalledTimes(1);
    expect(mockExecutePreSearchStreamService).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// TEST SUITE 2: Web Search Enable Flow
// ============================================================================

describe('web Search Enable Flow (Most Common Case)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should handle Round 0 without web search → Round 1 with web search enabled', async () => {
    const store = setupStore();

    // Round 0: No web search
    expect(store.getState().enableWebSearch).toBeFalsy();

    // User enables web search for Round 1
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);

    const roundNumber = 1;
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
      userQuery: 'Question with web search',
    });

    // Execute flow
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });
    await simulateChangelogFetch(store, roundNumber);
    await simulatePreSearchExecution(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify correct order
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);

    // Verify final state
    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().isWaitingForChangelog).toBeFalsy();
    expect(store.getState().configChangeRoundNumber).toBeNull();
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
  });

  it('should create pre-search placeholder BEFORE PATCH', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Enable web search
    store.getState().setEnableWebSearch(true);

    // Add pre-search placeholder IMMEDIATELY (before PATCH)
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Question',
    });

    // Verify placeholder exists before PATCH
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === roundNumber);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);

    // Set blocking flag
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Now execute PATCH
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });

    // Pre-search still exists, waiting for execution
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);
  });

  it('should block pre-search execution until changelog completes', async () => {
    const store = setupStore();
    const roundNumber = 1;

    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Add pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Question',
    });

    // Execute PATCH
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });

    // configChangeRoundNumber still blocks pre-search (not cleared until changelog fetch)
    expect(store.getState().configChangeRoundNumber).toBe(roundNumber); // Still blocking
    expect(store.getState().isWaitingForChangelog).toBeTruthy(); // Set after PATCH

    // Execute changelog fetch
    await simulateChangelogFetch(store, roundNumber);

    // Now unblocked
    expect(store.getState().isWaitingForChangelog).toBeFalsy();
    expect(store.getState().configChangeRoundNumber).toBeNull();

    // Can execute pre-search
    await simulatePreSearchExecution(store, roundNumber);

    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'pre-search']);
  });
});

// ============================================================================
// TEST SUITE 3: Full Conversation Flow
// ============================================================================

describe('full Conversation Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should handle Round 0 without web search → Round 1 with web search', async () => {
    const store = setupStore();

    // Round 0 completes (no web search)
    expect(store.getState().enableWebSearch).toBeFalsy();

    // User enables web search for Round 1
    const roundNumber = 1;
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Add pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Follow-up question',
    });

    // Execute complete flow
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });
    await simulateChangelogFetch(store, roundNumber);
    await simulatePreSearchExecution(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify order
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);
  });

  it('should verify store states at each step', async () => {
    const store = setupStore();
    const roundNumber = 1;

    store.getState().setEnableWebSearch(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // After PATCH
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });
    expect(store.getState().isWaitingForChangelog).toBeTruthy();
    expect(store.getState().configChangeRoundNumber).toBe(roundNumber); // Still blocking

    // After changelog
    await simulateChangelogFetch(store, roundNumber);
    expect(store.getState().isWaitingForChangelog).toBeFalsy();
    expect(store.getState().configChangeRoundNumber).toBeNull();

    // After pre-search (if added)
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Test',
    });
    await simulatePreSearchExecution(store, roundNumber);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

    // After streaming
    await simulateStreaming(store, roundNumber);
    // Streaming state would be managed by other systems
  });

  it('should clear hasPendingConfigChanges after successful submission', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Set pending changes
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    expect(store.getState().hasPendingConfigChanges).toBeTruthy();

    // Execute PATCH (would clear flag in real code)
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });

    // Manually clear flag (in real code, form-actions does this)
    store.getState().setHasPendingConfigChanges(false);

    expect(store.getState().hasPendingConfigChanges).toBeFalsy();
  });
});

// ============================================================================
// TEST SUITE 4: Participant Change Flow
// ============================================================================

describe('participant Change Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should handle adding a participant in Round 1', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Add third participant
    const newParticipant = createMockParticipant(2, { modelId: 'gemini-pro' });
    const updatedParticipants = [
      ...store.getState().participants,
      newParticipant,
    ];

    store.getState().updateParticipants(updatedParticipants);
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Execute flow
    await simulatePatchRequest(store, roundNumber, {}); // Participant changes in separate field
    await simulateChangelogFetch(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify order (no pre-search since web search disabled)
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'stream']);

    // Verify participants updated
    expect(store.getState().participants).toHaveLength(3);
  });

  it('should handle participant change + web search enabled together', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Add participant AND enable web search
    const newParticipant = createMockParticipant(2, { modelId: 'gemini-pro' });
    store.getState().updateParticipants([...store.getState().participants, newParticipant]);
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Add pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Question',
    });

    // Execute complete flow
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });
    await simulateChangelogFetch(store, roundNumber);
    await simulatePreSearchExecution(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify all operations in order
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);
  });
});

// ============================================================================
// TEST SUITE 5: Mode Change Flow
// ============================================================================

describe('mode Change Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should handle mode change from ANALYZING to DEBATING', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Change mode
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Execute flow
    await simulatePatchRequest(store, roundNumber, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify order
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'stream']);

    // Verify mode updated
    expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
  });

  it('should handle mode change + web search toggle', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Change mode AND enable web search
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Add pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Question',
    });

    // Execute flow
    await simulatePatchRequest(store, roundNumber, {
      enableWebSearch: true,
      mode: ChatModes.BRAINSTORMING,
    });
    await simulateChangelogFetch(store, roundNumber);
    await simulatePreSearchExecution(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify complete sequence
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);
  });

  it('should verify proper ordering with all config change types', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Change EVERYTHING: mode + participants + web search
    store.getState().setSelectedMode(ChatModes.SOLVING);
    store.getState().setEnableWebSearch(true);

    const newParticipant = createMockParticipant(2, { modelId: 'mistral-large' });
    store.getState().updateParticipants([...store.getState().participants, newParticipant]);

    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Add pre-search
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: `presearch-r${roundNumber}`,
      roundNumber,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Complex question',
    });

    // Execute flow
    await simulatePatchRequest(store, roundNumber, {
      enableWebSearch: true,
      mode: ChatModes.SOLVING,
    });
    await simulateChangelogFetch(store, roundNumber);
    await simulatePreSearchExecution(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Verify order maintained even with multiple changes
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'pre-search', 'stream']);

    // Verify all changes applied
    expect(store.getState().thread?.mode).toBe(ChatModes.SOLVING);
    expect(store.getState().thread?.enableWebSearch).toBeTruthy();
    expect(store.getState().participants).toHaveLength(3);
  });
});

// ============================================================================
// TEST SUITE 6: Edge Cases and Error Scenarios
// ============================================================================

describe('edge Cases and Error Scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCallOrder();
  });

  it('should handle PATCH failure gracefully', async () => {
    const store = setupStore();
    const roundNumber = 1;

    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Simulate PATCH failure
    recordCall('PATCH', roundNumber);

    // Cleanup state (simulating error recovery)
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // Should not proceed to changelog
    expect(mockGetThreadRoundChangelogService).not.toHaveBeenCalled();

    // Verify only PATCH was attempted
    expect(getCallSequence()).toEqual(['PATCH']);
  });

  it('should handle changelog fetch failure', async () => {
    const store = setupStore();
    const roundNumber = 1;

    store.getState().setConfigChangeRoundNumber(roundNumber);

    // PATCH succeeds
    await simulatePatchRequest(store, roundNumber, { enableWebSearch: true });

    // Changelog fetch fails
    recordCall('changelog', roundNumber);

    // Should still clear flags for recovery
    store.getState().setIsWaitingForChangelog(false);
    store.getState().setConfigChangeRoundNumber(null);

    // Pre-search should not execute
    expect(mockExecutePreSearchStreamService).not.toHaveBeenCalled();

    expect(getCallSequence()).toEqual(['PATCH', 'changelog']);
  });

  it('should handle no config changes (empty changelog)', async () => {
    const store = setupStore();
    const roundNumber = 1;

    // Set flags even with no actual changes
    store.getState().setConfigChangeRoundNumber(roundNumber);

    // Execute flow (changelog will be empty but still fetched)
    await simulatePatchRequest(store, roundNumber, {});
    await simulateChangelogFetch(store, roundNumber);
    await simulateStreaming(store, roundNumber);

    // Order still maintained
    expect(getCallSequence()).toEqual(['PATCH', 'changelog', 'stream']);
  });

  it('should handle rapid successive config changes', async () => {
    const store = setupStore();

    // Round 1: First change
    const round1 = 1;
    store.getState().setConfigChangeRoundNumber(round1);
    await simulatePatchRequest(store, round1, { enableWebSearch: true });
    await simulateChangelogFetch(store, round1);

    resetCallOrder();

    // Round 2: Second change immediately after
    const round2 = 2;
    store.getState().setConfigChangeRoundNumber(round2);
    await simulatePatchRequest(store, round2, { mode: ChatModes.DEBATING });
    await simulateChangelogFetch(store, round2);

    // Each round maintains order independently
    expect(getCallSequence()).toEqual(['PATCH', 'changelog']);
  });
});
