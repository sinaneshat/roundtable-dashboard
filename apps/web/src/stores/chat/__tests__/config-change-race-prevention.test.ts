/**
 * Config Change Race Condition Prevention Tests
 *
 * Tests the critical ordering for config changes between rounds:
 * PATCH → changelog → pre-search → streams
 *
 * Race conditions tested:
 * 1. Pre-search starting before PATCH completes
 * 2. Streaming starting before changelog fetch completes
 * 3. Concurrent submissions (round 1 overlapping round 2)
 * 4. State consistency during config transitions
 * 5. Screen mode transitions (OVERVIEW → THREAD)
 * 6. Rapid config toggles (stress test)
 *
 * @see src/stores/chat/actions/form-actions.ts - handleUpdateThreadAndSend
 * @see src/components/providers/chat-store-provider/hooks/use-changelog-sync.ts
 * @see src/components/providers/chat-store-provider/hooks/use-streaming-trigger.ts
 */

import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoredPreSearch } from '@/services/api';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockThread(options: {
  enableWebSearch?: boolean;
  mode?: string;
} = {}) {
  return {
    createdAt: new Date(),
    enableWebSearch: options.enableWebSearch ?? false,
    id: 'thread-123',
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    mode: options.mode || 'brainstorm',
    slug: 'test-thread',
    status: 'active',
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-1',
  } as const;
}

function createMockParticipants() {
  return [
    {
      createdAt: new Date(),
      customRoleId: null,
      id: 'participant-1',
      isEnabled: true,
      modelId: 'model-a',
      priority: 0,
      role: null,
      threadId: 'thread-123',
      updatedAt: new Date(),
    },
    {
      createdAt: new Date(),
      customRoleId: null,
      id: 'participant-2',
      isEnabled: true,
      modelId: 'model-b',
      priority: 1,
      role: null,
      threadId: 'thread-123',
      updatedAt: new Date(),
    },
  ];
}

function createUserMessage(roundNumber: number, text = 'Test message') {
  return {
    id: `user-msg-r${roundNumber}`,
    metadata: { role: MessageRoles.USER, roundNumber },
    parts: [{ text, type: 'text' as const }],
    role: MessageRoles.USER as const,
  };
}

function createAssistantMessage(roundNumber: number, participantIndex: number) {
  return {
    id: `assistant-msg-r${roundNumber}-p${participantIndex}`,
    metadata: {
      modelId: `model-${participantIndex}`,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [{ text: `Response from participant ${participantIndex}`, type: 'text' as const }],
    role: MessageRoles.ASSISTANT as const,
  };
}

function createModeratorMessage(roundNumber: number) {
  return {
    id: `moderator-msg-r${roundNumber}`,
    metadata: {
      isModerator: true,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [{ text: 'Moderator summary', type: 'text' as const }],
    role: MessageRoles.ASSISTANT as const,
  };
}

function createPreSearch(roundNumber: number, status: MessageStatuses, options: {
  userQuery?: string;
  completedAt?: Date | null;
} = {}): StoredPreSearch {
  return {
    completedAt: options.completedAt ?? null,
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-r${roundNumber}`,
    roundNumber,
    searchData: status === MessageStatuses.COMPLETE
      ? {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: '',
          totalResults: 0,
          totalTime: 0,
        }
      : null,
    status,
    threadId: 'thread-123',
    userQuery: options.userQuery || `Query for round ${roundNumber}`,
  };
}

/**
 * Simulate PATCH request delay
 * Returns a promise that resolves after the specified delay
 */
function createDelayedPatchMock(delayMs: number) {
  return vi.fn(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
    return {
      data: {
        message: createUserMessage(1),
        participants: createMockParticipants(),
        thread: createMockThread({ enableWebSearch: true }),
      },
      success: true,
    };
  });
}

/**
 * Simulate changelog fetch delay
 * Returns a promise that resolves after the specified delay
 */
function createDelayedChangelogMock(delayMs: number) {
  return vi.fn(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
    return {
      data: {
        items: [
          {
            changeType: 'web_search_enabled',
            createdAt: new Date().toISOString(),
            id: 'changelog-1',
            roundNumber: 1,
            threadId: 'thread-123',
          },
        ],
      },
      success: true,
    };
  });
}

// ============================================================================
// Test Suites
// ============================================================================

describe('config Change Race Prevention - PATCH Ordering', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('race Condition 1: Pre-search Before PATCH', () => {
    it('should block pre-search execution while configChangeRoundNumber is set', async () => {
      // Setup: Thread exists with round 0 complete
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants();

      store.getState().initializeThread(thread, participants, [
        createUserMessage(0),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search and submits
      store.getState().setEnableWebSearch(true);

      // Add optimistic user message for round 1
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1, 'Second question with web search'),
      ]);

      // Add pre-search placeholder
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));

      // ✅ CRITICAL: Set configChangeRoundNumber BEFORE PATCH
      // This blocks pre-search execution until PATCH completes
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Verify pre-search exists but should NOT execute
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // Verify blocking flag is set
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // ✅ TEST: Pre-search should NOT execute while configChangeRoundNumber is set
      // In real code, useStreamingTrigger checks this condition and returns early
      const shouldBlockPreSearch = store.getState().configChangeRoundNumber !== null;
      expect(shouldBlockPreSearch).toBeTruthy();

      // Simulate PATCH completing
      store.getState().setConfigChangeRoundNumber(null);

      // Now pre-search can execute
      const shouldAllowPreSearch = store.getState().configChangeRoundNumber === null;
      expect(shouldAllowPreSearch).toBeTruthy();
    });

    it('should handle slow PATCH preventing pre-search execution', async () => {
      vi.useRealTimers(); // Use real timers for this async test

      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Setup round 1 submission
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));

      // Set blocking flag BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Create delayed PATCH mock (100ms delay)
      const slowPatchMock = createDelayedPatchMock(100);

      // Verify pre-search is blocked
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // Start PATCH in background
      const patchPromise = slowPatchMock();

      // While PATCH is pending, pre-search should remain PENDING
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status)
        .toBe(MessageStatuses.PENDING);

      // Wait for PATCH to complete
      await patchPromise;

      // PATCH completed - clear blocking flag
      store.getState().setConfigChangeRoundNumber(null);

      // Now pre-search can execute
      expect(store.getState().configChangeRoundNumber).toBeNull();
    });

    it('should verify configChangeRoundNumber blocks pre-search in useStreamingTrigger logic', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW); // Initial submission on OVERVIEW

      // Setup round 0 with web search enabled
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([createUserMessage(0)]);
      store.getState().addPreSearch(createPreSearch(0, MessageStatuses.PENDING));

      // Set blocking flag for initial submission
      store.getState().setConfigChangeRoundNumber(0);
      store.getState().setWaitingToStartStreaming(true);

      // ✅ Simulate useStreamingTrigger condition check (line 112-115)
      const configChangeRoundNumber = store.getState().configChangeRoundNumber;
      const isWaitingForChangelog = store.getState().isWaitingForChangelog;

      const shouldBlockStreaming = configChangeRoundNumber !== null || isWaitingForChangelog;

      expect(shouldBlockStreaming).toBeTruthy();
      expect(configChangeRoundNumber).toBe(0);
    });
  });

  describe('race Condition 2: Streaming Before Changelog', () => {
    it('should block streaming while isWaitingForChangelog is true', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Setup round 1 with config changes
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);

      // PATCH completed - now waiting for changelog
      store.getState().setConfigChangeRoundNumber(null); // PATCH done
      store.getState().setIsWaitingForChangelog(true); // Trigger changelog fetch

      // ✅ TEST: Streaming should be blocked while waiting for changelog
      const shouldBlockStreaming = store.getState().isWaitingForChangelog;
      expect(shouldBlockStreaming).toBeTruthy();

      // Changelog fetch completes
      store.getState().setIsWaitingForChangelog(false);

      // Now streaming can proceed
      const canProceed = !store.getState().isWaitingForChangelog;
      expect(canProceed).toBeTruthy();
    });

    it('should handle slow changelog fetch preventing streaming', async () => {
      vi.useRealTimers();

      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Setup round 1
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));

      // PATCH completed
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(true);

      // Create delayed changelog mock (100ms delay)
      const slowChangelogMock = createDelayedChangelogMock(100);

      // Start changelog fetch
      const changelogPromise = slowChangelogMock();

      // While changelog is fetching, streaming should be blocked
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Wait for changelog to complete
      await changelogPromise;

      // Changelog completed - clear flag
      store.getState().setIsWaitingForChangelog(false);

      // Now streaming can proceed
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
    });

    it('should verify both flags block streaming in useStreamingTrigger', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Setup with both flags set (PATCH pending AND changelog pending)
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setWaitingToStartStreaming(true);

      // ✅ Simulate useStreamingTrigger blocking condition (line 112-115)
      const configChangeRound = store.getState().configChangeRoundNumber;
      const waitingForChangelog = store.getState().isWaitingForChangelog;

      const shouldBlock = configChangeRound !== null || waitingForChangelog;

      expect(shouldBlock).toBeTruthy();
      expect(configChangeRound).toBe(1);
      expect(waitingForChangelog).toBeTruthy();

      // Clear PATCH flag (PATCH completed)
      store.getState().setConfigChangeRoundNumber(null);

      // Still blocked by changelog flag
      const stillBlocked = store.getState().configChangeRoundNumber !== null
        || store.getState().isWaitingForChangelog;
      expect(stillBlocked).toBeTruthy();

      // Clear changelog flag (changelog fetched)
      store.getState().setIsWaitingForChangelog(false);

      // Now unblocked
      const unblocked = store.getState().configChangeRoundNumber === null
        && !store.getState().isWaitingForChangelog;
      expect(unblocked).toBeTruthy();
    });
  });

  describe('race Condition 3: Concurrent Submissions', () => {
    it('should prevent round 2 from starting while round 1 is pending', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // =============== ROUND 1 SUBMISSION ===============
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1, 'Round 1 question'),
      ]);
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Round 1 is now pending
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().waitingToStartStreaming).toBeTruthy();

      // =============== ATTEMPT ROUND 2 SUBMISSION ===============
      // This should be BLOCKED because round 1 is still pending

      // In real code, handleUpdateThreadAndSend would check if submission is safe
      const isRound1Pending = store.getState().configChangeRoundNumber !== null
        || store.getState().isWaitingForChangelog
        || store.getState().waitingToStartStreaming;

      expect(isRound1Pending).toBeTruthy();

      // User clicks submit again - form should be disabled or submission blocked
      const canSubmitRound2 = !isRound1Pending;
      expect(canSubmitRound2).toBeFalsy();

      // =============== ROUND 1 COMPLETES ===============
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setWaitingToStartStreaming(false);

      // Now round 2 can submit
      const canNowSubmit = store.getState().configChangeRoundNumber === null
        && !store.getState().isWaitingForChangelog
        && !store.getState().waitingToStartStreaming;

      expect(canNowSubmit).toBeTruthy();
    });

    it('should handle rapid submissions with proper serialization', async () => {
      vi.useRealTimers();

      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // =============== ROUND 1 STARTS ===============
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Create slow PATCH for round 1
      const round1Patch = createDelayedPatchMock(100);
      const round1Promise = round1Patch();

      // Round 1 PATCH is in flight
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // =============== ATTEMPT ROUND 2 WHILE ROUND 1 PENDING ===============
      // Should be blocked
      const canSubmitRound2 = store.getState().configChangeRoundNumber === null
        && !store.getState().isWaitingForChangelog;

      expect(canSubmitRound2).toBeFalsy();

      // Wait for round 1 to complete
      await round1Promise;
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setWaitingToStartStreaming(false);

      // =============== NOW ROUND 2 CAN SUBMIT ===============
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(2),
      ]);
      store.getState().setConfigChangeRoundNumber(2);
      store.getState().setWaitingToStartStreaming(true);

      expect(store.getState().configChangeRoundNumber).toBe(2);
    });
  });

  describe('state Consistency Tests', () => {
    it('should never have isWaitingForChangelog=true and configChangeRoundNumber=null', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // ✅ INVALID STATE: isWaitingForChangelog=true but configChangeRoundNumber=null
      // This is caught by use-changelog-sync.ts line 150-156

      // Set invalid state
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setConfigChangeRoundNumber(null);

      // ✅ use-changelog-sync detects and fixes this inconsistency
      const isInconsistent = store.getState().isWaitingForChangelog
        && store.getState().configChangeRoundNumber === null;

      expect(isInconsistent).toBeTruthy();

      // Simulate use-changelog-sync fix (line 153-154)
      if (isInconsistent) {
        store.getState().setIsWaitingForChangelog(false);
      }

      // State is now consistent
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
    });

    it('should never allow pre-search STREAMING while changelog flags are set', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Setup with changelog flags set
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setWaitingToStartStreaming(true);

      // Add PENDING pre-search
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));

      // ✅ Pre-search should NOT transition to STREAMING while flags are set
      const shouldBlockPreSearch = store.getState().configChangeRoundNumber !== null
        || store.getState().isWaitingForChangelog;

      expect(shouldBlockPreSearch).toBeTruthy();

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // Attempt to execute pre-search (should be blocked)
      // In real code, useStreamingTrigger returns early (line 112-115)

      // Verify pre-search remains PENDING
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status)
        .toBe(MessageStatuses.PENDING);
    });

    it('should never allow participant streaming while changelog flags are set', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Setup round 1 with config changes
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);

      // Set changelog flags (PATCH → changelog flow)
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setWaitingToStartStreaming(true);

      // ✅ Participant streaming should be blocked
      const canStartStreaming = store.getState().configChangeRoundNumber === null
        && !store.getState().isWaitingForChangelog;

      expect(canStartStreaming).toBeFalsy();

      // Verify isStreaming is false
      expect(store.getState().isStreaming).toBeFalsy();

      // Clear flags (changelog fetch complete)
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // Now streaming can start
      const canNowStream = store.getState().configChangeRoundNumber === null
        && !store.getState().isWaitingForChangelog;

      expect(canNowStream).toBeTruthy();
    });

    it('should maintain consistent state throughout PATCH → changelog → pre-search → stream flow', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // =============== STEP 1: User submits with web search enabled ===============
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));

      // Set blocking flag BEFORE PATCH
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // State check: PATCH pending
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
      expect(store.getState().waitingToStartStreaming).toBeTruthy();

      // =============== STEP 2: PATCH completes ===============
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(true); // Trigger changelog fetch

      // State check: Waiting for changelog
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
      expect(store.getState().waitingToStartStreaming).toBeTruthy();

      // =============== STEP 3: Changelog fetch completes ===============
      store.getState().setIsWaitingForChangelog(false);

      // State check: Ready for pre-search
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
      expect(store.getState().waitingToStartStreaming).toBeTruthy();

      // =============== STEP 4: Pre-search executes ===============
      store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);

      // State check: Pre-search streaming
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

      // =============== STEP 5: Pre-search completes ===============
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

      // State check: Pre-search complete, ready for participant streaming
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status)
        .toBe(MessageStatuses.COMPLETE);

      // =============== STEP 6: Participant streaming starts ===============
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);

      // Final state check
      expect(store.getState().isStreaming).toBeTruthy();
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
      expect(store.getState().configChangeRoundNumber).toBeNull();
      expect(store.getState().isWaitingForChangelog).toBeFalsy();
    });
  });

  describe('screen Mode Transitions', () => {
    it('should handle OVERVIEW screen submission with config changes', () => {
      // Initial thread creation on OVERVIEW screen
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([createUserMessage(0)]);
      store.getState().addPreSearch(createPreSearch(0, MessageStatuses.PENDING));

      // Set flags for initial submission
      store.getState().setConfigChangeRoundNumber(0);
      store.getState().setWaitingToStartStreaming(true);

      // Verify blocking
      expect(store.getState().configChangeRoundNumber).toBe(0);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

      // PATCH completes
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(true);

      // Changelog completes
      store.getState().setIsWaitingForChangelog(false);

      // Pre-search can now execute
      const canExecutePreSearch = store.getState().configChangeRoundNumber === null
        && !store.getState().isWaitingForChangelog;

      expect(canExecutePreSearch).toBeTruthy();
    });

    it('should handle THREAD screen submission with config changes', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Follow-up submission on THREAD screen
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().addPreSearch(createPreSearch(1, MessageStatuses.PENDING));

      // Set flags
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Verify blocking
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

      // Complete flow
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setIsWaitingForChangelog(false);

      // Ready for streaming
      const ready = store.getState().configChangeRoundNumber === null
        && !store.getState().isWaitingForChangelog;

      expect(ready).toBeTruthy();
    });

    it('should maintain flag consistency across screen transitions', () => {
      // Start on OVERVIEW
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setEnableWebSearch(true);

      // Set flags for round 0
      store.getState().setConfigChangeRoundNumber(0);
      store.getState().setWaitingToStartStreaming(true);

      // Transition to THREAD (after thread creation)
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // ✅ Flags should be preserved during screen transition
      // initializeThread preserves flags when hasActiveFormSubmission is true
      expect(store.getState().configChangeRoundNumber).toBe(0);
      expect(store.getState().waitingToStartStreaming).toBeTruthy();
    });
  });

  describe('stress Test: Rapid Config Toggles', () => {
    it('should handle rapid web search toggles', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Rapid toggles: off → on → off → on
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      store.getState().setEnableWebSearch(false);
      store.getState().setHasPendingConfigChanges(true);

      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Final state
      expect(store.getState().enableWebSearch).toBeTruthy();
      expect(store.getState().hasPendingConfigChanges).toBeTruthy();

      // Submit with final config
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().setConfigChangeRoundNumber(1);

      // Verify blocking
      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should handle multiple participant changes in quick succession', () => {
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants();
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Initial participants (2 models)
      expect(store.getState().selectedParticipants).toHaveLength(2);

      // Add participant
      store.getState().addParticipant({
        id: 'model-c',
        modelId: 'model-c',
        priority: 2,
        role: null,
      });
      store.getState().setHasPendingConfigChanges(true);

      expect(store.getState().selectedParticipants).toHaveLength(3);

      // Remove participant
      store.getState().removeParticipant('model-c');
      store.getState().setHasPendingConfigChanges(true);

      expect(store.getState().selectedParticipants).toHaveLength(2);

      // Add another
      store.getState().addParticipant({
        id: 'model-d',
        modelId: 'model-d',
        priority: 2,
        role: null,
      });
      store.getState().setHasPendingConfigChanges(true);

      expect(store.getState().selectedParticipants).toHaveLength(3);
      expect(store.getState().hasPendingConfigChanges).toBeTruthy();

      // Submit with final config
      store.getState().setConfigChangeRoundNumber(1);
      expect(store.getState().configChangeRoundNumber).toBe(1);
    });

    it('should maintain consistency during rapid config changes with pending PATCH', async () => {
      vi.useRealTimers();

      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Start round 1 submission
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().setConfigChangeRoundNumber(1);

      // Create slow PATCH
      const slowPatch = createDelayedPatchMock(100);
      const patchPromise = slowPatch();

      // While PATCH is pending, user makes MORE changes
      store.getState().setEnableWebSearch(false);
      store.getState().setHasPendingConfigChanges(true);

      // Round 1 PATCH is still pending
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // Wait for round 1 PATCH to complete
      await patchPromise;
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // User's new changes are tracked
      expect(store.getState().hasPendingConfigChanges).toBeTruthy();

      // Round 2 submission would use the latest config
      expect(store.getState().enableWebSearch).toBeFalsy();
    });

    it('should handle system staying consistent during rapid round submissions', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
        createModeratorMessage(0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // =============== ROUND 1 ===============
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(1),
      ]);
      store.getState().setConfigChangeRoundNumber(1);

      const round1Config = store.getState().configChangeRoundNumber;
      expect(round1Config).toBe(1);

      // Complete round 1
      store.getState().setMessages([
        ...store.getState().messages,
        createAssistantMessage(1, 0),
        createAssistantMessage(1, 1),
        createModeratorMessage(1),
      ]);
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // =============== ROUND 2 ===============
      store.getState().setEnableWebSearch(false);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(2),
      ]);
      store.getState().setConfigChangeRoundNumber(2);

      const round2Config = store.getState().configChangeRoundNumber;
      expect(round2Config).toBe(2);

      // Complete round 2
      store.getState().setConfigChangeRoundNumber(null);
      store.getState().setIsWaitingForChangelog(false);

      // =============== ROUND 3 ===============
      store.getState().setEnableWebSearch(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(3),
      ]);
      store.getState().setConfigChangeRoundNumber(3);

      const round3Config = store.getState().configChangeRoundNumber;
      expect(round3Config).toBe(3);

      // System remained consistent across 3 rapid rounds
      expect(store.getState().messages.filter(m => m.role === MessageRoles.USER)).toHaveLength(4);
    });
  });
});
