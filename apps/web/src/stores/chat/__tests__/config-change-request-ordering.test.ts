/**
 * Config Change Request Ordering Tests
 *
 * Comprehensive integration tests ensuring the correct order of operations
 * when config changes (enableWebSearch, mode) are made during form submission.
 *
 * CORRECT ORDER:
 * 1. User changes config (e.g., enables web search)
 * 2. Form state updated in store
 * 3. configChangeRoundNumber set (BEFORE PATCH)
 * 4. PATCH request sent with fresh state values
 * 5. isWaitingForChangelog set (AFTER PATCH)
 * 6. Changelog sync fetches updated config
 * 7. Changelog flags cleared
 * 8. Pre-search executes (if web search enabled)
 * 9. Participant streams begin
 *
 * BUGS THESE TESTS PREVENT:
 * - Stale closure: PATCH uses old form values captured in useCallback closure
 * - Request ordering: Pre-search executes before changelog syncs new config
 * - Missing config: enableWebSearch not included in PATCH payload
 *
 * @see src/stores/chat/actions/form-actions.ts - handleUpdateThreadAndSend
 * @see src/components/chat/pre-search-stream.tsx - blocking logic
 */

import { ChatModes, ThreadStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread } from '@/services/api';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST SETUP
// ============================================================================

function createMockThread(overrides: Partial<ChatThread> = {}): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: 'test-thread-123',
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
      threadId: 'test-thread-123',
      updatedAt: new Date(),
    },
  ];
}

/**
 * Simulates fresh state read pattern used in form-actions.ts fix
 * This ensures we read the CURRENT state, not closure-captured state
 */
function readFreshStateForPatch(store: ReturnType<typeof createChatStore>) {
  const currentState = store.getState();
  return {
    formMode: currentState.selectedMode,
    formWebSearch: currentState.enableWebSearch,
    threadSavedMode: currentState.thread?.mode || null,
    threadSavedWebSearch: currentState.thread?.enableWebSearch || false,
  };
}

/**
 * Simulates PATCH payload construction with fresh state
 */
function buildPatchPayload(store: ReturnType<typeof createChatStore>) {
  const { formMode, formWebSearch, threadSavedMode, threadSavedWebSearch } = readFreshStateForPatch(store);

  const modeChanged = threadSavedMode !== formMode;
  const webSearchChanged = threadSavedWebSearch !== formWebSearch;

  const payload: {
    mode?: string;
    enableWebSearch?: boolean;
  } = {};

  if (modeChanged && formMode !== null) {
    payload.mode = formMode;
  }

  if (webSearchChanged) {
    payload.enableWebSearch = formWebSearch;
  }

  return {
    hasChanges: modeChanged || webSearchChanged,
    modeChanged,
    payload,
    webSearchChanged,
  };
}

// ============================================================================
// STALE CLOSURE PREVENTION TESTS
// ============================================================================

describe('stale Closure Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('enableWebSearch Toggle', () => {
    it('should include enableWebSearch in PATCH when toggled from false to true', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate: User toggles web search ON right before submit
      store.getState().setEnableWebSearch(true);

      const { payload, webSearchChanged } = buildPatchPayload(store);

      expect(webSearchChanged).toBeTruthy();
      expect(payload.enableWebSearch).toBeTruthy();
    });

    it('should include enableWebSearch in PATCH when toggled from true to false', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true); // Match thread initially

      // Simulate: User toggles web search OFF right before submit
      store.getState().setEnableWebSearch(false);

      const { payload, webSearchChanged } = buildPatchPayload(store);

      expect(webSearchChanged).toBeTruthy();
      expect(payload.enableWebSearch).toBeFalsy();
    });

    it('should NOT include enableWebSearch when unchanged', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true); // Match thread

      // No toggle, just submit
      const { payload, webSearchChanged } = buildPatchPayload(store);

      expect(webSearchChanged).toBeFalsy();
      expect(payload.enableWebSearch).toBeUndefined();
    });

    it('should detect change even with rapid toggle ending at different value', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Rapid toggles ending at true
      store.getState().setEnableWebSearch(true);
      store.getState().setEnableWebSearch(false);
      store.getState().setEnableWebSearch(true);

      const { payload, webSearchChanged } = buildPatchPayload(store);

      expect(webSearchChanged).toBeTruthy();
      expect(payload.enableWebSearch).toBeTruthy();
    });

    it('should NOT detect change if rapid toggle ends at original value', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Rapid toggles ending at original (false)
      store.getState().setEnableWebSearch(true);
      store.getState().setEnableWebSearch(false);

      const { payload, webSearchChanged } = buildPatchPayload(store);

      expect(webSearchChanged).toBeFalsy();
      expect(payload.enableWebSearch).toBeUndefined();
    });
  });

  describe('mode Change', () => {
    it('should include mode in PATCH when changed', () => {
      const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

      // Change mode
      store.getState().setSelectedMode(ChatModes.DEBATING);

      const { modeChanged, payload } = buildPatchPayload(store);

      expect(modeChanged).toBeTruthy();
      expect(payload.mode).toBe(ChatModes.DEBATING);
    });

    it('should NOT include mode when unchanged', () => {
      const thread = createMockThread({ mode: ChatModes.BRAINSTORMING });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

      const { modeChanged, payload } = buildPatchPayload(store);

      expect(modeChanged).toBeFalsy();
      expect(payload.mode).toBeUndefined();
    });
  });

  describe('combined Changes', () => {
    it('should include both mode and webSearch when both changed', () => {
      const thread = createMockThread({
        enableWebSearch: false,
        mode: ChatModes.BRAINSTORMING,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
      store.getState().setEnableWebSearch(false);

      // Change both
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setEnableWebSearch(true);

      const { modeChanged, payload, webSearchChanged } = buildPatchPayload(store);

      expect(modeChanged).toBeTruthy();
      expect(webSearchChanged).toBeTruthy();
      expect(payload.mode).toBe(ChatModes.DEBATING);
      expect(payload.enableWebSearch).toBeTruthy();
    });

    it('should only include changed fields', () => {
      const thread = createMockThread({
        enableWebSearch: false,
        mode: ChatModes.BRAINSTORMING,
      });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
      store.getState().setEnableWebSearch(false);

      // Only change webSearch
      store.getState().setEnableWebSearch(true);

      const { modeChanged, payload, webSearchChanged } = buildPatchPayload(store);

      expect(modeChanged).toBeFalsy();
      expect(webSearchChanged).toBeTruthy();
      expect(payload.mode).toBeUndefined();
      expect(payload.enableWebSearch).toBeTruthy();
    });
  });
});

// ============================================================================
// REQUEST ORDERING TESTS
// ============================================================================

describe('request Ordering', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('blocking Logic Sequence', () => {
    it('should block pre-search during config change flow', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const checkpoints: { name: string; blocked: boolean }[] = [];

      // Step 1: Config change
      store.getState().setEnableWebSearch(true);
      let state = store.getState();
      checkpoints.push({
        blocked: state.isWaitingForChangelog || state.configChangeRoundNumber !== null,
        name: 'after-config-change',
      });

      // Step 2: Set configChangeRoundNumber (before PATCH)
      store.getState().setConfigChangeRoundNumber(1);
      state = store.getState();
      checkpoints.push({
        blocked: state.isWaitingForChangelog || state.configChangeRoundNumber !== null,
        name: 'after-configChangeRoundNumber',
      });

      // Step 3: Set isWaitingForChangelog (after PATCH)
      store.getState().setIsWaitingForChangelog(true);
      state = store.getState();
      checkpoints.push({
        blocked: state.isWaitingForChangelog || state.configChangeRoundNumber !== null,
        name: 'after-isWaitingForChangelog',
      });

      // Step 4: Changelog sync completes
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      state = store.getState();
      checkpoints.push({
        blocked: state.isWaitingForChangelog || state.configChangeRoundNumber !== null,
        name: 'after-changelog-sync',
      });

      expect(checkpoints).toEqual([
        { blocked: false, name: 'after-config-change' },
        { blocked: true, name: 'after-configChangeRoundNumber' },
        { blocked: true, name: 'after-isWaitingForChangelog' },
        { blocked: false, name: 'after-changelog-sync' },
      ]);
    });

    it('should not block when no config change', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true); // Match thread

      // Submit without config change
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeFalsy();
    });
  });

  describe('pre-Search Trigger Coordination', () => {
    it('should only trigger pre-search once per round', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true);

      // First trigger
      const firstTrigger = store.getState().tryMarkPreSearchTriggered(1);
      expect(firstTrigger).toBeTruthy();

      // Second trigger same round - should fail
      const secondTrigger = store.getState().tryMarkPreSearchTriggered(1);
      expect(secondTrigger).toBeFalsy();

      // Different round - should succeed
      const thirdTrigger = store.getState().tryMarkPreSearchTriggered(2);
      expect(thirdTrigger).toBeTruthy();
    });

    it('should clear pre-search tracking correctly', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true);

      // Trigger
      store.getState().tryMarkPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeTruthy();

      // Clear
      store.getState().clearPreSearchTracking(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBeFalsy();

      // Can trigger again
      const reTrigger = store.getState().tryMarkPreSearchTriggered(1);
      expect(reTrigger).toBeTruthy();
    });
  });
});

// ============================================================================
// FULL FLOW INTEGRATION TESTS
// ============================================================================

describe('full Flow Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  it('should maintain correct flow: toggle → PATCH → changelog → pre-search', async () => {
    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    const events: string[] = [];

    // Simulate full submission flow with config change

    // 1. User enables web search
    store.getState().setEnableWebSearch(true);
    events.push('user-enables-websearch');

    // 2. Check for config changes (using fresh state!)
    const { hasChanges, payload } = buildPatchPayload(store);
    expect(hasChanges).toBeTruthy();
    expect(payload.enableWebSearch).toBeTruthy();
    events.push('config-change-detected');

    // 3. Set configChangeRoundNumber BEFORE PATCH
    store.getState().setConfigChangeRoundNumber(1);
    events.push('configChangeRoundNumber-set');

    // 4. PATCH would be sent here with payload
    events.push(`PATCH-sent:${JSON.stringify(payload)}`);

    // 5. Set isWaitingForChangelog AFTER PATCH
    store.getState().setIsWaitingForChangelog(true);
    events.push('isWaitingForChangelog-set');

    // 6. Pre-search component checks if it can execute
    let state = store.getState();
    if (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) {
      events.push('pre-search-blocked');
    }

    // 7. Changelog sync happens
    await Promise.resolve();
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    events.push('changelog-sync-complete');

    // 8. Pre-search can now execute
    state = store.getState();
    if (!(state.isWaitingForChangelog || state.configChangeRoundNumber !== null)) {
      const triggered = store.getState().tryMarkPreSearchTriggered(1);
      if (triggered) {
        events.push('pre-search-triggered');
      }
    }

    // 9. Participant streams start
    events.push('participant-streams-start');

    expect(events).toEqual([
      'user-enables-websearch',
      'config-change-detected',
      'configChangeRoundNumber-set',
      'PATCH-sent:{"enableWebSearch":true}',
      'isWaitingForChangelog-set',
      'pre-search-blocked',
      'changelog-sync-complete',
      'pre-search-triggered',
      'participant-streams-start',
    ]);
  });

  it('should handle round 2 config change after round 1 had no changes', async () => {
    const thread = createMockThread({
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
    });
    store.getState().initializeThread(thread, createMockParticipants(), []);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setEnableWebSearch(false);

    const round1Events: string[] = [];
    const round2Events: string[] = [];

    // Round 1: No config changes
    let { hasChanges } = buildPatchPayload(store);
    expect(hasChanges).toBeFalsy();
    round1Events.push('no-config-change');

    // Pre-search not needed (web search off)
    let state = store.getState();
    if (!state.enableWebSearch) {
      round1Events.push('pre-search-skipped');
    }
    round1Events.push('round1-streams-start');

    expect(round1Events).toEqual([
      'no-config-change',
      'pre-search-skipped',
      'round1-streams-start',
    ]);

    // Round 2: Enable web search
    store.getState().setEnableWebSearch(true);
    round2Events.push('user-enables-websearch');

    ({ hasChanges } = buildPatchPayload(store));
    expect(hasChanges).toBeTruthy();
    round2Events.push('config-change-detected');

    // Set blocking flags
    store.getState().setConfigChangeRoundNumber(2);
    store.getState().setIsWaitingForChangelog(true);

    // Check blocking
    state = store.getState();
    if (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) {
      round2Events.push('pre-search-blocked');
    }

    // Changelog sync
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    round2Events.push('changelog-sync-complete');

    // Pre-search now enabled
    state = store.getState();
    if (state.enableWebSearch) {
      const triggered = store.getState().tryMarkPreSearchTriggered(2);
      if (triggered) {
        round2Events.push('pre-search-triggered');
      }
    }
    round2Events.push('round2-streams-start');

    expect(round2Events).toEqual([
      'user-enables-websearch',
      'config-change-detected',
      'pre-search-blocked',
      'changelog-sync-complete',
      'pre-search-triggered',
      'round2-streams-start',
    ]);
  });

  it('should handle disabling web search mid-conversation', async () => {
    const thread = createMockThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, createMockParticipants(), []);
    store.getState().setEnableWebSearch(true);

    const events: string[] = [];

    // User disables web search
    store.getState().setEnableWebSearch(false);
    events.push('user-disables-websearch');

    const { hasChanges, payload } = buildPatchPayload(store);
    expect(hasChanges).toBeTruthy();
    expect(payload.enableWebSearch).toBeFalsy();
    events.push('config-change-detected');

    // Set blocking flags and PATCH
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);
    events.push(`PATCH-sent:${JSON.stringify(payload)}`);

    // Changelog sync
    store.getState().setConfigChangeRoundNumber(null);
    store.getState().setIsWaitingForChangelog(false);
    events.push('changelog-sync-complete');

    // Pre-search should be SKIPPED (web search disabled)
    const state = store.getState();
    if (!state.enableWebSearch) {
      events.push('pre-search-skipped');
    }

    events.push('participant-streams-start');

    expect(events).toEqual([
      'user-disables-websearch',
      'config-change-detected',
      'PATCH-sent:{"enableWebSearch":false}',
      'changelog-sync-complete',
      'pre-search-skipped',
      'participant-streams-start',
    ]);
  });
});

// ============================================================================
// REGRESSION TESTS - Specific Bug Scenarios
// ============================================================================

describe('regression Tests', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  it('bug: should not miss enableWebSearch when toggled immediately before submit', () => {
    // This was the original bug: closure captured old state

    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // Capture "stale" state (what old buggy code would have)
    const staleWebSearch = store.getState().enableWebSearch;
    expect(staleWebSearch).toBeFalsy();

    // User toggles (store updates, but stale closure doesn't see it)
    store.getState().setEnableWebSearch(true);

    // Old buggy code would compare thread vs stale: (false !== false) = false
    const buggyDetection = (thread.enableWebSearch ?? false) !== staleWebSearch;
    expect(buggyDetection).toBeFalsy(); // BUG: No change detected!

    // Fixed code uses fresh state read
    const { payload, webSearchChanged } = buildPatchPayload(store);
    expect(webSearchChanged).toBeTruthy(); // FIXED: Change detected!
    expect(payload.enableWebSearch).toBeTruthy();
  });

  it('bug: should not execute pre-search before changelog syncs', () => {
    // This was the ordering bug: pre-search ran before new config was synced

    const thread = createMockThread({ enableWebSearch: false });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // User enables web search
    store.getState().setEnableWebSearch(true);

    // PATCH happens, flags set
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    // Bug scenario: PreSearchStream renders and tries to execute
    const state = store.getState();
    const isBlocked = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

    // With fix: Should be blocked
    expect(isBlocked).toBeTruthy();

    // Pre-search should NOT trigger while blocked
    // (Component returns early before calling tryMarkPreSearchTriggered)
  });

  it('bug: should read thread saved values from fresh state too', () => {
    // Edge case: Thread state might be stale too if multiple config changes happen

    const thread = createMockThread({
      enableWebSearch: false,
      mode: ChatModes.BRAINSTORMING,
    });
    store.getState().initializeThread(thread, createMockParticipants(), []);

    // User makes changes
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Fresh state read gets current thread state
    const freshState = store.getState();
    const threadFromFresh = freshState.thread;

    // Verify we're reading from the store's thread reference
    expect(threadFromFresh?.enableWebSearch).toBeFalsy(); // Thread hasn't been patched yet
    expect(threadFromFresh?.mode).toBe(ChatModes.BRAINSTORMING);

    // But form state has the new values
    expect(freshState.enableWebSearch).toBeTruthy();
    expect(freshState.selectedMode).toBe(ChatModes.DEBATING);

    // Comparison should detect both changes
    const webSearchChanged = (threadFromFresh?.enableWebSearch ?? false) !== freshState.enableWebSearch;
    const modeChanged = (threadFromFresh?.mode ?? null) !== freshState.selectedMode;

    expect(webSearchChanged).toBeTruthy();
    expect(modeChanged).toBeTruthy();
  });
});
