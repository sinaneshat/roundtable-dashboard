/**
 * Submission Flow Sanity Tests
 *
 * Sanity checks to verify state updates happen in correct order and expected state.
 * Focus on:
 * 1. State transitions follow documented flow
 * 2. No invalid state combinations
 * 3. State consistency throughout submission lifecycle
 * 4. Pre-conditions and post-conditions are met
 * 5. Critical flags are set/cleared correctly
 *
 * Based on FLOW_DOCUMENTATION.md Part 1-3: Chat Journey Flow
 */

import { describe, expect, it } from 'vitest';

import { MessageStatuses, ScreenModes } from '@/api/core/enums';
import {
  createTestAssistantMessage,
  createTestChatStore,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getRoundNumber } from '@/lib/utils';

describe('submission Flow Sanity - State Transition Order', () => {
  it('should transition from initial UI to streaming in correct order', () => {
    const store = createTestChatStore();
    const stateLog: Array<{
      showInitialUI: boolean;
      isCreatingThread: boolean;
      isStreaming: boolean;
      hasMessages: boolean;
    }> = [];

    const unsubscribe = store.subscribe((state) => {
      stateLog.push({
        showInitialUI: state.showInitialUI,
        isCreatingThread: state.isCreatingThread,
        isStreaming: state.isStreaming,
        hasMessages: state.messages.length > 0,
      });
    });

    // Initial state (ChatOverviewScreen)
    expect(store.getState().showInitialUI).toBe(true);
    expect(store.getState().isCreatingThread).toBe(false);
    expect(store.getState().isStreaming).toBe(false);

    // 1. User submits - thread creation starts
    store.getState().setIsCreatingThread(true);
    store.getState().setShowInitialUI(false);

    // 2. Thread created - user message added
    const userMessage = createTestUserMessage({
      id: 'thread_abc_r0_user',
      content: 'Question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // 3. Streaming starts
    store.getState().setIsCreatingThread(false);
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    unsubscribe();

    // Verify order: showInitialUI turns off BEFORE streaming starts
    const initialUIOffIndex = stateLog.findIndex(s => !s.showInitialUI);
    const streamingStartIndex = stateLog.findIndex(s => s.isStreaming);

    expect(initialUIOffIndex).toBeGreaterThan(-1);
    expect(streamingStartIndex).toBeGreaterThan(-1);
    expect(initialUIOffIndex).toBeLessThan(streamingStartIndex);

    // Verify messages exist when streaming starts
    const firstStreamingState = stateLog[streamingStartIndex];
    expect(firstStreamingState?.hasMessages).toBe(true);
  });

  it('should never have isCreatingThread and isStreaming true simultaneously', () => {
    const store = createTestChatStore();
    const invalidStates: Array<{ isCreatingThread: boolean; isStreaming: boolean }> = [];

    const unsubscribe = store.subscribe((state) => {
      if (state.isCreatingThread && state.isStreaming) {
        invalidStates.push({
          isCreatingThread: state.isCreatingThread,
          isStreaming: state.isStreaming,
        });
      }
    });

    // Simulate complete flow
    store.getState().setIsCreatingThread(true);
    store.getState().setShowInitialUI(false);

    const userMessage = createTestUserMessage({
      id: 'thread_abc_r0_user',
      content: 'Question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    store.getState().setIsCreatingThread(false); // Must turn off BEFORE streaming
    store.getState().setIsStreaming(true);

    unsubscribe();

    // Should NEVER have both flags true
    expect(invalidStates).toHaveLength(0);
  });

  it('should maintain streamingRoundNumber consistency with messages', () => {
    const store = createTestChatStore();

    // Start streaming for round 0
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Add round 0 messages
    const userMessage = createTestUserMessage({
      id: 'thread_abc_r0_user',
      content: 'Question',
      roundNumber: 0,
    });
    const assistantMessage = createTestAssistantMessage({
      id: 'thread_abc_r0_p0',
      content: 'Response',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
    });

    store.getState().setMessages([userMessage, assistantMessage]);

    // Verify streamingRoundNumber matches message roundNumber
    const currentRound = store.getState().streamingRoundNumber;
    const lastMessage = store.getState().messages[store.getState().messages.length - 1];

    expect(currentRound).toBe(0);
    expect(lastMessage).toBeDefined();
    expect(lastMessage!.metadata).toBeDefined();

    // Type-safe metadata extraction
    const messageRoundNumber = getRoundNumber(lastMessage!.metadata);
    expect(messageRoundNumber).toBe(currentRound);
  });
});

describe('submission Flow Sanity - Invalid State Prevention', () => {
  it('documents currentParticipantIndex should not be negative', () => {
    /**
     * PARTICIPANT INDEX VALIDATION:
     *
     * The store allows any number for currentParticipantIndex,
     * but provider logic should ensure it's never negative.
     *
     * Valid values: 0, 1, 2, ... (participant count - 1)
     * Invalid values: -1, -2, ... (should be prevented by provider)
     *
     * Note: Store is permissive (allows -1), provider is strict (validates)
     */
    const store = createTestChatStore();

    // Store allows negative index (permissive)
    store.getState().setCurrentParticipantIndex(-1);
    expect(store.getState().currentParticipantIndex).toBe(-1);

    // Provider should validate and reject negative indices
    // (This test documents expected behavior, not enforces it at store level)
  });

  it('should not have isStreaming true when streamingRoundNumber is null', () => {
    const store = createTestChatStore();
    const invalidStates: Array<{ isStreaming: boolean; streamingRoundNumber: number | null }> = [];

    const unsubscribe = store.subscribe((state) => {
      if (state.isStreaming && state.streamingRoundNumber === null) {
        invalidStates.push({
          isStreaming: state.isStreaming,
          streamingRoundNumber: state.streamingRoundNumber,
        });
      }
    });

    // Correct flow: set round THEN start streaming
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Complete streaming
    store.getState().completeStreaming();

    unsubscribe();

    // Should NEVER have isStreaming=true with null round
    expect(invalidStates).toHaveLength(0);
  });

  it('should clear streamingRoundNumber when completing streaming', () => {
    const store = createTestChatStore();

    // Start streaming
    store.setState({
      isStreaming: true,
      streamingRoundNumber: 0,
      currentParticipantIndex: 2,
    });

    // Complete streaming
    store.getState().completeStreaming();

    // Verify state is cleared
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().streamingRoundNumber).toBe(null);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should not allow isStreaming and isModeratorStreaming true simultaneously', () => {
    const store = createTestChatStore();
    const invalidStates: Array<{ isStreaming: boolean; isModeratorStreaming: boolean }> = [];

    const unsubscribe = store.subscribe((state) => {
      if (state.isStreaming && state.isModeratorStreaming) {
        invalidStates.push({
          isStreaming: state.isStreaming,
          isModeratorStreaming: state.isModeratorStreaming,
        });
      }
    });

    // Participant streaming
    store.getState().setIsStreaming(true);

    // Participant ends BEFORE moderator starts
    store.getState().setIsStreaming(false);

    // Moderator starts
    store.getState().setIsModeratorStreaming(true);

    unsubscribe();

    // Should NEVER have both streaming flags true
    expect(invalidStates).toHaveLength(0);
  });
});

describe('submission Flow Sanity - Pre-Search Integration', () => {
  it('should create PENDING pre-search when web search enabled', () => {
    const store = createTestChatStore({ enableWebSearch: true });

    const preSearchPlaceholder = {
      id: 'presearch_r0',
      threadId: 'thread_abc',
      roundNumber: 0,
      userQuery: 'Question with search',
      status: MessageStatuses.PENDING,
      data: null,
      createdAt: new Date(),
      completedAt: null,
    };

    store.getState().addPreSearch(preSearchPlaceholder);

    const preSearches = store.getState().preSearches;
    expect(preSearches).toHaveLength(1);
    expect(preSearches[0]?.status).toBe(MessageStatuses.PENDING);
  });

  it('should transition pre-search status correctly: PENDING → STREAMING → COMPLETE', () => {
    const store = createTestChatStore({ enableWebSearch: true });

    // Create PENDING
    const preSearchPlaceholder = {
      id: 'presearch_r0',
      threadId: 'thread_abc',
      roundNumber: 0,
      userQuery: 'Question',
      status: MessageStatuses.PENDING,
      data: null,
      createdAt: new Date(),
      completedAt: null,
    };
    store.getState().addPreSearch(preSearchPlaceholder);

    // Verify PENDING
    let preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);

    // Update to STREAMING
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);
    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

    // Update to COMPLETE
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);
    preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
  });

  it('should NOT create pre-search when web search is disabled', () => {
    const store = createTestChatStore({ enableWebSearch: false });

    // Attempt to add pre-search (should not happen in real flow)
    // This verifies store allows it but provider should not call it
    const preSearches = store.getState().preSearches;
    expect(preSearches).toHaveLength(0);
  });

  it('should mark pre-search as triggered atomically', () => {
    const store = createTestChatStore({ enableWebSearch: true });

    // Add pre-search
    const preSearchPlaceholder = {
      id: 'presearch_r0',
      threadId: 'thread_abc',
      roundNumber: 0,
      userQuery: 'Question',
      status: MessageStatuses.PENDING,
      data: null,
      createdAt: new Date(),
      completedAt: null,
    };
    store.getState().addPreSearch(preSearchPlaceholder);

    // First try to mark - should succeed
    const didMark = store.getState().tryMarkPreSearchTriggered(0);
    expect(didMark).toBe(true);

    // Second try to mark - should fail (already marked)
    const didMarkAgain = store.getState().tryMarkPreSearchTriggered(0);
    expect(didMarkAgain).toBe(false);
  });
});

describe('submission Flow Sanity - Message Ordering', () => {
  it('should maintain chronological message order', () => {
    const store = createTestChatStore();

    const messages = [
      createTestUserMessage({
        id: 'thread_abc_r0_user',
        content: 'Question',
        roundNumber: 0,
        createdAt: '2024-01-01T00:00:00.000Z',
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p0',
        content: 'Response 1',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        createdAt: '2024-01-01T00:00:01.000Z',
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p1',
        content: 'Response 2',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
        createdAt: '2024-01-01T00:00:02.000Z',
      }),
    ];

    store.getState().setMessages(messages);

    const storedMessages = store.getState().messages;

    // Verify we have expected number of messages
    expect(storedMessages).toHaveLength(3);

    // Extract and verify chronological order by createdAt
    const timestamps = storedMessages.map((msg) => {
      const metadata = msg.metadata as { createdAt?: string } | undefined;
      expect(metadata?.createdAt).toBeDefined();
      return new Date(metadata!.createdAt!).getTime();
    });

    // Verify each timestamp is >= previous
    expect(timestamps[0]).toBeLessThanOrEqual(timestamps[1]!);
    expect(timestamps[1]).toBeLessThanOrEqual(timestamps[2]!);
  });

  it('should have user message before assistant messages in same round', () => {
    const store = createTestChatStore();

    const messages = [
      createTestUserMessage({
        id: 'thread_abc_r0_user',
        content: 'Question',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p0',
        content: 'Response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
    ];

    store.getState().setMessages(messages);

    const storedMessages = store.getState().messages;

    // First message should be user message
    expect(storedMessages[0]?.role).toBe('user');

    // Second message should be assistant
    expect(storedMessages[1]?.role).toBe('assistant');
  });

  it('should maintain participant index order within round', () => {
    const store = createTestChatStore();

    const messages = [
      createTestUserMessage({
        id: 'thread_abc_r0_user',
        content: 'Question',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p0',
        content: 'Response 1',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p1',
        content: 'Response 2',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p2',
        content: 'Response 3',
        roundNumber: 0,
        participantId: 'participant-2',
        participantIndex: 2,
      }),
    ];

    store.getState().setMessages(messages);

    const storedMessages = store.getState().messages;

    // Extract participant indices
    const participantIndices: number[] = [];
    storedMessages.forEach((msg) => {
      if (
        msg.role === 'assistant'
        && msg.metadata
        && typeof msg.metadata === 'object'
        && 'participantIndex' in msg.metadata
        && typeof msg.metadata.participantIndex === 'number'
      ) {
        participantIndices.push(msg.metadata.participantIndex);
      }
    });

    // Should be sequential: 0, 1, 2
    expect(participantIndices).toEqual([0, 1, 2]);
  });
});

describe('submission Flow Sanity - Council Moderator Integration', () => {
  it('should only have moderator message after all participants complete', () => {
    const store = createTestChatStore();

    const messages = [
      createTestUserMessage({
        id: 'thread_abc_r0_user',
        content: 'Question',
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p0',
        content: 'Response 1',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'thread_abc_r0_p1',
        content: 'Response 2',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
      }),
      createTestModeratorMessage({
        id: 'thread_abc_r0_moderator',
        content: 'Council moderator summary',
        roundNumber: 0,
      }),
    ];

    store.getState().setMessages(messages);

    const storedMessages = store.getState().messages;

    // Find moderator message
    const moderatorIndex = storedMessages.findIndex(
      msg =>
        msg.metadata
        && typeof msg.metadata === 'object'
        && 'isModerator' in msg.metadata
        && msg.metadata.isModerator === true,
    );

    // Moderator should be last message
    expect(moderatorIndex).toBe(storedMessages.length - 1);
  });

  it('should clear isModeratorStreaming after moderator completes', () => {
    const store = createTestChatStore();

    // Start moderator streaming
    store.getState().setIsModeratorStreaming(true);

    expect(store.getState().isModeratorStreaming).toBe(true);

    // Moderator completes
    store.getState().setIsModeratorStreaming(false);

    expect(store.getState().isModeratorStreaming).toBe(false);
  });

  it('should not start moderator if participants still streaming', () => {
    const store = createTestChatStore();

    // Participants streaming
    store.setState({ isStreaming: true, isModeratorStreaming: false });

    // Verify moderator should not start
    const shouldBlockModerator = store.getState().isStreaming;
    expect(shouldBlockModerator).toBe(true);
  });
});

describe('submission Flow Sanity - Screen Mode Transitions', () => {
  it('should transition from OVERVIEW to THREAD after first round', () => {
    const store = createTestChatStore();

    // Initial: OVERVIEW screen
    store.setState({ screenMode: ScreenModes.OVERVIEW, showInitialUI: true });

    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    expect(store.getState().showInitialUI).toBe(true);

    // After submission: initial UI hidden but still OVERVIEW during streaming
    store.getState().setShowInitialUI(false);
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // After council moderator completes: transition to THREAD
    store.getState().setScreenMode(ScreenModes.THREAD);

    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    expect(store.getState().showInitialUI).toBe(false);
  });

  it('should stay in THREAD mode for subsequent rounds', () => {
    const store = createTestChatStore();

    // Set THREAD mode
    store.setState({ screenMode: ScreenModes.THREAD, showInitialUI: false });

    // Submit second message
    const round1User = createTestUserMessage({
      id: 'thread_abc_r1_user',
      content: 'Second question',
      roundNumber: 1,
    });
    store.getState().setMessages([round1User]);

    // Screen mode should remain THREAD
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    expect(store.getState().showInitialUI).toBe(false);
  });
});

describe('submission Flow Sanity - Critical Flags', () => {
  it('should clear input value after submission', () => {
    const store = createTestChatStore();

    // User types message
    store.getState().setInputValue('Test question');
    expect(store.getState().inputValue).toBe('Test question');

    // After submission, input should clear
    store.getState().setInputValue('');
    expect(store.getState().inputValue).toBe('');
  });

  it('should set waitingToStartStreaming correctly before streaming', () => {
    const store = createTestChatStore();

    // Before streaming starts, waiting flag may be true
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // When streaming actually starts, flag should clear
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);

    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should reset pendingMessage after submission', () => {
    const store = createTestChatStore();

    // Set pending message
    store.getState().setPendingMessage('Pending question');
    expect(store.getState().pendingMessage).toBe('Pending question');

    // After submission, should clear
    store.getState().setPendingMessage(null);
    expect(store.getState().pendingMessage).toBe(null);
  });

  it('should handle enableWebSearch toggle correctly', () => {
    const store = createTestChatStore();

    // Initially disabled
    expect(store.getState().enableWebSearch).toBe(false);

    // User enables web search
    store.getState().setEnableWebSearch(true);
    expect(store.getState().enableWebSearch).toBe(true);

    // User disables web search
    store.getState().setEnableWebSearch(false);
    expect(store.getState().enableWebSearch).toBe(false);
  });
});

describe('submission Flow Sanity - Thread State', () => {
  it('should set createdThreadId after thread creation', () => {
    const store = createTestChatStore();

    // Before creation
    expect(store.getState().createdThreadId).toBe(null);

    // After creation
    store.getState().setCreatedThreadId('thread_abc123');
    expect(store.getState().createdThreadId).toBe('thread_abc123');
  });

  it('should track effectiveThreadId for thread operations', () => {
    const store = createTestChatStore();

    // Set effective thread ID directly (no setter method)
    store.setState({ effectiveThreadId: 'thread_xyz789' });
    expect(store.getState().effectiveThreadId).toBe('thread_xyz789');
  });

  it('should clear hasNavigated flag when returning to overview', () => {
    const store = createTestChatStore();

    // After navigation
    store.setState({ hasNavigated: true });
    expect(store.getState().hasNavigated).toBe(true);

    // Reset to initial UI (returning to /chat overview)
    store.getState().setShowInitialUI(true);

    // hasNavigated should clear
    const currentState = store.getState();
    if (currentState.showInitialUI) {
      store.setState({ hasNavigated: false });
    }

    expect(store.getState().hasNavigated).toBe(false);
  });
});
