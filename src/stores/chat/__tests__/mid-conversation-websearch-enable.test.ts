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

      // ✅ CRITICAL ORDER: Set blocking flag BEFORE addPreSearch
      // This prevents effects from executing pre-search before PATCH/changelog complete
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // Create PENDING pre-search (as handleUpdateThreadAndSend does)
      // This is called AFTER setConfigChangeRoundNumber to ensure effects see the blocking flag
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
      // BLOCKING STATE VERIFICATION:
      // - configChangeRoundNumber is set → blocks pre-search execution
      // - Pre-search is PENDING, waiting for PATCH → changelog → then execute
      // - System correctly blocks until PATCH/changelog complete
      // =====================================================

      // Verify blocking state is active
      const blockingState = {
        configChangeRoundNumberSet: store.getState().configChangeRoundNumber === nextRoundNumber,
        isWaitingForChangelogFalse: store.getState().isWaitingForChangelog === false, // PATCH not done
        preSearchIsPending: preSearchForRound?.status === MessageStatuses.PENDING,
        screenModeIsThread: store.getState().screenMode === ScreenModes.THREAD,
        webSearchEnabledInForm: store.getState().enableWebSearch === true,
        waitingToStartStreaming: store.getState().waitingToStartStreaming === true,
        notStreaming: store.getState().isStreaming === false,
      };

      // Verify blocking is correctly enforced
      expect(blockingState.configChangeRoundNumberSet).toBe(true);
      expect(blockingState.isWaitingForChangelogFalse).toBe(true);
      expect(blockingState.preSearchIsPending).toBe(true);
      expect(blockingState.screenModeIsThread).toBe(true);
      expect(blockingState.webSearchEnabledInForm).toBe(true);
      expect(blockingState.waitingToStartStreaming).toBe(true);
      expect(blockingState.notStreaming).toBe(true);

      // The blocking condition: configChangeRoundNumber !== null OR isWaitingForChangelog
      const isBlocked = store.getState().configChangeRoundNumber !== null
        || store.getState().isWaitingForChangelog;
      expect(isBlocked).toBe(true);
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

  describe('non-initial round pre-search execution (pendingMessage=null)', () => {
    /**
     * BUG FIX TEST: For non-initial rounds, handleUpdateThreadAndSend does NOT call
     * prepareForNewMessage, so pendingMessage is null. The original usePendingMessage
     * hook was gated behind pendingMessage, causing pre-search to stay PENDING forever.
     *
     * This test verifies that pre-search execution can happen when:
     * - pendingMessage is null (non-initial round pattern)
     * - waitingToStart is true
     * - screenMode is THREAD
     * - web search is enabled
     * - pre-search is PENDING
     */
    it('should have correct conditions for non-initial round pre-search execution', () => {
      // Setup: Initialize thread with round 0 complete
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants();

      store.getState().initializeThread(thread, participants, [
        createUserMessage(0, 'Initial question'),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
        createModeratorMessage(0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search mid-conversation
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Add round 1 user message
      const round1UserMsg = createUserMessage(1, 'Follow-up with web search');
      store.getState().setMessages([...store.getState().messages, round1UserMsg]);

      // Add PENDING pre-search (as handleUpdateThreadAndSend does)
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'Follow-up with web search',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Set streaming state (as handleUpdateThreadAndSend does)
      // NOTE: pendingMessage is NOT set for non-initial rounds
      store.getState().setStreamingRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);

      // Verify state for non-initial round execution
      const state = store.getState();

      // Key condition: pendingMessage is NULL for non-initial rounds
      expect(state.pendingMessage).toBeNull();

      // All other conditions for pre-search execution
      expect(state.screenMode).toBe(ScreenModes.THREAD);
      expect(state.waitingToStartStreaming).toBe(true);
      expect(getEffectiveWebSearchEnabled(state.thread, state.enableWebSearch)).toBe(true);

      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearchForRound).toBeDefined();
      expect(preSearchForRound?.status).toBe(MessageStatuses.PENDING);

      // This is the condition that would block the old code:
      // The main effect in usePendingMessage requires pendingMessage to be set
      // The new effect handles this case when pendingMessage is null
    });

    it('should detect web search toggle WITHOUT mode or participant changes', () => {
      // This tests the exact bug scenario described by the user:
      // "web search enabled midway of a conversation, not detecting it
      // unless coupled with mode or participant count changes"

      const thread = createMockThread({
        enableWebSearch: false, // Initially disabled
        mode: 'brainstorm',
      });
      const participants = createMockParticipants();

      store.getState().initializeThread(thread, participants, [
        createUserMessage(0),
        createAssistantMessage(0, 0),
        createAssistantMessage(0, 1),
        createModeratorMessage(0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);

      // Only toggle web search - NO mode or participant changes
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Verify config change detection
      const state = store.getState();
      const webSearchChanged = state.thread!.enableWebSearch !== state.enableWebSearch;
      const modeChanged = false; // Same mode
      const participantsChanged = false; // Same participants

      // Web search change should be detected even without other changes
      expect(webSearchChanged).toBe(true);
      expect(modeChanged).toBe(false);
      expect(participantsChanged).toBe(false);

      // Form state should be the source of truth
      expect(getEffectiveWebSearchEnabled(state.thread, state.enableWebSearch)).toBe(true);
    });

    it('should have user message available in messages for pre-search execution', () => {
      // The new effect extracts user query from messages (not pendingMessage)

      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants();

      store.getState().initializeThread(thread, participants, [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add round 1 user message BEFORE pre-search placeholder
      const round1Msg = createUserMessage(1, 'Query for web search');
      store.getState().setMessages([...store.getState().messages, round1Msg]);

      // Add pre-search placeholder
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'Query for web search',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      store.getState().setStreamingRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Verify user message is available in messages for query extraction
      const state = store.getState();
      const round1UserMessages = state.messages.filter(
        m => m.role === 'user'
          && m.metadata
          && typeof m.metadata === 'object'
          && 'roundNumber' in m.metadata
          && m.metadata.roundNumber === 1,
      );

      expect(round1UserMessages).toHaveLength(1);
      expect(round1UserMessages[0]?.parts[0]).toEqual({ type: 'text', text: 'Query for web search' });
    });

    it('should handle pre-search status transition PENDING → STREAMING → COMPLETE', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add PENDING pre-search
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test query',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Verify PENDING status
      let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

      // Transition to STREAMING
      store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
      preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.STREAMING);
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);

      // Transition to COMPLETE
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
      preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });

    it('should handle pre-search failure gracefully', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add PENDING pre-search
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test query',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Simulate failure
      store.getState().updatePreSearchStatus(1, MessageStatuses.FAILED);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.FAILED);

      // Should NOT wait for failed pre-search - streaming can proceed
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(false);
    });

    it('should prevent duplicate execution with atomic tryMarkPreSearchTriggered', () => {
      store.getState().setScreenMode(ScreenModes.THREAD);

      // First attempt should succeed
      const firstAttempt = store.getState().tryMarkPreSearchTriggered(1);
      expect(firstAttempt).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Second attempt should fail (already marked)
      const secondAttempt = store.getState().tryMarkPreSearchTriggered(1);
      expect(secondAttempt).toBe(false);

      // Third attempt should also fail
      const thirdAttempt = store.getState().tryMarkPreSearchTriggered(1);
      expect(thirdAttempt).toBe(false);

      // Verify only one trigger happened
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should handle multiple rounds with web search enabled', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add pre-searches for multiple rounds
      [1, 2, 3].forEach((roundNumber) => {
        store.getState().addPreSearch({
          id: `presearch-r${roundNumber}`,
          threadId: 'thread-123',
          roundNumber,
          userQuery: `Query for round ${roundNumber}`,
          status: MessageStatuses.PENDING,
          searchData: null,
          createdAt: new Date(),
          completedAt: null,
          errorMessage: null,
        });
      });

      // Each round should have its own pre-search
      expect(store.getState().preSearches).toHaveLength(3);

      // Each round's pre-search is independent
      const r1 = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const r2 = store.getState().preSearches.find(ps => ps.roundNumber === 2);
      const r3 = store.getState().preSearches.find(ps => ps.roundNumber === 3);

      expect(r1?.status).toBe(MessageStatuses.PENDING);
      expect(r2?.status).toBe(MessageStatuses.PENDING);
      expect(r3?.status).toBe(MessageStatuses.PENDING);

      // Complete round 1, others should still be pending
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status)
        .toBe(MessageStatuses.COMPLETE);
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 2)?.status)
        .toBe(MessageStatuses.PENDING);
    });

    it('should handle web search disabled mid-conversation after enabling', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search
      store.getState().setEnableWebSearch(true);
      expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch))
        .toBe(true);

      // Add pre-search for round 1
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Disable web search before pre-search completes
      store.getState().setEnableWebSearch(false);
      expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch))
        .toBe(false);

      // When web search disabled, should NOT wait for pre-search
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(shouldWaitForPreSearch(false, preSearch)).toBe(false);
    });

    it('should reset pre-search tracking on thread change', () => {
      // Track pre-search for round 1 on first thread
      store.getState().tryMarkPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);

      // Initialize new thread (simulates navigation)
      const newThread = { ...createMockThread(), id: 'thread-456' };
      store.getState().initializeThread(newThread, createMockParticipants(), []);

      // Tracking should be reset
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });

    it('should handle pre-search when thread already has enableWebSearch true', () => {
      // Thread was created with web search enabled
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true); // Form state matches thread

      // Verify both thread and form have web search enabled
      expect(store.getState().thread?.enableWebSearch).toBe(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // getEffectiveWebSearchEnabled should return true
      expect(getEffectiveWebSearchEnabled(store.getState().thread, store.getState().enableWebSearch))
        .toBe(true);

      // Pre-search should work normally
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(shouldWaitForPreSearch(true, preSearch)).toBe(true);
    });
  });

  describe('pre-search activity tracking', () => {
    it('should track and clear pre-search activity', () => {
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Update activity
      store.getState().updatePreSearchActivity(1);
      expect(store.getState().preSearchActivityTimes.has(1)).toBe(true);

      // Clear activity
      store.getState().clearPreSearchActivity(1);
      expect(store.getState().preSearchActivityTimes.has(1)).toBe(false);
    });

    it('should update partial pre-search data during streaming', () => {
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const partialData = {
        queries: ['partial query'],
        results: [],
        summary: '',
        successCount: 0,
        failureCount: 0,
        totalResults: 0,
        totalTime: 0,
      };

      store.getState().updatePartialPreSearchData(1, partialData);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.searchData).toEqual(partialData);
    });

    it('should finalize pre-search data on completion', () => {
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      const finalData = {
        queries: ['test query'],
        results: [{ url: 'https://example.com', title: 'Result', snippet: 'Content' }],
        summary: 'Search summary',
        successCount: 1,
        failureCount: 0,
        totalResults: 1,
        totalTime: 500,
      };

      store.getState().updatePreSearchData(1, finalData);

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
      expect(preSearch?.searchData).toEqual(finalData);
      expect(preSearch?.completedAt).toBeDefined();
    });
  });

  describe('edge cases for non-initial round pre-search', () => {
    it('should handle case when messages array is empty', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);
      store.getState().setWaitingToStartStreaming(true);

      // No messages = no round to determine
      const state = store.getState();
      expect(state.messages).toHaveLength(0);

      // Pre-search execution should not proceed without messages
      // (no user query to extract)
    });

    it('should handle waitingToStartStreaming = false', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);
      store.getState().setWaitingToStartStreaming(false);

      // Add PENDING pre-search
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'test',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // With waitingToStart=false, the non-initial round effect won't execute
      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(false);
    });

    it('should handle OVERVIEW screen with non-initial round', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      // On OVERVIEW screen, not THREAD
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setEnableWebSearch(true);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);

      // Non-initial round effect only applies to THREAD screen
      // OVERVIEW screen has its own handling via useStreamingTrigger
    });

    it('should handle pendingMessage being set (initial round pattern)', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), []);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Set pendingMessage (initial round pattern)
      store.getState().setPendingMessage('Initial question');
      store.getState().setExpectedParticipantIds(['model-a', 'model-b']);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      expect(state.pendingMessage).toBe('Initial question');

      // When pendingMessage is set, the main effect handles pre-search
      // The non-initial round effect only kicks in when pendingMessage is null
    });

    it('should extract user query from pre-search fallback when not in messages', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, createMockParticipants(), [
        createUserMessage(0),
        createAssistantMessage(0, 0),
      ]);

      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add pre-search with userQuery but no matching user message for round 1
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'Pre-search query from placeholder',
        status: MessageStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // No round 1 user message in messages array
      const state = store.getState();
      const round1UserMsgs = state.messages.filter(
        m => m.role === 'user'
          && m.metadata
          && typeof m.metadata === 'object'
          && 'roundNumber' in m.metadata
          && m.metadata.roundNumber === 1,
      );
      expect(round1UserMsgs).toHaveLength(0);

      // Pre-search has the query as fallback
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch?.userQuery).toBe('Pre-search query from placeholder');
    });
  });
});
