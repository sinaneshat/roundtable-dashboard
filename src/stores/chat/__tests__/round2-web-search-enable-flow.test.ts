/**
 * Round 2 Web Search Enable Flow Tests
 *
 * BUG REPORT:
 * - When enabling web search on round 2 submission (after round 0/1 without search)
 * - Chatbox empties and loading shows
 * - BUT no personal message box or UI updates happen
 * - The new round doesn't start properly
 *
 * This test catches the bug where enabling web search mid-conversation
 * breaks the round initialization and message display flow.
 *
 * Location: /src/stores/chat/__tests__/round2-web-search-enable-flow.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  PendingMessageValidationReasons,
  ScreenModes,
} from '@/api/core/enums';
import { calculateNextRoundNumber, getCurrentRoundNumber } from '@/lib/utils/round-utils';
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
// BUG REPRODUCTION: ROUND 2 WEB SEARCH ENABLE
// ============================================================================

describe('round 2 Web Search Enable Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('bug Reproduction: User message not showing after web search enable', () => {
    /**
     * BUG SCENARIO:
     * 1. Thread exists with rounds 0 and 1 complete (NO web search)
     * 2. User enables web search toggle
     * 3. User submits message for round 2
     * 4. EXPECTED: Optimistic user message appears, pre-search runs, participants stream
     * 5. ACTUAL: Chatbox empties but no user message shows, round doesn't start
     */
    it('should show optimistic user message when enabling web search on round 2', () => {
      // SETUP: Complete conversation with rounds 0 and 1 (NO web search)
      const thread = createMockThread({
        id: 'thread-no-search',
        enableWebSearch: false, // Thread created WITHOUT web search
        mode: ChatModes.DEBATING,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      ];

      // Round 0: User question + participant responses
      const round0Messages = [
        createMockUserMessage(0, 'Initial question'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      // Round 1: Follow-up + participant responses
      const round1Messages = [
        createMockUserMessage(1, 'Follow-up question'),
        createMockMessage(0, 1),
        createMockMessage(1, 1),
      ];

      const allMessages = [...round0Messages, ...round1Messages];

      // Initialize store with completed rounds
      store.getState().initializeThread(thread, participants, allMessages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add completed analyses for rounds 0 and 1
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Verify initial state
      expect(store.getState().messages).toHaveLength(6);
      expect(store.getState().enableWebSearch).toBe(false);

      // USER ACTION: Enable web search for next round
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // USER ACTION: Submit message for round 2
      const round2Message = 'Round 2 question with web search';

      // Simulate what handleUpdateThreadAndSend does AFTER PATCH completes:
      // 1. setExpectedParticipantIds (already done via PATCH response handling)
      store.getState().setExpectedParticipantIds(['openai/gpt-4', 'anthropic/claude-3']);

      // 2. prepareForNewMessage
      store.getState().prepareForNewMessage(round2Message, []);

      // ============================================================================
      // BUG CHECK: Optimistic user message should be in messages array
      // ============================================================================
      const messagesAfterPrepare = store.getState().messages;

      // Should have 7 messages (6 existing + 1 optimistic for round 2)
      expect(messagesAfterPrepare).toHaveLength(7);

      // Last message should be the optimistic user message
      const lastMessage = messagesAfterPrepare[6];
      expect(lastMessage.role).toBe('user');
      expect(lastMessage.metadata?.roundNumber).toBe(2);
      expect(lastMessage.metadata?.isOptimistic).toBe(true);

      // ============================================================================
      // BUG CHECK: State should be ready for pre-search creation
      // ============================================================================
      expect(store.getState().pendingMessage).toBe(round2Message);
      expect(store.getState().streamingRoundNumber).toBe(2);
      expect(store.getState().hasSentPendingMessage).toBe(false);
      expect(store.getState().isWaitingForChangelog).toBe(true);
    });

    it('should block message sending until pre-search completes when enabled mid-conversation', () => {
      // SETUP: Same as above
      const thread = createMockThread({
        id: 'thread-presearch-block',
        enableWebSearch: false,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      ];

      const allMessages = [
        createMockUserMessage(0, 'Round 0'),
        createMockMessage(0, 0),
        createMockUserMessage(1, 'Round 1'),
        createMockMessage(0, 1),
      ];

      store.getState().initializeThread(thread, participants, allMessages);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 1, status: AnalysisStatuses.COMPLETE }));

      // Enable web search
      store.getState().setEnableWebSearch(true);

      // Prepare round 2 message
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 2 with search', []);

      // Clear changelog wait (simulating changelog fetch completed)
      store.getState().setIsWaitingForChangelog(false);

      // ============================================================================
      // BUG CHECK: Should wait for pre-search since web search is enabled
      // ============================================================================
      const validationResult = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      // Should NOT send - waiting for pre-search creation
      expect(validationResult.shouldSend).toBe(false);
      expect(validationResult.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);
      expect(validationResult.roundNumber).toBe(2);
    });

    it('should correctly calculate round number for mid-conversation web search enable', () => {
      const thread = createMockThread({
        id: 'thread-round-calc',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0)];

      // Set up rounds 0, 1, 2 completed
      const messages = [
        createMockUserMessage(0, 'R0'),
        createMockMessage(0, 0),
        createMockUserMessage(1, 'R1'),
        createMockMessage(0, 1),
        createMockUserMessage(2, 'R2'),
        createMockMessage(0, 2),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search for round 3
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 3 with search', []);

      // ============================================================================
      // BUG CHECK: streamingRoundNumber should be 3
      // ============================================================================
      expect(store.getState().streamingRoundNumber).toBe(3);

      // Optimistic message should have roundNumber 3
      const lastMessage = store.getState().messages[store.getState().messages.length - 1];
      expect(lastMessage.metadata?.roundNumber).toBe(3);
    });

    it('should allow message to proceed after pre-search completes', () => {
      // SETUP
      const thread = createMockThread({
        id: 'thread-presearch-complete',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'R0'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));

      // Enable web search
      store.getState().setEnableWebSearch(true);

      // Prepare round 1
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 1 with search', []);
      store.getState().setIsWaitingForChangelog(false);

      // Initially blocked - no pre-search
      let validationResult = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      expect(validationResult.shouldSend).toBe(false);
      expect(validationResult.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);

      // Add PENDING pre-search
      store.getState().addPreSearch(createPendingPreSearch(1));

      validationResult = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      expect(validationResult.shouldSend).toBe(false);
      expect(validationResult.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);

      // Update to STREAMING
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      validationResult = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      expect(validationResult.shouldSend).toBe(false);
      expect(validationResult.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);

      // Update to COMPLETE
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      // ============================================================================
      // Now message should be sendable
      // ============================================================================
      validationResult = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      expect(validationResult.shouldSend).toBe(true);
      expect(validationResult.roundNumber).toBe(1);
    });
  });

  describe('edge Cases: Multi-round conversation with web search toggle', () => {
    it('should handle web search toggle OFF→ON→OFF→ON pattern', () => {
      const thread = createMockThread({
        id: 'thread-toggle-pattern',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'R0'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Round 1: Enable web search
      store.getState().setEnableWebSearch(true);
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: [],
        roundNumber: 1,
      })).toBe(true);

      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Round 2: Disable web search
      store.getState().setEnableWebSearch(false);
      expect(shouldWaitForPreSearch({
        webSearchEnabled: false,
        preSearches: store.getState().preSearches,
        roundNumber: 2,
      })).toBe(false); // No wait needed when disabled

      // Round 3: Re-enable web search
      store.getState().setEnableWebSearch(true);
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 3,
      })).toBe(true); // Should wait for new pre-search
    });

    it('should not affect existing pre-searches when toggling web search', () => {
      const thread = createMockThread({
        id: 'thread-preserve-presearches',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add pre-searches for rounds 0 and 1
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      expect(store.getState().preSearches).toHaveLength(2);

      // Disable web search for next round
      store.getState().setEnableWebSearch(false);

      // Existing pre-searches should be preserved
      expect(store.getState().preSearches).toHaveLength(2);
      expect(store.getState().preSearches[0].roundNumber).toBe(0);
      expect(store.getState().preSearches[1].roundNumber).toBe(1);
    });
  });

  describe('provider Effect Simulation', () => {
    /**
     * This test simulates what the provider effect does when web search is enabled
     * mid-conversation. It verifies the complete flow from message preparation
     * to pre-search completion.
     */
    it('should complete full flow: prepare → pre-search → send', () => {
      const thread = createMockThread({
        id: 'thread-full-flow',
        enableWebSearch: false,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      ];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'R0'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // STEP 1: Enable web search
      store.getState().setEnableWebSearch(true);

      // STEP 2: Prepare message (simulates handleUpdateThreadAndSend)
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Test message for round 1', []);

      // Verify state after preparation
      expect(store.getState().pendingMessage).toBe('Test message for round 1');
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().hasSentPendingMessage).toBe(false);
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // Verify optimistic message added
      const messages = store.getState().messages;
      expect(messages).toHaveLength(3);
      const optimisticMsg = messages[2];
      expect(optimisticMsg.role).toBe('user');
      expect(optimisticMsg.metadata?.roundNumber).toBe(1);
      expect(optimisticMsg.metadata?.isOptimistic).toBe(true);

      // STEP 3: Changelog completes
      store.getState().setIsWaitingForChangelog(false);

      // STEP 4: Provider effect detects web search enabled, no pre-search → creates one
      // (In real code, provider effect calls createPreSearch mutation)
      store.getState().markPreSearchTriggered(1);
      store.getState().addPreSearch({
        id: 'presearch-1',
        threadId: 'thread-full-flow',
        roundNumber: 1,
        userQuery: 'Test message for round 1',
        status: AnalysisStatuses.STREAMING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Verify blocked on STREAMING
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(true);

      // STEP 5: Pre-search completes
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      // Verify no longer blocked
      expect(shouldWaitForPreSearch({
        webSearchEnabled: true,
        preSearches: store.getState().preSearches,
        roundNumber: 1,
      })).toBe(false);

      // STEP 6: Message can be sent
      const validation = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      expect(validation.shouldSend).toBe(true);
      expect(validation.roundNumber).toBe(1);
    });
  });

  describe('state Consistency After prepareForNewMessage', () => {
    it('should maintain all required state for pre-search flow', () => {
      const thread = createMockThread({
        id: 'thread-state-consistency',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable and prepare
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Test', []);

      // All these fields must be set correctly for the provider effect
      const state = store.getState();

      expect(state.pendingMessage).toBe('Test');
      expect(state.expectedParticipantIds).toEqual(['openai/gpt-4']);
      expect(state.hasSentPendingMessage).toBe(false);
      expect(state.isStreaming).toBe(false);
      expect(state.screenMode).toBe(ScreenModes.THREAD);
      expect(state.enableWebSearch).toBe(true);
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.isWaitingForChangelog).toBe(true);

      // Messages must include optimistic user message
      expect(state.messages.length).toBeGreaterThan(2);
      const lastMsg = state.messages[state.messages.length - 1];
      expect(lastMsg.role).toBe('user');
      expect(lastMsg.metadata?.isOptimistic).toBe(true);
    });

    it('should not clear messages when prepareForNewMessage is called', () => {
      const thread = createMockThread({ id: 'thread-no-clear' });
      const participants = [createMockParticipant(0)];

      // Initialize with 4 messages
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().messages).toHaveLength(4);

      // Enable web search and prepare
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 2 message', []);

      // Should have 5 messages (4 + 1 optimistic), NOT less
      expect(store.getState().messages).toHaveLength(5);

      // Verify existing messages are preserved
      expect(store.getState().messages[0].metadata?.roundNumber).toBe(0);
      expect(store.getState().messages[1].metadata?.roundNumber).toBe(0);
      expect(store.getState().messages[2].metadata?.roundNumber).toBe(1);
      expect(store.getState().messages[3].metadata?.roundNumber).toBe(1);
      expect(store.getState().messages[4].metadata?.roundNumber).toBe(2);
    });
  });

  describe('thread State vs Form State Independence', () => {
    /**
     * Critical test: Form state (enableWebSearch) should be independent
     * of thread state after user toggles it.
     */
    it('should use form state for blocking decisions, not thread state', () => {
      const thread = createMockThread({
        id: 'thread-form-state',
        enableWebSearch: false, // Thread says OFF
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Initially, form state synced from thread
      expect(store.getState().enableWebSearch).toBe(false);
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // User enables web search in form
      store.getState().setEnableWebSearch(true);

      // Form state should be TRUE, thread state should be FALSE
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // Blocking decision should use FORM state (true), not thread state (false)
      expect(shouldWaitForPreSearch({
        webSearchEnabled: store.getState().enableWebSearch,
        preSearches: [],
        roundNumber: 1,
      })).toBe(true);

      // If we incorrectly used thread state, this would be false
      expect(shouldWaitForPreSearch({
        webSearchEnabled: store.getState().thread?.enableWebSearch ?? false,
        preSearches: [],
        roundNumber: 1,
      })).toBe(false);
    });

    it('should sync form state from thread on setThread (after PATCH)', () => {
      const thread = createMockThread({
        id: 'thread-patch-sync',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // User toggles web search on
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().thread?.enableWebSearch).toBe(false);

      // Simulate PATCH response updating thread
      store.getState().setThread({
        ...store.getState().thread!,
        enableWebSearch: true,
      });

      // Both should now be true
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().thread?.enableWebSearch).toBe(true);
    });
  });

  describe('isWaitingForChangelog Flow', () => {
    /**
     * POTENTIAL BUG: isWaitingForChangelog blocking
     *
     * When prepareForNewMessage is called:
     * 1. isWaitingForChangelog is set to TRUE
     * 2. Provider effect checks: if (isWaitingForChangelog && screenMode !== OVERVIEW) return;
     * 3. useThreadActions clears flag when changelog finishes fetching
     *
     * If changelog is already loaded (isFetching=false), flag should clear immediately.
     * But if there's a timing issue, the message might never send.
     */
    it('should clear isWaitingForChangelog flag when set on THREAD screen', () => {
      const thread = createMockThread({
        id: 'thread-changelog-wait',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)], [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search and prepare message
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Test with changelog wait', []);

      // ============================================================================
      // BUG CHECK: isWaitingForChangelog should be TRUE after prepareForNewMessage
      // ============================================================================
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // Simulate what useThreadActions does when changelog finishes fetching
      // In real code: if (isWaitingForChangelog && !isChangelogFetching) → clear flag
      store.getState().setIsWaitingForChangelog(false);

      expect(store.getState().isWaitingForChangelog).toBe(false);

      // Now validation should proceed (no longer blocked by changelog wait)
      // Pre-search creation would be checked next
    });

    it('should maintain optimistic message even with isWaitingForChangelog set', () => {
      const thread = createMockThread({
        id: 'thread-msg-persist',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)], [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const initialMessageCount = store.getState().messages.length;
      expect(initialMessageCount).toBe(2);

      // Enable web search and prepare message
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Test message', []);

      // isWaitingForChangelog is TRUE
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // ============================================================================
      // BUG CHECK: Messages should include optimistic message EVEN WHILE WAITING
      // ============================================================================
      expect(store.getState().messages).toHaveLength(3);

      const optimisticMsg = store.getState().messages[2];
      expect(optimisticMsg.role).toBe('user');
      expect(optimisticMsg.metadata?.isOptimistic).toBe(true);

      // Clear the flag
      store.getState().setIsWaitingForChangelog(false);

      // Messages should STILL include optimistic message
      expect(store.getState().messages).toHaveLength(3);
      expect(store.getState().messages[2].metadata?.isOptimistic).toBe(true);
    });
  });

  describe('regression: Provider Effect Dependencies', () => {
    /**
     * The provider effect should re-run when any of these change:
     * - pendingMessage
     * - preSearches
     * - enableWebSearch
     * - messages
     *
     * This test verifies the state changes that should trigger effect re-runs.
     */
    it('should have correct state changes that trigger effect re-runs', () => {
      const thread = createMockThread({
        id: 'thread-effect-deps',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Capture initial state
      const initialMessages = store.getState().messages;
      const initialPreSearches = store.getState().preSearches;
      const initialPendingMessage = store.getState().pendingMessage;
      const initialEnableWebSearch = store.getState().enableWebSearch;

      // Enable web search (should trigger effect re-run)
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).not.toBe(initialEnableWebSearch);

      // Prepare message (changes pendingMessage AND messages)
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Test', []);
      expect(store.getState().pendingMessage).not.toBe(initialPendingMessage);
      expect(store.getState().messages).not.toBe(initialMessages);
      expect(store.getState().messages.length).toBeGreaterThan(initialMessages.length);

      // Add pre-search (should trigger effect re-run)
      store.getState().addPreSearch(createPendingPreSearch(1));
      expect(store.getState().preSearches).not.toBe(initialPreSearches);
      expect(store.getState().preSearches.length).toBeGreaterThan(initialPreSearches.length);
    });
  });

  describe('e2e: round 2 web search enable complete flow', () => {
    /**
     * This test simulates the EXACT bug scenario:
     * 1. Thread created with web search DISABLED
     * 2. Round 0 completes successfully
     * 3. User enables web search
     * 4. User sends message for round 1
     * 5. Pre-search should be created for round 1
     * 6. Message should be sent after pre-search completes
     */
    it('should correctly handle web search enable on round 1 after round 0 without search', () => {
      // Step 1: Create thread with web search DISABLED
      const thread = createMockThread({
        id: 'thread-e2e-round2-search',
        enableWebSearch: false, // Web search OFF initially
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
      ];

      // Initialize with round 0 complete (no web search)
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify initial state
      expect(store.getState().enableWebSearch).toBe(false);
      expect(store.getState().preSearches).toHaveLength(0);
      expect(getCurrentRoundNumber(store.getState().messages)).toBe(0);

      // Step 2: User enables web search (simulating toggle)
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);

      // Step 3: User submits message (simulating handleUpdateThreadAndSend)
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('What is the weather today?', []);

      // Verify optimistic message added for round 1
      const messagesAfterPrepare = store.getState().messages;
      expect(messagesAfterPrepare).toHaveLength(3);
      expect(messagesAfterPrepare[2].metadata?.roundNumber).toBe(1);
      expect(messagesAfterPrepare[2].metadata?.isOptimistic).toBe(true);

      // Verify isWaitingForChangelog is set
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // Step 4: Simulate useThreadActions clearing the flag
      store.getState().setIsWaitingForChangelog(false);

      // Step 5: Now check validation - should wait for pre-search
      const validationBeforePreSearch = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: { ...thread, enableWebSearch: true },
        enableWebSearch: true,
      });

      // Should be waiting for pre-search creation (doesn't exist yet)
      expect(validationBeforePreSearch.shouldSend).toBe(false);
      expect(validationBeforePreSearch.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);
      expect(validationBeforePreSearch.roundNumber).toBe(1); // Correct round!

      // Step 6: Create pre-search for round 1 (simulating provider creating it)
      store.getState().addPreSearch({
        id: 'presearch-round-1',
        threadId: thread.id,
        roundNumber: 1, // Must be round 1, not round 2!
        userQuery: 'What is the weather today?',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        completedAt: null,
        errorMessage: null,
      });

      // Validation should wait for pre-search to complete
      const validationDuringPending = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: { ...thread, enableWebSearch: true },
        enableWebSearch: true,
      });

      expect(validationDuringPending.shouldSend).toBe(false);
      expect(validationDuringPending.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);

      // Step 7: Pre-search completes
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.COMPLETE);

      // Final validation - should be ready to send!
      const validationAfterComplete = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: { ...thread, enableWebSearch: true },
        enableWebSearch: true,
      });

      expect(validationAfterComplete.shouldSend).toBe(true);
      expect(validationAfterComplete.roundNumber).toBe(1);
    });

    it('should work correctly for round 2 after rounds 0 and 1 without search', () => {
      // Thread with rounds 0 and 1 complete, no web search
      const thread = createMockThread({
        id: 'thread-e2e-round2-search-2',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(1, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search for round 2
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Search query for round 2', []);

      // Verify optimistic message is for round 2
      const messages = store.getState().messages;
      expect(messages).toHaveLength(5);
      expect(messages[4].metadata?.roundNumber).toBe(2);

      // Clear changelog flag
      store.getState().setIsWaitingForChangelog(false);

      // Check that getCurrentRoundNumber returns 2 (not 3!)
      expect(getCurrentRoundNumber(messages)).toBe(2);

      // Create pre-search for correct round
      store.getState().addPreSearch({
        ...createPendingPreSearch(2),
        status: AnalysisStatuses.COMPLETE,
      });

      // Validation should pass
      const validation = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: { ...thread, enableWebSearch: true },
        enableWebSearch: true,
      });

      expect(validation.shouldSend).toBe(true);
      expect(validation.roundNumber).toBe(2);
    });

    it('should fail if pre-search created for wrong round (simulates old bug)', () => {
      const thread = createMockThread({
        id: 'thread-wrong-round',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search and prepare message
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Test query', []);
      store.getState().setIsWaitingForChangelog(false);

      // BUG SIMULATION: Create pre-search for WRONG round (2 instead of 1)
      // This is what the old buggy code would do
      store.getState().addPreSearch({
        ...createPendingPreSearch(2), // WRONG! Should be round 1
        status: AnalysisStatuses.COMPLETE,
      });

      // Validation should FAIL because pre-search is for wrong round
      const validation = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: false,
        isStreaming: false,
        isWaitingForChangelog: false,
        screenMode: ScreenModes.THREAD,
        participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: { ...thread, enableWebSearch: true },
        enableWebSearch: true,
      });

      // This demonstrates the bug - validation can't find pre-search for round 1
      expect(validation.shouldSend).toBe(false);
      expect(validation.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH_CREATION);
      expect(validation.roundNumber).toBe(1); // Looking for round 1
    });
  });

  describe('bug fix: round number calculation after optimistic message', () => {
    /**
     * BUG: The provider was using calculateNextRoundNumber instead of getCurrentRoundNumber
     *
     * After prepareForNewMessage adds an optimistic user message:
     * - calculateNextRoundNumber returns N+1 (the NEXT round) - WRONG
     * - getCurrentRoundNumber returns N (the CURRENT round from optimistic message) - CORRECT
     *
     * This caused pre-searches to be created for the wrong round number.
     * For example, if user was in round 1, pre-search would be created for round 2.
     */
    it('should use correct round number after optimistic message is added', () => {
      const thread = createMockThread({
        id: 'thread-round-calc-fix',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      // Initialize with round 0 complete
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Before prepareForNewMessage:
      // - messages = [user_r0, assistant_r0]
      // - getCurrentRoundNumber = 0 (from user_r0)
      // - calculateNextRoundNumber = 1 (max 0 + 1)
      expect(getCurrentRoundNumber(store.getState().messages)).toBe(0);
      expect(calculateNextRoundNumber(store.getState().messages)).toBe(1);

      // Enable web search and prepare for round 1
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // After prepareForNewMessage:
      // - messages = [user_r0, assistant_r0, user_r1_optimistic]
      // - getCurrentRoundNumber = 1 (from user_r1_optimistic) - CORRECT
      // - calculateNextRoundNumber = 2 (max 1 + 1) - WRONG for current round
      const messagesAfter = store.getState().messages;
      expect(messagesAfter).toHaveLength(3);

      const optimisticMsg = messagesAfter[2];
      expect(optimisticMsg.role).toBe('user');
      expect(optimisticMsg.metadata?.isOptimistic).toBe(true);
      expect(optimisticMsg.metadata?.roundNumber).toBe(1);

      // ============================================================================
      // THE FIX: Provider should use getCurrentRoundNumber (returns 1)
      // NOT calculateNextRoundNumber (which would return 2)
      // ============================================================================
      const currentRound = getCurrentRoundNumber(messagesAfter);
      const nextRound = calculateNextRoundNumber(messagesAfter);

      expect(currentRound).toBe(1); // CORRECT - pre-search should be for round 1
      expect(nextRound).toBe(2); // WRONG if used for pre-search

      // When creating pre-search, it should be for round 1 (currentRound)
      // Previously the bug would create pre-search for round 2 (nextRound)
    });

    it('should correctly identify round 2 after round 1 completes and new message is sent', () => {
      const thread = createMockThread({
        id: 'thread-round2-calc',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      // Initialize with round 0 and round 1 complete
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(1, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Before prepareForNewMessage for round 2:
      expect(getCurrentRoundNumber(store.getState().messages)).toBe(1);
      expect(calculateNextRoundNumber(store.getState().messages)).toBe(2);

      // Prepare for round 2
      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 2 question', []);

      const messagesAfter = store.getState().messages;
      expect(messagesAfter).toHaveLength(5);

      const optimisticMsg = messagesAfter[4];
      expect(optimisticMsg.metadata?.roundNumber).toBe(2);

      // After optimistic message added:
      // getCurrentRoundNumber = 2 (CORRECT for pre-search)
      // calculateNextRoundNumber = 3 (WRONG - would create pre-search for wrong round)
      expect(getCurrentRoundNumber(messagesAfter)).toBe(2);
      expect(calculateNextRoundNumber(messagesAfter)).toBe(3);
    });

    it('should handle overview screen correctly (no optimistic message added)', () => {
      // On OVERVIEW screen, prepareForNewMessage does NOT add optimistic message
      // because initializeThread already added the user message from backend

      const thread = createMockThread({
        id: 'thread-overview-round',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      // Simulate overview screen: messages already include user message from backend
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0), // Backend already created this
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW); // OVERVIEW, not THREAD

      // prepareForNewMessage on OVERVIEW screen should NOT add optimistic message
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Initial question', []);

      // Messages should still be just 1 (no optimistic added)
      expect(store.getState().messages).toHaveLength(1);

      // Both functions return 0 for round 0
      expect(getCurrentRoundNumber(store.getState().messages)).toBe(0);
      expect(calculateNextRoundNumber(store.getState().messages)).toBe(1);
      // Note: For overview, we still want getCurrentRoundNumber (0) for pre-search
    });

    it('should match validation function round number expectations', () => {
      const thread = createMockThread({
        id: 'thread-validation-match',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      store.getState().setEnableWebSearch(true);
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Test message', []);

      const messages = store.getState().messages;

      // The validation function (shouldSendPendingMessage) uses getCurrentRoundNumber
      // The provider effect should also use getCurrentRoundNumber to match
      const validationRoundNumber = getCurrentRoundNumber(messages);

      // Create pre-search for the CORRECT round
      store.getState().addPreSearch({
        ...createPendingPreSearch(validationRoundNumber),
        status: AnalysisStatuses.COMPLETE,
      });

      // Validation should find the pre-search for round 1
      const validation = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
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

      // Should be ready to send (pre-search exists and is complete)
      expect(validation.shouldSend).toBe(true);
      expect(validation.roundNumber).toBe(validationRoundNumber);
    });
  });

  // ============================================================================
  // EAGER RENDERING TESTS: Web Search Accordion & Pending Participant Cards
  // ============================================================================

  describe('eager Rendering: Placeholder Pre-Search Creation', () => {
    /**
     * BUG REPORT: Web search accordion doesn't appear mid-conversation
     *
     * SCENARIO:
     * 1. Thread exists with completed rounds (NO web search)
     * 2. User enables web search toggle
     * 3. User sends message for next round
     * 4. EXPECTED: Web search accordion appears immediately with shimmer loading
     * 5. ACTUAL (BUG): No accordion appears because no placeholder pre-search exists
     *
     * ROOT CAUSE:
     * - handleCreateThread (overview) adds placeholder pre-search immediately
     * - handleUpdateThreadAndSend (thread) did NOT add placeholder pre-search
     * - Provider effect creates pre-search async, causing UI delay
     *
     * FIX: handleUpdateThreadAndSend now creates placeholder pre-search immediately
     */
    it('should support immediate pre-search placeholder for eager rendering', () => {
      // SETUP: Complete thread without web search
      const thread = createMockThread({
        id: 'thread-eager-presearch',
        enableWebSearch: false,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      ];

      const messages = [
        createMockUserMessage(0, 'Round 0 question'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // SIMULATE: User enables web search and form-actions adds placeholder
      store.getState().setEnableWebSearch(true);
      const nextRoundNumber = calculateNextRoundNumber(store.getState().messages);

      // CRITICAL: Add placeholder pre-search IMMEDIATELY (like form-actions does now)
      const placeholderPreSearch = createPendingPreSearch(nextRoundNumber);
      store.getState().addPreSearch({
        ...placeholderPreSearch,
        id: `placeholder-presearch-${thread.id}-${nextRoundNumber}`,
        userQuery: 'Round 1 with web search',
        status: AnalysisStatuses.PENDING,
      });

      // VERIFY: Pre-search exists BEFORE prepareForNewMessage
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].roundNumber).toBe(nextRoundNumber);
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Now prepare the message (happens after placeholder is created)
      store.getState().prepareForNewMessage('Round 1 with web search', []);

      // Pre-search still exists after prepareForNewMessage
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().streamingRoundNumber).toBe(nextRoundNumber);
    });

    it('should not block message sending when placeholder pre-search exists in STREAMING status', () => {
      // SETUP
      const thread = createMockThread({
        id: 'thread-streaming-presearch',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'R0'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));

      // Prepare round 1
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 1', []);
      store.getState().setIsWaitingForChangelog(false);

      // Add pre-search in STREAMING status (provider is executing it)
      const nextRound = getCurrentRoundNumber(store.getState().messages);
      store.getState().addPreSearch({
        ...createPendingPreSearch(nextRound),
        status: AnalysisStatuses.STREAMING,
      });

      // Should wait for streaming to complete
      const validationResult = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      expect(validationResult.shouldSend).toBe(false);
      // STREAMING status means we're waiting for pre-search to complete
      expect(validationResult.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);
    });

    it('should validate placeholder pre-search has correct round number for round 3', () => {
      // SETUP: Thread with rounds 0, 1, 2 complete
      const thread = createMockThread({
        id: 'thread-round3',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      const messages = [
        createMockUserMessage(0, 'R0'),
        createMockMessage(0, 0),
        createMockUserMessage(1, 'R1'),
        createMockMessage(0, 1),
        createMockUserMessage(2, 'R2'),
        createMockMessage(0, 2),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Enable web search for round 3
      store.getState().setEnableWebSearch(true);

      // Calculate round number (should be 3)
      const expectedRound = calculateNextRoundNumber(store.getState().messages);
      expect(expectedRound).toBe(3);

      // Add placeholder (like form-actions does)
      store.getState().addPreSearch({
        ...createPendingPreSearch(expectedRound),
        id: `placeholder-presearch-${thread.id}-${expectedRound}`,
        userQuery: 'Round 3 with web search',
      });

      // Prepare message
      store.getState().prepareForNewMessage('Round 3 with web search', []);

      // Verify state is correctly set for round 3
      expect(store.getState().streamingRoundNumber).toBe(3);
      expect(store.getState().preSearches[0].roundNumber).toBe(3);

      // Optimistic message should also be round 3
      const lastMsg = store.getState().messages[store.getState().messages.length - 1];
      expect(lastMsg.metadata?.roundNumber).toBe(3);
    });
  });

  describe('eager Rendering: Pre-Search Status Transitions', () => {
    /**
     * Test the lifecycle of a placeholder pre-search:
     * PENDING → STREAMING → COMPLETE
     *
     * Each status has specific UI implications:
     * - PENDING: Show accordion with "Searching..." shimmer
     * - STREAMING: Show accordion with streaming content
     * - COMPLETE: Show accordion with full results
     */
    it('should track pre-search status transitions correctly', () => {
      const thread = createMockThread({
        id: 'thread-status-transitions',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Step 1: Add placeholder (PENDING)
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.PENDING,
      });

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Step 2: Update to STREAMING (provider started execution)
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

      // Step 3: Update to COMPLETE with data
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().preSearches[0].searchData).not.toBeNull();
    });

    it('should block message sending during PENDING status', () => {
      const thread = createMockThread({
        id: 'thread-pending-block',
        enableWebSearch: true,
      });

      const participants = [createMockParticipant(0, { modelId: 'openai/gpt-4' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'R0'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));

      // Prepare round 1
      store.getState().setExpectedParticipantIds(['openai/gpt-4']);
      store.getState().prepareForNewMessage('Round 1', []);
      store.getState().setIsWaitingForChangelog(false);

      // Add PENDING pre-search (just created, not yet executing)
      const roundNum = getCurrentRoundNumber(store.getState().messages);
      store.getState().addPreSearch({
        ...createPendingPreSearch(roundNum),
        status: AnalysisStatuses.PENDING,
      });

      const validation = shouldSendPendingMessage({
        pendingMessage: store.getState().pendingMessage,
        expectedParticipantIds: store.getState().expectedParticipantIds,
        hasSentPendingMessage: store.getState().hasSentPendingMessage,
        isStreaming: store.getState().isStreaming,
        isWaitingForChangelog: store.getState().isWaitingForChangelog,
        screenMode: store.getState().screenMode,
        participants: store.getState().participants,
        messages: store.getState().messages,
        preSearches: store.getState().preSearches,
        thread: store.getState().thread,
        enableWebSearch: store.getState().enableWebSearch,
      });

      // Should wait for pre-search to complete (PENDING means waiting for execution to start/complete)
      expect(validation.shouldSend).toBe(false);
      expect(validation.reason).toBe(PendingMessageValidationReasons.WAITING_FOR_PRE_SEARCH);
    });
  });
});
