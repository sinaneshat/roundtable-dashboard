/**
 * NAVIGATION STATE RESET BUG TESTS
 *
 * CRITICAL BUG DESCRIPTION:
 * When navigating from /chat/[slug] to /chat overview and then starting a new thread,
 * the store state doesn't properly reset, causing:
 * - waitingToStartStreaming flag remains true (blocks streaming)
 * - triggeredPreSearchRounds Set retains old round numbers (blocks pre-search)
 * - createdAnalysisRounds Set retains old round numbers (blocks analysis creation)
 * - isWaitingForChangelog flag remains true
 * - Pre-search orchestration doesn't trigger properly
 *
 * EXPECTED BEHAVIOR:
 * - resetToOverview() should clear ALL state when navigating to /chat
 * - resetThreadState() should clear flags/Sets when switching threads
 * - resetToNewChat() should clear ALL state including tracking Sets
 *
 * CURRENT BUG:
 * - Tracking Sets (triggeredPreSearchRounds, createdAnalysisRounds) NOT cleared
 * - waitingToStartStreaming flag NOT cleared
 * - isWaitingForChangelog flag NOT cleared
 * - Streaming flags persist across navigation
 *
 * REPRODUCTION FLOW:
 * 1. Complete round 0 on thread A (web search enabled)
 * 2. Navigate to /chat overview
 * 3. Start new thread B
 * 4. BUG: triggeredPreSearchRounds still has Set([0])
 * 5. BUG: Pre-search for round 0 on thread B doesn't trigger
 * 6. BUG: Conversation stops after accordion finishes
 *
 * FILES UNDER TEST:
 * - src/stores/chat/store.ts (resetThreadState, resetToOverview)
 * - src/stores/chat/store-defaults.ts (THREAD_RESET_STATE, COMPLETE_RESET_STATE)
 * - src/components/providers/chat-store-provider.tsx (navigation cleanup)
 *
 * @see store-defaults.ts:210-234 THREAD_RESET_STATE (missing Sets reset)
 * @see store-defaults.ts:151-202 COMPLETE_RESET_STATE (missing Sets reset)
 * @see store.ts:696-700 resetToOverview (uses COMPLETE_RESET_STATE)
 * @see store.ts:781-794 resetToNewChat (manually creates new Sets but other resets don't)
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { AnalysisStatuses } from '@/api/core/enums';
import { createMockPreSearch, createMockThread } from '@/lib/testing';
import { createChatStore } from '@/stores/chat';

import type { ChatStore } from '../../../stores/chat/store';

describe('navigation State Reset Bugs', () => {
  let store: ReturnType<typeof createChatStore>;
  let getState: () => ChatStore;

  beforeEach(() => {
    store = createChatStore();
    getState = store.getState;
  });

  // ==========================================================================
  // BUG 1: waitingToStartStreaming NOT CLEARED
  // ==========================================================================
  describe('bUG: waitingToStartStreaming flag not cleared', () => {
    it('should clear waitingToStartStreaming when navigating to overview', () => {
      // ARRANGE: Set flag as if streaming is about to start
      getState().setWaitingToStartStreaming(true);
      expect(getState().waitingToStartStreaming).toBe(true);

      // ACT: Navigate to overview (user clicks logo or "New Chat")
      getState().resetToOverview();

      // ASSERT: Flag should be cleared
      // 🚨 THIS WILL FAIL - waitingToStartStreaming NOT in COMPLETE_RESET_STATE
      expect(getState().waitingToStartStreaming).toBe(false);
    });

    it('should clear waitingToStartStreaming when switching threads', () => {
      // ARRANGE: Set flag on thread A
      getState().setWaitingToStartStreaming(true);
      expect(getState().waitingToStartStreaming).toBe(true);

      // ACT: Switch to thread B
      getState().resetThreadState();

      // ASSERT: Flag should be cleared
      // 🚨 THIS WILL FAIL - waitingToStartStreaming NOT in THREAD_RESET_STATE
      expect(getState().waitingToStartStreaming).toBe(false);
    });

    it('should allow streaming on new thread after overview navigation', () => {
      // ARRANGE: Complete workflow on thread A
      getState().setWaitingToStartStreaming(true);
      getState().setIsStreaming(true);

      // Simulate participants streaming
      expect(getState().isStreaming).toBe(true);

      // Complete streaming
      getState().setIsStreaming(false);
      expect(getState().waitingToStartStreaming).toBe(true); // BUG: Still waiting

      // ACT: Navigate to overview and start new thread
      getState().resetToOverview();

      // ASSERT: New thread should have clean state (no blocking flags)
      // 🚨 THIS WILL FAIL - waitingToStartStreaming still true from thread A
      expect(getState().waitingToStartStreaming).toBe(false);
    });
  });

  // ==========================================================================
  // BUG 2: triggeredPreSearchRounds Set NOT CLEARED
  // ==========================================================================
  describe('bUG: triggeredPreSearchRounds Set not cleared', () => {
    it('should clear triggeredPreSearchRounds Set when navigating to overview', () => {
      // ARRANGE: Mark round 0 and round 1 as having triggered pre-search
      getState().markPreSearchTriggered(0);
      getState().markPreSearchTriggered(1);
      getState().markPreSearchTriggered(2);

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(true);

      // ACT: Navigate to overview
      getState().resetToOverview();

      // ASSERT: Set should be empty (allows pre-search to trigger on new thread)
      // 🚨 THIS WILL FAIL - triggeredPreSearchRounds NOT in COMPLETE_RESET_STATE
      // COMPLETE_RESET_STATE uses TRACKING_DEFAULTS which has new Set() but set() doesn't create new instance
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(2)).toBe(false);
    });

    it('should clear triggeredPreSearchRounds when switching threads', () => {
      // ARRANGE: Trigger pre-search on thread A for rounds 0, 1
      getState().markPreSearchTriggered(0);
      getState().markPreSearchTriggered(1);

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // ACT: Switch to thread B
      getState().resetThreadState();

      // ASSERT: Set should be cleared for thread B
      // 🚨 THIS WILL FAIL - triggeredPreSearchRounds NOT in THREAD_RESET_STATE
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should allow pre-search to trigger on new thread after navigation', () => {
      // ARRANGE: Thread A completes round 0 with pre-search
      const threadA = createMockThread({ id: 'thread-a', enableWebSearch: true });
      getState().setThread(threadA);

      // Mark pre-search triggered for round 0
      getState().markPreSearchTriggered(0);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // ACT: Navigate to overview and prepare thread B
      getState().resetToOverview();

      const threadB = createMockThread({ id: 'thread-b', enableWebSearch: true });
      getState().setThread(threadB);

      // ASSERT: Pre-search should be triggerable for round 0 on thread B
      // 🚨 THIS WILL FAIL - Set still contains 0 from thread A
      // This causes pre-search orchestration to skip because it thinks it already triggered
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);
    });

    it('should handle multi-round scenario across navigation', () => {
      // ARRANGE: Thread A has 3 rounds of pre-search triggered
      getState().markPreSearchTriggered(0);
      getState().markPreSearchTriggered(1);
      getState().markPreSearchTriggered(2);

      // Verify all marked
      expect(getState().triggeredPreSearchRounds.size).toBe(3);

      // ACT: Navigate away and back
      getState().resetToOverview();

      // ASSERT: Set should be completely empty
      // 🚨 THIS WILL FAIL - Set still has 3 entries
      expect(getState().triggeredPreSearchRounds.size).toBe(0);
    });
  });

  // ==========================================================================
  // BUG 3: createdAnalysisRounds Set NOT CLEARED
  // ==========================================================================
  describe('bUG: createdAnalysisRounds Set not cleared', () => {
    it('should clear createdAnalysisRounds Set when navigating to overview', () => {
      // ARRANGE: Mark analyses created for rounds 0, 1, 2
      getState().markAnalysisCreated(0);
      getState().markAnalysisCreated(1);
      getState().markAnalysisCreated(2);

      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(getState().hasAnalysisBeenCreated(1)).toBe(true);
      expect(getState().hasAnalysisBeenCreated(2)).toBe(true);

      // ACT: Navigate to overview
      getState().resetToOverview();

      // ASSERT: Set should be empty (allows analysis creation on new thread)
      // 🚨 THIS WILL FAIL - createdAnalysisRounds NOT in COMPLETE_RESET_STATE
      expect(getState().hasAnalysisBeenCreated(0)).toBe(false);
      expect(getState().hasAnalysisBeenCreated(1)).toBe(false);
      expect(getState().hasAnalysisBeenCreated(2)).toBe(false);
    });

    it('should clear createdAnalysisRounds when switching threads', () => {
      // ARRANGE: Create analyses on thread A
      getState().markAnalysisCreated(0);
      getState().markAnalysisCreated(1);

      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(getState().hasAnalysisBeenCreated(1)).toBe(true);

      // ACT: Switch to thread B
      getState().resetThreadState();

      // ASSERT: Set should be cleared for thread B
      // 🚨 THIS WILL FAIL - createdAnalysisRounds NOT in THREAD_RESET_STATE
      expect(getState().hasAnalysisBeenCreated(0)).toBe(false);
      expect(getState().hasAnalysisBeenCreated(1)).toBe(false);
    });

    it('should allow analysis creation on new thread after navigation', () => {
      // ARRANGE: Thread A has analysis created for round 0
      getState().markAnalysisCreated(0);
      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);

      // ACT: Navigate to overview and start new thread
      getState().resetToOverview();

      // ASSERT: Analysis should be creatable for round 0 on new thread
      // 🚨 THIS WILL FAIL - Set still contains 0 from thread A
      // This prevents analysis creation on new thread (thinks it already exists)
      expect(getState().hasAnalysisBeenCreated(0)).toBe(false);
    });
  });

  // ==========================================================================
  // BUG 4: isWaitingForChangelog NOT CLEARED
  // ==========================================================================
  describe('bUG: isWaitingForChangelog flag not cleared', () => {
    it('should clear isWaitingForChangelog when navigating to overview', () => {
      // ARRANGE: Set flag (waiting for participant changes to sync)
      getState().setIsWaitingForChangelog(true);
      expect(getState().isWaitingForChangelog).toBe(true);

      // ACT: Navigate to overview
      getState().resetToOverview();

      // ASSERT: Flag should be cleared
      // ✅ THIS SHOULD PASS - isWaitingForChangelog IS in COMPLETE_RESET_STATE (FLAGS_DEFAULTS)
      expect(getState().isWaitingForChangelog).toBe(false);
    });

    it('should clear isWaitingForChangelog when switching threads', () => {
      // ARRANGE: Set flag on thread A
      getState().setIsWaitingForChangelog(true);
      expect(getState().isWaitingForChangelog).toBe(true);

      // ACT: Switch to thread B
      getState().resetThreadState();

      // ASSERT: Flag should be cleared
      // ✅ THIS SHOULD PASS - isWaitingForChangelog IS in THREAD_RESET_STATE
      expect(getState().isWaitingForChangelog).toBe(false);
    });
  });

  // ==========================================================================
  // BUG 5: STREAMING FLAGS NOT CLEARED
  // ==========================================================================
  describe('bUG: streaming flags not cleared on navigation', () => {
    it('should clear all streaming flags when navigating to overview', () => {
      // ARRANGE: Set multiple streaming flags
      getState().setIsStreaming(true);
      getState().setIsRegenerating(true);
      getState().setIsCreatingAnalysis(true);
      getState().setStreamingRoundNumber(2);
      getState().setRegeneratingRoundNumber(1);

      // Verify flags are set
      expect(getState().isStreaming).toBe(true);
      expect(getState().isRegenerating).toBe(true);
      expect(getState().isCreatingAnalysis).toBe(true);
      expect(getState().streamingRoundNumber).toBe(2);
      expect(getState().regeneratingRoundNumber).toBe(1);

      // ACT: Navigate to overview
      getState().resetToOverview();

      // ASSERT: All flags should be cleared
      // ✅ THESE SHOULD PASS - flags ARE in COMPLETE_RESET_STATE
      expect(getState().isStreaming).toBe(false);
      expect(getState().isRegenerating).toBe(false);
      expect(getState().isCreatingAnalysis).toBe(false);
      expect(getState().streamingRoundNumber).toBe(null);
      expect(getState().regeneratingRoundNumber).toBe(null);
    });

    it('should clear streaming flags when switching between threads', () => {
      // ARRANGE: Streaming on thread A
      getState().setIsStreaming(true);
      getState().setStreamingRoundNumber(1);

      expect(getState().isStreaming).toBe(true);
      expect(getState().streamingRoundNumber).toBe(1);

      // ACT: Switch to thread B
      getState().resetThreadState();

      // ASSERT: Streaming flags cleared
      // ✅ THESE SHOULD PASS - flags ARE in THREAD_RESET_STATE
      expect(getState().isStreaming).toBe(false);
      expect(getState().streamingRoundNumber).toBe(null);
    });
  });

  // ==========================================================================
  // BUG 6: PRE-SEARCH STATE NOT CLEARED (Arrays stay populated)
  // ==========================================================================
  describe('bUG: pre-search state not properly reset', () => {
    it('should clear preSearches array when navigating to overview', () => {
      // ARRANGE: Add pre-searches for thread A
      const preSearch0 = createMockPreSearch({
        id: 'search-0',
        threadId: 'thread-a',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Question 0',
      });

      const preSearch1 = createMockPreSearch({
        id: 'search-1',
        threadId: 'thread-a',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        userQuery: 'Question 1',
      });

      getState().addPreSearch(preSearch0);
      getState().addPreSearch(preSearch1);

      expect(getState().preSearches).toHaveLength(2);

      // ACT: Navigate to overview
      getState().resetToOverview();

      // ASSERT: preSearches should be empty array
      // ✅ THIS SHOULD PASS - preSearches IS in COMPLETE_RESET_STATE (PRESEARCH_DEFAULTS)
      expect(getState().preSearches).toHaveLength(0);
    });

    it('should clear triggeredPreSearchRounds Set along with preSearches array', () => {
      // ARRANGE: Pre-search triggered and data stored
      getState().markPreSearchTriggered(0);
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-0',
          threadId: 'thread-a',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question',
        }),
      );

      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().preSearches).toHaveLength(1);

      // ACT: Reset to overview
      getState().resetToOverview();

      // ASSERT: Both array AND Set should be cleared
      expect(getState().preSearches).toHaveLength(0); // ✅ Should pass
      // 🚨 THIS WILL FAIL - Set not cleared
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);
    });
  });

  // ==========================================================================
  // INTEGRATION TEST: COMPLETE NAVIGATION FLOW
  // ==========================================================================
  describe('iNTEGRATION: Complete navigation flow with web search', () => {
    it('should fully reset state when navigating from thread → overview → new thread', () => {
      // ========== THREAD A: Complete Round 0 with Web Search ==========
      const threadA = createMockThread({ id: 'thread-a', enableWebSearch: true });
      getState().setThread(threadA);
      getState().setEnableWebSearch(true);

      // Mark round 0 pre-search as triggered
      getState().markPreSearchTriggered(0);

      // Add completed pre-search
      getState().addPreSearch(
        createMockPreSearch({
          id: 'search-a-0',
          threadId: 'thread-a',
          roundNumber: 0,
          status: AnalysisStatuses.COMPLETE,
          userQuery: 'Question A',
        }),
      );

      // Mark analysis created
      getState().markAnalysisCreated(0);

      // Set streaming flags (as if mid-operation)
      getState().setWaitingToStartStreaming(true);
      getState().setIsWaitingForChangelog(true);

      // ========== VERIFY THREAD A STATE ==========
      expect(getState().thread?.id).toBe('thread-a');
      expect(getState().enableWebSearch).toBe(true);
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(getState().preSearches).toHaveLength(1);
      expect(getState().waitingToStartStreaming).toBe(true);
      expect(getState().isWaitingForChangelog).toBe(true);

      // ========== ACT: NAVIGATE TO OVERVIEW ==========
      getState().resetToOverview();

      // ========== ASSERT: COMPLETE STATE RESET ==========

      // Thread data cleared
      expect(getState().thread).toBe(null);

      // Pre-search array cleared
      expect(getState().preSearches).toHaveLength(0); // ✅ Should pass

      // 🚨 THESE WILL FAIL - Sets not cleared
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(getState().hasAnalysisBeenCreated(0)).toBe(false);

      // Flags cleared
      expect(getState().waitingToStartStreaming).toBe(false); // 🚨 Will fail
      expect(getState().isWaitingForChangelog).toBe(false); // ✅ Should pass

      // ========== THREAD B: START NEW THREAD ==========
      const threadB = createMockThread({ id: 'thread-b', enableWebSearch: true });
      getState().setThread(threadB);
      getState().setEnableWebSearch(true);

      // CRITICAL: Pre-search should be triggerable for round 0 on thread B
      // 🚨 THIS WILL FAIL - triggeredPreSearchRounds still has Set([0]) from thread A
      expect(getState().hasPreSearchBeenTriggered(0)).toBe(false);

      // CRITICAL: Analysis should be creatable for round 0 on thread B
      // 🚨 THIS WILL FAIL - createdAnalysisRounds still has Set([0]) from thread A
      expect(getState().hasAnalysisBeenCreated(0)).toBe(false);
    });

    it('should fully reset state when switching directly between threads', () => {
      // ========== THREAD A SETUP ==========
      getState().markPreSearchTriggered(0);
      getState().markPreSearchTriggered(1);
      getState().markAnalysisCreated(0);
      getState().markAnalysisCreated(1);
      getState().setWaitingToStartStreaming(true);

      expect(getState().triggeredPreSearchRounds.size).toBe(2);
      expect(getState().createdAnalysisRounds.size).toBe(2);
      expect(getState().waitingToStartStreaming).toBe(true);

      // ========== ACT: SWITCH TO THREAD B ==========
      getState().resetThreadState();

      // ========== ASSERT: THREAD-SPECIFIC STATE RESET ==========

      // 🚨 THESE WILL FAIL - Sets not in THREAD_RESET_STATE
      expect(getState().triggeredPreSearchRounds.size).toBe(0);
      expect(getState().createdAnalysisRounds.size).toBe(0);

      // 🚨 THIS WILL FAIL - waitingToStartStreaming not in THREAD_RESET_STATE
      expect(getState().waitingToStartStreaming).toBe(false);
    });
  });

  // ==========================================================================
  // REGRESSION TEST: resetToNewChat() WORKS BUT OTHERS DON'T
  // ==========================================================================
  describe('rEGRESSION: resetToNewChat() creates new Sets but other resets do not', () => {
    it('resetToNewChat() should create new Set instances (CURRENTLY WORKS)', () => {
      // ARRANGE: Populate Sets
      getState().markPreSearchTriggered(0);
      getState().markAnalysisCreated(0);

      expect(getState().triggeredPreSearchRounds.size).toBe(1);
      expect(getState().createdAnalysisRounds.size).toBe(1);

      // ACT: Call resetToNewChat (has manual Set creation)
      getState().resetToNewChat();

      // ASSERT: Sets are cleared (this WORKS because of manual new Set() in store.ts:791-792)
      // ✅ THESE PASS because resetToNewChat manually creates new Sets
      expect(getState().triggeredPreSearchRounds.size).toBe(0);
      expect(getState().createdAnalysisRounds.size).toBe(0);
    });

    it('resetToOverview() should create new Set instances (CURRENTLY FAILS)', () => {
      // ARRANGE: Populate Sets
      getState().markPreSearchTriggered(0);
      getState().markAnalysisCreated(0);

      expect(getState().triggeredPreSearchRounds.size).toBe(1);
      expect(getState().createdAnalysisRounds.size).toBe(1);

      // ACT: Call resetToOverview (uses COMPLETE_RESET_STATE from defaults)
      getState().resetToOverview();

      // ASSERT: Sets should be cleared
      // 🚨 THESE FAIL - COMPLETE_RESET_STATE reuses TRACKING_DEFAULTS.triggeredPreSearchRounds
      // which is the SAME Set instance, not a new one
      expect(getState().triggeredPreSearchRounds.size).toBe(0);
      expect(getState().createdAnalysisRounds.size).toBe(0);
    });

    it('resetThreadState() should create new Set instances (CURRENTLY FAILS)', () => {
      // ARRANGE: Populate Sets
      getState().markPreSearchTriggered(0);
      getState().markAnalysisCreated(0);

      expect(getState().triggeredPreSearchRounds.size).toBe(1);
      expect(getState().createdAnalysisRounds.size).toBe(1);

      // ACT: Call resetThreadState (uses THREAD_RESET_STATE)
      getState().resetThreadState();

      // ASSERT: Sets should be cleared
      // 🚨 THESE FAIL - THREAD_RESET_STATE uses TRACKING_DEFAULTS which is same Set instance
      expect(getState().triggeredPreSearchRounds.size).toBe(0);
      expect(getState().createdAnalysisRounds.size).toBe(0);
    });
  });

  // ==========================================================================
  // ROOT CAUSE TEST: Set Instance Reuse Bug
  // ==========================================================================
  describe('rOOT CAUSE: TRACKING_DEFAULTS Sets are reused, not recreated', () => {
    it('should demonstrate the Set instance reuse bug', () => {
      // ARRANGE: Get initial Set reference
      const initialTriggeredSet = getState().triggeredPreSearchRounds;
      const initialCreatedSet = getState().createdAnalysisRounds;

      // Populate Sets
      getState().markPreSearchTriggered(0);
      getState().markAnalysisCreated(0);

      // ACT: Reset using defaults
      getState().resetToOverview();

      // ASSERT: Sets should be NEW instances, not same reference
      const afterResetTriggeredSet = getState().triggeredPreSearchRounds;
      const afterResetCreatedSet = getState().createdAnalysisRounds;

      // 🚨 THESE WILL FAIL - Same Set instance reused (const assertion prevents new instances)
      // TRACKING_DEFAULTS = { triggeredPreSearchRounds: new Set<number>() } is created ONCE
      // Every reset reuses the SAME Set instance from TRACKING_DEFAULTS
      expect(afterResetTriggeredSet).not.toBe(initialTriggeredSet);
      expect(afterResetCreatedSet).not.toBe(initialCreatedSet);

      // Because it's the same instance, the values persist
      // 🚨 THIS DEMONSTRATES THE BUG
      expect(afterResetTriggeredSet.size).toBe(0); // Should be 0, will be 1
      expect(afterResetCreatedSet.size).toBe(0); // Should be 0, will be 1
    });
  });
});
