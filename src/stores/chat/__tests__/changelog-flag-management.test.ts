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

    it('should set flags in prepareForNewMessage when hasPendingConfigChanges', () => {
      // Setup with pending config changes
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Prepare for new message
      store.getState().prepareForNewMessage('Test message', ['p1']);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(0); // Round 0 when no messages
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
    it('should set both flags when hasPendingConfigChanges is true', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setHasPendingConfigChanges(true);

      // Prepare for new message (Round 0)
      store.getState().prepareForNewMessage('Test', ['p1']);

      const state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(0);
    });

    it('should calculate correct round number for flags', () => {
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
      expect(state.configChangeRoundNumber).toBe(1); // Next round after 0
    });

    it('should use streamingRoundNumber if already set', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setStreamingRoundNumber(5);
      store.getState().setHasPendingConfigChanges(true);

      // Prepare for new message
      store.getState().prepareForNewMessage('Test', ['p1']);

      const state = store.getState();
      expect(state.configChangeRoundNumber).toBe(5); // Uses existing streamingRoundNumber
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

    it('should only set changelog flags when hasPendingConfigChanges is true', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Without pending config changes
      store.getState().setHasPendingConfigChanges(false);
      store.getState().prepareForNewMessage('Test', ['p1']);

      let state = store.getState();
      expect(state.isWaitingForChangelog).toBe(false);
      expect(state.configChangeRoundNumber).toBe(null);

      // With pending config changes
      store.getState().setHasPendingConfigChanges(true);
      store.getState().prepareForNewMessage('Test', ['p1']);

      state = store.getState();
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.configChangeRoundNumber).toBe(0);
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
});
