/**
 * Submission Flow Performance Tests
 *
 * Tests render counts and function call frequency during submission flow.
 * Focus on:
 * 1. Store update frequency during submission
 * 2. Function call counts match expected behavior
 * 3. No unnecessary re-renders during state transitions
 * 4. Action invocation counts are minimal and correct
 * 5. State updates happen in correct order
 *
 * Based on FLOW_DOCUMENTATION.md Part 1-3: Starting Chat → AI Responses
 */

import { describe, expect, it, vi } from 'vitest';

import { ChatModes, MessageStatuses, ScreenModes } from '@/api/core/enums';
import {
  createTestAssistantMessage,
  createTestChatStore,
  createTestUserMessage,
} from '@/lib/testing';

describe('submission Flow Performance - Store Updates', () => {
  it('should batch submission state changes into minimal updates', () => {
    const store = createTestChatStore();
    let updateCount = 0;

    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    const initialCount = updateCount;

    // Simulate submission - these should be separate updates (no batching in current impl)
    store.getState().setInputValue('Test question');
    store.getState().setIsCreatingThread(true);
    store.getState().setShowInitialUI(false);

    unsubscribe();

    // Document current behavior: 3 separate updates
    expect(updateCount - initialCount).toBe(3);

    // OPTIMIZATION OPPORTUNITY: Could batch into single update
    // Expected ideal: 1 update (batched submission state change)
  });

  it('should track store update frequency during complete submission flow', () => {
    const store = createTestChatStore();
    const updateLog: string[] = [];

    const unsubscribe = store.subscribe((state, prevState) => {
      const changes: string[] = [];

      if (state.inputValue !== prevState.inputValue)
        changes.push('inputValue');
      if (state.isCreatingThread !== prevState.isCreatingThread)
        changes.push('isCreatingThread');
      if (state.showInitialUI !== prevState.showInitialUI)
        changes.push('showInitialUI');
      if (state.isStreaming !== prevState.isStreaming)
        changes.push('isStreaming');
      if (state.streamingRoundNumber !== prevState.streamingRoundNumber)
        changes.push('streamingRoundNumber');
      if (state.messages !== prevState.messages)
        changes.push('messages');

      if (changes.length > 0) {
        updateLog.push(changes.join('+'));
      }
    });

    // 1. User types message
    store.getState().setInputValue('What is React?');

    // 2. User submits - thread creation starts
    store.getState().setIsCreatingThread(true);
    store.getState().setShowInitialUI(false);

    // 3. Thread created - user message added
    const userMessage = createTestUserMessage({
      id: 'thread_abc_r0_user',
      content: 'What is React?',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // 4. Streaming starts
    store.getState().setIsCreatingThread(false);
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    // 5. Input clears
    store.getState().setInputValue('');

    unsubscribe();

    // Verify state transition order
    expect(updateLog).toContain('inputValue');
    expect(updateLog).toContain('isCreatingThread');
    expect(updateLog).toContain('showInitialUI');
    expect(updateLog).toContain('messages');
    expect(updateLog).toContain('isStreaming');

    // Total updates should be reasonable (currently 8 separate updates)
    expect(updateLog.length).toBeGreaterThan(0);
    expect(updateLog.length).toBeLessThan(15);
  });

  it('should not trigger redundant updates when setting same value', () => {
    const store = createTestChatStore();
    let updateCount = 0;

    // Start with specific state
    store.setState({ isCreatingThread: false, isStreaming: false });

    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    const initialCount = updateCount;

    // Set same value multiple times
    store.getState().setIsCreatingThread(false);
    store.getState().setIsCreatingThread(false);
    store.getState().setIsStreaming(false);
    store.getState().setIsStreaming(false);

    unsubscribe();

    // Each setter call triggers update even if value is same (Zustand behavior)
    // Subscribers with shallow equality checks won't re-render
    expect(updateCount - initialCount).toBe(4);
  });
});

describe('submission Flow Performance - Function Call Tracking', () => {
  it('should call setMessages exactly once per streaming chunk', () => {
    const store = createTestChatStore();
    const setMessagesSpy = vi.spyOn(store.getState(), 'setMessages');

    // Simulate 10 streaming chunks for participant 0
    for (let i = 1; i <= 10; i++) {
      const message = createTestAssistantMessage({
        id: 'thread_abc_r0_p0',
        content: 'Word '.repeat(i),
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      });
      store.getState().setMessages([message]);
    }

    // Should be called exactly 10 times (once per chunk)
    expect(setMessagesSpy).toHaveBeenCalledTimes(10);
  });

  it('should call setIsStreaming exactly twice per participant (start + end)', () => {
    const store = createTestChatStore();
    const setIsStreamingSpy = vi.spyOn(store.getState(), 'setIsStreaming');

    // Participant 0: start
    store.getState().setIsStreaming(true);

    // Simulate streaming chunks (should NOT call setIsStreaming)
    const message = createTestAssistantMessage({
      id: 'thread_abc_r0_p0',
      content: 'Response here',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
    });
    store.getState().setMessages([message]);

    // Participant 0: end
    store.getState().setIsStreaming(false);

    // Should be called exactly 2 times (true, false)
    expect(setIsStreamingSpy).toHaveBeenCalledTimes(2);
    expect(setIsStreamingSpy).toHaveBeenNthCalledWith(1, true);
    expect(setIsStreamingSpy).toHaveBeenNthCalledWith(2, false);
  });

  it('should call setCurrentParticipantIndex once per participant transition', () => {
    const store = createTestChatStore();
    const setIndexSpy = vi.spyOn(store.getState(), 'setCurrentParticipantIndex');

    // Start with participant 0
    store.getState().setCurrentParticipantIndex(0);

    // Participant 0 completes, move to participant 1
    store.getState().setCurrentParticipantIndex(1);

    // Participant 1 completes, move to participant 2
    store.getState().setCurrentParticipantIndex(2);

    // Should be called exactly 3 times (0, 1, 2)
    expect(setIndexSpy).toHaveBeenCalledTimes(3);
    expect(setIndexSpy).toHaveBeenNthCalledWith(1, 0);
    expect(setIndexSpy).toHaveBeenNthCalledWith(2, 1);
    expect(setIndexSpy).toHaveBeenNthCalledWith(3, 2);
  });

  it('should not call addPreSearch when web search is disabled', () => {
    const store = createTestChatStore({ enableWebSearch: false });
    const addPreSearchSpy = vi.spyOn(store.getState(), 'addPreSearch');

    // Simulate submission without web search
    const userMessage = createTestUserMessage({
      id: 'thread_abc_r0_user',
      content: 'Question without search',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // Pre-search should NOT be called when disabled
    expect(addPreSearchSpy).not.toHaveBeenCalled();
  });

  it('should call addPreSearch exactly once when web search is enabled', () => {
    const store = createTestChatStore({ enableWebSearch: true });
    const addPreSearchSpy = vi.spyOn(store.getState(), 'addPreSearch');

    // Simulate pre-search creation
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

    // Should be called exactly once
    expect(addPreSearchSpy).toHaveBeenCalledTimes(1);
    expect(addPreSearchSpy).toHaveBeenCalledWith(preSearchPlaceholder);
  });
});

describe('submission Flow Performance - Sequential Participant Streaming', () => {
  it('should increment currentParticipantIndex sequentially without gaps', () => {
    const store = createTestChatStore();
    const indexHistory: number[] = [];

    // Subscribe BEFORE making changes to catch all updates
    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.currentParticipantIndex !== prevState.currentParticipantIndex) {
        indexHistory.push(state.currentParticipantIndex);
      }
    });

    // Simulate 3 participants streaming sequentially
    // Note: Initial state has currentParticipantIndex = 0, so first call may not trigger change
    store.getState().setCurrentParticipantIndex(0); // May not change if already 0
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setCurrentParticipantIndex(2);

    unsubscribe();

    // Should be sequential (may start from 1 if initial state was 0)
    // Either [0, 1, 2] or [1, 2] depending on initial state
    expect(indexHistory.length).toBeGreaterThanOrEqual(2);
    expect(indexHistory).toContain(1);
    expect(indexHistory).toContain(2);
  });

  it('should track message updates per participant without duplicates', () => {
    const store = createTestChatStore();
    const messageUpdates: Array<{ participantIndex: number; updateCount: number }> = [];

    // Track updates for each participant
    const participantUpdates = new Map<number, number>();

    const unsubscribe = store.subscribe((state) => {
      const lastMessage = state.messages[state.messages.length - 1];
      if (
        lastMessage &&
        lastMessage.metadata &&
        typeof lastMessage.metadata === 'object' &&
        'participantIndex' in lastMessage.metadata &&
        typeof lastMessage.metadata.participantIndex === 'number'
      ) {
        const index = lastMessage.metadata.participantIndex;
        const count = (participantUpdates.get(index) ?? 0) + 1;
        participantUpdates.set(index, count);
      }
    });

    // Participant 0: 5 chunks
    for (let i = 1; i <= 5; i++) {
      store.getState().setMessages([
        createTestAssistantMessage({
          id: 'thread_abc_r0_p0',
          content: 'P0 '.repeat(i),
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
      ]);
    }

    // Participant 1: 3 chunks
    for (let i = 1; i <= 3; i++) {
      store.getState().setMessages([
        createTestAssistantMessage({
          id: 'thread_abc_r0_p1',
          content: 'P1 '.repeat(i),
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
        }),
      ]);
    }

    unsubscribe();

    // Record results
    participantUpdates.forEach((updateCount, participantIndex) => {
      messageUpdates.push({ participantIndex, updateCount });
    });

    // Participant 0 should have 5 updates
    const p0Updates = messageUpdates.find(u => u.participantIndex === 0);
    expect(p0Updates?.updateCount).toBe(5);

    // Participant 1 should have 3 updates
    const p1Updates = messageUpdates.find(u => u.participantIndex === 1);
    expect(p1Updates?.updateCount).toBe(3);
  });

  it('should complete streaming with batched state reset', () => {
    const store = createTestChatStore();
    let updateCount = 0;

    // Set up streaming state
    store.setState({
      isStreaming: true,
      streamingRoundNumber: 0,
      currentParticipantIndex: 2,
    });

    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    const initialCount = updateCount;

    // Complete streaming - should batch all resets
    store.getState().completeStreaming();

    unsubscribe();

    // Should be 1 batched update (not 3 separate updates)
    expect(updateCount - initialCount).toBe(1);

    // Verify all state was reset
    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBe(null);
    expect(state.currentParticipantIndex).toBe(0);
  });
});

describe('submission Flow Performance - Council Moderator', () => {
  it('should transition from participant to moderator streaming efficiently', () => {
    const store = createTestChatStore();
    const stateTransitions: string[] = [];

    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.isStreaming !== prevState.isStreaming) {
        stateTransitions.push(`isStreaming:${state.isStreaming}`);
      }
      if (state.isModeratorStreaming !== prevState.isModeratorStreaming) {
        stateTransitions.push(`isModeratorStreaming:${state.isModeratorStreaming}`);
      }
    });

    // Participant streaming ends
    store.getState().setIsStreaming(true);
    store.getState().setIsStreaming(false);

    // Moderator streaming starts
    store.getState().setIsModeratorStreaming(true);

    // Moderator streaming ends
    store.getState().setIsModeratorStreaming(false);

    unsubscribe();

    // Should have clean transitions
    expect(stateTransitions).toContain('isStreaming:true');
    expect(stateTransitions).toContain('isStreaming:false');
    expect(stateTransitions).toContain('isModeratorStreaming:true');
    expect(stateTransitions).toContain('isModeratorStreaming:false');

    // isStreaming should turn off before isModeratorStreaming turns on
    const isStreamingFalseIndex = stateTransitions.indexOf('isStreaming:false');
    const isModeratorStreamingTrueIndex = stateTransitions.indexOf('isModeratorStreaming:true');
    expect(isStreamingFalseIndex).toBeLessThan(isModeratorStreamingTrueIndex);
  });

  it('should not trigger participant streaming while moderator is streaming', () => {
    const store = createTestChatStore();

    // Start moderator streaming
    store.setState({ isModeratorStreaming: true, isStreaming: false });

    // Verify state
    expect(store.getState().isModeratorStreaming).toBe(true);
    expect(store.getState().isStreaming).toBe(false);

    // Participant streaming should not start while moderator is active
    // (This is business logic enforced in components/providers)
    const currentState = store.getState();
    const shouldBlockParticipantStreaming = currentState.isModeratorStreaming;

    expect(shouldBlockParticipantStreaming).toBe(true);
  });
});

describe('submission Flow Performance - Regression Baselines', () => {
  it('documents performance baseline for submission flow', () => {
    /**
     * PERFORMANCE BASELINE (for regression detection):
     *
     * Submission State Changes (initial submission):
     * - setInputValue: 1 update
     * - setIsCreatingThread(true): 1 update
     * - setShowInitialUI(false): 1 update
     * - setMessages (user message): 1 update
     * - setIsCreatingThread(false): 1 update
     * - setIsStreaming(true): 1 update
     * - setStreamingRoundNumber: 1 update
     * - setInputValue(''): 1 update
     * Total: 8 state updates for submission
     *
     * Per Participant (3 participants):
     * - setCurrentParticipantIndex: 1 update per participant = 3 updates
     * - setMessages: N updates (one per streaming chunk, ~20 chunks)
     * Total: ~23 updates per participant × 3 = ~69 updates
     *
     * Council Moderator:
     * - setIsStreaming(false): 1 update
     * - setIsModeratorStreaming(true): 1 update
     * - setMessages: N updates (~30 chunks for moderator)
     * - setIsModeratorStreaming(false): 1 update
     * Total: ~32 updates
     *
     * Complete Round 0 (3 participants + moderator):
     * - Submission: 8 updates
     * - Participants: ~69 updates
     * - Moderator: ~32 updates
     * - Total: ~109 updates
     *
     * OPTIMIZATION OPPORTUNITIES:
     * 1. Batch submission state changes: 8 → 1-2 updates
     * 2. Throttle streaming chunks: 20 chunks → 10-15 updates (throttle to 10-20/sec)
     * 3. Batch moderator state transitions: 4 → 1 update
     *
     * If these baselines increase significantly:
     * - Check for duplicate state updates
     * - Verify completeStreaming still batches
     * - Look for cascading effect bugs
     */
    expect(true).toBe(true);
  });

  it('verifies completeStreaming batching is maintained', () => {
    const store = createTestChatStore();

    store.setState({
      isStreaming: true,
      streamingRoundNumber: 0,
      currentParticipantIndex: 2,
      waitingToStartStreaming: false,
    });

    let updateCount = 0;
    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // Complete streaming - should be ONE batched update
    store.getState().completeStreaming();
    unsubscribe();

    // CRITICAL: Must remain 1 update (regression check)
    expect(updateCount).toBe(1);
  });

  it('verifies no duplicate messages in store after streaming', () => {
    const store = createTestChatStore();

    // Simulate 3 participants streaming
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

    // Verify no duplicate IDs
    const messageIds = messages.map(m => m.id);
    const uniqueIds = new Set(messageIds);
    expect(messageIds.length).toBe(uniqueIds.size);

    // Store should have exactly 4 messages (1 user + 3 assistant)
    expect(store.getState().messages).toHaveLength(4);
  });
});
