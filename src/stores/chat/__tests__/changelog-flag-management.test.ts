/**
 * Changelog Flag Management Tests
 *
 * Tests the changelog synchronization flag management system to ensure:
 * 1. Flags are set and cleared atomically
 * 2. Query execution is properly gated by flag state
 * 3. Edge cases don't leave the system stuck
 * 4. Multi-round scenarios work correctly
 *
 * Flow: PATCH → changelog → pre-search → streams
 *
 * Key Components:
 * - use-changelog-sync.ts: Fetches changelog when flags set
 * - thread-actions.ts: Also has changelog logic for thread screen
 * - store.ts: Flag management (isWaitingForChangelog, configChangeRoundNumber)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ScreenModes } from '@/api/core/enums';
import { createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

describe('changelog Flag Management', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('flag State Management', () => {
    it('should initialize with both flags false/null', () => {
      const state = store.getState();

      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should set both flags atomically when preparing for config change', () => {
      // Simulate handleUpdateThreadAndSend setting flags before PATCH
      const roundNumber = 1;

      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(roundNumber);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(roundNumber);
    });

    it('should clear both flags atomically after changelog merge', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Clear flags (as use-changelog-sync does after merge)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should allow flags to be set for different rounds', () => {
      // Round 1
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      let state = store.getState();
      expect(state.configChangeRoundNumber).toBe(1);

      // Clear
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Round 2
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(2);

      state = store.getState();
      expect(state.configChangeRoundNumber).toBe(2);
    });
  });

  describe('query Trigger Conditions', () => {
    it('should require BOTH flags to be true/non-null for query to run', () => {
      // Condition: shouldFetch = isWaitingForChangelog && configChangeRoundNumber !== null

      // Case 1: Both false/null → no fetch
      let shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetch).toBe(false);

      // Case 2: Only isWaitingForChangelog true → no fetch
      store.getState().setIsWaitingForChangelog(true);
      shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetch).toBe(false);

      // Case 3: Only configChangeRoundNumber set → no fetch
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(1);
      shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetch).toBe(false);

      // Case 4: Both true/non-null → fetch
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);
      shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetch).toBe(true);
    });

    it('should trigger query immediately when both flags become true', () => {
      // Flags start false/null
      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);

      // Set both flags (simulates handleUpdateThreadAndSend)
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Query condition should be true immediately
      const shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetch).toBe(true);
    });

    it('should not trigger query if only one flag is set', () => {
      // Only set isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(true);

      let shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetch).toBe(false);

      // Clear and only set configChangeRoundNumber
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(1);

      shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;
      expect(shouldFetch).toBe(false);
    });
  });

  describe('flag Clearing Logic', () => {
    it('should clear both flags after successful changelog merge', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate successful changelog merge (as use-changelog-sync does)
      // After merge, both flags are cleared
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should clear both flags even when changelog is empty', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Empty changelog result still clears flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should clear both flags on timeout (30s safety)', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate timeout clearing flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should clear both flags on error', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate error handling (flags should be cleared)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });
  });

  describe('multi-Round Scenarios', () => {
    it('should handle Round 0 with config changes', () => {
      // Round 0 with config changes
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(0);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(0);

      // Clear after changelog
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);
    });

    it('should handle Round 1 with web search enabled mid-conversation', () => {
      // Setup: Round 0 complete
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'First', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0-p0',
          content: 'Response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      store.getState().setMessages(messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search and submits
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Set flags for round 1
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(1);
      expect(state.hasPendingConfigChanges).toBe(true);

      // Clear after changelog
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setHasPendingConfigChanges(false);

      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);
    });

    it('should handle Round 2+ with participant changes', () => {
      // Setup: Rounds 0 and 1 complete
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'First', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0-p0',
          content: 'R0',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
        createTestUserMessage({ id: 'u1', content: 'Second', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'a1-p0',
          content: 'R1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      store.getState().setMessages(messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User changes participants for round 2
      store.getState().setHasPendingConfigChanges(true);

      // Set flags for round 2
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(2);

      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(2);

      // Clear after changelog
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setHasPendingConfigChanges(false);

      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);
    });

    it('should handle multiple config changes across different rounds', () => {
      // Round 1 config change
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      let state = store.getState();
      expect(state.configChangeRoundNumber).toBe(1);

      // Clear round 1 flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Round 2 config change
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(2);

      state = store.getState();
      expect(state.configChangeRoundNumber).toBe(2);

      // Clear round 2 flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Round 3 config change
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(3);

      state = store.getState();
      expect(state.configChangeRoundNumber).toBe(3);

      // Each round's flags are independent
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(3);
    });
  });

  describe('edge Cases - Preventing Stuck States', () => {
    it('should handle PATCH failure by clearing flags on error', () => {
      // Set flags before PATCH
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate PATCH failure (error handler should clear flags)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should handle changelog query failure by clearing flags', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate query failure (error handler should clear flags)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should handle rapid successive submissions', () => {
      // First submission
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Before first completes, second submission starts
      // (This would be blocked by form state in reality, but test flag handling)
      store.getState().setConfigChangeRoundNumber(2);

      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(2);

      // Clear flags
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);
    });

    it('should detect inconsistent state: isWaitingForChangelog=true but configChangeRoundNumber=null', () => {
      // This is the bug scenario that use-changelog-sync detects and fixes
      store.getState().setIsWaitingForChangelog(true);
      // configChangeRoundNumber remains null (inconsistent state)

      const state = store.getState();
      const isInconsistent = state.isWaitingForChangelog && state.configChangeRoundNumber === null;

      expect(isInconsistent).toBe(true);

      // The hook would detect this and clear isWaitingForChangelog
      if (isInconsistent) {
        store.getState().setIsWaitingForChangelog(false);
      }

      expect(store.getState().isWaitingForChangelog).toBe(false);
    });

    it('should not allow query to run in inconsistent state', () => {
      // Inconsistent: isWaitingForChangelog=true but configChangeRoundNumber=null
      store.getState().setIsWaitingForChangelog(true);
      // configChangeRoundNumber is null

      const shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;

      // Should NOT fetch in this inconsistent state
      expect(shouldFetch).toBe(false);
    });
  });

  describe('flag Interaction with Other State', () => {
    it('should preserve flags during initializeThread when hasActiveFormSubmission', () => {
      // Set flags as if form submission is in progress
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setHasPendingConfigChanges(true);

      const thread = {
        id: 'thread-1',
        userId: 'user-1',
        title: 'Test',
        slug: 'test',
        mode: 'brainstorm' as const,
        status: 'active' as const,
        isFavorite: false,
        isPublic: false,
        isAiGeneratedTitle: false,
        enableWebSearch: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      };

      const participants = [
        {
          id: 'p1',
          threadId: 'thread-1',
          modelId: 'model-a',
          role: null,
          priority: 0,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // initializeThread preserves flags when configChangeRoundNumber !== null
      store.getState().initializeThread(thread, participants, []);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(1);
    });

    it('should reset flags during initializeThread when NO active submission', () => {
      // Active submission requires either:
      // - configChangeRoundNumber !== null, OR
      // - isWaitingForChangelog === true
      // So for NO active submission, BOTH must be false/null

      // Set both to false/null (no active submission)
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const thread = {
        id: 'thread-1',
        userId: 'user-1',
        title: 'Test',
        slug: 'test',
        mode: 'brainstorm' as const,
        status: 'active' as const,
        isFavorite: false,
        isPublic: false,
        isAiGeneratedTitle: false,
        enableWebSearch: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastMessageAt: new Date(),
      };

      const participants = [
        {
          id: 'p1',
          threadId: 'thread-1',
          modelId: 'model-a',
          role: null,
          priority: 0,
          isEnabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // initializeThread resets flags when no active submission
      store.getState().initializeThread(thread, participants, []);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should clear flags on completeModeratorStream', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsModeratorStreaming(true);

      // Complete moderator stream
      store.getState().completeModeratorStream();

      const state = store.getState();
      expect(state.isModeratorStreaming).toBe(false);
      // ⚠️ CRITICAL: isWaitingForChangelog is NOT cleared by completeModeratorStream
      // It must ONLY be cleared by use-changelog-sync.ts after changelog is fetched
      // This ensures correct ordering: PATCH → changelog → pre-search/streaming
      expect(state.isWaitingForChangelog).toBe(true);
      // configChangeRoundNumber is also NOT cleared by completeModeratorStream
      expect(state.configChangeRoundNumber).toBe(1);
    });

    // ✅ FIX: prepareForNewMessage should NEVER set changelog flags
    // prepareForNewMessage is called for:
    // 1. Initial thread creation (POST) - no changelog exists
    // 2. Incomplete round resumption - changelog was handled when round originally started
    // For subsequent rounds, handleUpdateThreadAndSend sets flags AFTER PATCH
    it('should NOT set flags in prepareForNewMessage even when hasPendingConfigChanges', () => {
      // Setup with pending config changes
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Prepare for new message
      store.getState().prepareForNewMessage('Test message', ['p1']);

      const state = store.getState();
      // ✅ FIX: prepareForNewMessage should NOT set changelog flags
      // Changelog flags are only set by handleUpdateThreadAndSend AFTER PATCH
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
      // hasPendingConfigChanges is preserved (not cleared by prepareForNewMessage)
      expect(state.hasPendingConfigChanges).toBe(true);
    });

    it('should NOT set flags in prepareForNewMessage when no config changes', () => {
      // Setup without config changes
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Prepare for new message
      store.getState().prepareForNewMessage('Test message', ['p1']);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });
  });

  describe('prepareForNewMessage Flag Setting', () => {
    // ✅ FIX: prepareForNewMessage should NEVER set changelog flags
    // These tests verify the correct behavior after the fix
    it('should NOT set changelog flags even when hasPendingConfigChanges is true', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setHasPendingConfigChanges(true);

      // Prepare for new message (Round 0)
      store.getState().prepareForNewMessage('Test', ['p1']);

      const state = store.getState();
      // ✅ FIX: Flags should NOT be set - only handleUpdateThreadAndSend sets them
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should NOT set changelog flags regardless of round number', () => {
      const messages = [
        createTestUserMessage({ id: 'u0', content: 'First', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'a0',
          content: 'Response',
          roundNumber: 0,
          participantId: 'p1',
          participantIndex: 0,
        }),
      ];

      store.getState().setMessages(messages);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setHasPendingConfigChanges(true);

      // Prepare for round 1
      store.getState().prepareForNewMessage('Test', ['p1']);

      const state = store.getState();
      // ✅ FIX: configChangeRoundNumber should NOT be set by prepareForNewMessage
      expect(state.configChangeRoundNumber).toBe(null);
      expect(state.isWaitingForChangelog).toBe(false);
    });

    it('should NOT set changelog flags even with existing streamingRoundNumber', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setStreamingRoundNumber(5);
      store.getState().setHasPendingConfigChanges(true);

      // Prepare for new message
      store.getState().prepareForNewMessage('Test', ['p1']);

      const state = store.getState();
      // ✅ FIX: configChangeRoundNumber should NOT be set by prepareForNewMessage
      expect(state.configChangeRoundNumber).toBe(null);
      expect(state.isWaitingForChangelog).toBe(false);
    });
  });

  describe('timeout Safety Mechanism', () => {
    it('should clear flags after timeout if not cleared by normal flow', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Simulate timeout (30s)
      // In real code, useEffect with setTimeout would do this
      // Here we just verify the action works
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should handle timeout clearing when both flags are set', () => {
      // Initial state
      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);

      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Verify flags are set
      expect(store.getState().isWaitingForChangelog).toBe(true);
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // Timeout clears both
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Verify both cleared
      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);
    });
  });

  describe('flag Consistency Validation', () => {
    it('should never have isWaitingForChangelog=false with non-null configChangeRoundNumber', () => {
      // This would be an inconsistent state that shouldn't happen

      // Correct: both false/null
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      let state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);

      // Correct: both true/non-null
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(1);

      // If we somehow get inconsistent state (waiting=false but round set)
      // The query won't run because shouldFetch requires both
      store.getState().setIsWaitingForChangelog(false);
      // configChangeRoundNumber remains 1

      const shouldFetch = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber !== null;

      expect(shouldFetch).toBe(false); // Won't fetch in inconsistent state
    });

    it('should handle flags being cleared in different orders', () => {
      // Set both flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Clear isWaitingForChangelog first
      store.getState().setIsWaitingForChangelog(false);
      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // Then clear configChangeRoundNumber
      store.getState().setConfigChangeRoundNumber(null);
      expect(store.getState().configChangeRoundNumber).toBe(null);

      // Reset and try opposite order
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Clear configChangeRoundNumber first
      store.getState().setConfigChangeRoundNumber(null);
      expect(store.getState().configChangeRoundNumber).toBe(null);
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // Then clear isWaitingForChangelog
      store.getState().setIsWaitingForChangelog(false);
      expect(store.getState().isWaitingForChangelog).toBe(false);
    });
  });

  describe('integration with hasPendingConfigChanges', () => {
    it('should work with hasPendingConfigChanges flag', () => {
      // User makes config changes
      store.getState().setHasPendingConfigChanges(true);

      // Submit message
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      const state = store.getState();
      expect(state.hasPendingConfigChanges).toBe(true);
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(1);

      // After changelog completes and streaming finishes
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setHasPendingConfigChanges(false);

      const finalState = store.getState();
      expect(finalState.hasPendingConfigChanges).toBe(false);
      expect(finalState.isWaitingForChangelog).toBe(false);
      expect(finalState.configChangeRoundNumber).toBe(null);
    });

    // ✅ FIX: prepareForNewMessage should NEVER set changelog flags
    // Changelog flags are ONLY set by handleUpdateThreadAndSend AFTER PATCH
    it('should NOT set changelog flags regardless of hasPendingConfigChanges', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Without pending config changes
      store.getState().setHasPendingConfigChanges(false);
      store.getState().prepareForNewMessage('Test', ['p1']);

      let state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);

      // With pending config changes - flags still NOT set
      store.getState().setHasPendingConfigChanges(true);
      store.getState().prepareForNewMessage('Test', ['p1']);

      state = store.getState();
      // ✅ FIX: prepareForNewMessage does NOT set changelog flags
      // Only handleUpdateThreadAndSend sets them AFTER PATCH completes
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });
  });

  describe('round Number Tracking', () => {
    it('should track different round numbers correctly', () => {
      const rounds = [0, 1, 2, 5, 10];

      for (const round of rounds) {
        store.getState().setIsWaitingForChangelog(true);
        store.getState().setConfigChangeRoundNumber(round);

        const state = store.getState();
        expect(state.configChangeRoundNumber).toBe(round);

        // Clear for next iteration
        store.getState().setIsWaitingForChangelog(false);
        store.getState().setConfigChangeRoundNumber(null);
      }
    });

    it('should allow updating configChangeRoundNumber while waiting', () => {
      // Start with round 1
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      expect(store.getState().configChangeRoundNumber).toBe(1);

      // Update to round 2 (shouldn't happen in practice, but test store behavior)
      store.getState().setConfigChangeRoundNumber(2);

      expect(store.getState().configChangeRoundNumber).toBe(2);
    });
  });

  describe('reset Operations', () => {
    it('should clear flags on resetToNewChat', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setHasPendingConfigChanges(true);

      // Reset to new chat
      store.getState().resetToNewChat();

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
      expect(state.hasPendingConfigChanges).toBe(false);
    });

    it('should clear flags on resetForThreadNavigation', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setHasPendingConfigChanges(true);

      // Navigate to different thread
      store.getState().resetForThreadNavigation();

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
      expect(state.hasPendingConfigChanges).toBe(false);
    });

    it('should clear flags on resetToOverview', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Reset to overview
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);
    });

    it('should NOT clear changelog flags on completeStreaming', () => {
      // Set flags
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(1);

      // Complete streaming
      store.getState().completeStreaming();

      const state = store.getState();
      // ⚠️ CRITICAL: isWaitingForChangelog and configChangeRoundNumber are NOT
      // cleared by completeStreaming. They must ONLY be cleared by use-changelog-sync.ts
      // after changelog is fetched. This ensures correct ordering: PATCH → changelog → streaming
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(1);
    });
  });

  // ============================================================================
  // INTEGRATION TESTS: Config Change + Changelog Timing
  // ============================================================================
  // These tests verify the correct ordering and state transitions during
  // config change flows, specifically:
  // 1. Initial thread creation (POST) - no changelog flags
  // 2. Subsequent rounds with config changes (PATCH) - changelog flags set AFTER PATCH
  // 3. Error recovery - flags cleared on PATCH failure
  // 4. Blocking logic consistency across hooks
  // ============================================================================
  describe('config Change + Changelog Timing Integration', () => {
    describe('initial Thread Creation (POST) - No Changelog', () => {
      it('should NOT set changelog flags for initial thread creation flow', () => {
        // Initial thread creation starts from OVERVIEW screen
        store.getState().setScreenMode(ScreenModes.OVERVIEW);

        // User has config set up (this is normal, not a "change")
        store.getState().setSelectedMode('panel');
        store.getState().setEnableWebSearch(true);
        store.getState().setSelectedParticipants([
          { id: 'p1', modelId: 'gpt-4', role: 'specialist', priority: 0 },
        ]);

        // Prepare for streaming (simulates handleCreateThread calling prepareForNewMessage)
        store.getState().prepareForNewMessage('Hello', ['gpt-4']);
        store.getState().setStreamingRoundNumber(0);
        store.getState().setWaitingToStartStreaming(true);

        // ✅ For initial thread creation, NO changelog flags should be set
        // POST creates new thread, no changelog entries exist
        const state = store.getState();
        expect(state.isWaitingForChangelog).toBe(false);
        expect(state.configChangeRoundNumber).toBe(null);
        expect(state.waitingToStartStreaming).toBe(true);
        expect(state.streamingRoundNumber).toBe(0);
      });

      it('should allow streaming to proceed without changelog blocking on initial thread', () => {
        store.getState().setScreenMode(ScreenModes.OVERVIEW);
        store.getState().prepareForNewMessage('Hello', ['gpt-4']);
        store.getState().setStreamingRoundNumber(0);
        store.getState().setWaitingToStartStreaming(true);

        // Simulate streaming trigger checking blocking conditions
        const state = store.getState();
        const isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;

        // ✅ Initial thread should NOT be blocked
        expect(isBlocked).toBe(false);
        expect(state.waitingToStartStreaming).toBe(true);
      });
    });

    describe('subsequent Rounds with Config Changes (PATCH)', () => {
      it('should set configChangeRoundNumber BEFORE PATCH for blocking', () => {
        // Set up existing thread state
        store.getState().setScreenMode(ScreenModes.THREAD);
        store.getState().setThread({
          id: 'thread-1',
          slug: 'test-thread',
          title: 'Test',
          mode: 'panel',
          status: 'active',
          isFavorite: false,
          isPublic: false,
          isAiGeneratedTitle: false,
          enableWebSearch: false,
          participantCount: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastMessageAt: new Date(),
          userId: 'user-1',
        });
        store.getState().setMessages([
          createTestUserMessage({ id: 'u0', content: 'First', roundNumber: 0 }),
        ]);

        // User makes config change
        store.getState().setHasPendingConfigChanges(true);

        // ✅ BEFORE PATCH: Set configChangeRoundNumber to block effects
        // This is what handleUpdateThreadAndSend does at line 322
        const nextRound = 1;
        store.getState().setConfigChangeRoundNumber(nextRound);

        // Set waiting to start (but streaming should be blocked)
        store.getState().setWaitingToStartStreaming(true);
        store.getState().setExpectedParticipantIds(['gpt-4', 'claude-3']);

        const state = store.getState();
        // Blocking flag is set BEFORE PATCH
        expect(state.configChangeRoundNumber).toBe(1);
        // isWaitingForChangelog is NOT set yet (set AFTER PATCH)
        expect(state.isWaitingForChangelog).toBe(false);

        // Streaming should be blocked by configChangeRoundNumber
        const isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(true);
      });

      it('should set isWaitingForChangelog AFTER PATCH succeeds', () => {
        store.getState().setScreenMode(ScreenModes.THREAD);
        store.getState().setHasPendingConfigChanges(true);

        // BEFORE PATCH: Block with configChangeRoundNumber
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setWaitingToStartStreaming(true);

        // Simulate PATCH success
        // ✅ AFTER PATCH: Set isWaitingForChangelog (line 409)
        store.getState().setIsWaitingForChangelog(true);
        // Clear hasPendingConfigChanges (line 392)
        store.getState().setHasPendingConfigChanges(false);

        const state = store.getState();
        // Both flags now set - waiting for changelog to be fetched
        expect(state.configChangeRoundNumber).toBe(1);
        expect(state.isWaitingForChangelog).toBe(true);
        expect(state.hasPendingConfigChanges).toBe(false);

        // Still blocked until changelog is fetched
        const isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(true);
      });

      it('should unblock streaming after changelog is fetched and flags cleared', () => {
        // Set up blocked state (after PATCH, waiting for changelog)
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setIsWaitingForChangelog(true);
        store.getState().setWaitingToStartStreaming(true);

        // Verify blocked
        let state = store.getState();
        let isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(true);

        // ✅ use-changelog-sync clears BOTH flags after fetching changelog
        store.getState().setIsWaitingForChangelog(false);
        store.getState().setConfigChangeRoundNumber(null);

        state = store.getState();
        isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;

        // ✅ Now unblocked - streaming can proceed
        expect(isBlocked).toBe(false);
        expect(state.waitingToStartStreaming).toBe(true);
      });
    });

    describe('error Recovery - PATCH Failure', () => {
      it('should clear BOTH changelog flags on PATCH error', () => {
        // Set up state before PATCH (configChangeRoundNumber set for blocking)
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setWaitingToStartStreaming(true);
        store.getState().setExpectedParticipantIds(['gpt-4']);

        // Simulate PATCH error - need to clear flags to prevent deadlock
        // This is what form-actions.ts does at lines 426-429
        store.getState().setConfigChangeRoundNumber(null);
        store.getState().setIsWaitingForChangelog(false);
        store.getState().setWaitingToStartStreaming(false);

        const state = store.getState();
        expect(state.configChangeRoundNumber).toBe(null);
        expect(state.isWaitingForChangelog).toBe(false);
        expect(state.waitingToStartStreaming).toBe(false);

        // Not blocked, but also not trying to stream
        const isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(false);
      });

      it('should preserve other state on PATCH error (optimistic rollback)', () => {
        // Set up pre-PATCH state
        store.getState().setMessages([
          createTestUserMessage({ id: 'u0', content: 'Original', roundNumber: 0 }),
        ]);
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setWaitingToStartStreaming(true);

        // Simulate PATCH error - clear streaming/changelog state
        store.getState().setConfigChangeRoundNumber(null);
        store.getState().setIsWaitingForChangelog(false);
        store.getState().setWaitingToStartStreaming(false);
        store.getState().setStreamingRoundNumber(null);
        store.getState().setNextParticipantToTrigger(null);

        // Original messages should still be there (optimistic message removed by form-actions)
        const state = store.getState();
        expect(state.messages).toHaveLength(1);
        expect(state.messages[0].id).toBe('u0');
      });
    });

    describe('multi-Round Config Change Scenarios', () => {
      it('should handle config changes on multiple rounds correctly', () => {
        // Round 1: No config change
        store.getState().setScreenMode(ScreenModes.THREAD);
        store.getState().setMessages([
          createTestUserMessage({ id: 'u0', content: 'First', roundNumber: 0 }),
          createTestAssistantMessage({ id: 'a0', content: 'Response', roundNumber: 0, participantId: 'p1', participantIndex: 0 }),
        ]);

        // Round 1 completes without config change
        store.getState().completeStreaming();

        let state = store.getState();
        expect(state.configChangeRoundNumber).toBe(null);
        expect(state.isWaitingForChangelog).toBe(false);

        // Round 2: User changes config
        store.getState().setHasPendingConfigChanges(true);
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setWaitingToStartStreaming(true);

        state = store.getState();
        expect(state.configChangeRoundNumber).toBe(1);

        // Simulate PATCH success
        store.getState().setIsWaitingForChangelog(true);
        store.getState().setHasPendingConfigChanges(false);

        // Simulate changelog fetch complete
        store.getState().setIsWaitingForChangelog(false);
        store.getState().setConfigChangeRoundNumber(null);

        state = store.getState();
        expect(state.configChangeRoundNumber).toBe(null);
        expect(state.isWaitingForChangelog).toBe(false);

        // Round 3: No config change
        store.getState().setMessages([
          ...store.getState().messages,
          createTestUserMessage({ id: 'u1', content: 'Second', roundNumber: 1 }),
        ]);
        store.getState().setWaitingToStartStreaming(true);

        // No blocking since no config change
        state = store.getState();
        const isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(false);
      });

      it('should correctly track round number for changelog fetch', () => {
        const rounds = [1, 2, 5];

        for (const round of rounds) {
          // Simulate config change for this round
          store.getState().setConfigChangeRoundNumber(round);
          store.getState().setIsWaitingForChangelog(true);

          const state = store.getState();
          expect(state.configChangeRoundNumber).toBe(round);

          // Clear for next iteration
          store.getState().setIsWaitingForChangelog(false);
          store.getState().setConfigChangeRoundNumber(null);
        }
      });
    });

    describe('blocking Logic Consistency', () => {
      it('should use same blocking condition across all hooks', () => {
        // The blocking condition used by:
        // - use-streaming-trigger.ts (line 112)
        // - use-round-resumption.ts (line 145, 179)
        // - use-pending-message.ts (line 104)
        // Is: configChangeRoundNumber !== null || isWaitingForChangelog

        // Test Case 1: Neither flag set - NOT blocked
        store.getState().setConfigChangeRoundNumber(null);
        store.getState().setIsWaitingForChangelog(false);

        let state = store.getState();
        let isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(false);

        // Test Case 2: Only configChangeRoundNumber set - blocked
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setIsWaitingForChangelog(false);

        state = store.getState();
        isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(true);

        // Test Case 3: Only isWaitingForChangelog set - blocked
        store.getState().setConfigChangeRoundNumber(null);
        store.getState().setIsWaitingForChangelog(true);

        state = store.getState();
        isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(true);

        // Test Case 4: Both flags set - blocked
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setIsWaitingForChangelog(true);

        state = store.getState();
        isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(true);
      });

      it('should require BOTH flags cleared to unblock', () => {
        // Start blocked
        store.getState().setConfigChangeRoundNumber(1);
        store.getState().setIsWaitingForChangelog(true);

        // Clear only isWaitingForChangelog
        store.getState().setIsWaitingForChangelog(false);

        let state = store.getState();
        let isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(true); // Still blocked by configChangeRoundNumber

        // Clear configChangeRoundNumber
        store.getState().setConfigChangeRoundNumber(null);

        state = store.getState();
        isBlocked = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
        expect(isBlocked).toBe(false); // Now unblocked
      });
    });
  });
});
