/**
 * Non-Initial Round Placeholder Disappearance E2E Test
 *
 * Bug scenario:
 * 1. User completes first round (round 0)
 * 2. User submits message for round 1 (with or without config changes)
 * 3. Placeholders appear briefly
 * 4. PATCH completes → configChangeRoundNumber is cleared
 * 5. Something causes useScreenInitialization to re-run
 * 6. BUG: initializeThread() is called, resetting streaming state
 * 7. Placeholders disappear until streaming actually starts
 *
 * Root cause:
 * - handleUpdateThreadAndSend sets configChangeRoundNumber BEFORE PATCH
 * - After PATCH, if NO config changes, it clears configChangeRoundNumber immediately
 * - This creates a window where hasActiveFormSubmission=false
 * - If useScreenInitialization re-runs during this window, initializeThread is called
 * - initializeThread resets streamingRoundNumber to null → placeholders disappear
 *
 * Fix:
 * - Don't clear configChangeRoundNumber until streaming actually starts
 * - OR use waitingToStartStreaming in the submission detection logic
 */

import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

describe('non-initial round placeholder disappearance', () => {
  // Test helper: create a store with a completed round 0
  function createStoreWithCompletedRound0() {
    const store = createChatStore();
    const threadId = 'test-thread-id';

    // Create thread and participants
    const thread: ChatThread = {
      createdAt: new Date(),
      enableWebSearch: true,
      id: threadId,
      isAiGeneratedTitle: false,
      isFavorite: false,
      isPublic: false,
      lastMessageAt: new Date(),
      mode: 'debate',
      slug: 'test-thread',
      status: 'active',
      title: 'Test Thread',
      updatedAt: new Date(),
      userId: 'user-1',
    };

    const participants: ChatParticipant[] = [
      {
        createdAt: new Date(),
        customRoleId: null,
        id: 'p-1',
        isEnabled: true,
        modelId: 'gpt-4',
        priority: 0,
        role: 'analyst',
        threadId,
        updatedAt: new Date(),
      },
      {
        createdAt: new Date(),
        customRoleId: null,
        id: 'p-2',
        isEnabled: true,
        modelId: 'claude-3',
        priority: 1,
        role: 'critic',
        threadId,
        updatedAt: new Date(),
      },
    ];

    // Initialize thread with completed round 0 messages
    store.getState().initializeThread(thread, participants, [
      {
        id: `${threadId}_r0_user`,
        metadata: { role: MessageRoles.USER, roundNumber: 0 },
        parts: [{ text: 'Initial question', type: 'text' }],
        role: MessageRoles.USER,
      },
      {
        id: `${threadId}_r0_p0`,
        metadata: {
          finishReason: 'stop',
          model: 'gpt-4',
          participantIndex: 0,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'GPT-4 response', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      },
      {
        id: `${threadId}_r0_p1`,
        metadata: {
          finishReason: 'stop',
          model: 'claude-3',
          participantIndex: 1,
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
        parts: [{ text: 'Claude response', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      },
      {
        id: `${threadId}_r0_moderator`,
        metadata: {
          finishReason: 'stop',
          isModerator: true,
          role: 'moderator',
          roundNumber: 0,
        },
        parts: [{ text: 'Summary', type: 'text' }],
        role: MessageRoles.ASSISTANT,
      },
    ]);

    store.getState().setScreenMode(ScreenModes.THREAD);

    return { participants, store, thread };
  }

  describe('bug reproduction: placeholder disappearance on re-initialization', () => {
    it('should NOT reset streamingRoundNumber when initializeThread is called during active submission', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();

      // Simulate form submission for round 1 (handleUpdateThreadAndSend flow)
      const nextRoundNumber = 1;

      // Step 1: Set streaming round number and add optimistic message
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: `optimistic-user-${Date.now()}-r${nextRoundNumber}`,
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: nextRoundNumber,
          },
          parts: [{ text: 'Follow-up question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      // Step 2: Add pre-search placeholder if web search enabled
      store.getState().addPreSearch({
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: `placeholder-presearch-${thread.id}-${nextRoundNumber}`,
        roundNumber: nextRoundNumber,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: thread.id,
        userQuery: 'Follow-up question',
      } as StoredPreSearch);

      // Step 3: Set configChangeRoundNumber to block streaming until PATCH
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);

      // Step 4: Set waitingToStartStreaming
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);

      // Verify state before PATCH
      expect(store.getState().streamingRoundNumber).toBe(nextRoundNumber);
      expect(store.getState().configChangeRoundNumber).toBe(nextRoundNumber);
      expect(store.getState().waitingToStartStreaming).toBeTruthy();
      expect(store.getState().preSearches).toHaveLength(1);

      // Step 5: Simulate PATCH completing
      // In the fixed code, isWaitingForChangelog is ALWAYS set to true after PATCH
      // (regardless of whether there were config changes)
      // This keeps hasActiveFormSubmission = true until use-changelog-sync clears both flags
      store.getState().setIsWaitingForChangelog(true);
      // configChangeRoundNumber is still set (will be cleared by use-changelog-sync)

      // At this point:
      // - configChangeRoundNumber = nextRoundNumber
      // - isWaitingForChangelog = true
      // So hasActiveFormSubmission = true!

      // Step 6: Simulate what happens if initializeThread is called
      // (e.g., due to React reconciliation, TanStack Query update, etc.)
      const beforeStreamingRoundNumber = store.getState().streamingRoundNumber;

      // This simulates the effect re-running and calling initializeThread
      // Note: The fix should make initializeThread preserve streaming state
      store.getState().initializeThread(thread, participants, store.getState().messages);

      // ASSERTION: streamingRoundNumber should be preserved!
      // Before the fix, this would be null (reset by initializeThread)
      expect(store.getState().streamingRoundNumber).toBe(beforeStreamingRoundNumber);
      expect(store.getState().streamingRoundNumber).toBe(nextRoundNumber);

      // Also verify other streaming state is preserved
      expect(store.getState().waitingToStartStreaming).toBeTruthy();
      expect(store.getState().nextParticipantToTrigger).toBe(0);
    });

    it('should preserve placeholder visibility flags when initializeThread is called during submission', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Setup submission state
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().addPreSearch({
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: `placeholder-presearch-${thread.id}-${nextRoundNumber}`,
        roundNumber: nextRoundNumber,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: thread.id,
        userQuery: 'Follow-up',
      } as StoredPreSearch);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);

      // Capture state for rendering assertions
      const renderingState = () => {
        const s = store.getState();
        const roundNumber = nextRoundNumber;
        const streamingRoundNumber = s.streamingRoundNumber;
        const isStreamingRound = roundNumber === streamingRoundNumber;
        const preSearch = s.preSearches.find(ps => ps.roundNumber === roundNumber);
        const preSearchActive = preSearch
          && (preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING);
        const preSearchComplete = preSearch && preSearch.status === MessageStatuses.COMPLETE;
        const isAnyStreamingActive = s.isStreaming || s.isModeratorStreaming || isStreamingRound;
        const isRoundComplete = false; // No moderator finishReason yet
        const shouldShowPendingCards = !isRoundComplete && (preSearchActive || preSearchComplete || isAnyStreamingActive);
        return { isAnyStreamingActive, isStreamingRound, shouldShowPendingCards };
      };

      // Before "PATCH completion" - placeholders should show
      expect(renderingState().shouldShowPendingCards).toBeTruthy();

      // Simulate PATCH completion - isWaitingForChangelog is always set to true
      // (this is the fix - we no longer clear configChangeRoundNumber immediately)
      store.getState().setIsWaitingForChangelog(true);

      // After PATCH but before initializeThread - placeholders should still show
      expect(renderingState().shouldShowPendingCards).toBeTruthy();

      // Simulate initializeThread being called during this window
      store.getState().initializeThread(thread, participants, store.getState().messages);

      // CRITICAL: After initializeThread, placeholders should STILL show
      // This is the bug - if streamingRoundNumber is reset, shouldShowPendingCards becomes false
      expect(renderingState().shouldShowPendingCards).toBeTruthy();
      expect(renderingState().isStreamingRound).toBeTruthy();
    });

    it('should preserve state when isWaitingForChangelog is true (after PATCH completion)', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Setup: Submission in progress
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setNextParticipantToTrigger(0);

      // After PATCH completion, isWaitingForChangelog is ALWAYS set to true
      // (this is the fix - we no longer clear configChangeRoundNumber immediately)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setIsWaitingForChangelog(true);

      // With the fix: hasActiveFormSubmission = true because isWaitingForChangelog = true

      // Call initializeThread - it should detect active submission and preserve state
      const beforeState = {
        nextParticipantToTrigger: store.getState().nextParticipantToTrigger,
        streamingRoundNumber: store.getState().streamingRoundNumber,
        waitingToStartStreaming: store.getState().waitingToStartStreaming,
      };

      store.getState().initializeThread(thread, participants, store.getState().messages);

      // State should be preserved
      expect(store.getState().streamingRoundNumber).toBe(beforeState.streamingRoundNumber);
      expect(store.getState().waitingToStartStreaming).toBe(beforeState.waitingToStartStreaming);
      expect(store.getState().nextParticipantToTrigger).toBe(beforeState.nextParticipantToTrigger);
    });
  });

  describe('correct behavior: streaming starts after initializeThread', () => {
    it('should allow streamingRoundNumber to be cleared when streaming actually completes', () => {
      const { store } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Setup submission
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // Simulate streaming started
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);

      // Simulate streaming completed
      store.getState().completeStreaming();

      // After complete, streamingRoundNumber should be null
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().isStreaming).toBeFalsy();
    });
  });

  describe('initializeThread guard during active submission', () => {
    it('should NOT call initializeThread when configChangeRoundNumber is set', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Simulate the EXACT order of operations in handleUpdateThreadAndSend:
      // 1. Add optimistic message
      const optimisticUserId = `optimistic-user-r${nextRoundNumber}`;
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticUserId,
          metadata: { isOptimistic: true, role: MessageRoles.USER, roundNumber: nextRoundNumber },
          parts: [{ text: 'Round 1 question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      // 2. Set streaming state
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setExpectedParticipantIds(['p-1', 'p-2']);

      // 3. Set configChangeRoundNumber (this blocks initializeThread)
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // At this point, hasActiveFormSubmission should be true
      const state = store.getState();
      const hasActiveFormSubmission = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
      expect(hasActiveFormSubmission).toBeTruthy();

      // Verify user message is present
      expect(store.getState().messages).toHaveLength(5);
      const userMsg = store.getState().messages.find(m => m.id === optimisticUserId);
      expect(userMsg).toBeDefined();

      // Now simulate initializeThread being called (as useScreenInitialization would)
      // This should preserve messages because hasActiveFormSubmission = true
      const serverMessages = store.getState().messages.slice(0, 4); // Only round 0
      store.getState().initializeThread(thread, participants, serverMessages);

      // Messages should still include the optimistic user message
      expect(store.getState().messages).toHaveLength(5);
      const userMsgAfter = store.getState().messages.find(m => m.id === optimisticUserId);
      expect(userMsgAfter).toBeDefined();
    });

    it('should NOT call initializeThread when isWaitingForChangelog is true', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Add optimistic message
      const optimisticUserId = `optimistic-user-r${nextRoundNumber}`;
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticUserId,
          metadata: { isOptimistic: true, role: MessageRoles.USER, roundNumber: nextRoundNumber },
          parts: [{ text: 'Round 1 question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // Simulate AFTER PATCH: isWaitingForChangelog is set
      store.getState().setIsWaitingForChangelog(true);

      // hasActiveFormSubmission should be true
      const state = store.getState();
      expect(state.isWaitingForChangelog).toBeTruthy();

      // initializeThread should preserve messages
      const serverMessages = store.getState().messages.slice(0, 4);
      store.getState().initializeThread(thread, participants, serverMessages);

      expect(store.getState().messages).toHaveLength(5);
      expect(store.getState().messages.find(m => m.id === optimisticUserId)).toBeDefined();
    });

    it('should preserve messages when NEITHER flag is set but store has newer round', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Add optimistic message WITHOUT setting any flags
      const optimisticUserId = `optimistic-user-r${nextRoundNumber}`;
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticUserId,
          metadata: { isOptimistic: true, role: MessageRoles.USER, roundNumber: nextRoundNumber },
          parts: [{ text: 'Round 1 question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      // NO flags set - but store has round 1, server only has round 0
      const serverMessages = store.getState().messages.slice(0, 4);

      // initializeThread should still preserve store messages due to round comparison
      store.getState().initializeThread(thread, participants, serverMessages);

      // Store had round 1, server had round 0, so store messages should be kept
      expect(store.getState().messages).toHaveLength(5);
      expect(store.getState().messages.find(m => m.id === optimisticUserId)).toBeDefined();
    });
  });

  describe('user message visibility after submission', () => {
    it('should preserve optimistic user message when initializeThread is called with server messages', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Get the initial round 0 messages (what server would return)
      const serverMessages = [...store.getState().messages];
      expect(serverMessages).toHaveLength(4); // user + 2 participants + moderator

      // Step 1: Simulate form submission - add optimistic user message
      const optimisticUserId = `optimistic-user-${Date.now()}-r${nextRoundNumber}`;
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticUserId,
          metadata: {
            isOptimistic: true,
            role: MessageRoles.USER,
            roundNumber: nextRoundNumber,
          },
          parts: [{ text: 'Follow-up question for round 1', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      // Verify user message was added
      expect(store.getState().messages).toHaveLength(5);
      const userMsgBeforeInit = store.getState().messages.find(m => m.id === optimisticUserId);
      expect(userMsgBeforeInit).toBeDefined();
      expect(userMsgBeforeInit?.parts[0]).toEqual({ text: 'Follow-up question for round 1', type: 'text' });

      // Step 2: Set up streaming state (as handleUpdateThreadAndSend does)
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setWaitingToStartStreaming(true);

      // Step 3: PATCH completes - set isWaitingForChangelog (this is the fix)
      store.getState().setIsWaitingForChangelog(true);

      // Step 4: initializeThread is called with SERVER messages (that DON'T have the optimistic message)
      // This simulates the TanStack Query cache update triggering a re-render
      store.getState().initializeThread(thread, participants, serverMessages);

      // CRITICAL: User message should STILL be present!
      // The initializeThread logic should prefer store messages when store has more rounds
      expect(store.getState().messages).toHaveLength(5);
      const userMsgAfterInit = store.getState().messages.find(m => m.id === optimisticUserId);
      expect(userMsgAfterInit).toBeDefined();
      expect(userMsgAfterInit?.parts[0]).toEqual({ text: 'Follow-up question for round 1', type: 'text' });
    });

    it('should NOT lose user message when initializeThread called WITHOUT hasActiveFormSubmission flags', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Get server messages (round 0 only)
      const serverMessages = [...store.getState().messages];

      // Add optimistic user message for round 1
      const optimisticUserId = `optimistic-user-r${nextRoundNumber}`;
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticUserId,
          metadata: { isOptimistic: true, role: MessageRoles.USER, roundNumber: nextRoundNumber },
          parts: [{ text: 'Second round question', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      // Verify: 5 messages (4 from round 0 + 1 user from round 1)
      expect(store.getState().messages).toHaveLength(5);

      // Simulate streamingRoundNumber set (but without hasActiveFormSubmission flags)
      store.getState().setStreamingRoundNumber(nextRoundNumber);

      // NOTE: configChangeRoundNumber and isWaitingForChangelog are NOT set!
      // This tests the message comparison logic independent of preserveStreamingState

      // Call initializeThread with server messages
      store.getState().initializeThread(thread, participants, serverMessages);

      // The message comparison should still keep store messages because:
      // - Store has max round 1, server has max round 0
      // - storeMaxRound > newMaxRound, so messagesToSet = storeMessages
      const messagesAfter = store.getState().messages;
      expect(messagesAfter.length).toBeGreaterThanOrEqual(5);

      const userMsg = messagesAfter.find(m => m.id === optimisticUserId);
      expect(userMsg).toBeDefined();
    });

    it('should keep user message when server returns same messages after PATCH', () => {
      const { participants, store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Add optimistic user message
      const optimisticUserId = `user-msg-r${nextRoundNumber}`;
      store.getState().setMessages(msgs => [
        ...msgs,
        {
          id: optimisticUserId,
          metadata: { isOptimistic: true, role: MessageRoles.USER, roundNumber: nextRoundNumber },
          parts: [{ text: 'My follow-up', type: 'text' }],
          role: MessageRoles.USER,
        },
      ]);

      // Set up submission state
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().setConfigChangeRoundNumber(nextRoundNumber);
      store.getState().setIsWaitingForChangelog(true);

      // After PATCH, server returns messages INCLUDING the persisted user message
      const serverMessagesWithPersistedUser = [
        ...store.getState().messages.filter(m => m.id !== optimisticUserId),
        {
          id: `persisted-user-r${nextRoundNumber}`, // Different ID from optimistic
          metadata: { role: MessageRoles.USER, roundNumber: nextRoundNumber },
          parts: [{ text: 'My follow-up', type: 'text' }],
          role: MessageRoles.USER,
        },
      ];

      // initializeThread called with server messages
      store.getState().initializeThread(thread, participants, serverMessagesWithPersistedUser);

      // Should have 5 messages (store messages preserved because hasActiveFormSubmission)
      // OR server messages if they have the same/higher round
      const messagesAfter = store.getState().messages;
      expect(messagesAfter).toHaveLength(5);

      // At least one user message for round 1 should exist
      const round1UserMsgs = messagesAfter.filter(
        m => m.role === MessageRoles.USER && m.metadata?.roundNumber === nextRoundNumber,
      );
      expect(round1UserMsgs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('pre-search completion should not hide placeholders', () => {
    it('should keep placeholders visible when pre-search completes but streaming not started', () => {
      const { store, thread } = createStoreWithCompletedRound0();
      const nextRoundNumber = 1;

      // Setup
      store.getState().setStreamingRoundNumber(nextRoundNumber);
      store.getState().addPreSearch({
        completedAt: null,
        createdAt: new Date(),
        errorMessage: null,
        id: `presearch-${thread.id}-${nextRoundNumber}`,
        roundNumber: nextRoundNumber,
        searchData: null,
        status: MessageStatuses.PENDING,
        threadId: thread.id,
        userQuery: 'Test',
      } as StoredPreSearch);
      store.getState().setWaitingToStartStreaming(true);

      // Pre-search starts streaming
      store.getState().updatePreSearchStatus(nextRoundNumber, MessageStatuses.STREAMING);

      // Pre-search completes
      store.getState().updatePreSearchStatus(nextRoundNumber, MessageStatuses.COMPLETE);

      // streamingRoundNumber should still be set
      expect(store.getState().streamingRoundNumber).toBe(nextRoundNumber);

      // Rendering conditions
      const isStreamingRound = nextRoundNumber === store.getState().streamingRoundNumber;
      const preSearchComplete = store.getState().preSearches.find(
        ps => ps.roundNumber === nextRoundNumber,
      )?.status === MessageStatuses.COMPLETE;

      expect(isStreamingRound).toBeTruthy();
      expect(preSearchComplete).toBeTruthy();

      // shouldShowPendingCards depends on isAnyStreamingActive
      // isAnyStreamingActive = isStreaming || isModeratorStreaming || isStreamingRound
      const isAnyStreamingActive = store.getState().isStreaming
        || store.getState().isModeratorStreaming
        || isStreamingRound;

      expect(isAnyStreamingActive).toBeTruthy(); // Because isStreamingRound is true
    });
  });
});
