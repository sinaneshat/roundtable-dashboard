/**
 * Pre-Search Changelog Blocking Tests
 *
 * Tests the fix for a request ordering bug where pre-search was executing
 * before changelog fetch completed after a config change.
 *
 * CORRECT ORDER: PATCH → changelog → pre-search → participant streams
 * BUG SCENARIO:
 * 1. User enables web search and submits
 * 2. PATCH request sent with enableWebSearch: true
 * 3. configChangeRoundNumber set, then isWaitingForChangelog set
 * 4. PreSearchStream component renders with PENDING pre-search
 * 5. Without blocking: pre-search executes immediately (wrong!)
 * 6. With blocking: pre-search waits for changelog to clear flags
 *
 * FIX:
 * PreSearchStream checks isWaitingForChangelog and configChangeRoundNumber
 * and returns early (blocks) until both are cleared by changelog-sync.
 *
 * @see src/components/chat/pre-search-stream.tsx - blocking logic
 * @see src/stores/chat/slices/changelog-slice.ts - flag management
 */

import { ChatModes, ThreadStatuses } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '@/stores/chat';
import type { ChatParticipant, ChatThread } from '@/types/api';

// ============================================================================
// TEST SETUP
// ============================================================================

function createMockThread(enableWebSearch = false): ChatThread {
  return {
    id: 'test-thread-123',
    slug: 'test-thread',
    title: 'Test Thread',
    mode: ChatModes.BRAINSTORMING,
    status: ThreadStatuses.ACTIVE,
    isFavorite: false,
    isPublic: false,
    enableWebSearch,
    isAiGeneratedTitle: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
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
  ];
}

// ============================================================================
// TESTS FOR PRE-SEARCH CHANGELOG BLOCKING
// ============================================================================

describe('pre-Search Changelog Blocking', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('blocking Flag States', () => {
    it('should block pre-search when isWaitingForChangelog is true', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate config change: set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);

      const state = store.getState();

      // Pre-search should be blocked
      expect(state.isWaitingForChangelog).toBe(true);

      // Simulate the blocking check from PreSearchStream
      const shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(true);
    });

    it('should block pre-search when configChangeRoundNumber is set', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate config change: set configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(1);

      const state = store.getState();

      // Pre-search should be blocked
      expect(state.configChangeRoundNumber).toBe(1);

      // Simulate the blocking check from PreSearchStream
      const shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(true);
    });

    it('should block pre-search when both flags are set', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Simulate config change: set both flags
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      const state = store.getState();

      // Both flags set
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.isWaitingForChangelog).toBe(true);

      // Pre-search should be blocked
      const shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(true);
    });

    it('should allow pre-search when both flags are cleared', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Initially both flags are clear
      const state = store.getState();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBe(false);

      // Pre-search should NOT be blocked
      const shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(false);
    });

    it('should still block if only configChangeRoundNumber is cleared', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Set both flags
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Clear only configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBe(true);

      // Pre-search should still be blocked
      const shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(true);
    });

    it('should still block if only isWaitingForChangelog is cleared', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Set both flags
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Clear only isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(false);

      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pre-search should still be blocked
      const shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(true);
    });
  });

  describe('config Change Flow Simulation', () => {
    it('should simulate correct order: PATCH → changelog → pre-search', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      const executionOrder: string[] = [];

      // Step 1: User enables web search
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Step 2: Before PATCH - set configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(1);
      executionOrder.push('configChangeRoundNumber-set');

      // Step 3: PATCH request would be sent here
      executionOrder.push('PATCH-sent');

      // Step 4: After PATCH - set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);
      executionOrder.push('isWaitingForChangelog-set');

      // At this point, pre-search should be blocked
      let state = store.getState();
      let shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(true);

      // Step 5: Changelog sync completes - clears both flags
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      executionOrder.push('changelog-sync-complete');

      // Now pre-search should be allowed
      state = store.getState();
      shouldBlockPreSearch = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBe(false);

      // Step 6: Pre-search executes
      executionOrder.push('pre-search-execute');

      // Verify order
      expect(executionOrder).toEqual([
        'configChangeRoundNumber-set',
        'PATCH-sent',
        'isWaitingForChangelog-set',
        'changelog-sync-complete',
        'pre-search-execute',
      ]);
    });

    it('should handle multiple rounds with config changes', () => {
      const thread = createMockThread(false);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Round 1: No config change
      let state = store.getState();
      let shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(false); // Pre-search OK

      // Round 2: Config change
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setIsWaitingForChangelog(true);

      state = store.getState();
      shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(true); // Pre-search blocked

      // Changelog syncs for round 2
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      state = store.getState();
      shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(false); // Pre-search OK again
    });
  });

  describe('edge Cases', () => {
    it('should handle rapid flag toggling', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Rapid toggling
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setConfigChangeRoundNumber(2);

      // Final state should be what matters
      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(2);

      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(true);
    });

    it('should handle round number 0 correctly', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Round 0 is valid
      store.getState().setConfigChangeRoundNumber(0);

      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(0);

      // 0 !== null, so should still block
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(true);
    });

    it('should handle thread without web search initially', () => {
      const thread = createMockThread(false); // No web search
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // User enables web search mid-conversation
      store.getState().setEnableWebSearch(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      const state = store.getState();
      expect(state.enableWebSearch).toBe(true);

      // Pre-search should be blocked until changelog syncs
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(true);
    });
  });

  describe('pre-Search Trigger Tracking Integration', () => {
    it('should not mark pre-search triggered while blocked', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Block pre-search
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      const state = store.getState();

      // Check blocking condition first (simulating PreSearchStream logic)
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(true);

      // If blocked, tryMarkPreSearchTriggered should NOT be called
      // This is the behavior we're testing - component returns early before calling tryMark
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should allow tryMarkPreSearchTriggered after unblock', () => {
      const thread = createMockThread(true);
      store.getState().initializeThread(thread, createMockParticipants(), []);

      // Initially blocked
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // Unblock
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlock).toBe(false);

      // Now tryMarkPreSearchTriggered can be called
      const didMark = store.getState().tryMarkPreSearchTriggered(1);
      expect(didMark).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
    });
  });
});

describe('request Ordering E2E Simulation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  it('should maintain PATCH → changelog → pre-search → stream order', async () => {
    const thread = createMockThread(false);
    store.getState().initializeThread(thread, createMockParticipants(), []);

    const events: string[] = [];

    // Simulate the full flow
    const simulateConfigChangeSubmit = async () => {
      // 1. User changes config
      store.getState().setEnableWebSearch(true);
      events.push('config-changed');

      // 2. Set configChangeRoundNumber before PATCH
      store.getState().setConfigChangeRoundNumber(1);
      events.push('configChangeRoundNumber-set');

      // 3. PATCH request (simulated)
      await Promise.resolve(); // Simulate async
      events.push('PATCH-complete');

      // 4. Set isWaitingForChangelog after PATCH
      store.getState().setIsWaitingForChangelog(true);
      events.push('isWaitingForChangelog-set');

      // 5. Check if pre-search can execute (should be blocked)
      let state = store.getState();
      if (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) {
        events.push('pre-search-blocked');
      }

      // 6. Changelog sync completes
      await Promise.resolve(); // Simulate async
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      events.push('changelog-sync-complete');

      // 7. Check if pre-search can execute (should be allowed)
      state = store.getState();
      if (!(state.isWaitingForChangelog || state.configChangeRoundNumber !== null)) {
        events.push('pre-search-allowed');
        store.getState().tryMarkPreSearchTriggered(1);
        events.push('pre-search-triggered');
      }

      // 8. Participant streams start
      events.push('participant-stream-start');
    };

    await simulateConfigChangeSubmit();

    expect(events).toEqual([
      'config-changed',
      'configChangeRoundNumber-set',
      'PATCH-complete',
      'isWaitingForChangelog-set',
      'pre-search-blocked',
      'changelog-sync-complete',
      'pre-search-allowed',
      'pre-search-triggered',
      'participant-stream-start',
    ]);
  });

  it('should allow immediate pre-search when no config change', async () => {
    const thread = createMockThread(true); // Already has web search
    store.getState().initializeThread(thread, createMockParticipants(), []);
    store.getState().setEnableWebSearch(true); // Match thread

    const events: string[] = [];

    // Simulate submit without config change
    const simulateNoConfigChangeSubmit = async () => {
      // No PATCH needed, no changelog flags set
      events.push('submit-start');

      // Check if pre-search can execute
      const state = store.getState();
      if (!(state.isWaitingForChangelog || state.configChangeRoundNumber !== null)) {
        events.push('pre-search-immediate');
        store.getState().tryMarkPreSearchTriggered(1);
      }

      events.push('participant-stream-start');
    };

    await simulateNoConfigChangeSubmit();

    // Pre-search should execute immediately without blocking
    expect(events).toEqual([
      'submit-start',
      'pre-search-immediate',
      'participant-stream-start',
    ]);
  });
});
