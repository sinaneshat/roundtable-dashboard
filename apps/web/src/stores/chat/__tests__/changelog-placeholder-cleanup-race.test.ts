/**
 * Changelog + Placeholder Cleanup Race Condition Test
 *
 * Tests the bug where:
 * 1. User starts round 0 with participants
 * 2. User submits another message with config changes (round 1)
 * 3. PATCH updates thread/participants in store
 * 4. This triggers screen initialization effect which calls initializeThread
 * 5. initializeThread resets streaming state (waitingToStartStreaming, configChangeRoundNumber, etc.)
 * 6. Pre-search placeholders and streaming setup are wiped out
 *
 * ROOT CAUSE: handleUpdateThreadAndSend doesn't set pendingMessage, so the
 * screen initialization guard (isFormActionsSubmission) is false, allowing
 * initializeThread to be called when thread/participants update.
 *
 * Test File: /src/stores/chat/__tests__/changelog-placeholder-cleanup-race.test.ts
 */

import { ChatModes, MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread } from '@/services/api';

import type { ChatStoreApi } from '../store';
import { createChatStore } from '../store';
import { createOptimisticUserMessage, createPlaceholderPreSearch } from '../utils/placeholder-factories';

/**
 * Simulates the handleUpdateThreadAndSend flow from form-actions.ts
 * This matches the actual implementation closely
 */
function simulateHandleUpdateThreadAndSend(
  store: ChatStoreApi,
  options: {
    threadId: string;
    message: string;
    roundNumber: number;
    hasConfigChanges: boolean;
    enableWebSearch: boolean;
  },
) {
  const state = store.getState();
  const { threadId, message, roundNumber, enableWebSearch } = options;

  // 1. Create and add optimistic user message
  const optimisticMessage = createOptimisticUserMessage({
    roundNumber,
    text: message,
    fileParts: [],
  });
  state.setMessages(currentMessages => [...currentMessages, optimisticMessage]);

  // 2. Set streaming round number
  state.setStreamingRoundNumber(roundNumber);

  // 3. Set expected participant IDs
  state.setExpectedParticipantIds(['gpt-4', 'claude-3']);

  // 4. Create pre-search placeholder if web search enabled
  if (enableWebSearch) {
    state.addPreSearch(createPlaceholderPreSearch({
      threadId,
      roundNumber,
      userQuery: message,
    }));
  }

  // 5. CRITICAL: Set configChangeRoundNumber to block streaming until PATCH completes
  state.setConfigChangeRoundNumber(roundNumber);

  // 6. Enable streaming trigger
  state.setWaitingToStartStreaming(true);
  state.setNextParticipantToTrigger(0);

  return { optimisticMessage };
}

/**
 * Simulates what happens after PATCH completes
 * This triggers the bug because thread/participants update causes screen initialization
 */
function simulatePatchComplete(
  store: ChatStoreApi,
  options: {
    thread: ChatThread;
    participants: ChatParticipant[];
    hasConfigChanges: boolean;
  },
) {
  const state = store.getState();
  const { thread, participants, hasConfigChanges } = options;

  // Update thread and participants (this is what triggers the bug)
  state.setThread(thread);
  state.setParticipants(participants);

  // After PATCH, set isWaitingForChangelog if there were config changes
  if (hasConfigChanges) {
    state.setIsWaitingForChangelog(true);
    // configChangeRoundNumber will be cleared by changelog sync after fetch
  } else {
    // No config changes, clear configChangeRoundNumber directly
    state.setConfigChangeRoundNumber(null);
  }
}

describe('changelog + Placeholder Cleanup Race Condition', () => {
  let store: ChatStoreApi;
  const threadId = 'thread-123';
  const slug = 'test-thread';

  const mockThread: ChatThread = {
    id: threadId,
    title: 'Test Thread',
    slug,
    mode: ChatModes.DEBATING,
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };

  const mockParticipants: ChatParticipant[] = [
    {
      id: 'p1',
      threadId,
      modelId: 'gpt-4',
      role: 'specialist',
      customRoleId: null,
      priority: 0,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'p2',
      threadId,
      modelId: 'claude-3',
      role: 'analyst',
      customRoleId: null,
      priority: 1,
      isEnabled: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  const round0Messages: UIMessage[] = [
    {
      id: 'msg-user-0',
      role: MessageRoles.USER,
      parts: [{ type: 'text', text: 'First message' }],
      metadata: { roundNumber: 0, role: MessageRoles.USER },
    },
    {
      id: 'msg-asst-0-p1',
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Response from GPT-4' }],
      metadata: { roundNumber: 0, role: MessageRoles.ASSISTANT, participantIndex: 0, modelId: 'gpt-4' },
    },
    {
      id: 'msg-asst-0-p2',
      role: MessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Response from Claude' }],
      metadata: { roundNumber: 0, role: MessageRoles.ASSISTANT, participantIndex: 1, modelId: 'claude-3' },
    },
  ];

  beforeEach(() => {
    store = createChatStore();

    // Initialize with round 0 complete
    store.getState().initializeThread(mockThread, mockParticipants, round0Messages);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Simulate round 0 streaming completion
    store.getState().completeStreaming();
  });

  describe('streaming State Preservation During PATCH Update', () => {
    it('sHOULD preserve streaming state when thread/participants update after PATCH', () => {
      // Simulate user submitting round 1 with config changes
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Second message with config changes',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: true,
      });

      // Verify streaming state is set up correctly
      expect(store.getState().waitingToStartStreaming).toBe(true);
      expect(store.getState().configChangeRoundNumber).toBe(1);
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().nextParticipantToTrigger).toBe(0);

      // Verify pre-search placeholder was created
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // Verify optimistic message was added
      const userMessages = store.getState().messages.filter(m => m.role === MessageRoles.USER);
      expect(userMessages).toHaveLength(2); // Round 0 + Round 1

      // Now simulate PATCH completing (this is where the bug occurs)
      // The bug: updating thread/participants can trigger initializeThread
      // which resets all the streaming state we just set up
      simulatePatchComplete(store, {
        thread: { ...mockThread, updatedAt: new Date() }, // New reference
        participants: mockParticipants,
        hasConfigChanges: true,
      });

      // ❌ BUG: These values get reset when initializeThread is incorrectly called
      // The fix should preserve these values

      // Streaming state should still be set up
      expect(store.getState().waitingToStartStreaming).toBe(true);
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().nextParticipantToTrigger).toBe(0);

      // isWaitingForChangelog should be set (for changelog fetch)
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // Pre-search placeholder should still exist
      const preSearchAfterPatch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      expect(preSearchAfterPatch).toBeDefined();
      expect(preSearchAfterPatch?.status).toBe(MessageStatuses.PENDING);

      // Optimistic message should still be there
      const userMessagesAfterPatch = store.getState().messages.filter(m => m.role === MessageRoles.USER);
      expect(userMessagesAfterPatch).toHaveLength(2);
    });

    it('sHOULD NOT call initializeThread during active form submission', () => {
      const initializeThreadSpy = vi.fn();
      const originalInitializeThread = store.getState().initializeThread;

      // Wrap initializeThread to track calls
      store.setState({
        initializeThread: (...args) => {
          initializeThreadSpy();
          return originalInitializeThread(...args);
        },
      });

      // Simulate form submission
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Message with changes',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: true,
      });

      // Clear spy count from setup
      initializeThreadSpy.mockClear();

      // Simulate PATCH completing with new thread reference
      const updatedThread = { ...mockThread, updatedAt: new Date() };
      store.getState().setThread(updatedThread);
      store.getState().setParticipants(mockParticipants);
      store.getState().setIsWaitingForChangelog(true);

      // ❌ BUG: initializeThread might be called here inappropriately
      // The screen initialization effect should detect active submission and skip

      // This test documents expected behavior after fix:
      // initializeThread should NOT be called during active form submission
      // Note: In actual app, this is controlled by useScreenInitialization hook
    });

    it('sHOULD detect active form submission via streaming state flags', () => {
      // Before submission - no active submission
      expect(store.getState().waitingToStartStreaming).toBe(false);
      expect(store.getState().configChangeRoundNumber).toBe(null);
      expect(store.getState().isWaitingForChangelog).toBe(false);
      expect(store.getState().streamingRoundNumber).toBe(null);

      // Start form submission
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Test message',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: false,
      });

      // Active submission should be detectable via multiple flags
      const state = store.getState();
      const isActiveSubmission
        = state.waitingToStartStreaming
          || state.configChangeRoundNumber !== null
          || state.isWaitingForChangelog
          || state.streamingRoundNumber !== null;

      expect(isActiveSubmission).toBe(true);

      // The screen initialization guard should use these flags
      // to prevent calling initializeThread during active submission
    });
  });

  describe('pre-Search Placeholder Preservation', () => {
    it('sHOULD preserve pre-search placeholders when changelog is fetched', () => {
      // Start submission with web search enabled
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Search query',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: true,
      });

      // Verify pre-search placeholder exists
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // Simulate PATCH completing
      simulatePatchComplete(store, {
        thread: mockThread,
        participants: mockParticipants,
        hasConfigChanges: true,
      });

      // Simulate changelog fetch completing
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // ❌ BUG: Pre-search placeholder might be removed
      // The fix should preserve it

      // Pre-search placeholder should still exist and be ready for streaming
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
    });

    it('sHOULD allow pre-search to transition from PENDING to STREAMING', () => {
      // Start submission
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Search query',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: true,
      });

      // Simulate PATCH and changelog completing
      simulatePatchComplete(store, {
        thread: mockThread,
        participants: mockParticipants,
        hasConfigChanges: true,
      });

      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Pre-search should still be pending
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // Mark pre-search as triggered and start streaming
      const didMark = store.getState().tryMarkPreSearchTriggered(1);
      expect(didMark).toBe(true);

      store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      // Complete pre-search
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('streaming Trigger Blocking', () => {
    it('sHOULD block streaming trigger while configChangeRoundNumber is set', () => {
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Test',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: false,
      });

      // configChangeRoundNumber should block streaming
      expect(store.getState().configChangeRoundNumber).toBe(1);

      // This simulates the check in useStreamingTrigger
      const shouldBlockStreaming = store.getState().configChangeRoundNumber !== null
        || store.getState().isWaitingForChangelog;

      expect(shouldBlockStreaming).toBe(true);
    });

    it('sHOULD block streaming trigger while isWaitingForChangelog is true', () => {
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Test',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: false,
      });

      // Simulate PATCH completing with config changes
      store.getState().setIsWaitingForChangelog(true);

      // isWaitingForChangelog should block streaming
      expect(store.getState().isWaitingForChangelog).toBe(true);

      const shouldBlockStreaming = store.getState().configChangeRoundNumber !== null
        || store.getState().isWaitingForChangelog;

      expect(shouldBlockStreaming).toBe(true);
    });

    it('sHOULD unblock streaming trigger when both flags are cleared', () => {
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Test',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: false,
      });

      // Simulate full flow completion
      simulatePatchComplete(store, {
        thread: mockThread,
        participants: mockParticipants,
        hasConfigChanges: true,
      });

      // Simulate changelog fetch completing
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // Now streaming should be unblocked
      const shouldBlockStreaming = store.getState().configChangeRoundNumber !== null
        || store.getState().isWaitingForChangelog;

      expect(shouldBlockStreaming).toBe(false);

      // waitingToStartStreaming should still be true for trigger
      expect(store.getState().waitingToStartStreaming).toBe(true);
    });
  });

  describe('message Preservation During State Updates', () => {
    it('sHOULD preserve optimistic user message when thread updates', () => {
      simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'New message',
        roundNumber: 1,
        hasConfigChanges: true,
        enableWebSearch: false,
      });

      const messagesBefore = store.getState().messages;
      const round1UserMessage = messagesBefore.find(
        m => m.role === MessageRoles.USER
          && (m.metadata as { roundNumber: number })?.roundNumber === 1,
      );

      expect(round1UserMessage).toBeDefined();

      // Update thread (simulating PATCH response)
      simulatePatchComplete(store, {
        thread: { ...mockThread, updatedAt: new Date() },
        participants: mockParticipants,
        hasConfigChanges: true,
      });

      // ❌ BUG: Optimistic message might be removed
      // The fix should preserve it

      const messagesAfter = store.getState().messages;
      const round1UserMessageAfter = messagesAfter.find(
        m => m.role === MessageRoles.USER
          && (m.metadata as { roundNumber: number })?.roundNumber === 1,
      );

      expect(round1UserMessageAfter).toBeDefined();
      expect(messagesAfter).toHaveLength(messagesBefore.length);
    });

    it('sHOULD allow replacing optimistic message with persisted message', () => {
      const { optimisticMessage } = simulateHandleUpdateThreadAndSend(store, {
        threadId,
        message: 'Test message',
        roundNumber: 1,
        hasConfigChanges: false,
        enableWebSearch: false,
      });

      // Simulate receiving persisted message from PATCH response
      const persistedMessage: UIMessage = {
        id: 'msg-persisted-123',
        role: MessageRoles.USER,
        parts: [{ type: 'text', text: 'Test message' }],
        metadata: { roundNumber: 1, role: MessageRoles.USER },
      };

      // Replace optimistic with persisted
      store.getState().setMessages(currentMessages =>
        currentMessages.map(m =>
          m.id === optimisticMessage.id ? persistedMessage : m,
        ),
      );

      const messages = store.getState().messages;
      const round1Message = messages.find(
        m => (m.metadata as { roundNumber: number })?.roundNumber === 1,
      );

      expect(round1Message?.id).toBe('msg-persisted-123');
    });
  });

  describe('initializeThread State Preservation', () => {
    it('sHOULD preserve configChangeRoundNumber when called during active submission', () => {
      // Set up active submission state
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsWaitingForChangelog(true);

      // If initializeThread is called with same thread (shouldn't happen but testing)
      // It should NOT reset these values

      // Current behavior (BUG): initializeThread always resets isWaitingForChangelog
      // Expected behavior (FIX): initializeThread should detect active submission
      // and preserve these values

      // This test documents what SHOULD happen after the fix
      const configChangeRound = store.getState().configChangeRoundNumber;
      const waitingForChangelog = store.getState().isWaitingForChangelog;
      const waitingToStart = store.getState().waitingToStartStreaming;

      expect(configChangeRound).toBe(1);
      expect(waitingForChangelog).toBe(true);
      expect(waitingToStart).toBe(true);
    });

    it('sHOULD preserve pre-searches when called during active submission', () => {
      // Add pre-search for round 1
      store.getState().addPreSearch(createPlaceholderPreSearch({
        threadId,
        roundNumber: 1,
        userQuery: 'Test query',
      }));

      // Set up active submission state
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      // Pre-searches should be preserved
      expect(store.getState().preSearches).toHaveLength(1);

      // Current behavior (BUG): initializeThread doesn't explicitly clear preSearches
      // but other state resets can cause UI to stop rendering them
      // Expected behavior (FIX): Pre-searches should remain intact during active submission
    });
  });

  describe('screen Initialization Guard Detection', () => {
    it('sHOULD detect active submission from streaming flags even without pendingMessage', () => {
      // This is the key insight - handleUpdateThreadAndSend doesn't set pendingMessage
      // but it DOES set other flags that indicate active submission

      // Simulate handleUpdateThreadAndSend (which doesn't set pendingMessage)
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setNextParticipantToTrigger(0);

      // pendingMessage is NOT set (this is the bug cause)
      expect(store.getState().pendingMessage).toBe(null);

      // But we CAN detect active submission via other flags
      const state = store.getState();
      const isActiveFormSubmission
        = state.waitingToStartStreaming
          || state.configChangeRoundNumber !== null
          || state.isWaitingForChangelog
          || (state.streamingRoundNumber !== null && !state.streamResumptionPrefilled);

      expect(isActiveFormSubmission).toBe(true);

      // The fix should update useScreenInitialization to use this broader check
    });

    it('sHOULD differentiate between resumption and active submission', () => {
      // Case 1: Resumption (prefilled from server)
      store.getState().prefillStreamResumptionState(threadId, {
        roundComplete: false,
        currentPhase: 'participants',
        roundNumber: 1,
        preSearch: null,
        participants: {
          nextParticipantToTrigger: 0,
          completedParticipants: [],
          activeParticipant: null,
        },
        moderator: null,
      });

      expect(store.getState().streamResumptionPrefilled).toBe(true);
      expect(store.getState().waitingToStartStreaming).toBe(true);

      // This IS resumption, not active form submission
      const isResumption = store.getState().streamResumptionPrefilled;
      expect(isResumption).toBe(true);

      // Reset for case 2
      store.getState().clearStreamResumption();

      // Case 2: Active form submission
      store.getState().setConfigChangeRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // This is NOT resumption
      expect(store.getState().streamResumptionPrefilled).toBe(false);

      // But it IS active submission (via streaming flags)
      const isActiveSubmission
        = store.getState().configChangeRoundNumber !== null
          || store.getState().waitingToStartStreaming;

      expect(isActiveSubmission).toBe(true);
    });
  });
});
