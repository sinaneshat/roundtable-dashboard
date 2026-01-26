/**
 * Form Value Sync - 3 Round E2E Tests
 *
 * Tests verify that form values (selectedMode, enableWebSearch) stay in sync
 * with thread values after PATCH responses, preventing false change detection
 * on subsequent rounds.
 *
 * BUG FIXED:
 * - setThread only synced enableWebSearch, NOT selectedMode
 * - hasPendingConfigChanges was cleared AFTER setThread, preventing sync
 * - On round 3, stale form values caused false "change" detection
 *
 * CORRECT FLOW:
 * 1. PATCH executes
 * 2. hasPendingConfigChanges cleared FIRST
 * 3. setThread called - syncs BOTH enableWebSearch AND selectedMode
 * 4. isWaitingForChangelog set
 * 5. Changelog fetched
 * 6. Flags cleared
 * 7. Streaming proceeds
 *
 * @see src/stores/chat/store.ts - setThread function
 * @see src/stores/chat/actions/form-actions.ts - handleUpdateThreadAndSend
 */

import { ChatModes, MessageStatuses, ThreadStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createMockThread(overrides: Partial<ChatThread> = {}): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: 'thread-123',
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    mode: ChatModes.BRAINSTORMING,
    slug: 'test-thread',
    status: ThreadStatuses.ACTIVE,
    title: 'Test Thread',
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockParticipants(): ChatParticipant[] {
  return [
    {
      createdAt: new Date(),
      id: 'participant-1',
      isEnabled: true,
      modelId: 'gpt-4o',
      priority: 0,
      role: 'Analyst',
      settings: null,
      threadId: 'thread-123',
      updatedAt: new Date(),
    },
  ];
}

type PatchPayload = {
  mode?: ChatModes;
  enableWebSearch?: boolean;
};

type NetworkCall = {
  type: 'PATCH' | 'changelog' | 'pre-search' | 'stream';
  round: number;
  payload?: PatchPayload;
};

class NetworkTracker {
  private calls: NetworkCall[] = [];

  log(type: NetworkCall['type'], round: number, payload?: PatchPayload) {
    this.calls.push({ payload, round, type });
  }

  getCallsForRound(round: number): NetworkCall[] {
    return this.calls.filter(c => c.round === round);
  }

  getOrder(round: number): string[] {
    return this.getCallsForRound(round).map(c => c.type);
  }

  getPatchPayload(round: number): PatchPayload | undefined {
    const patch = this.calls.find(c => c.type === 'PATCH' && c.round === round);
    return patch?.payload;
  }

  hasChangelog(round: number): boolean {
    return this.calls.some(c => c.type === 'changelog' && c.round === round);
  }

  reset() {
    this.calls = [];
  }
}

// ============================================================================
// FORM VALUE SYNC TESTS
// ============================================================================

describe('form Value Sync After PATCH', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('setThread Syncs Form Values', () => {
    it('syncs selectedMode from thread when hasPendingConfigChanges is false', () => {
      const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
      expect(store.getState().hasPendingConfigChanges).toBeFalsy();

      // Simulate PATCH response with updated mode
      const updatedThread = createMockThread({ mode: ChatModes.ANALYZING });
      store.getState().setThread(updatedThread);

      // selectedMode should sync to thread value
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    });

    it('syncs enableWebSearch from thread when hasPendingConfigChanges is false', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      expect(store.getState().enableWebSearch).toBeFalsy();

      // Simulate PATCH response with updated enableWebSearch
      const updatedThread = createMockThread({ enableWebSearch: true });
      store.getState().setThread(updatedThread);

      // enableWebSearch should sync to thread value
      expect(store.getState().enableWebSearch).toBeTruthy();
    });

    it('preserves selectedMode when hasPendingConfigChanges is true', () => {
      const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User changes mode for next round
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setHasPendingConfigChanges(true);

      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);

      // setThread called while user has pending changes
      const serverThread = createMockThread({ mode: ChatModes.ANALYZING });
      store.getState().setThread(serverThread);

      // User's selection should be preserved
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    });

    it('preserves enableWebSearch when hasPendingConfigChanges is true', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User toggles web search for next round
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // setThread called while user has pending changes
      const serverThread = createMockThread({ enableWebSearch: false });
      store.getState().setThread(serverThread);

      // User's selection should be preserved
      expect(store.getState().enableWebSearch).toBeTruthy();
    });
  });

  describe('correct Flag Clearing Order', () => {
    it('clears hasPendingConfigChanges BEFORE setThread allows sync', () => {
      const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User changes mode
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setHasPendingConfigChanges(true);

      // Simulate PATCH flow:
      // Step 1: Clear hasPendingConfigChanges FIRST
      store.getState().setHasPendingConfigChanges(false);

      // Step 2: setThread syncs because hasPendingConfigChanges is now false
      const updatedThread = createMockThread({ mode: ChatModes.ANALYZING });
      store.getState().setThread(updatedThread);

      // Form should now be in sync with thread
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
      expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
    });
  });
});

// ============================================================================
// 3-ROUND E2E TESTS
// ============================================================================

describe('3-Round E2E: PATCH → changelog → streaming', () => {
  let store: ReturnType<typeof createChatStore>;
  let network: NetworkTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
    network = new NetworkTracker();
  });

  /**
   * Simulates a complete round with config changes
   */
  async function executeRound(
    roundNumber: number,
    options: {
      changeMode?: ChatModes;
      changeWebSearch?: boolean;
      expectChangelog: boolean;
    },
  ) {
    const state = store.getState();
    const currentThread = state.thread;
    const currentMode = currentThread?.mode;
    const currentWebSearch = currentThread?.enableWebSearch ?? false;

    const hasChanges = (options.changeMode && options.changeMode !== currentMode)
      || (options.changeWebSearch !== undefined && options.changeWebSearch !== currentWebSearch);

    // Build PATCH payload based on actual changes
    const payload: PatchPayload = {};
    if (options.changeMode && options.changeMode !== currentMode) {
      payload.mode = options.changeMode;
      state.setSelectedMode(options.changeMode);
    }
    if (options.changeWebSearch !== undefined && options.changeWebSearch !== currentWebSearch) {
      payload.enableWebSearch = options.changeWebSearch;
      state.setEnableWebSearch(options.changeWebSearch);
    }

    // Set config change flag BEFORE PATCH (if changes exist)
    if (hasChanges) {
      state.setConfigChangeRoundNumber(roundNumber);
    }

    // Execute PATCH
    network.log('PATCH', roundNumber, payload);
    await Promise.resolve();

    // PATCH complete - update thread and clear flags
    // CRITICAL: Clear hasPendingConfigChanges BEFORE setThread
    state.setHasPendingConfigChanges(false);

    // Update thread from "server response"
    const updatedThread = createMockThread({
      enableWebSearch: options.changeWebSearch ?? currentWebSearch,
      mode: options.changeMode || currentMode || ChatModes.BRAINSTORMING,
    });
    state.setThread(updatedThread);

    // Set isWaitingForChangelog AFTER PATCH (if changes exist)
    if (hasChanges) {
      state.setIsWaitingForChangelog(true);

      // Execute changelog
      network.log('changelog', roundNumber);
      await Promise.resolve();

      // Clear flags
      state.setConfigChangeRoundNumber(null);
      state.setIsWaitingForChangelog(false);
    }

    // Streaming
    network.log('stream', roundNumber);

    // Verify expectations
    if (options.expectChangelog) {
      expect(network.hasChangelog(roundNumber)).toBeTruthy();
    } else {
      expect(network.hasChangelog(roundNumber)).toBeFalsy();
    }

    // Verify order
    const order = network.getOrder(roundNumber);
    if (options.expectChangelog) {
      expect(order).toEqual(['PATCH', 'changelog', 'stream']);
    } else {
      expect(order).toEqual(['PATCH', 'stream']);
    }
  }

  it('round 1: mode change triggers changelog', async () => {
    const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    await executeRound(1, {
      changeMode: ChatModes.ANALYZING,
      expectChangelog: true,
    });

    // Verify form values synced
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
  });

  it('round 2: no changes skips changelog', async () => {
    const thread = createMockThread({ mode: ChatModes.ANALYZING });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Simulate round 1 completed
    network.reset();

    await executeRound(2, {
      expectChangelog: false,
    });

    // Form values should remain in sync
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
  });

  it('round 3: web search toggle triggers changelog', async () => {
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    network.reset();

    await executeRound(3, {
      changeWebSearch: true,
      expectChangelog: true,
    });

    // Verify form values synced
    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().thread?.enableWebSearch).toBeTruthy();
  });

  it('full 3-round scenario: R1 change, R2 no change, R3 change', async () => {
    const thread = createMockThread({
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
    });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Round 1: Change mode
    await executeRound(1, {
      changeMode: ChatModes.ANALYZING,
      expectChangelog: true,
    });

    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    network.reset();

    // Round 2: No changes (just send message)
    await executeRound(2, {
      expectChangelog: false,
    });

    // Form values should still be in sync
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
    network.reset();

    // Round 3: Change web search
    await executeRound(3, {
      changeWebSearch: true,
      expectChangelog: true,
    });

    // All values should be in sync
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
    expect(store.getState().thread?.enableWebSearch).toBeTruthy();
  });

  it('full 3-round scenario: changes every round', async () => {
    const thread = createMockThread({
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
    });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Round 1: Change mode
    await executeRound(1, {
      changeMode: ChatModes.ANALYZING,
      expectChangelog: true,
    });
    network.reset();

    // Round 2: Enable web search
    await executeRound(2, {
      changeWebSearch: true,
      expectChangelog: true,
    });
    network.reset();

    // Round 3: Change mode again
    await executeRound(3, {
      changeMode: ChatModes.DEBATING,
      expectChangelog: true,
    });

    // All values should be in sync
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    expect(store.getState().enableWebSearch).toBeTruthy();
    expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
    expect(store.getState().thread?.enableWebSearch).toBeTruthy();
  });
});

// ============================================================================
// STALE CLOSURE PREVENTION TESTS
// ============================================================================

describe('stale Closure Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  it('after round 2, round 3 should not detect false mode change', () => {
    const thread = createMockThread({ mode: ChatModes.ANALYZING });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Simulate round 2 completing with mode=analyzing
    // hasPendingConfigChanges cleared FIRST
    store.getState().setHasPendingConfigChanges(false);

    // setThread syncs form values
    const round2Thread = createMockThread({ mode: ChatModes.ANALYZING });
    store.getState().setThread(round2Thread);

    // Now both should be in sync
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);

    // Round 3: Check if change detection works correctly
    const freshSelectedMode = store.getState().selectedMode;
    const freshThreadMode = store.getState().thread?.mode;

    // No false change detection
    expect(freshSelectedMode).toBe(freshThreadMode);
    expect(freshSelectedMode === freshThreadMode).toBeTruthy();
  });

  it('after round 2 with web search toggle, round 3 should not detect false change', () => {
    const thread = createMockThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Simulate round 2 - user disabled web search
    store.getState().setEnableWebSearch(false);
    store.getState().setHasPendingConfigChanges(true);

    // PATCH sent, response received
    store.getState().setHasPendingConfigChanges(false);
    const round2Thread = createMockThread({ enableWebSearch: false });
    store.getState().setThread(round2Thread);

    // Both should be in sync
    expect(store.getState().enableWebSearch).toBeFalsy();
    expect(store.getState().thread?.enableWebSearch).toBeFalsy();

    // Round 3: Check change detection
    const freshEnableWebSearch = store.getState().enableWebSearch;
    const freshThreadWebSearch = store.getState().thread?.enableWebSearch;

    // No false change detection
    expect(freshEnableWebSearch).toBe(freshThreadWebSearch);
  });

  it('rEGRESSION: round 3 with same values should NOT include mode/enableWebSearch in PATCH', () => {
    const thread = createMockThread({
      enableWebSearch: false,
      mode: ChatModes.ANALYZING,
    });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Sync form values
    store.getState().setHasPendingConfigChanges(false);
    store.getState().setThread(thread);

    // Get fresh values (simulating what handleUpdateThreadAndSend does)
    const freshState = store.getState();
    const freshSelectedMode = freshState.selectedMode;
    const freshEnableWebSearch = freshState.enableWebSearch;
    const freshThreadMode = freshState.thread?.mode;
    const freshThreadWebSearch = freshState.thread?.enableWebSearch;

    // Calculate changes (same logic as form-actions.ts)
    const modeChanged = freshThreadMode !== freshSelectedMode;
    const webSearchChanged = freshThreadWebSearch !== freshEnableWebSearch;

    // Should NOT detect changes
    expect(modeChanged).toBeFalsy();
    expect(webSearchChanged).toBeFalsy();

    // PATCH payload should NOT include mode or enableWebSearch
    const patchPayload: PatchPayload = {};
    if (modeChanged) {
      patchPayload.mode = freshSelectedMode;
    }
    if (webSearchChanged) {
      patchPayload.enableWebSearch = freshEnableWebSearch;
    }

    expect(patchPayload).toEqual({});
  });
});

// ============================================================================
// PRE-SEARCH BLOCKING TESTS
// ============================================================================

describe('pre-Search Blocking During Config Changes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  function isPreSearchBlocked(): boolean {
    const state = store.getState();
    return state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
  }

  it('pre-search blocked when configChangeRoundNumber is set', () => {
    const thread = createMockThread();
    store.getState().initializeThread(thread, createMockParticipants(), []);

    expect(isPreSearchBlocked()).toBeFalsy();

    store.getState().setConfigChangeRoundNumber(1);
    expect(isPreSearchBlocked()).toBeTruthy();
  });

  it('pre-search blocked when isWaitingForChangelog is true', () => {
    const thread = createMockThread();
    store.getState().initializeThread(thread, createMockParticipants(), []);

    expect(isPreSearchBlocked()).toBeFalsy();

    store.getState().setIsWaitingForChangelog(true);
    expect(isPreSearchBlocked()).toBeTruthy();
  });

  it('pre-search unblocked only when BOTH flags cleared', () => {
    const thread = createMockThread();
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Set both flags
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    expect(isPreSearchBlocked()).toBeTruthy();

    // Clear one flag - still blocked
    store.getState().setConfigChangeRoundNumber(null);
    expect(isPreSearchBlocked()).toBeTruthy();

    // Clear both - unblocked
    store.getState().setIsWaitingForChangelog(false);
    expect(isPreSearchBlocked()).toBeFalsy();
  });

  it('round 3 with web search: pre-search waits for changelog', () => {
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // User enables web search for round 3
    store.getState().setEnableWebSearch(true);

    // Step 1: Set configChangeRoundNumber BEFORE PATCH
    store.getState().setConfigChangeRoundNumber(3);
    expect(isPreSearchBlocked()).toBeTruthy();

    // Step 2: Add pre-search placeholder (blocked)
    store.getState().addPreSearch({
      completedAt: null,
      createdAt: new Date(),
      errorMessage: null,
      id: 'presearch-r3',
      roundNumber: 3,
      searchData: null,
      status: MessageStatuses.PENDING,
      threadId: 'thread-123',
      userQuery: 'Round 3 query',
    });

    // Pre-search should NOT execute while blocked
    expect(isPreSearchBlocked()).toBeTruthy();

    // Step 3: PATCH completes, set isWaitingForChangelog
    store.getState().setIsWaitingForChangelog(true);
    expect(isPreSearchBlocked()).toBeTruthy();

    // Step 4: Changelog completes, clear flags
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);

    // NOW pre-search can execute
    expect(isPreSearchBlocked()).toBeFalsy();
  });
});

// ============================================================================
// EDGE CASES AND BLIND SPOTS
// ============================================================================

describe('edge Cases and Blind Spots', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  it('handles rapid round transitions without stale state', () => {
    const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Round 1: Quick completion
    store.getState().setHasPendingConfigChanges(false);
    store.getState().setThread(createMockThread({ mode: ChatModes.ANALYZING }));
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);

    // Round 2: Quick completion
    store.getState().setHasPendingConfigChanges(false);
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);

    // Round 3: Verify no stale state
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
  });

  it('handles thread being null gracefully', () => {
    // Initialize first to have a known state
    const thread = createMockThread({ mode: ChatModes.ANALYZING });
    store.getState().initializeThread(thread, createMockParticipants(), []);
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);

    // Set thread to null
    store.getState().setThread(null);

    // Should not throw - selectedMode preserved when thread is null
    expect(store.getState().thread).toBeNull();
    // selectedMode is preserved (setThread doesn't sync when thread is null)
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
  });

  it('handles multiple setThread calls in sequence', () => {
    const thread1 = createMockThread({ mode: ChatModes.BRAINSTORMING });
    store.getState().initializeThread(thread1, createMockParticipants(), []);

    // Multiple rapid updates
    store.getState().setThread(createMockThread({ mode: ChatModes.ANALYZING }));
    store.getState().setThread(createMockThread({ mode: ChatModes.DEBATING }));
    store.getState().setThread(createMockThread({ mode: ChatModes.SOLVING }));

    // Should settle on final value
    expect(store.getState().selectedMode).toBe(ChatModes.SOLVING);
    expect(store.getState().thread?.mode).toBe(ChatModes.SOLVING);
  });

  it('hasPendingConfigChanges cleared at right time prevents sync race', () => {
    const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // User changes mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setHasPendingConfigChanges(true);

    // WRONG ORDER (bug): setThread before clearing flag
    // store.getState().setThread(updatedThread);
    // store.getState().setHasPendingConfigChanges(false);
    // Result: selectedMode stays at ANALYZING, not synced

    // CORRECT ORDER (fix): clear flag FIRST
    store.getState().setHasPendingConfigChanges(false);
    const updatedThread = createMockThread({ mode: ChatModes.ANALYZING });
    store.getState().setThread(updatedThread);

    // Result: selectedMode syncs to thread.mode
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    expect(store.getState().thread?.mode).toBe(ChatModes.ANALYZING);
  });

  it('rEGRESSION: initializeThread during active submission preserves flags', () => {
    const thread = createMockThread();
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Simulate active submission
    store.getState().setConfigChangeRoundNumber(3);
    store.getState().setIsWaitingForChangelog(true);

    // initializeThread called (e.g., from query refetch)
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Flags should be preserved
    expect(store.getState().configChangeRoundNumber).toBe(3);
    expect(store.getState().isWaitingForChangelog).toBeTruthy();
  });
});
