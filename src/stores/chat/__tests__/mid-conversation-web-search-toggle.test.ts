/**
 * Mid-Conversation Web Search Toggle Tests
 *
 * Tests the ability to enable/disable web search at any point during a conversation,
 * regardless of initial thread settings.
 *
 * BUG FIXED (November 2025):
 * - Error: "Web search is not enabled for this thread" when enabling mid-conversation
 * - Root cause: Backend checked thread.enableWebSearch (set at creation) as hard gate
 * - Fix: Removed thread.enableWebSearch check from pre-search handlers
 *
 * KEY BEHAVIOR:
 * - Users can toggle web search ON/OFF at any point
 * - Form state is sole source of truth for current round
 * - Thread's enableWebSearch is a default/preference, not a restriction
 * - Each round can have different web search setting
 *
 * Location: /src/stores/chat/__tests__/mid-conversation-web-search-toggle.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  PendingMessageValidationReasons,
  ScreenModes,
} from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { shouldSendPendingMessage, shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// MID-CONVERSATION WEB SEARCH TOGGLE TESTS
// ============================================================================

describe('mid-Conversation Web Search Toggle', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // ENABLING WEB SEARCH MID-CONVERSATION
  // ==========================================================================

  describe('enabling Web Search Mid-Conversation', () => {
    it('should allow enabling web search when thread was created with web search disabled', () => {
      // Setup: Thread created with web search OFF
      const thread = createMockThread({
        id: 'thread-no-websearch',
        enableWebSearch: false, // Initially disabled
        mode: ChatModes.ANALYZING,
      });

      const participant = createMockParticipant(0, {
        id: 'part-1',
        threadId: 'thread-no-websearch',
      });

      // Complete round 0 without web search
      const userMsgR0 = createMockUserMessage(0, 'Initial question');
      store.getState().initializeThread(thread, [participant], [userMsgR0]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify initial state
      expect(store.getState().thread?.enableWebSearch).toBe(false);
      expect(store.getState().enableWebSearch).toBe(false); // Synced from thread

      // User enables web search for next round
      store.getState().setEnableWebSearch(true);

      // Verify form state is independent of thread state
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().thread?.enableWebSearch).toBe(false); // Thread unchanged

      // Form state should be used for decisions
      const state = store.getState();
      expect(state.enableWebSearch).toBe(true); // This controls pre-search creation
    });

    it('should block participant streaming until pre-search completes when enabled mid-conversation', () => {
      // Setup: Thread with web search OFF
      const thread = createMockThread({
        id: 'thread-toggle-test',
        enableWebSearch: false,
      });

      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search
      store.getState().setEnableWebSearch(true);

      // Add user message for round 1
      const userMsgR1 = createMockUserMessage(1, 'Question with web search');
      store.getState().setMessages([
        createMockUserMessage(0, 'First question'),
        userMsgR1,
      ]);

      // Pre-search blocking check - should wait because no pre-search exists yet
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [],
        roundNumber: 1,
      });
      expect(shouldWait).toBe(true);

      // Add PENDING pre-search
      const pendingPreSearch: StoredPreSearch = createMockPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-toggle-test',
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      });
      store.getState().addPreSearch(pendingPreSearch);

      // Should still wait for PENDING
      const shouldWaitPending = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [pendingPreSearch],
        roundNumber: 1,
      });
      expect(shouldWaitPending).toBe(true);

      // Update to STREAMING
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      // Should still wait for STREAMING
      const shouldWaitStreaming = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      });
      expect(shouldWaitStreaming).toBe(true);

      // Update to COMPLETE
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      // Should NOT wait for COMPLETE
      const shouldWaitComplete = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      });
      expect(shouldWaitComplete).toBe(false);
    });

    it('should use form state for pending message validation when web search enabled mid-conversation', () => {
      // Setup
      const thread = createMockThread({
        id: 'thread-validation-test',
        enableWebSearch: false, // Thread says OFF
      });

      const participant = createMockParticipant(0, {
        modelId: 'openai/gpt-4',
      });

      store.getState().initializeThread(thread, [participant]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search (overrides thread setting)
      store.getState().setEnableWebSearch(true);

      // Setup pending message
      store.getState().setPendingMessage('New question');
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().setMessages([createMockUserMessage(0, 'First question')]);

      // Validation should use form state (enableWebSearch=true)
      const validationResult = shouldSendPendingMessage({
        pendingMessage: 'New question',
        expectedParticipantIds: ['openai/gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants: [participant],
        messages: [createMockUserMessage(0, 'First question')],
        preSearches: [], // No pre-search yet
        thread,
        enableWebSearch: true, // Form state overrides thread
      });

      // Should wait for pre-search creation (form says enabled, but no pre-search exists)
      expect(validationResult.shouldSend).toBe(false);
      expect(validationResult.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);
    });
  });

  // ==========================================================================
  // DISABLING WEB SEARCH MID-CONVERSATION
  // ==========================================================================

  describe('disabling Web Search Mid-Conversation', () => {
    it('should allow disabling web search when thread was created with web search enabled', () => {
      // Setup: Thread created with web search ON
      const thread = createMockThread({
        id: 'thread-with-websearch',
        enableWebSearch: true, // Initially enabled
        mode: ChatModes.BRAINSTORMING,
      });

      const participant = createMockParticipant(0);

      // Complete round 0 with web search
      const userMsgR0 = createMockUserMessage(0, 'Initial question');
      const preSearchR0 = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });

      store.getState().initializeThread(thread, [participant], [userMsgR0]);
      store.getState().addPreSearch(preSearchR0);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify initial state
      expect(store.getState().thread?.enableWebSearch).toBe(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // User disables web search for next round
      store.getState().setEnableWebSearch(false);

      // Verify form state is independent
      expect(store.getState().enableWebSearch).toBe(false);
      expect(store.getState().thread?.enableWebSearch).toBe(true); // Thread unchanged
    });

    it('should NOT block participant streaming when web search disabled mid-conversation', () => {
      // Setup: Thread with web search ON
      const thread = createMockThread({
        id: 'thread-disable-test',
        enableWebSearch: true,
      });

      const participant = createMockParticipant(0, {
        modelId: 'anthropic/claude-3',
      });

      store.getState().initializeThread(thread, [participant]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User disables web search
      store.getState().setEnableWebSearch(false);

      // Should NOT wait for pre-search when disabled
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: [],
        roundNumber: 1,
      });
      expect(shouldWait).toBe(false);

      // Pending message validation should pass without waiting for pre-search
      store.getState().setPendingMessage('Question without web search');
      store.getState().setExpectedParticipantIds(['anthropic/claude-3']);
      store.getState().setMessages([createMockUserMessage(0, 'First question')]);

      const validationResult = shouldSendPendingMessage({
        pendingMessage: 'Question without web search',
        expectedParticipantIds: ['anthropic/claude-3'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants: [participant],
        messages: [createMockUserMessage(0, 'First question')],
        preSearches: [],
        thread,
        enableWebSearch: false, // Form state says disabled
      });

      // Should send immediately (no pre-search blocking)
      expect(validationResult.shouldSend).toBe(true);
    });
  });

  // ==========================================================================
  // MULTIPLE TOGGLES ACROSS ROUNDS
  // ==========================================================================

  describe('multiple Toggles Across Rounds', () => {
    it('should support toggling web search ON/OFF/ON across multiple rounds', () => {
      // Setup
      const thread = createMockThread({
        id: 'thread-multi-toggle',
        enableWebSearch: false, // Start with OFF
      });

      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 0: Web search OFF (default)
      expect(store.getState().enableWebSearch).toBe(false);
      const messages = [createMockUserMessage(0, 'Round 0 question')];
      store.getState().setMessages(messages);

      // Round 1: Enable web search
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Add pre-search for round 1
      const preSearchR1 = createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addPreSearch(preSearchR1);
      store.getState().setMessages([
        ...messages,
        createMockUserMessage(1, 'Round 1 with web search'),
      ]);

      // Verify round 1 has pre-search
      expect(store.getState().preSearches.filter((ps: StoredPreSearch) => ps.roundNumber === 1)).toHaveLength(1);

      // Round 2: Disable web search
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBe(false);

      store.getState().setMessages([
        ...store.getState().messages,
        createMockUserMessage(2, 'Round 2 without web search'),
      ]);

      // No pre-search for round 2
      expect(store.getState().preSearches.filter((ps: StoredPreSearch) => ps.roundNumber === 2)).toHaveLength(0);

      // Round 3: Re-enable web search
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Add pre-search for round 3
      const preSearchR3 = createMockPreSearch({
        roundNumber: 3,
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addPreSearch(preSearchR3);
      store.getState().setMessages([
        ...store.getState().messages,
        createMockUserMessage(3, 'Round 3 with web search again'),
      ]);

      // Verify final state
      expect(store.getState().preSearches).toHaveLength(2); // Only rounds 1 and 3
      expect(store.getState().preSearches.map((ps: StoredPreSearch) => ps.roundNumber).sort()).toEqual([1, 3]);
    });

    it('should maintain per-round web search independence', () => {
      // Setup
      const thread = createMockThread({
        id: 'thread-independence',
        enableWebSearch: true, // Thread default
      });

      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 0: Uses thread default (ON) - has pre-search
      const preSearchR0 = createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addPreSearch(preSearchR0);

      // Round 1: User disables - no pre-search
      store.getState().setEnableWebSearch(false);
      // (no pre-search added)

      // Round 2: User enables - has pre-search
      store.getState().setEnableWebSearch(true);
      const preSearchR2 = createMockPreSearch({
        roundNumber: 2,
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addPreSearch(preSearchR2);

      // Verify each round's independence
      const preSearchByRound = {
        0: store.getState().preSearches.find((ps: StoredPreSearch) => ps.roundNumber === 0),
        1: store.getState().preSearches.find((ps: StoredPreSearch) => ps.roundNumber === 1),
        2: store.getState().preSearches.find((ps: StoredPreSearch) => ps.roundNumber === 2),
      };

      expect(preSearchByRound[0]).toBeDefined(); // Round 0 has pre-search
      expect(preSearchByRound[1]).toBeUndefined(); // Round 1 no pre-search
      expect(preSearchByRound[2]).toBeDefined(); // Round 2 has pre-search
    });
  });

  // ==========================================================================
  // FORM STATE VS THREAD STATE
  // ==========================================================================

  describe('form State vs Thread State', () => {
    it('should sync form state from thread on initialization', () => {
      // Thread with web search enabled
      const threadEnabled = createMockThread({
        id: 'thread-sync-enabled',
        enableWebSearch: true,
      });

      store.getState().initializeThread(threadEnabled, [createMockParticipant(0)]);
      expect(store.getState().enableWebSearch).toBe(true);

      // Reset and test with disabled
      const newStore = createTestStore();
      const threadDisabled = createMockThread({
        id: 'thread-sync-disabled',
        enableWebSearch: false,
      });

      newStore.getState().initializeThread(threadDisabled, [createMockParticipant(0)]);
      expect(newStore.getState().enableWebSearch).toBe(false);
    });

    it('should allow form state to diverge from thread state', () => {
      const thread = createMockThread({
        id: 'thread-diverge',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Initially synced
      expect(store.getState().enableWebSearch).toBe(false);
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // User changes form state
      store.getState().setEnableWebSearch(true);

      // Form diverges from thread
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().thread?.enableWebSearch).toBe(false);
    });

    it('should use form state (not thread state) for blocking decisions', () => {
      const thread = createMockThread({
        id: 'thread-blocking',
        enableWebSearch: false, // Thread says OFF
      });

      const participant = createMockParticipant(0, {
        modelId: 'google/gemini-pro',
      });

      store.getState().initializeThread(thread, [participant]);
      store.getState().setEnableWebSearch(true); // Form says ON

      // Blocking should use form state (true), not thread state (false)
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch, // Uses form state
        preSearches: [],
        roundNumber: 1,
      });

      // Should wait because form state says web search enabled
      expect(shouldWait).toBe(true);
    });
  });

  // ==========================================================================
  // ERROR RECOVERY
  // ==========================================================================

  describe('error Recovery', () => {
    it('should proceed when pre-search fails after being enabled mid-conversation', () => {
      const thread = createMockThread({
        id: 'thread-error-recovery',
        enableWebSearch: false,
      });

      const participant = createMockParticipant(0);
      store.getState().initializeThread(thread, [participant]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search
      store.getState().setEnableWebSearch(true);

      // Pre-search fails
      const failedPreSearch = createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.FAILED,
      });
      store.getState().addPreSearch(failedPreSearch);

      // Should NOT block on failed pre-search
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [failedPreSearch],
        roundNumber: 1,
      });

      expect(shouldWait).toBe(false);
    });

    it('should maintain state consistency after toggle errors', () => {
      const thread = createMockThread({
        id: 'thread-consistency',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Toggle ON
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Toggle OFF
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBe(false);

      // Toggle ON again
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // State should be consistent
      expect(store.getState().thread?.enableWebSearch).toBe(false); // Thread unchanged
      expect(store.getState().enableWebSearch).toBe(true); // Form state latest
    });
  });

  // ==========================================================================
  // SCREEN MODE INTERACTIONS
  // ==========================================================================

  describe('screen Mode Interactions', () => {
    it('should support web search toggle on overview screen for first round', () => {
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Enable web search before thread creation
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Disable before submitting
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBe(false);

      // Final toggle
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);
    });

    it('should support web search toggle on thread screen for subsequent rounds', () => {
      const thread = createMockThread({
        id: 'thread-subsequent',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Toggle for round 1
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Toggle for round 2
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBe(false);
    });

    it('should NOT allow toggle on public screen', () => {
      const thread = createMockThread({
        id: 'thread-public',
        enableWebSearch: false,
        isPublic: true,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setScreenMode(ScreenModes.PUBLIC);

      // Validation should reject on public screen
      const validationResult = shouldSendPendingMessage({
        pendingMessage: 'Test',
        expectedParticipantIds: [],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.PUBLIC,
        participants: [],
        messages: [],
        preSearches: [],
        thread,
        enableWebSearch: true,
      });

      expect(validationResult.shouldSend).toBe(false);
      expect(validationResult.reason).toBe(PendingMessageValidationReasons.PUBLIC_SCREEN_MODE);
    });
  });

  // ==========================================================================
  // OPTIMISTIC UI UPDATES
  // ==========================================================================

  describe('optimistic UI Updates', () => {
    it('should add optimistic user message when enabling web search on THREAD screen', () => {
      const thread = createMockThread({
        id: 'thread-optimistic',
        enableWebSearch: false,
      });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Complete round 0
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'First question'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Before: 3 messages
      expect(store.getState().messages).toHaveLength(3);

      // Enable web search
      store.getState().setEnableWebSearch(true);

      // Prepare new message - should add optimistic user message
      store.getState().prepareForNewMessage('Question with web search', ['openai/gpt-4', 'openai/gpt-4']);

      // After: 4 messages (optimistic user message added)
      expect(store.getState().messages).toHaveLength(4);

      const lastMessage = store.getState().messages[3];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.metadata?.roundNumber).toBe(1);
      expect(lastMessage.metadata?.isOptimistic).toBe(true);
    });

    it('should NOT add optimistic user message on OVERVIEW screen', () => {
      const thread = createMockThread({
        id: 'thread-overview',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Enable web search
      store.getState().setEnableWebSearch(true);

      // Before: 0 messages
      expect(store.getState().messages).toHaveLength(0);

      // Prepare new message
      store.getState().prepareForNewMessage('First question', ['openai/gpt-4']);

      // After: Still 0 messages (no optimistic message on OVERVIEW)
      expect(store.getState().messages).toHaveLength(0);
    });

    it('should correctly track streamingRoundNumber when web search enabled', () => {
      const thread = createMockThread({
        id: 'thread-round-number',
        enableWebSearch: false,
      });
      const participants = [createMockParticipant(0)];

      // Complete round 0
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search
      store.getState().setEnableWebSearch(true);

      // Prepare message for round 1
      store.getState().prepareForNewMessage('Follow-up', ['openai/gpt-4']);

      // streamingRoundNumber should be set to next round
      expect(store.getState().streamingRoundNumber).toBe(1);
    });
  });

  // ==========================================================================
  // RACE CONDITIONS
  // ==========================================================================

  describe('race Conditions', () => {
    it('should handle toggle during participant streaming', () => {
      const thread = createMockThread({
        id: 'thread-race',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add completed pre-search for round 1
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // Start streaming round 1
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // User disables web search mid-stream
      store.getState().setEnableWebSearch(false);

      // Current round's pre-search should still be present (already completed)
      const preSearch = store.getState().preSearches.find((ps: StoredPreSearch) => ps.roundNumber === 1);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(AnalysisStatuses.COMPLETE);

      // Next round (2) should NOT wait for pre-search
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: store.getState().preSearches,
        roundNumber: 2,
      });
      expect(shouldWait).toBe(false);
    });

    it('should handle toggle during pre-search streaming', () => {
      const thread = createMockThread({
        id: 'thread-presearch-race',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Pre-search in progress
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      // Should wait (web search enabled, pre-search streaming)
      let shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      });
      expect(shouldWait).toBe(true);

      // User disables mid-pre-search
      store.getState().setEnableWebSearch(false);

      // Should NOT wait anymore (user disabled)
      shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      });
      expect(shouldWait).toBe(false);

      // Re-enable
      store.getState().setEnableWebSearch(true);

      // Should wait again (pre-search still streaming)
      shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      });
      expect(shouldWait).toBe(true);
    });

    it('should handle rapid toggle operations consistently', () => {
      const thread = createMockThread({
        id: 'thread-rapid-toggle',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Rapid toggles
      for (let i = 0; i < 50; i++) {
        store.getState().setEnableWebSearch(i % 2 === 0);
      }

      // Final state should be consistent (50 is even, so false)
      expect(store.getState().enableWebSearch).toBe(false);

      // One more toggle
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Blocking should reflect final state
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [],
        roundNumber: 1,
      });
      expect(shouldWait).toBe(true);
    });

    it('should handle toggle during PATCH request (simulated)', () => {
      const thread = createMockThread({
        id: 'thread-patch-race',
        enableWebSearch: false,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User enables web search
      store.getState().setEnableWebSearch(true);

      // PATCH starts (simulated async)
      // User changes mind and disables before PATCH completes
      store.getState().setEnableWebSearch(false);

      // Form state should be false
      expect(store.getState().enableWebSearch).toBe(false);

      // Should NOT wait for pre-search during PATCH (before response)
      const shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: [],
        roundNumber: 1,
      });
      expect(shouldWait).toBe(false);

      // PATCH returns with enableWebSearch: true
      // NOTE: setThread intentionally syncs form state with thread state
      // This ensures the UI reflects server state after PATCH completes
      store.getState().setThread({ ...store.getState().thread!, enableWebSearch: true });

      // After PATCH, form state is synced with thread (enableWebSearch: true)
      expect(store.getState().enableWebSearch).toBe(true);

      // Now should wait because form state is synced
      const shouldWaitAfterPatch = shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch,
        preSearches: [],
        roundNumber: 1,
      });
      expect(shouldWaitAfterPatch).toBe(true);

      // User can still toggle again after PATCH completes
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBe(false);
      expect(shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch,
        preSearches: [],
        roundNumber: 1,
      })).toBe(false);
    });
  });

  // ==========================================================================
  // COMPLETE FLOW SCENARIOS
  // ==========================================================================

  describe('complete Flow Scenarios', () => {
    it('should handle 5-round conversation with mixed web search states', () => {
      const thread = createMockThread({
        id: 'thread-5round',
        enableWebSearch: false,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Round 0: No web search
      store.getState().setMessages([createMockUserMessage(0)]);
      let shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: [],
        roundNumber: 0,
      });
      expect(shouldWait).toBe(false);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 1: Enable web search
      store.getState().setEnableWebSearch(true);
      store.getState().prepareForNewMessage('Round 1', ['openai/gpt-4']);

      shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [],
        roundNumber: 1,
      });
      expect(shouldWait).toBe(true);

      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().markPreSearchTriggered(1);
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      });
      expect(shouldWait).toBe(false);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);

      // Round 2: Keep web search enabled
      store.getState().prepareForNewMessage('Round 2', ['openai/gpt-4']);

      shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 2,
      });
      expect(shouldWait).toBe(true);

      store.getState().addPreSearch(createPendingPreSearch(2));
      store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 2)]);

      // Round 3: Disable web search
      store.getState().setEnableWebSearch(false);
      store.getState().prepareForNewMessage('Round 3', ['openai/gpt-4']);

      shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: store.getState().preSearches,
        roundNumber: 3,
      });
      expect(shouldWait).toBe(false);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 3)]);

      // Round 4: Re-enable web search
      store.getState().setEnableWebSearch(true);
      store.getState().prepareForNewMessage('Round 4', ['openai/gpt-4']);

      shouldWait = shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 4,
      });
      expect(shouldWait).toBe(true);

      store.getState().addPreSearch(createPendingPreSearch(4));
      store.getState().updatePreSearchData(4, createMockPreSearchDataPayload());

      // Final verification
      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(3); // Rounds 1, 2, and 4

      const roundNumbers = preSearches.map((ps: StoredPreSearch) => ps.roundNumber).sort();
      expect(roundNumbers).toEqual([1, 2, 4]);

      // All have data
      expect(preSearches.every((ps: StoredPreSearch) => ps.searchData !== null)).toBe(true);
    });

    it('should handle sparse pre-search array from toggling', () => {
      const thread = createMockThread({
        id: 'thread-sparse',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Simulate: Round 0 (no search), Round 1 (search), Round 2 (no search), Round 3 (search)
      store.getState().addPreSearch(createMockPreSearch({
        id: 'ps-1',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().addPreSearch(createMockPreSearch({
        id: 'ps-3',
        roundNumber: 3,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Web search disabled - no round should wait
      store.getState().setEnableWebSearch(false);
      expect(shouldWaitForPreSearch({ webSearchEnabled: false, preSearches: store.getState().preSearches, roundNumber: 0 })).toBe(false);
      expect(shouldWaitForPreSearch({ webSearchEnabled: false, preSearches: store.getState().preSearches, roundNumber: 1 })).toBe(false);
      expect(shouldWaitForPreSearch({ webSearchEnabled: false, preSearches: store.getState().preSearches, roundNumber: 2 })).toBe(false);
      expect(shouldWaitForPreSearch({ webSearchEnabled: false, preSearches: store.getState().preSearches, roundNumber: 3 })).toBe(false);
      expect(shouldWaitForPreSearch({ webSearchEnabled: false, preSearches: store.getState().preSearches, roundNumber: 4 })).toBe(false);

      // Web search enabled - only rounds without complete pre-search should wait
      store.getState().setEnableWebSearch(true);
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: store.getState().preSearches, roundNumber: 0 })).toBe(true); // No pre-search
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: store.getState().preSearches, roundNumber: 1 })).toBe(false); // Has complete pre-search
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: store.getState().preSearches, roundNumber: 2 })).toBe(true); // No pre-search
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: store.getState().preSearches, roundNumber: 3 })).toBe(false); // Has complete pre-search
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: store.getState().preSearches, roundNumber: 4 })).toBe(true); // No pre-search (new round)
    });

    it('should handle enable-cancel-enable pattern gracefully', () => {
      const thread = createMockThread({
        id: 'thread-cancel',
        enableWebSearch: false,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable
      store.getState().setEnableWebSearch(true);
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: [], roundNumber: 1 })).toBe(true);

      // Prepare message
      store.getState().prepareForNewMessage('Test', ['openai/gpt-4']);

      // Pre-search created
      store.getState().addPreSearch(createPendingPreSearch(1));

      // User "cancels" by disabling
      store.getState().setEnableWebSearch(false);
      expect(shouldWaitForPreSearch({ webSearchEnabled: false, preSearches: store.getState().preSearches, roundNumber: 1 })).toBe(false);

      // Reset form
      store.getState().resetForm();

      // Enable again for fresh attempt
      store.getState().setEnableWebSearch(true);
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: store.getState().preSearches, roundNumber: 1 })).toBe(true);

      // New message submission
      store.getState().prepareForNewMessage('New attempt', ['openai/gpt-4']);

      // Complete the pre-search this time
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());
      expect(shouldWaitForPreSearch({ webSearchEnabled: true, preSearches: store.getState().preSearches, roundNumber: 1 })).toBe(false);
    });
  });

  // ==========================================================================
  // PENDING MESSAGE VALIDATION INTEGRATION
  // ==========================================================================

  describe('pending Message Validation Integration', () => {
    it('should correctly integrate with pending message validation when enabling web search', () => {
      const thread = createMockThread({
        id: 'thread-validation',
        enableWebSearch: false,
      });
      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Enable web search
      store.getState().setEnableWebSearch(true);

      // Prepare message
      store.getState().prepareForNewMessage('Follow-up question', ['openai/gpt-4']);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().setIsWaitingForChangelog(false);

      // Should NOT send - waiting for pre-search creation
      let result = shouldSendPendingMessage({
        pendingMessage: 'Follow-up question',
        expectedParticipantIds: ['openai/gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: [],
        thread,
        enableWebSearch: true,
      });
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);

      // Add PENDING pre-search
      store.getState().addPreSearch(createPendingPreSearch(1));

      // Still should NOT send - pre-search PENDING
      result = shouldSendPendingMessage({
        pendingMessage: 'Follow-up question',
        expectedParticipantIds: ['openai/gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread,
        enableWebSearch: true,
      });
      expect(result.shouldSend).toBe(false);
      expect(result.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);

      // Complete pre-search
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      // Now should send
      result = shouldSendPendingMessage({
        pendingMessage: 'Follow-up question',
        expectedParticipantIds: ['openai/gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread,
        enableWebSearch: true,
      });
      expect(result.shouldSend).toBe(true);
      expect(result.roundNumber).toBe(1);
    });

    it('should allow immediate send when web search disabled mid-conversation', () => {
      const thread = createMockThread({
        id: 'thread-disable-validation',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setEnableWebSearch(true);

      // Add completed pre-search for round 0
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Disable web search
      store.getState().setEnableWebSearch(false);

      // Prepare message
      store.getState().prepareForNewMessage('Question without search', ['openai/gpt-4']);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().setIsWaitingForChangelog(false);

      // Should send immediately (no pre-search blocking when disabled)
      const result = shouldSendPendingMessage({
        pendingMessage: 'Question without search',
        expectedParticipantIds: ['openai/gpt-4'],
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread,
        enableWebSearch: false, // Disabled
      });
      expect(result.shouldSend).toBe(true);
    });
  });
});
