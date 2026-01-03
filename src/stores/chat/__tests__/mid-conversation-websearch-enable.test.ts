/**
 * Mid-Conversation Web Search Enable Test
 *
 * Tests the specific bug scenario:
 * 1. Start conversation WITHOUT web search enabled (Round 0 completes)
 * 2. Enable web search mid-conversation
 * 3. Select preset participants
 * 4. Submit message for Round 1
 * 5. BUG: Web search completes but first participant never starts
 *
 * Root Cause:
 * - `useStreamingTrigger` only handles OVERVIEW screen
 * - `usePendingMessage` creates/waits for pre-search but doesn't EXECUTE it
 * - On THREAD screen with PENDING pre-search, nothing triggers execution
 *
 * @see docs/FLOW_DOCUMENTATION.md Section 2 - Mid-Conversation Web Search Toggle
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles, MessageStatuses, ScreenModes } from '@/api/core/enums';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';
import { getEffectiveWebSearchEnabled, shouldWaitForPreSearch } from '../utils/pre-search-execution';

// Helper to create mock messages
function createUserMessage(roundNumber: number, text = 'Test message') {
  return {
    id: `user-msg-r${roundNumber}`,
    role: MessageRoles.USER as const,
    parts: [{ type: 'text' as const, text }],
    metadata: { roundNumber, role: MessageRoles.USER },
  };
}

function createAssistantMessage(roundNumber: number, participantIndex: number) {
  return {
    id: `assistant-msg-r${roundNumber}-p${participantIndex}`,
    role: MessageRoles.ASSISTANT as const,
    parts: [{ type: 'text' as const, text: `Response from participant ${participantIndex}` }],
    metadata: {
      roundNumber,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      modelId: `model-${participantIndex}`,
    },
  };
}

function createModeratorMessage(roundNumber: number) {
  return {
    id: `moderator-msg-r${roundNumber}`,
    role: MessageRoles.ASSISTANT as const,
    parts: [{ type: 'text' as const, text: 'Moderator summary' }],
    metadata: {
      roundNumber,
      role: MessageRoles.ASSISTANT,
      isModerator: true,
    },
  };
}

function createMockThread(options: {
  enableWebSearch?: boolean;
  mode?: string;
} = {}) {
  return {
    id: 'thread-123',
    userId: 'user-1',
    title: 'Test Thread',
    slug: 'test-thread',
    mode: options.mode || 'brainstorm',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: options.enableWebSearch ?? false,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };
}

function createMockParticipants() {
  return [
    {
      id: 'participant-1',
      threadId: 'thread-123',
      modelId: 'model-a',
      role: null,
      priority: 0,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'participant-2',
      threadId: 'thread-123',
      modelId: 'model-b',
      role: null,
      priority: 1,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

describe('mid-Conversation Web Search Enable Bug', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('bug Scenario: Enable Web Search Mid-Conversation', () => {
    it('should detect that form web search is true but thread web search is false', () => {
      // Setup: Thread has web search disabled
      const thread = createMockThread({ enableWebSearch: false });

      // User enables web search in form
      const formEnableWebSearch = true;

      // getEffectiveWebSearchEnabled should return form state (user intent)
      const effective = getEffectiveWebSearchEnabled(thread, formEnableWebSearch);

      expect(effective).toBe(true);
      expect(thread.enableWebSearch).toBe(false); // Thread still has old value
    });

    it('should wait for PENDING pre-search when web search enabled', () => {
      const webSearchEnabled = true;
      const pendingPreSearch = {
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test query',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      };

      // Should wait for PENDING pre-search
      expect(shouldWaitForPreSearch(webSearchEnabled, pendingPreSearch)).toBe(true);
    });

    it('should NOT wait for COMPLETE pre-search', () => {
      const webSearchEnabled = true;
      const completePreSearch = {
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test query',
        status: MessageStatuses.COMPLETE,
        searchData: { queries: [], results: [], summary: '', successCount: 0, failureCount: 0, totalResults: 0, totalTime: 0 },
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      };

      // Should NOT wait for COMPLETE pre-search
      expect(shouldWaitForPreSearch(webSearchEnabled, completePreSearch)).toBe(false);
    });

    it('should simulate the full bug scenario flow', () => {
      // =====================================================
      // SETUP: Round 0 completed WITHOUT web search
      // =====================================================
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants();

      // Initialize with round 0 complete
      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'First question'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
        createModeratorMessage(0),
      ]);

      // Set screen mode to THREAD (after navigation)
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify initial state
      expect(store.getState().thread?.enableWebSearch).toBe(false);
      expect(store.getState().enableWebSearch).toBe(false);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
      expect(store.getState().messages).toHaveLength(4);

      // =====================================================
      // USER ACTION: Enable web search mid-conversation
      // =====================================================
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Verify form state updated but thread state unchanged
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // =====================================================
      // USER ACTION: Submit message (simulates handleUpdateThreadAndSend)
      // =====================================================
      const nextRoundNumber = 1;

      // Add optimistic user message
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMessage(nextRoundNumber, 'Second question'),
      ]);

      // Create PENDING pre-search (as handleUpdateThreadAndSend does)
      store.getState().addPreSearch({
        id: `placeholder-presearch-thread-123-${nextRoundNumber}`,
        threadId: 'thread-123',
        roundNumber: nextRoundNumber,
        userQuery: 'Second question',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Set streaming state
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);

      // =====================================================
      // BUG CHECK: Pre-search is PENDING, nobody executes it
      // =====================================================
      const preSearchForRound = store.getState().preSearches.find(
        ps => ps.roundNumber === nextRoundNumber,
      );

      expect(preSearchForRound).toBeDefined();
      expect(preSearchForRound?.status).toBe(MessageStatuses.PENDING);

      // Web search IS enabled from form state
      const webSearchEnabled = getEffectiveWebSearchEnabled(
        store.getState().thread,
        store.getState().enableWebSearch,
      );
      expect(webSearchEnabled).toBe(true);

      // Should wait for pre-search (it's PENDING)
      expect(shouldWaitForPreSearch(webSearchEnabled, preSearchForRound)).toBe(true);

      // State check: System is stuck waiting
      expect(store.getState().waitingToStartStreaming).toBe(true);
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

      // =====================================================
      // THIS IS THE BUG:
      // - We're on THREAD screen (not OVERVIEW)
      // - useStreamingTrigger only runs on OVERVIEW
      // - Pre-search is PENDING but nobody executes it
      // - usePendingMessage just waits for PENDING/STREAMING to complete
      // - Result: Stuck forever waiting
      // =====================================================

      // Verify the conditions that cause the bug
      const bugConditions = {
        screenModeIsThread: store.getState().screenMode === ScreenModes.THREAD,
        preSearchIsPending: preSearchForRound?.status === MessageStatuses.PENDING,
        webSearchEnabledInForm: store.getState().enableWebSearch === true,
        webSearchDisabledInThread: store.getState().thread?.enableWebSearch === false,
        waitingToStartStreaming: store.getState().waitingToStartStreaming === true,
        notStreaming: store.getState().isStreaming === false,
      };

      // All conditions that cause the bug are present
      expect(bugConditions.screenModeIsThread).toBe(true);
      expect(bugConditions.preSearchIsPending).toBe(true);
      expect(bugConditions.webSearchEnabledInForm).toBe(true);
      expect(bugConditions.webSearchDisabledInThread).toBe(true);
      expect(bugConditions.waitingToStartStreaming).toBe(true);
      expect(bugConditions.notStreaming).toBe(true);
    });

    it('should detect PENDING pre-search needs execution on THREAD screen', () => {
      // This test verifies the detection logic that should trigger execution
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants();

      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'First question'),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add PENDING pre-search
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Function to check if pre-search needs execution
      // This is the logic that should be added to usePendingMessage
      function needsPreSearchExecution(state: ReturnType<typeof store.getState>) {
        // Only on THREAD screen
        if (state.screenMode !== ScreenModes.THREAD)
          return false;

        // Web search must be enabled
        const webSearchEnabled = getEffectiveWebSearchEnabled(state.thread, state.enableWebSearch);
        if (!webSearchEnabled)
          return false;

        // Must have messages to determine round
        if (state.messages.length === 0)
          return false;

        // Find current round's pre-search
        // Use the latest round number from messages
        const roundNumbers = state.messages
          .map(m => (m.metadata as { roundNumber?: number })?.roundNumber)
          .filter((r): r is number => r !== undefined);
        const currentRound = roundNumbers.length > 0 ? Math.max(...roundNumbers) : 0;
        const nextRound = currentRound + 1;

        // Check if there's a PENDING pre-search for next round that needs execution
        const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === nextRound);
        if (!preSearchForRound)
          return false;

        return preSearchForRound.status === MessageStatuses.PENDING;
      }

      expect(needsPreSearchExecution(store.getState())).toBe(true);
    });
  });

  describe('pre-Search Execution Requirements', () => {
    it('should NOT need execution when web search is disabled', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(false);

      const webSearchEnabled = getEffectiveWebSearchEnabled(
        store.getState().thread,
        store.getState().enableWebSearch,
      );

      expect(webSearchEnabled).toBe(false);
    });

    it('should NOT wait when pre-search is COMPLETE', () => {
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.COMPLETE,
        searchData: { queries: [], results: [], summary: '', successCount: 0, failureCount: 0, totalResults: 0, totalTime: 0 },
        createdAt: new Date(),
        completedAt: new Date(),
        errorMessage: null,
      });

      const preSearch = store.getState().preSearches[0];
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });

    it('should NOT wait when pre-search is FAILED', () => {
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.FAILED,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: 'Search failed',
      });

      const preSearch = store.getState().preSearches[0];
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });

    it('should wait when pre-search is STREAMING', () => {
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const preSearch = store.getState().preSearches[0];
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);
    });
  });

  describe('pre-Search Tracking State', () => {
    it('should track pre-search as triggered to prevent duplicates', () => {
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);

      // Mark as triggered
      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Clear tracking
      store.getState().clearPreSearchTracking(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should use tryMarkPreSearchTriggered for atomic check-and-mark', () => {
      // First call should succeed
      expect(store.getState().tryMarkPreSearchTriggered(1)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Second call should fail (already triggered)
      expect(store.getState().tryMarkPreSearchTriggered(1)).toBe(false);
    });
  });

  describe('form State vs Thread State', () => {
    it('should use form state for current round web search decision', () => {
      // Thread has web search disabled
      const thread = createMockThread({ enableWebSearch: false });

      // User enabled web search in form
      const formEnableWebSearch = true;

      // getEffectiveWebSearchEnabled should return form state (not thread state)
      expect(getEffectiveWebSearchEnabled(thread, formEnableWebSearch)).toBe(true);
    });

    it('should use form state even when thread has web search enabled', () => {
      // Thread has web search enabled
      const thread = createMockThread({ enableWebSearch: true });

      // User disabled web search in form
      const formEnableWebSearch = false;

      // getEffectiveWebSearchEnabled should return form state (not thread state)
      expect(getEffectiveWebSearchEnabled(thread, formEnableWebSearch)).toBe(false);
    });
  });

  describe('screen Mode Constraints', () => {
    it('should recognize THREAD screen is different from OVERVIEW', () => {
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

      store.getState().setScreenMode(ScreenModes.THREAD);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
      expect(store.getState().screenMode).not.toBe(ScreenModes.OVERVIEW);
    });

    it('should verify useStreamingTrigger condition blocks THREAD screen', () => {
      // This documents the blocking condition in useStreamingTrigger
      // Line 81: if (currentScreenMode !== ScreenModes.OVERVIEW) return;

      store.getState().setScreenMode(ScreenModes.THREAD);

      // Condition that would block useStreamingTrigger
      const wouldBlockStreamingTrigger = store.getState().screenMode !== ScreenModes.OVERVIEW;

      expect(wouldBlockStreamingTrigger).toBe(true);
    });
  });

  describe('expected Fix Behavior', () => {
    it('should complete pre-search and allow participant streaming', () => {
      // Setup the bug scenario
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants();

      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'First question'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add PENDING pre-search
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Simulate pre-search execution completing
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

      // Now should NOT wait for pre-search
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const webSearchEnabled = getEffectiveWebSearchEnabled(
        store.getState().thread,
        store.getState().enableWebSearch,
      );

      expect(shouldWaitForPreSearch(webSearchEnabled, preSearch)).toBe(false);

      // Participant streaming can now proceed
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);
    });
  });
});

describe('usePendingMessage Pre-Search Execution Logic', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('detection of PENDING pre-search needing execution', () => {
    it('should identify when PENDING pre-search needs execution on THREAD screen', () => {
      // Setup
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add PENDING pre-search
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Set pending message state (as form-actions does)
      store.getState().setPendingMessage('test');
      store.getState().setExpectedParticipantIds(['model-a', 'model-b']);
      store.getState().setWaitingToStartStreaming(true);

      // Conditions for pre-search execution
      const state = store.getState();
      const conditions = {
        onThreadScreen: state.screenMode === ScreenModes.THREAD,
        webSearchEnabled: getEffectiveWebSearchEnabled(state.thread, state.enableWebSearch),
        hasPendingMessage: !!state.pendingMessage,
        preSearchIsPending: state.preSearches.some(
          ps => ps.status === MessageStatuses.PENDING,
        ),
        notAlreadyTriggered: !state.hasPreSearchBeenTriggered(1),
      };

      // All conditions should be met
      expect(conditions.onThreadScreen).toBe(true);
      expect(conditions.webSearchEnabled).toBe(true);
      expect(conditions.hasPendingMessage).toBe(true);
      expect(conditions.preSearchIsPending).toBe(true);
      expect(conditions.notAlreadyTriggered).toBe(true);
    });
  });
});
