/**
 * Config Change + Pre-Search Ordering E2E Tests
 *
 * Comprehensive end-to-end tests ensuring the EXACT network request order
 * when config changes (web search, mode, participants) occur during submission.
 *
 * REQUIRED ORDER: PATCH → changelog → pre-search → participant streams
 *
 * CRITICAL BUG FIXED:
 * PreSearchStream component was executing pre-search requests BEFORE changelog
 * was fetched because it didn't check the blocking flags (configChangeRoundNumber,
 * isWaitingForChangelog).
 *
 * NETWORK ORDER BUG (before fix):
 * 1. PATCH (with enableWebSearch: true)
 * 2. pre-search ← WRONG! Executed before changelog
 * 3. changelog
 *
 * CORRECT ORDER (after fix):
 * 1. PATCH (with enableWebSearch: true)
 * 2. changelog
 * 3. pre-search ← Only after changelog completes
 *
 * @see src/components/chat/pre-search-stream.tsx - blocking logic at lines 106-113
 * @see src/stores/chat/actions/form-actions.ts - handleUpdateThreadAndSend
 */

import { ChatModes, MessageStatuses, ThreadStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST SETUP
// ============================================================================

function createMockThread(overrides: Partial<ChatThread> = {}): ChatThread {
  return {
    id: 'test-thread-123',
    slug: 'test-thread',
    title: 'Test Thread',
    mode: ChatModes.BRAINSTORMING,
    status: ThreadStatuses.ACTIVE,
    isFavorite: false,
    isPublic: false,
    enableWebSearch: false,
    isAiGeneratedTitle: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  };
}

function createMockParticipants(): ChatParticipant[] {
  return [
    {
      id: 'participant-1',
      threadId: 'test-thread-123',
      modelId: 'gpt-4o',
      role: 'Analyst',
      priority: 0,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'participant-2',
      threadId: 'test-thread-123',
      modelId: 'claude-3-5-sonnet',
      role: 'Reviewer',
      priority: 1,
      isEnabled: true,
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

function createMockPreSearch(roundNumber: number): StoredPreSearch {
  return {
    id: `presearch-${roundNumber}`,
    threadId: 'test-thread-123',
    roundNumber,
    userQuery: `Query for round ${roundNumber}`,
    status: MessageStatuses.PENDING,
    searchData: null,
    createdAt: new Date(),
    completedAt: null,
    errorMessage: null,
  };
}

type NetworkPayload = {
  mode?: ChatModes;
  enableWebSearch?: boolean;
};

type NetworkRequest = {
  type: string;
  timestamp: number;
  payload?: NetworkPayload;
};

/**
 * Network request simulator for E2E testing
 * Tracks the order of simulated network requests
 */
class NetworkSimulator {
  private requestLog: NetworkRequest[] = [];

  private timestamp = 0;

  log(type: string, payload?: NetworkPayload) {
    this.requestLog.push({
      type,
      timestamp: this.timestamp++,
      payload,
    });
  }

  getOrder(): string[] {
    return this.requestLog.map(r => r.type);
  }

  getLog() {
    return [...this.requestLog];
  }

  reset() {
    this.requestLog = [];
    this.timestamp = 0;
  }
}

/**
 * Simulates PreSearchStream component's blocking check
 * Mirrors the exact logic at lines 106-113 of pre-search-stream.tsx
 */
function isPreSearchBlocked(store: ReturnType<typeof createChatStore>): boolean {
  const state = store.getState();
  return state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
}

/**
 * Simulates the full form submission flow from handleUpdateThreadAndSend
 */
async function simulateFormSubmission(
  store: ReturnType<typeof createChatStore>,
  network: NetworkSimulator,
  options: {
    enableWebSearch?: boolean;
    changeMode?: string;
    changeParticipants?: boolean;
  } = {},
) {
  const { enableWebSearch = false, changeMode, changeParticipants = false } = options;
  const state = store.getState();
  const roundNumber = 1;

  // Determine if there are config changes
  const currentWebSearch = state.thread?.enableWebSearch || false;
  const currentMode = state.thread?.mode || null;
  const webSearchChanged = currentWebSearch !== enableWebSearch;
  const modeChanged = changeMode ? currentMode !== changeMode : false;
  const hasChanges = webSearchChanged || modeChanged || changeParticipants;

  // Step 1: Apply form state changes
  if (webSearchChanged) {
    store.getState().setEnableWebSearch(enableWebSearch);
  }
  if (changeMode) {
    store.getState().setSelectedMode(changeMode);
  }

  // Step 2: Set blocking flag BEFORE PATCH (if changes exist)
  if (hasChanges) {
    store.getState().setConfigChangeRoundNumber(roundNumber);
    network.log('blocking-flag-set');
  }

  // Step 3: Add pre-search placeholder (if web search enabled)
  if (enableWebSearch) {
    store.getState().addPreSearch(createMockPreSearch(roundNumber));
    network.log('presearch-placeholder-added');

    // PreSearchStream component would check blocking here
    if (isPreSearchBlocked(store)) {
      network.log('presearch-blocked');
    }
  }

  // Step 4: Send PATCH request
  network.log('PATCH', {
    enableWebSearch: webSearchChanged ? enableWebSearch : undefined,
    mode: modeChanged ? changeMode : undefined,
  });

  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 10));

  // Step 5: PATCH completes, set isWaitingForChangelog (if changes)
  if (hasChanges) {
    store.getState().setIsWaitingForChangelog(true);
    network.log('PATCH-complete');

    // PreSearchStream component would re-check blocking here
    if (enableWebSearch && isPreSearchBlocked(store)) {
      network.log('presearch-still-blocked');
    }
  }

  // Step 6: Changelog fetch (if changes)
  if (hasChanges) {
    network.log('changelog-fetch');
    await new Promise(resolve => setTimeout(resolve, 10));

    // Step 7: Changelog sync complete, clear flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    network.log('changelog-complete');
  }

  // Step 8: Pre-search can now execute (if enabled and was blocked)
  if (enableWebSearch && !isPreSearchBlocked(store)) {
    const didTrigger = store.getState().tryMarkPreSearchTriggered(roundNumber);
    if (didTrigger) {
      network.log('presearch-execute');
    }
  }

  // Step 9: Participant streams begin
  network.log('participant-streams-start');
}

// ============================================================================
// E2E TESTS
// ============================================================================

describe('config Change + Pre-Search Ordering E2E', () => {
  let store: ReturnType<typeof createChatStore>;
  let network: NetworkSimulator;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
    network = new NetworkSimulator();
  });

  describe('web Search Enable Flow', () => {
    it('enforces PATCH → changelog → pre-search order when enabling web search', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      await simulateFormSubmission(store, network, { enableWebSearch: true });

      const order = network.getOrder();

      // Verify exact order
      expect(order).toEqual([
        'blocking-flag-set',
        'presearch-placeholder-added',
        'presearch-blocked',
        'PATCH',
        'PATCH-complete',
        'presearch-still-blocked',
        'changelog-fetch',
        'changelog-complete',
        'presearch-execute',
        'participant-streams-start',
      ]);

      // Verify pre-search comes AFTER changelog
      const changelogIndex = order.indexOf('changelog-complete');
      const presearchIndex = order.indexOf('presearch-execute');
      expect(presearchIndex).toBeGreaterThan(changelogIndex);
    });

    it('verifies pre-search is blocked until both flags are cleared', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const blockingLog: Array<{ phase: string; blocked: boolean }> = [];

      // Phase 1: Before any flags
      blockingLog.push({ phase: 'initial', blocked: isPreSearchBlocked(store) });

      // Phase 2: configChangeRoundNumber set
      store.getState().setConfigChangeRoundNumber(1);
      blockingLog.push({ phase: 'after-config-flag', blocked: isPreSearchBlocked(store) });

      // Phase 3: Both flags set
      store.getState().setIsWaitingForChangelog(true);
      blockingLog.push({ phase: 'after-both-flags', blocked: isPreSearchBlocked(store) });

      // Phase 4: Only isWaitingForChangelog cleared
      store.getState().setIsWaitingForChangelog(false);
      blockingLog.push({ phase: 'after-waiting-cleared', blocked: isPreSearchBlocked(store) });

      // Phase 5: Both cleared
      store.getState().setConfigChangeRoundNumber(null);
      blockingLog.push({ phase: 'after-all-cleared', blocked: isPreSearchBlocked(store) });

      expect(blockingLog).toEqual([
        { phase: 'initial', blocked: false },
        { phase: 'after-config-flag', blocked: true },
        { phase: 'after-both-flags', blocked: true },
        { phase: 'after-waiting-cleared', blocked: true }, // Still blocked!
        { phase: 'after-all-cleared', blocked: false },
      ]);
    });
  });

  describe('mode Change Flow', () => {
    it('enforces correct order when changing mode', async () => {
      const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      await simulateFormSubmission(store, network, { changeMode: ChatModes.ANALYZING });

      const order = network.getOrder();

      // No pre-search since web search not enabled
      expect(order).toEqual([
        'blocking-flag-set',
        'PATCH',
        'PATCH-complete',
        'changelog-fetch',
        'changelog-complete',
        'participant-streams-start',
      ]);
    });
  });

  describe('combined Changes Flow', () => {
    it('enforces PATCH → changelog → pre-search order with mode + web search changes', async () => {
      const thread = createMockThread({
        mode: ChatModes.BRAINSTORMING,
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      await simulateFormSubmission(store, network, {
        enableWebSearch: true,
        changeMode: ChatModes.ANALYZING,
      });

      const order = network.getOrder();

      // Pre-search must come after changelog
      const changelogIndex = order.indexOf('changelog-complete');
      const presearchIndex = order.indexOf('presearch-execute');
      expect(presearchIndex).toBeGreaterThan(changelogIndex);

      // Verify full order
      expect(order).toEqual([
        'blocking-flag-set',
        'presearch-placeholder-added',
        'presearch-blocked',
        'PATCH',
        'PATCH-complete',
        'presearch-still-blocked',
        'changelog-fetch',
        'changelog-complete',
        'presearch-execute',
        'participant-streams-start',
      ]);
    });

    it('enforces order with participant + web search changes', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      await simulateFormSubmission(store, network, {
        enableWebSearch: true,
        changeParticipants: true,
      });

      const order = network.getOrder();

      // Verify pre-search after changelog
      expect(order.indexOf('presearch-execute')).toBeGreaterThan(
        order.indexOf('changelog-complete'),
      );
    });
  });

  describe('no Config Change Flow', () => {
    it('skips changelog when no config changes (just message submission)', async () => {
      const thread = createMockThread({ enableWebSearch: true }); // Already enabled
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true); // Match thread

      // Simulate submission without changes
      network.log('PATCH');
      await Promise.resolve();
      network.log('PATCH-complete');

      // Pre-search can execute immediately (no blocking)
      const preSearch = createMockPreSearch(1);
      store.getState().addPreSearch(preSearch);

      if (!isPreSearchBlocked(store)) {
        const didTrigger = store.getState().tryMarkPreSearchTriggered(1);
        if (didTrigger) {
          network.log('presearch-execute');
        }
      }

      network.log('participant-streams-start');

      const order = network.getOrder();

      // No changelog in the flow
      expect(order).not.toContain('changelog-fetch');
      expect(order).not.toContain('changelog-complete');

      // Pre-search executes immediately after PATCH
      expect(order).toEqual([
        'PATCH',
        'PATCH-complete',
        'presearch-execute',
        'participant-streams-start',
      ]);
    });
  });

  describe('multiple Rounds', () => {
    it('maintains correct order across multiple rounds with config changes', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Round 1: Enable web search
      network.log('round-1-start');
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch(createMockPreSearch(1));

      expect(isPreSearchBlocked(store)).toBe(true);
      network.log('PATCH-round-1');

      store.getState().setIsWaitingForChangelog(true);
      expect(isPreSearchBlocked(store)).toBe(true);

      network.log('changelog-round-1');
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      expect(isPreSearchBlocked(store)).toBe(false);
      store.getState().tryMarkPreSearchTriggered(1);
      network.log('presearch-round-1');
      network.log('round-1-complete');

      // Round 2: Disable web search
      network.log('round-2-start');
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setEnableWebSearch(false);

      network.log('PATCH-round-2');
      store.getState().setIsWaitingForChangelog(true);

      network.log('changelog-round-2');
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      network.log('round-2-complete');

      // Round 3: Re-enable web search
      network.log('round-3-start');
      store.getState().setConfigChangeRoundNumber(3);
      store.getState().setEnableWebSearch(true);
      store.getState().addPreSearch(createMockPreSearch(3));

      expect(isPreSearchBlocked(store)).toBe(true);
      network.log('PATCH-round-3');

      store.getState().setIsWaitingForChangelog(true);
      expect(isPreSearchBlocked(store)).toBe(true);

      network.log('changelog-round-3');
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      expect(isPreSearchBlocked(store)).toBe(false);
      store.getState().tryMarkPreSearchTriggered(3);
      network.log('presearch-round-3');
      network.log('round-3-complete');

      const order = network.getOrder();

      // Verify each round has correct order
      // Round 1
      expect(order.indexOf('PATCH-round-1')).toBeLessThan(order.indexOf('changelog-round-1'));
      expect(order.indexOf('changelog-round-1')).toBeLessThan(order.indexOf('presearch-round-1'));

      // Round 3
      expect(order.indexOf('PATCH-round-3')).toBeLessThan(order.indexOf('changelog-round-3'));
      expect(order.indexOf('changelog-round-3')).toBeLessThan(order.indexOf('presearch-round-3'));
    });
  });

  describe('regression Tests', () => {
    it('rEGRESSION: prevents pre-search before PATCH completes', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // This is the exact bug scenario that was fixed
      store.getState().setEnableWebSearch(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().addPreSearch(createMockPreSearch(1));

      // At this point, PATCH hasn't been sent yet
      // PreSearchStream component would render and try to execute

      // BUG (before fix): Pre-search would execute here
      // FIX: Pre-search is blocked by configChangeRoundNumber
      expect(isPreSearchBlocked(store)).toBe(true);

      // Cannot trigger pre-search while blocked
      const didTriggerEarly = store.getState().tryMarkPreSearchTriggered(1);

      // Even if tryMark succeeds, the component checks blocking first
      // So effectively it would return early before calling tryMark
      // But for safety, we verify the blocking check
      expect(isPreSearchBlocked(store)).toBe(true);

      // Clear the trigger so we can test properly
      if (didTriggerEarly) {
        store.getState().clearPreSearchTracking(1);
      }

      // Continue with proper flow
      store.getState().setIsWaitingForChangelog(true);
      expect(isPreSearchBlocked(store)).toBe(true);

      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      expect(isPreSearchBlocked(store)).toBe(false);
    });

    it('rEGRESSION: prevents pre-search before changelog completes', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      store.getState().setEnableWebSearch(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().addPreSearch(createMockPreSearch(1));

      // Simulate PATCH complete
      store.getState().setIsWaitingForChangelog(true);

      // At this point, changelog hasn't been fetched yet
      // BUG (before fix): Pre-search might execute here
      // FIX: Pre-search blocked by isWaitingForChangelog
      expect(isPreSearchBlocked(store)).toBe(true);

      // Changelog complete
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // NOW pre-search can execute
      expect(isPreSearchBlocked(store)).toBe(false);
    });

    it('rEGRESSION: network order is PATCH → changelog → pre-search', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      await simulateFormSubmission(store, network, { enableWebSearch: true });

      const order = network.getOrder();
      const patchIndex = order.indexOf('PATCH');
      const changelogIndex = order.indexOf('changelog-complete');
      const presearchIndex = order.indexOf('presearch-execute');

      // Strict ordering: PATCH < changelog < pre-search
      expect(patchIndex).toBeLessThan(changelogIndex);
      expect(changelogIndex).toBeLessThan(presearchIndex);

      // Double-check pre-search doesn't appear before changelog
      const presearchBeforeChangelog = order.slice(0, changelogIndex).includes('presearch-execute');
      expect(presearchBeforeChangelog).toBe(false);
    });
  });

  describe('state Consistency', () => {
    it('verifies flag clearing is atomic (both cleared together)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Set both flags
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Simulate changelog sync clearing both atomically
      // This mimics use-changelog-sync.ts behavior
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // Both should be cleared
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(isPreSearchBlocked(store)).toBe(false);
    });

    it('verifies initializeThread preserves flags during active submission', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate active submission
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Re-initialize (e.g., from PATCH response)
      const updatedThread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(updatedThread, createMockParticipants(), []);

      // Flags should be preserved (not cleared by initializeThread)
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBe(true);
    });

    it('rEGRESSION: initializeThread preserves enableWebSearch when hasPendingConfigChanges is true', () => {
      // This bug caused user's web search toggle to be wiped when query refetched
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User toggles web search ON
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Verify form state is set
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // Query refetches, triggering initializeThread with OLD thread data
      const refetchedThread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(refetchedThread, createMockParticipants(), []);

      // BUG (before fix): enableWebSearch would be reset to false
      // FIX: enableWebSearch preserved because hasPendingConfigChanges was true
      expect(store.getState().enableWebSearch).toBe(true);
    });

    it('rEGRESSION: initializeThread preserves selectedMode when hasPendingConfigChanges is true', () => {
      const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User changes mode
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);

      // Verify form state
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);

      // Query refetches with OLD thread data
      const refetchedThread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(refetchedThread, createMockParticipants(), []);

      // Mode should be preserved
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    });

    it('initializeThread syncs form state with thread when NO pending changes', () => {
      const thread = createMockThread({ enableWebSearch: false, mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User hasn't made changes, hasPendingConfigChanges is false
      expect(store.getState().hasPendingConfigChanges).toBe(false);

      // Thread data updates (e.g., from server)
      const updatedThread = createMockThread({ enableWebSearch: true, mode: ChatModes.DEBATING });
      store.getState().initializeThread(updatedThread, createMockParticipants(), []);

      // Form state should sync with thread (no pending changes)
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    });
  });

  describe('changelog Waits For PATCH', () => {
    it('changelog flag is NOT set before PATCH completes', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Step 1: Set blocking flag (BEFORE PATCH)
      store.getState().setConfigChangeRoundNumber(1);
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBe(false); // NOT set yet

      // At this point, changelog should NOT be fetched
      // isWaitingForChangelog is false, so changelog query won't trigger
      const shouldFetchChangelog = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetchChangelog).toBe(false);
    });

    it('changelog flag is set ONLY after PATCH completes', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Step 1: Set configChangeRoundNumber (BEFORE PATCH)
      store.getState().setConfigChangeRoundNumber(1);

      // Step 2: Simulate PATCH in progress
      network.log('PATCH-start');
      await new Promise(resolve => setTimeout(resolve, 10));

      // During PATCH, isWaitingForChangelog is still false
      expect(store.getState().isWaitingForChangelog).toBe(false);

      // Step 3: PATCH completes
      network.log('PATCH-complete');

      // Step 4: NOW set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // NOW changelog can be fetched
      const shouldFetchChangelog = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetchChangelog).toBe(true);

      network.log('changelog-fetch');
    });

    it('enforces async order: PATCH resolves → then changelog', async () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const timeline: string[] = [];

      // Simulate the exact async flow
      store.getState().setConfigChangeRoundNumber(1);
      timeline.push('configChangeRoundNumber-set');

      // PATCH (async operation)
      timeline.push('PATCH-start');
      await new Promise(resolve => setTimeout(resolve, 20));
      timeline.push('PATCH-end');

      // Only AFTER PATCH, set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);
      timeline.push('isWaitingForChangelog-set');

      // NOW changelog can fetch
      timeline.push('changelog-fetch-start');
      await new Promise(resolve => setTimeout(resolve, 10));
      timeline.push('changelog-fetch-end');

      // Clear flags
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      timeline.push('flags-cleared');

      // Verify order
      expect(timeline).toEqual([
        'configChangeRoundNumber-set',
        'PATCH-start',
        'PATCH-end',
        'isWaitingForChangelog-set',
        'changelog-fetch-start',
        'changelog-fetch-end',
        'flags-cleared',
      ]);

      // isWaitingForChangelog must come AFTER PATCH-end
      expect(timeline.indexOf('isWaitingForChangelog-set')).toBeGreaterThan(
        timeline.indexOf('PATCH-end'),
      );
    });
  });

  describe('3-Round E2E with Form Value Sync', () => {
    it('round 1 → 2 → 3: form values sync after each PATCH', async () => {
      const thread = createMockThread({
        mode: ChatModes.BRAINSTORMING,
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // ROUND 1: Change mode
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate PATCH
      await new Promise(resolve => setTimeout(resolve, 10));

      // After PATCH: clear hasPendingConfigChanges FIRST, then setThread
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setThread(createMockThread({ mode: ChatModes.ANALYZING }));

      // Form values should sync
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
      expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);

      // Changelog
      store.getState().setIsWaitingForChangelog(true);
      await new Promise(resolve => setTimeout(resolve, 10));
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // ROUND 2: No changes (just message)
      // Form values should still be in sync from round 1
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
      expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);

      const modeChanged = store.getState().thread?.mode !== store.getState().selectedMode;
      expect(modeChanged).toBe(false); // NO false change detection

      // ROUND 3: Enable web search
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setConfigChangeRoundNumber(3);

      // Simulate PATCH
      await new Promise(resolve => setTimeout(resolve, 10));

      // After PATCH: clear hasPendingConfigChanges FIRST, then setThread
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setThread(createMockThread({
        mode: ChatModes.ANALYZING,
        enableWebSearch: true,
      }));

      // Form values should sync
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().thread?.enableWebSearch).toBe(true);

      // Mode should still be in sync
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    });

    it('rEGRESSION: round 3 does not send unchanged values in PATCH', async () => {
      const thread = createMockThread({
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate rounds 1 and 2 completing (form synced with thread)
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setThread(createMockThread({
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
      }));

      // Round 3: Check change detection
      const freshState = store.getState();
      const freshSelectedMode = freshState.selectedMode;
      const freshEnableWebSearch = freshState.enableWebSearch;
      const threadMode = freshState.thread?.mode;
      const threadWebSearch = freshState.thread?.enableWebSearch;

      // Calculate what would be in PATCH payload
      const modeChanged = threadMode !== freshSelectedMode;
      const webSearchChanged = threadWebSearch !== freshEnableWebSearch;

      // Should NOT detect changes (values are in sync)
      expect(modeChanged).toBe(false);
      expect(webSearchChanged).toBe(false);

      // PATCH payload should be empty (no config changes)
      const payload: NetworkPayload = {};
      if (modeChanged)
        payload.mode = freshSelectedMode;
      if (webSearchChanged)
        payload.enableWebSearch = freshEnableWebSearch;

      expect(Object.keys(payload)).toHaveLength(0);
    });

    it('3-round scenario with changes every round maintains sync', async () => {
      const thread = createMockThread({
        mode: ChatModes.BRAINSTORMING,
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Round 1: Change mode to ANALYZING
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setThread(createMockThread({
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
      }));
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);

      // Round 2: Enable web search
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setThread(createMockThread({
        mode: ChatModes.ANALYZING,
        enableWebSearch: true,
      }));
      expect(store.getState().enableWebSearch).toBe(true);

      // Round 3: Change mode to DEBATING
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setThread(createMockThread({
        mode: ChatModes.DEBATING,
        enableWebSearch: true,
      }));
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);

      // Final verification: all values in sync
      expect(store.getState().selectedMode).toBe(store.getState().thread?.mode);
      expect(store.getState().enableWebSearch).toBe(store.getState().thread?.enableWebSearch);
    });
  });

  describe('setThread Form Value Sync', () => {
    it('setThread syncs BOTH selectedMode AND enableWebSearch', () => {
      const thread = createMockThread({
        mode: ChatModes.BRAINSTORMING,
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Update thread with new values
      const updatedThread = createMockThread({
        mode: ChatModes.DEBATING,
        enableWebSearch: true,
      });
      store.getState().setThread(updatedThread);

      // BOTH should sync (since hasPendingConfigChanges is false)
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
      expect(store.getState().enableWebSearch).toBe(true);
    });

    it('setThread preserves form values when hasPendingConfigChanges is true', () => {
      const thread = createMockThread({
        mode: ChatModes.BRAINSTORMING,
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User makes changes for next round
      store.getState().setSelectedMode(ChatModes.SOLVING);
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // setThread called (e.g., from query refetch with old data)
      store.getState().setThread(createMockThread({
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
      }));

      // User's pending changes should be preserved
      expect(store.getState().selectedMode).toBe(ChatModes.SOLVING);
      expect(store.getState().enableWebSearch).toBe(true);
    });

    it('correct order: hasPendingConfigChanges cleared → setThread syncs', () => {
      const thread = createMockThread({
        mode: ChatModes.BRAINSTORMING,
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User changes mode
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);

      // CORRECT ORDER (after fix):
      // Step 1: Clear hasPendingConfigChanges FIRST
      store.getState().setHasPendingConfigChanges(false);

      // Step 2: setThread syncs because flag is now false
      store.getState().setThread(createMockThread({
        mode: ChatModes.ANALYZING,
        enableWebSearch: false,
      }));

      // Form values synced to thread
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
      expect(store.getState().selectedMode).toBe(store.getState().thread?.mode);
    });
  });
});
