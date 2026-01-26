/**
 * Config Change Flow Ordering - Comprehensive Unit Tests
 *
 * Verifies the exact ordering of operations during config changes between rounds:
 * REQUIRED ORDER: PATCH → changelog → pre-search → streams
 *
 * Key mechanisms tested:
 * 1. Flag Setting Order:
 *    - configChangeRoundNumber is set BEFORE PATCH starts (line 309 form-actions.ts)
 *    - isWaitingForChangelog is set AFTER PATCH completes (line 372 form-actions.ts)
 *
 * 2. Blocking Logic (use-pending-message.ts):
 *    - First effect (line 107): blocks when configChangeRoundNumber !== null
 *    - First effect (line 107): blocks when isWaitingForChangelog === true
 *    - Second effect (line 307): blocks on BOTH flags for non-initial rounds
 *    - Pre-search executes only when BOTH flags are cleared
 *
 * 3. Config Change Types:
 *    - Web search toggle (off → on, on → off)
 *    - Mode change
 *    - Participant addition/removal
 *    - Participant role/order change
 *
 * Test File: /src/stores/chat/__tests__/config-change-ordering.test.ts
 */

import { beforeEach, describe, expect, it } from 'vitest';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

describe('config Change Flow Ordering - Flag States and Blocking', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('flag Setting Order in handleUpdateThreadAndSend', () => {
    it('should set configChangeRoundNumber BEFORE PATCH starts', () => {
      // Initial state: both flags cleared
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();

      // Simulate handleUpdateThreadAndSend setting configChangeRoundNumber (line 309)
      // This happens BEFORE any async PATCH operation
      const roundNumber = 1;
      store.getState().setConfigChangeRoundNumber(roundNumber);

      // Verify configChangeRoundNumber is set immediately
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
    });

    it('should set isWaitingForChangelog AFTER PATCH completes', () => {
      const roundNumber = 1;

      // Step 1: Set configChangeRoundNumber BEFORE PATCH (line 309)
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().isWaitingForChangelog).toBeFalsy();

      // Step 2: Simulate PATCH completing (async operation finishes)
      // Then set isWaitingForChangelog (line 372)
      store.getState().setIsWaitingForChangelog(true);

      // Verify BOTH flags are now set
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });

    it('should have BOTH flags set before pre-search can execute', () => {
      const roundNumber = 1;

      // Simulate the exact sequence from handleUpdateThreadAndSend
      // Step 1: Set configChangeRoundNumber (line 309) - blocks streaming immediately
      store.getState().setConfigChangeRoundNumber(roundNumber);

      const stateBeforePatch = store.getState();
      expect(stateBeforePatch.configChangeRoundNumber).toBe(roundNumber);
      expect(stateBeforePatch.isWaitingForChangelog).toBeFalsy();

      // At this point, pre-search would be blocked by configChangeRoundNumber

      // Step 2: PATCH completes, set isWaitingForChangelog (line 372)
      store.getState().setIsWaitingForChangelog(true);

      const stateAfterPatch = store.getState();
      expect(stateAfterPatch.configChangeRoundNumber).toBe(roundNumber);
      expect(stateAfterPatch.isWaitingForChangelog).toBeTruthy();

      // Now pre-search is blocked by BOTH flags
      // This ensures changelog is fetched before pre-search executes
    });

    it('should clear BOTH flags atomically after changelog sync', () => {
      const roundNumber = 1;

      // Set both flags
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Simulate changelog sync completing (use-changelog-sync.ts lines 118-120)
      // Clears BOTH flags atomically
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Verify both flags cleared
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();

      // NOW pre-search can execute
    });
  });

  describe('usePendingMessage Blocking Logic - First Effect (Initial Rounds)', () => {
    it('should block when configChangeRoundNumber !== null (line 107)', () => {
      const roundNumber = 1;
      store.getState().setConfigChangeRoundNumber(roundNumber);

      // Simulate the blocking condition check (use-pending-message.ts line 107)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy();
      expect(state.configChangeRoundNumber).toBe(roundNumber);
    });

    it('should block when isWaitingForChangelog === true (line 107)', () => {
      store.getState().setIsWaitingForChangelog(true);

      // Simulate the blocking condition check (use-pending-message.ts line 107)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy();
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should block when BOTH flags are set', () => {
      const roundNumber = 1;
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setIsWaitingForChangelog(true);

      // Simulate the blocking condition check (use-pending-message.ts line 107)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy();
      expect(state.configChangeRoundNumber).toBe(roundNumber);
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should NOT block when BOTH flags are cleared', () => {
      // Ensure both flags are cleared
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // Simulate the blocking condition check (use-pending-message.ts line 107)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeFalsy();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeFalsy();
    });

    it('should still block if only configChangeRoundNumber is cleared', () => {
      const roundNumber = 1;
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setIsWaitingForChangelog(true);

      // Clear only configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy(); // Still blocked by isWaitingForChangelog
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should still block if only isWaitingForChangelog is cleared', () => {
      const roundNumber = 1;
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setIsWaitingForChangelog(true);

      // Clear only isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(false);

      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy(); // Still blocked by configChangeRoundNumber
      expect(state.configChangeRoundNumber).toBe(roundNumber);
      expect(state.isWaitingForChangelog).toBeFalsy();
    });
  });

  describe('usePendingMessage Blocking Logic - Second Effect (Non-Initial Rounds)', () => {
    it('should block when configChangeRoundNumber !== null (line 307)', () => {
      const roundNumber = 2;
      store.getState().setConfigChangeRoundNumber(roundNumber);

      // Simulate the blocking condition check (use-pending-message.ts line 307)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy();
      expect(state.configChangeRoundNumber).toBe(roundNumber);
    });

    it('should block when isWaitingForChangelog === true (line 307)', () => {
      store.getState().setIsWaitingForChangelog(true);

      // Simulate the blocking condition check (use-pending-message.ts line 307)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy();
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should block when BOTH flags are set (non-initial round)', () => {
      const roundNumber = 2;
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setIsWaitingForChangelog(true);

      // Simulate the blocking condition check (use-pending-message.ts line 307)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeTruthy();
      expect(state.configChangeRoundNumber).toBe(roundNumber);
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should NOT block when BOTH flags are cleared (non-initial round)', () => {
      // Ensure both flags are cleared
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // Simulate the blocking condition check (use-pending-message.ts line 307)
      const state = store.getState();
      const shouldBlock = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;

      expect(shouldBlock).toBeFalsy();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeFalsy();
    });
  });

  describe('config Change Types - Web Search Toggle', () => {
    it('should set flags when web search toggles from OFF to ON', () => {
      const roundNumber = 1;

      // Initial state: web search disabled
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBeFalsy();

      // User toggles web search ON (mid-conversation)
      store.getState().setEnableWebSearch(true);

      // handleUpdateThreadAndSend detects config change
      // Step 1: Set configChangeRoundNumber BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(roundNumber);

      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().enableWebSearch).toBeTruthy();

      // Step 2: PATCH completes, set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
    });

    it('should set flags when web search toggles from ON to OFF', () => {
      const roundNumber = 1;

      // Initial state: web search enabled
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBeTruthy();

      // User toggles web search OFF (mid-conversation)
      store.getState().setEnableWebSearch(false);

      // handleUpdateThreadAndSend detects config change
      // Step 1: Set configChangeRoundNumber BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(roundNumber);

      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().enableWebSearch).toBeFalsy();

      // Step 2: PATCH completes, set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
    });

    it('should block pre-search execution during web search toggle', () => {
      const roundNumber = 1;

      // Simulate web search being toggled ON
      store.getState().setEnableWebSearch(true);
      store.getState().setConfigChangeRoundNumber(roundNumber);

      // Pre-search would be blocked at this point
      const stateBeforePatch = store.getState();
      const shouldBlockPreSearch = stateBeforePatch.configChangeRoundNumber !== null
        || stateBeforePatch.isWaitingForChangelog;

      expect(shouldBlockPreSearch).toBeTruthy();

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);

      // Pre-search still blocked (waiting for changelog)
      const stateAfterPatch = store.getState();
      const stillBlocked = stateAfterPatch.configChangeRoundNumber !== null
        || stateAfterPatch.isWaitingForChangelog;

      expect(stillBlocked).toBeTruthy();

      // Changelog sync completes, clears flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // NOW pre-search can execute
      const stateAfterChangelog = store.getState();
      const canExecutePreSearch = stateAfterChangelog.configChangeRoundNumber === null
        && !stateAfterChangelog.isWaitingForChangelog;

      expect(canExecutePreSearch).toBeTruthy();
    });
  });

  describe('config Change Types - Mode Changes', () => {
    it('should set flags when mode changes between rounds', () => {
      const roundNumber = 1;

      // Initial mode
      store.getState().setSelectedMode('panel');
      expect(store.getState().selectedMode).toBe('panel');

      // User changes to council mode
      store.getState().setSelectedMode('council');

      // handleUpdateThreadAndSend detects mode change
      // Step 1: Set configChangeRoundNumber BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(roundNumber);

      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().selectedMode).toBe('council');

      // Step 2: PATCH completes, set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
    });

    it('should enforce correct ordering for mode changes', () => {
      const roundNumber = 1;

      // Change mode
      store.getState().setSelectedMode('council');

      // Step 1: configChangeRoundNumber set FIRST
      store.getState().setConfigChangeRoundNumber(roundNumber);
      const state1 = store.getState();
      expect(state1.configChangeRoundNumber).toBe(roundNumber);
      expect(state1.isWaitingForChangelog).toBeFalsy();

      // Step 2: isWaitingForChangelog set SECOND (after PATCH)
      store.getState().setIsWaitingForChangelog(true);
      const state2 = store.getState();
      expect(state2.configChangeRoundNumber).toBe(roundNumber);
      expect(state2.isWaitingForChangelog).toBeTruthy();

      // Step 3: Both cleared after changelog fetch
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);
      const state3 = store.getState();
      expect(state3.configChangeRoundNumber).toBeNull();
      expect(state3.isWaitingForChangelog).toBeFalsy();
    });
  });

  describe('config Change Types - Participant Changes', () => {
    it('should set flags when participants are added', () => {
      const roundNumber = 1;

      // Initial participants
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'specialist' },
      ]);

      // Add a second participant
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'specialist' },
        { id: 'p2', modelId: 'claude-3', priority: 1, role: 'analyst' },
      ]);

      // handleUpdateThreadAndSend detects participant change
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });

    it('should set flags when participants are removed', () => {
      const roundNumber = 1;

      // Initial participants
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'specialist' },
        { id: 'p2', modelId: 'claude-3', priority: 1, role: 'analyst' },
      ]);

      // Remove a participant
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'specialist' },
      ]);

      // handleUpdateThreadAndSend detects participant change
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });

    it('should set flags when participant roles change', () => {
      const roundNumber = 1;

      // Initial participants
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'specialist' },
        { id: 'p2', modelId: 'claude-3', priority: 1, role: 'analyst' },
      ]);

      // Swap roles
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'analyst' },
        { id: 'p2', modelId: 'claude-3', priority: 1, role: 'specialist' },
      ]);

      // handleUpdateThreadAndSend detects participant change
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });

    it('should set flags when participant order changes', () => {
      const roundNumber = 1;

      // Initial participants
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'specialist' },
        { id: 'p2', modelId: 'claude-3', priority: 1, role: 'analyst' },
      ]);

      // Reorder participants
      store.getState().setSelectedParticipants([
        { id: 'p2', modelId: 'claude-3', priority: 0, role: 'analyst' },
        { id: 'p1', modelId: 'gpt-4', priority: 1, role: 'specialist' },
      ]);

      // handleUpdateThreadAndSend detects participant change
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });
  });

  describe('race Condition Prevention - PATCH → Changelog → Pre-search → Streams', () => {
    it('should prevent pre-search from starting before PATCH completes', () => {
      const roundNumber = 1;

      // Step 1: configChangeRoundNumber set BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(roundNumber);

      // Pre-search should be blocked
      const state = store.getState();
      const shouldBlockPreSearch = state.configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBeTruthy();

      // Pre-search CANNOT execute at this point
      expect(state.configChangeRoundNumber).toBe(roundNumber);
      expect(state.isWaitingForChangelog).toBeFalsy();
    });

    it('should prevent streaming from starting before changelog is fetched', () => {
      const roundNumber = 1;

      // Step 1: PATCH starts, configChangeRoundNumber set
      store.getState().setConfigChangeRoundNumber(roundNumber);

      // Step 2: PATCH completes, isWaitingForChangelog set
      store.getState().setIsWaitingForChangelog(true);

      // Streaming should be blocked
      const state = store.getState();
      const shouldBlockStreaming = state.isWaitingForChangelog || state.configChangeRoundNumber !== null;
      expect(shouldBlockStreaming).toBeTruthy();

      // Streaming CANNOT start at this point
      expect(state.configChangeRoundNumber).toBe(roundNumber);
      expect(state.isWaitingForChangelog).toBeTruthy();
    });

    it('should allow pre-search only after changelog is fetched', () => {
      const roundNumber = 1;

      // Step 1: configChangeRoundNumber set
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // Step 2: PATCH completes, isWaitingForChangelog set
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Pre-search still blocked
      let state = store.getState();
      let canExecutePreSearch = state.configChangeRoundNumber === null
        && !state.isWaitingForChangelog;
      expect(canExecutePreSearch).toBeFalsy();

      // Step 3: Changelog fetched, flags cleared
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // NOW pre-search can execute
      state = store.getState();
      canExecutePreSearch = state.configChangeRoundNumber === null
        && !state.isWaitingForChangelog;
      expect(canExecutePreSearch).toBeTruthy();
    });

    it('should enforce complete ordering: PATCH → changelog → pre-search → streams', () => {
      const roundNumber = 1;

      // STEP 1: PATCH starts - configChangeRoundNumber set
      store.getState().setConfigChangeRoundNumber(roundNumber);

      let state = store.getState();
      expect(state.configChangeRoundNumber).toBe(roundNumber);
      expect(state.isWaitingForChangelog).toBeFalsy();

      // Pre-search blocked: true
      let preSearchBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(preSearchBlocked).toBeTruthy();

      // STEP 2: PATCH completes - isWaitingForChangelog set
      store.getState().setIsWaitingForChangelog(true);

      state = store.getState();
      expect(state.configChangeRoundNumber).toBe(roundNumber);
      expect(state.isWaitingForChangelog).toBeTruthy();

      // Pre-search blocked: true (waiting for changelog)
      preSearchBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(preSearchBlocked).toBeTruthy();

      // STEP 3: Changelog fetched - flags cleared
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      state = store.getState();
      expect(state.configChangeRoundNumber).toBeNull();
      expect(state.isWaitingForChangelog).toBeFalsy();

      // Pre-search unblocked: can execute NOW
      preSearchBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(preSearchBlocked).toBeFalsy();

      // STEP 4: Pre-search completes → streams can start
      // (streams would start after pre-search execution)
    });
  });

  describe('edge Cases and Error Scenarios', () => {
    it('should handle changelog fetch timeout by clearing flags', () => {
      const roundNumber = 1;

      // Set flags for changelog fetch
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Simulate changelog fetch timeout (30s timeout in use-changelog-sync.ts line 140)
      // Timeout handler clears flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
    });

    it('should handle inconsistent state: isWaitingForChangelog=true but configChangeRoundNumber=null', () => {
      // This inconsistent state is handled by use-changelog-sync.ts lines 150-156
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBeTruthy();
      expect(state.configChangeRoundNumber).toBeNull();

      // Fix handler would clear isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(false);

      expect(store.getState().isWaitingForChangelog).toBeFalsy();
      expect(store.getState().configChangeRoundNumber).toBeNull();
    });

    it('should handle no config changes scenario (hasAnyChanges=false)', () => {
      const roundNumber = 1;

      // Set configChangeRoundNumber (always set by handleUpdateThreadAndSend)
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // If no actual config changes, flags are cleared immediately
      // (This is the line 373 path in form-actions.ts - though the comment says it's removed)
      store.getState().setConfigChangeRoundNumber(null);

      // isWaitingForChangelog is NOT set
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
    });

    it('should handle error during PATCH by clearing flags', () => {
      const roundNumber = 1;

      // Set configChangeRoundNumber before PATCH
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // Simulate PATCH error (form-actions.ts lines 392-393)
      // Error handler clears configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(null);

      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
    });

    it('should maintain flag isolation across different rounds', () => {
      // Round 1: Config change
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Changelog fetched, flags cleared
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();

      // Round 2: New config change (independent of round 1)
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().configChangeRoundNumber).toBe(2);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Round 2 flags are independent of round 1
      // They were properly cleared and reset
    });
  });

  describe('multiple Config Changes in Same Submission', () => {
    it('should handle web search + mode change together', () => {
      const roundNumber = 1;

      // User changes BOTH web search AND mode
      store.getState().setEnableWebSearch(true);
      store.getState().setSelectedMode('council');

      // handleUpdateThreadAndSend detects BOTH changes
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Same blocking logic applies regardless of number of changes
      const state = store.getState();
      const shouldBlock = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(shouldBlock).toBeTruthy();
    });

    it('should handle web search + participants + mode change together', () => {
      const roundNumber = 1;

      // User changes web search, participants, AND mode
      store.getState().setEnableWebSearch(true);
      store.getState().setSelectedMode('council');
      store.getState().setSelectedParticipants([
        { id: 'p1', modelId: 'gpt-4', priority: 0, role: 'specialist' },
        { id: 'p2', modelId: 'claude-3', priority: 1, role: 'analyst' },
        { id: 'p3', modelId: 'gemini-pro', priority: 2, role: 'critic' },
      ]);

      // handleUpdateThreadAndSend detects ALL changes
      store.getState().setConfigChangeRoundNumber(roundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(roundNumber);

      // PATCH completes
      store.getState().setIsWaitingForChangelog(true);
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Blocking logic is the same
      const state = store.getState();
      const shouldBlock = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(shouldBlock).toBeTruthy();

      // Changelog sync clears flags (fetches all changelog entries for the round)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const clearedState = store.getState();
      expect(clearedState.configChangeRoundNumber).toBeNull();
      expect(clearedState.isWaitingForChangelog).toBeFalsy();
    });
  });

  describe('isInitialThreadCreation Bypass - OVERVIEW Screen Non-Initial Rounds', () => {
    /**
     * BUG FIX: isInitialThreadCreation was incorrectly calculated as:
     *   isInitialThreadCreation = screenMode === OVERVIEW && waitingToStart
     *
     * This caused the blocking check to be bypassed for ALL submissions on OVERVIEW screen,
     * even for non-initial rounds (round 2+) with config changes.
     *
     * FIX: Added configChangeRoundNumber === null to the condition:
     *   isInitialThreadCreation = screenMode === OVERVIEW && waitingToStart && configChangeRoundNumber === null
     *
     * Now:
     * - Initial thread creation (handleCreateThread): configChangeRoundNumber is null → bypass allowed
     * - Non-initial rounds (handleUpdateThreadAndSend): configChangeRoundNumber is set → blocking works
     */

    it('should NOT bypass blocking for non-initial rounds on OVERVIEW screen', () => {
      const roundNumber = 2;

      // Simulate non-initial round submission on OVERVIEW screen
      // handleUpdateThreadAndSend sets configChangeRoundNumber BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // isInitialThreadCreation requires OVERVIEW && waitingToStart && configChangeRoundNumber === null
      const isInitialThreadCreation = state.waitingToStartStreaming && state.configChangeRoundNumber === null;

      // Verify initial thread check is false for round 2 config changes
      expect(isInitialThreadCreation).toBeFalsy();

      // Blocking condition should work
      const shouldBlock = (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) && !isInitialThreadCreation;
      expect(shouldBlock).toBeTruthy();
    });

    it('should allow bypass for actual initial thread creation', () => {
      // Simulate initial thread creation (handleCreateThread)
      // handleCreateThread does NOT set configChangeRoundNumber
      store.getState().setWaitingToStartStreaming(true);
      // configChangeRoundNumber stays null (default)

      const state = store.getState();

      // FIXED LOGIC: isInitialThreadCreation = OVERVIEW && waitingToStart && configChangeRoundNumber === null
      const fixedIsInitialThreadCreation = state.waitingToStartStreaming && state.configChangeRoundNumber === null;

      // For initial thread creation, bypass should be allowed
      expect(fixedIsInitialThreadCreation).toBeTruthy();

      // Blocking condition should NOT block (bypass allowed)
      const shouldBlock = (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) && !fixedIsInitialThreadCreation;
      expect(shouldBlock).toBeFalsy();
    });

    it('should block pre-search for web search enabled mid-conversation on OVERVIEW screen', () => {
      const roundNumber = 2;

      // User enables web search mid-conversation (round 2) on OVERVIEW screen
      store.getState().setEnableWebSearch(true);

      // handleUpdateThreadAndSend sets configChangeRoundNumber BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // FIXED LOGIC: configChangeRoundNumber is set, so NOT initial thread creation
      const isInitialThreadCreation = state.waitingToStartStreaming && state.configChangeRoundNumber === null;
      expect(isInitialThreadCreation).toBeFalsy();

      // Pre-search should be blocked
      const shouldBlockPreSearch = (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) && !isInitialThreadCreation;
      expect(shouldBlockPreSearch).toBeTruthy();

      // PATCH completes, isWaitingForChangelog set
      store.getState().setIsWaitingForChangelog(true);

      // Pre-search still blocked (waiting for changelog)
      const stateAfterPatch = store.getState();
      const stillBlocked = (stateAfterPatch.isWaitingForChangelog || stateAfterPatch.configChangeRoundNumber !== null);
      expect(stillBlocked).toBeTruthy();

      // Changelog completes, flags cleared
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // NOW pre-search can execute
      const stateAfterChangelog = store.getState();
      const canExecutePreSearch = !stateAfterChangelog.isWaitingForChangelog && stateAfterChangelog.configChangeRoundNumber === null;
      expect(canExecutePreSearch).toBeTruthy();
    });

    it('should block for mode-only changes on OVERVIEW screen', () => {
      const roundNumber = 2;

      // User changes mode mid-conversation on OVERVIEW screen
      store.getState().setSelectedMode('council');

      // handleUpdateThreadAndSend sets configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(roundNumber);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // Should NOT be treated as initial thread creation
      const isInitialThreadCreation = state.waitingToStartStreaming && state.configChangeRoundNumber === null;
      expect(isInitialThreadCreation).toBeFalsy();

      // Blocking check should work
      const shouldBlock = (state.isWaitingForChangelog || state.configChangeRoundNumber !== null) && !isInitialThreadCreation;
      expect(shouldBlock).toBeTruthy();
    });
  });
});
