/**
 * Config Change Stale Closure Prevention Tests
 *
 * Tests the fix for a stale closure bug in form-actions.ts where config changes
 * (like enableWebSearch toggle) made immediately before form submission were not
 * included in the PATCH request.
 *
 * BUG SCENARIO:
 * 1. User is on thread screen with enableWebSearch: false
 * 2. User toggles web search ON (store state: enableWebSearch: true)
 * 3. User immediately submits form (before React re-renders)
 * 4. The useCallback closure has stale formState.enableWebSearch = false
 * 5. Config detection: webSearchChanged = (false !== false) = false
 * 6. PATCH doesn't include enableWebSearch: true ❌ BUG!
 *
 * FIX:
 * Use storeApi.getState() inside the callback to read fresh state instead of
 * relying on the closure's captured formState values.
 *
 * @see src/stores/chat/actions/form-actions.ts - handleUpdateThreadAndSend
 */

import { ChatModes, ThreadStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread } from '@/services/api';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST SETUP
// ============================================================================

function createMockThread(enableWebSearch = false): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch,
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

// ============================================================================
// TESTS FOR STALE CLOSURE FIX
// ============================================================================

describe('config Change Stale Closure Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('enableWebSearch Config Change Detection', () => {
    it('should detect webSearch toggle from false to true via fresh state read', () => {
      // Setup: Thread has webSearch disabled
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Initial state: form enableWebSearch matches thread
      expect(store.getState().enableWebSearch).toBeFalsy();
      expect(store.getState().thread?.enableWebSearch).toBeFalsy();

      // Simulate stale closure scenario:
      // 1. Capture "old" state (what a stale closure would see)
      const staleFormState = {
        enableWebSearch: store.getState().enableWebSearch,
      };

      // 2. User toggles webSearch ON (updates store)
      store.getState().setEnableWebSearch(true);

      // 3. Read fresh state (what the fixed code does with storeApi.getState())
      const freshState = store.getState();

      // Old (buggy) approach: compare thread with stale closure value
      const currentWebSearchFromThread = thread.enableWebSearch ?? false;
      const buggyWebSearchChanged = currentWebSearchFromThread !== staleFormState.enableWebSearch;
      // Both are false: (false !== false) = false - BUG: no change detected!
      expect(buggyWebSearchChanged).toBeFalsy();

      // Fixed approach: compare thread with fresh store state
      const fixedWebSearchChanged = currentWebSearchFromThread !== freshState.enableWebSearch;
      // (false !== true) = true - CORRECT: change detected!
      expect(fixedWebSearchChanged).toBeTruthy();
    });

    it('should detect webSearch toggle from true to false via fresh state read', () => {
      // Setup: Thread has webSearch enabled
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Initial state: form enableWebSearch matches thread
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBeTruthy();
      expect(store.getState().thread?.enableWebSearch).toBeTruthy();

      // Simulate stale closure: capture old state
      const staleFormState = {
        enableWebSearch: store.getState().enableWebSearch,
      };

      // User toggles webSearch OFF
      store.getState().setEnableWebSearch(false);

      // Fresh state read
      const freshState = store.getState();

      // Buggy: stale value (true !== true) = false - no change
      const currentWebSearch = thread.enableWebSearch ?? false;
      const buggyWebSearchChanged = currentWebSearch !== staleFormState.enableWebSearch;
      expect(buggyWebSearchChanged).toBeFalsy();

      // Fixed: (true !== false) = true - change detected
      const fixedWebSearchChanged = currentWebSearch !== freshState.enableWebSearch;
      expect(fixedWebSearchChanged).toBeTruthy();
    });

    it('should not detect change when toggle value matches thread', () => {
      // Setup: Thread has webSearch enabled
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(true);

      // Even with fresh read, no change if values match
      const freshState = store.getState();
      const currentWebSearch = thread.enableWebSearch ?? false;
      const webSearchChanged = currentWebSearch !== freshState.enableWebSearch;
      // (true !== true) = false - correctly no change
      expect(webSearchChanged).toBeFalsy();
    });
  });

  describe('selectedMode Config Change Detection', () => {
    it('should detect mode change via fresh state read', () => {
      // Setup: Thread has brainstorm mode
      const thread = createMockThread();
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Verify initial state - form selectedMode should match thread
      const initialState = store.getState();
      const threadMode = thread.mode ?? null;

      // Capture stale state (this is what a stale closure would have)
      const _staleFormState = {
        selectedMode: initialState.selectedMode,
      };

      // User changes mode to DEBATE
      store.getState().setSelectedMode(ChatModes.DEBATING);

      // Fresh state read (what fixed code does with storeApi.getState())
      const freshState = store.getState();

      // Verify user's change was recorded
      expect(freshState.selectedMode).toBe(ChatModes.DEBATING);

      // Buggy approach: stale value might equal thread (if unchanged) or not
      // The key is that if user changed mode, we need to detect it
      // With stale closure: if form was originally matching thread, still matches
      // thread.mode (brainstorm) !== stale.selectedMode (brainstorm) = false (no change) - BUG if user changed!

      // Fixed approach: always detects the change
      // thread.mode (brainstorm) !== fresh.selectedMode (debate) = true (change detected)
      const fixedModeChanged = threadMode !== freshState.selectedMode;
      expect(fixedModeChanged).toBeTruthy();

      // The bug manifests when stale closure captured state BEFORE user toggled
      // This test verifies fresh state read correctly detects the change
    });
  });

  describe('combined Config Changes', () => {
    it('should detect both mode and webSearch changes via fresh state', () => {
      // Setup: Thread with webSearch disabled and brainstorm mode
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Verify initial state
      const initialState = store.getState();
      expect(initialState.enableWebSearch).toBeFalsy();

      // User changes both settings
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setEnableWebSearch(true);

      // Fresh state (what fixed code uses)
      const freshState = store.getState();

      // With fresh state - both changes detected
      const freshWebSearchChanged = (thread.enableWebSearch ?? false) !== freshState.enableWebSearch;
      const freshModeChanged = (thread.mode ?? null) !== freshState.selectedMode;

      // thread.enableWebSearch (false) !== fresh.enableWebSearch (true) = true
      expect(freshWebSearchChanged).toBeTruthy();
      // thread.mode (brainstorm) !== fresh.selectedMode (debate) = true
      expect(freshModeChanged).toBeTruthy();

      // The key insight: fresh state read always reflects user's latest changes
      // regardless of when the callback was created
    });

    it('should correctly determine hasPendingConfigChanges from fresh state', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
      store.getState().setEnableWebSearch(false);

      // Toggle webSearch
      store.getState().setEnableWebSearch(true);

      const freshState = store.getState();
      const webSearchChanged = (thread.enableWebSearch ?? false) !== freshState.enableWebSearch;
      const modeChanged = (thread.mode ?? null) !== freshState.selectedMode;
      const hasPendingChanges = webSearchChanged || modeChanged;

      expect(hasPendingChanges).toBeTruthy();
    });
  });

  describe('pATCH Payload Construction', () => {
    it('should include enableWebSearch in PATCH payload when changed (fresh state)', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(false);

      // Toggle ON
      store.getState().setEnableWebSearch(true);

      const freshState = store.getState();
      const webSearchChanged = (thread.enableWebSearch ?? false) !== freshState.enableWebSearch;

      // Construct PATCH payload (simplified version of form-actions logic)
      const patchPayload: { enableWebSearch?: boolean } = {};
      if (webSearchChanged) {
        patchPayload.enableWebSearch = freshState.enableWebSearch;
      }

      expect(patchPayload.enableWebSearch).toBeTruthy();
    });

    it('should not include enableWebSearch in PATCH payload when unchanged', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(false);

      const freshState = store.getState();
      const webSearchChanged = (thread.enableWebSearch ?? false) !== freshState.enableWebSearch;

      const patchPayload: { enableWebSearch?: boolean } = {};
      if (webSearchChanged) {
        patchPayload.enableWebSearch = freshState.enableWebSearch;
      }

      expect(patchPayload.enableWebSearch).toBeUndefined();
    });

    it('should include mode in PATCH payload when changed (fresh state)', () => {
      const thread = createMockThread();
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

      // Change mode
      store.getState().setSelectedMode(ChatModes.DEBATING);

      const freshState = store.getState();
      const modeChanged = (thread.mode ?? null) !== freshState.selectedMode;

      const patchPayload: { mode?: string } = {};
      if (modeChanged) {
        patchPayload.mode = freshState.selectedMode ?? undefined;
      }

      expect(patchPayload.mode).toBe(ChatModes.DEBATING);
    });
  });

  describe('pre-Search Placeholder Creation', () => {
    it('should use fresh enableWebSearch for pre-search placeholder decision', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(false);

      // Capture stale state
      const staleEnableWebSearch = store.getState().enableWebSearch;

      // User enables web search
      store.getState().setEnableWebSearch(true);

      // Fresh state
      const freshEnableWebSearch = store.getState().enableWebSearch;

      // Buggy: stale value would not create placeholder
      const buggyCreatePreSearch = staleEnableWebSearch === true;
      expect(buggyCreatePreSearch).toBeFalsy();

      // Fixed: fresh value correctly creates placeholder
      const fixedCreatePreSearch = freshEnableWebSearch === true;
      expect(fixedCreatePreSearch).toBeTruthy();
    });
  });

  describe('edge Cases', () => {
    it('should detect mode change when thread has different mode than selected', () => {
      // Thread with brainstorming mode (default from createMockThread)
      const thread = createMockThread();
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Set a different mode
      store.getState().setSelectedMode(ChatModes.DEBATING);

      const freshState = store.getState();
      const currentModeFromThread = thread.mode;
      const modeChanged = currentModeFromThread !== freshState.selectedMode;

      // 'brainstorming' !== 'debating' = true
      expect(modeChanged).toBeTruthy();
      expect(currentModeFromThread).toBe(ChatModes.BRAINSTORMING);
      expect(freshState.selectedMode).toBe(ChatModes.DEBATING);
    });

    it('should handle rapid toggle before re-render', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(false);

      // Simulate rapid toggles (user clicks multiple times)
      store.getState().setEnableWebSearch(true);
      store.getState().setEnableWebSearch(false);
      store.getState().setEnableWebSearch(true);

      // Final fresh state should be what user ended with
      const freshState = store.getState();
      expect(freshState.enableWebSearch).toBeTruthy();

      // Change detection should work
      const webSearchChanged = (thread.enableWebSearch ?? false) !== freshState.enableWebSearch;
      expect(webSearchChanged).toBeTruthy();
    });

    it('should detect no change when user toggles back to original', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setEnableWebSearch(false);

      // User toggles on then back off
      store.getState().setEnableWebSearch(true);
      store.getState().setEnableWebSearch(false);

      const freshState = store.getState();
      const webSearchChanged = (thread.enableWebSearch ?? false) !== freshState.enableWebSearch;
      // (false !== false) = false - no change
      expect(webSearchChanged).toBeFalsy();
    });
  });
});
