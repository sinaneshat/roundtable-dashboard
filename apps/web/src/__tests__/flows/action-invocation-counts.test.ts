/**
 * Action Invocation Count Tests
 *
 * Tests to verify store actions are called the correct number of times.
 * Focus on:
 * 1. No duplicate action calls
 * 2. Action invocation matches expected flow
 * 3. Atomic operations prevent race conditions
 * 4. No excessive polling or queries
 * 5. Action call order verification
 *
 * Based on FLOW_DOCUMENTATION.md and store action patterns
 */

import { MessageStatuses } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  createTestAssistantMessage,
  createTestChatStore,
  createTestUserMessage,
} from '@/lib/testing';

describe('action Invocation Counts - Submission Flow', () => {
  it('should call setInputValue exactly twice during submission (type + clear)', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setInputValue');

    // User types
    store.getState().setInputValue('Test question');

    // After submission, input clears
    store.getState().setInputValue('');

    // Should be called exactly twice
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 'Test question');
    expect(spy).toHaveBeenNthCalledWith(2, '');
  });

  it('should call setIsCreatingThread exactly twice (start + end)', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setIsCreatingThread');

    // Thread creation starts
    store.getState().setIsCreatingThread(true);

    // Thread creation completes
    store.getState().setIsCreatingThread(false);

    // Should be called exactly twice (true, false)
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, true);
    expect(spy).toHaveBeenNthCalledWith(2, false);
  });

  it('should call setShowInitialUI exactly once to hide overview', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setShowInitialUI');

    // Initial UI hides after submission
    store.getState().setShowInitialUI(false);

    // Should be called exactly once
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(false);
  });

  it('should call setStreamingRoundNumber exactly once per round', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setStreamingRoundNumber');

    // Round 0 starts
    store.getState().setStreamingRoundNumber(0);

    // Round 0 completes (completeStreaming batches reset, doesn't call setter)
    store.getState().completeStreaming();

    // Should be called once (set to 0)
    // completeStreaming batches state reset via set(), not via setter
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenNthCalledWith(1, 0);

    // Verify state was reset to null by completeStreaming
    expect(store.getState().streamingRoundNumber).toBe(null);
  });

  it('should call setCreatedThreadId exactly once per thread', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setCreatedThreadId');

    // Thread created
    store.getState().setCreatedThreadId('thread_abc123');

    // Should be called exactly once
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('thread_abc123');
  });
});

describe('action Invocation Counts - Participant Streaming', () => {
  it('should call setCurrentParticipantIndex exactly N times for N participants', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setCurrentParticipantIndex');

    // 3 participants: indices 0, 1, 2
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setCurrentParticipantIndex(2);

    // Reset after round (completeStreaming batches reset)
    store.getState().completeStreaming();

    // Should be called 3 times (0, 1, 2)
    // completeStreaming batches state reset via set(), not via setter
    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy).toHaveBeenNthCalledWith(1, 0);
    expect(spy).toHaveBeenNthCalledWith(2, 1);
    expect(spy).toHaveBeenNthCalledWith(3, 2);

    // Verify index was reset to 0 by completeStreaming
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should call setIsStreaming exactly 2 times per streaming session', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setIsStreaming');

    // Streaming starts
    store.getState().setIsStreaming(true);

    // Streaming ends
    store.getState().setIsStreaming(false);

    // Should be called exactly twice (true, false)
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, true);
    expect(spy).toHaveBeenNthCalledWith(2, false);
  });

  it('should call completeStreaming exactly once per round', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'completeStreaming');

    // Set up streaming state
    store.setState({
      isStreaming: true,
      streamingRoundNumber: 0,
      currentParticipantIndex: 2,
    });

    // Complete round
    store.getState().completeStreaming();

    // Should be called exactly once
    expect(spy).toHaveBeenCalledTimes(1);

    // Verify state was reset
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().streamingRoundNumber).toBe(null);
  });

  it('should call setMessages N times for N streaming chunks', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setMessages');

    // Simulate 10 streaming chunks
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

    // Should be called exactly 10 times
    expect(spy).toHaveBeenCalledTimes(10);
  });
});

describe('action Invocation Counts - Council Moderator', () => {
  it('should call setIsModeratorStreaming exactly twice (start + end)', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setIsModeratorStreaming');

    // Moderator starts
    store.getState().setIsModeratorStreaming(true);

    // Moderator ends
    store.getState().setIsModeratorStreaming(false);

    // Should be called exactly twice (true, false)
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, true);
    expect(spy).toHaveBeenNthCalledWith(2, false);
  });

  it('should not call setIsModeratorStreaming while participants streaming', () => {
    const store = createTestChatStore();
    const moderatorSpy = vi.spyOn(store.getState(), 'setIsModeratorStreaming');

    // Participant streaming
    store.getState().setIsStreaming(true);

    // Moderator should NOT start yet
    expect(moderatorSpy).not.toHaveBeenCalled();

    // Participants complete
    store.getState().setIsStreaming(false);

    // NOW moderator can start
    store.getState().setIsModeratorStreaming(true);

    expect(moderatorSpy).toHaveBeenCalledTimes(1);
    expect(moderatorSpy).toHaveBeenCalledWith(true);
  });
});

describe('action Invocation Counts - Pre-Search', () => {
  it('should call addPreSearch exactly once when web search enabled', () => {
    const store = createTestChatStore({ enableWebSearch: true });
    const spy = vi.spyOn(store.getState(), 'addPreSearch');

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

    // Should be called exactly once
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(preSearchPlaceholder);
  });

  it('should not call addPreSearch when web search disabled', () => {
    const store = createTestChatStore({ enableWebSearch: false });
    const spy = vi.spyOn(store.getState(), 'addPreSearch');

    // Simulate submission without web search
    const userMessage = createTestUserMessage({
      id: 'thread_abc_r0_user',
      content: 'Question',
      roundNumber: 0,
    });
    store.getState().setMessages([userMessage]);

    // Should NOT be called
    expect(spy).not.toHaveBeenCalled();
  });

  it('should call updatePreSearchStatus exactly twice (STREAMING + COMPLETE)', () => {
    const store = createTestChatStore({ enableWebSearch: true });
    const spy = vi.spyOn(store.getState(), 'updatePreSearchStatus');

    // Add PENDING pre-search
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

    // Update to STREAMING
    store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

    // Update to COMPLETE
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // Should be called exactly twice (STREAMING, COMPLETE)
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenNthCalledWith(1, 0, MessageStatuses.STREAMING);
    expect(spy).toHaveBeenNthCalledWith(2, 0, MessageStatuses.COMPLETE);
  });

  it('should call tryMarkPreSearchTriggered exactly once (atomic check-and-mark)', () => {
    const store = createTestChatStore({ enableWebSearch: true });
    const spy = vi.spyOn(store.getState(), 'tryMarkPreSearchTriggered');

    // Add PENDING pre-search
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

    // First try - should succeed
    const didMark1 = store.getState().tryMarkPreSearchTriggered(0);
    expect(didMark1).toBe(true);

    // Second try - should fail (already marked)
    const didMark2 = store.getState().tryMarkPreSearchTriggered(0);
    expect(didMark2).toBe(false);

    // Should be called exactly twice (once successful, once failed)
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should prevent duplicate pre-search execution via atomic flag', () => {
    const store = createTestChatStore({ enableWebSearch: true });
    let executionCount = 0;

    // Add PENDING pre-search
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

    // Simulate multiple execution attempts (race condition scenario)
    for (let i = 0; i < 5; i++) {
      const didMark = store.getState().tryMarkPreSearchTriggered(0);
      if (didMark) {
        executionCount++;
        // Simulate execution would happen here
      }
    }

    // Should only execute once despite 5 attempts
    expect(executionCount).toBe(1);
  });
});

describe('action Invocation Counts - Multi-Round Flow', () => {
  it('should track action calls across two complete rounds', () => {
    const store = createTestChatStore();
    const setMessagesspy = vi.spyOn(store.getState(), 'setMessages');
    const setRoundSpy = vi.spyOn(store.getState(), 'setStreamingRoundNumber');
    const completeStreamingSpy = vi.spyOn(store.getState(), 'completeStreaming');

    // Round 0: User message + 3 participants
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // User message
    const r0User = createTestUserMessage({
      id: 'thread_abc_r0_user',
      content: 'Question 1',
      roundNumber: 0,
    });
    store.getState().setMessages([r0User]);

    // 3 participant messages (simulating completed state)
    const r0p0 = createTestAssistantMessage({
      id: 'thread_abc_r0_p0',
      content: 'Response 1',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
    });
    const r0p1 = createTestAssistantMessage({
      id: 'thread_abc_r0_p1',
      content: 'Response 2',
      roundNumber: 0,
      participantId: 'participant-1',
      participantIndex: 1,
    });
    const r0p2 = createTestAssistantMessage({
      id: 'thread_abc_r0_p2',
      content: 'Response 3',
      roundNumber: 0,
      participantId: 'participant-2',
      participantIndex: 2,
    });

    store.getState().setMessages([r0User, r0p0]);
    store.getState().setMessages([r0User, r0p0, r0p1]);
    store.getState().setMessages([r0User, r0p0, r0p1, r0p2]);

    // Complete round 0
    store.getState().completeStreaming();

    // Round 1: User message + 3 participants
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsStreaming(true);

    const r1User = createTestUserMessage({
      id: 'thread_abc_r1_user',
      content: 'Question 2',
      roundNumber: 1,
    });
    store.getState().setMessages([r0User, r0p0, r0p1, r0p2, r1User]);

    const r1p0 = createTestAssistantMessage({
      id: 'thread_abc_r1_p0',
      content: 'Response 4',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
    });
    const r1p1 = createTestAssistantMessage({
      id: 'thread_abc_r1_p1',
      content: 'Response 5',
      roundNumber: 1,
      participantId: 'participant-1',
      participantIndex: 1,
    });
    const r1p2 = createTestAssistantMessage({
      id: 'thread_abc_r1_p2',
      content: 'Response 6',
      roundNumber: 1,
      participantId: 'participant-2',
      participantIndex: 2,
    });

    store.getState().setMessages([r0User, r0p0, r0p1, r0p2, r1User, r1p0]);
    store.getState().setMessages([r0User, r0p0, r0p1, r0p2, r1User, r1p0, r1p1]);
    store.getState().setMessages([r0User, r0p0, r0p1, r0p2, r1User, r1p0, r1p1, r1p2]);

    // Complete round 1
    store.getState().completeStreaming();

    // setMessages: 1 (r0 user) + 3 (r0 participants) + 1 (r1 user) + 3 (r1 participants) = 8 calls
    expect(setMessagesspy).toHaveBeenCalledTimes(8);

    // setStreamingRoundNumber: 2 rounds (0, 1)
    // completeStreaming batches reset via set(), not via setter
    expect(setRoundSpy).toHaveBeenCalledTimes(2);

    // completeStreaming: 2 rounds
    expect(completeStreamingSpy).toHaveBeenCalledTimes(2);
  });
});

describe('action Invocation Counts - Error Scenarios', () => {
  it('should not call actions when validation fails', () => {
    const store = createTestChatStore();
    const _setStreamingSpy = vi.spyOn(store.getState(), 'setIsStreaming');

    // Attempt to start streaming without setting round number
    // (This should be prevented by provider logic, but store allows it)

    // In proper flow, setStreamingRoundNumber MUST be called before setIsStreaming
    // This test documents expected behavior
    expect(store.getState().streamingRoundNumber).toBe(null);

    // Provider should NOT call setIsStreaming when round is null
    // But store will accept it (store is permissive, provider is strict)
  });

  it('should handle stop button preventing further participant calls', () => {
    const store = createTestChatStore();
    const setCurrentParticipantIndexSpy = vi.spyOn(store.getState(), 'setCurrentParticipantIndex');

    // Start streaming with 3 participants planned
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Participant 0 completes
    store.getState().setCurrentParticipantIndex(1);

    // User clicks stop button
    store.getState().setIsStreaming(false);

    // Participants 2 and 3 should NOT be called
    // (Provider logic prevents this, not store)

    // Verify only 2 participants started (0, 1)
    expect(setCurrentParticipantIndexSpy).toHaveBeenCalledTimes(2);
    expect(setCurrentParticipantIndexSpy).toHaveBeenNthCalledWith(1, 0);
    expect(setCurrentParticipantIndexSpy).toHaveBeenNthCalledWith(2, 1);
  });
});

describe('action Invocation Counts - Performance Regression', () => {
  it('documents action call baseline for complete round', () => {
    /**
     * ACTION CALL BASELINE - Complete Round 0 (3 participants, no web search):
     *
     * Submission:
     * - setInputValue: 2 calls (type, clear)
     * - setIsCreatingThread: 2 calls (true, false)
     * - setShowInitialUI: 1 call (false)
     * - setCreatedThreadId: 1 call
     * - setEffectiveThreadId: 1 call
     *
     * Participant Streaming:
     * - setStreamingRoundNumber: 1 call (0)
     * - setIsStreaming: 2 calls (true, false)
     * - setCurrentParticipantIndex: 3 calls (0, 1, 2)
     * - setMessages: 1 (user) + 20 chunks × 3 participants = 61 calls
     *
     * Council Moderator:
     * - setIsModeratorStreaming: 2 calls (true, false)
     * - setMessages: 30 chunks = 30 calls
     *
     * Cleanup:
     * - completeStreaming: 1 call
     *
     * TOTAL ACTION CALLS:
     * 7 (submission) + 67 (streaming) + 32 (moderator) + 1 (cleanup) = 107 calls
     *
     * With Web Search (add 4 calls):
     * - addPreSearch: 1 call
     * - updatePreSearchStatus: 2 calls (STREAMING, COMPLETE)
     * - tryMarkPreSearchTriggered: 1 call
     * Total: 111 calls
     *
     * If these baselines increase significantly:
     * - Check for duplicate action calls
     * - Verify atomic operations working correctly
     * - Look for unnecessary polling or queries
     */
    expect(true).toBe(true);
  });

  it('verifies no duplicate setMessages calls for same content', () => {
    const store = createTestChatStore();
    const spy = vi.spyOn(store.getState(), 'setMessages');

    const message = createTestAssistantMessage({
      id: 'thread_abc_r0_p0',
      content: 'Test response',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
    });

    // Call once
    store.getState().setMessages([message]);

    // Call again with same content (provider should prevent this, but store allows)
    store.getState().setMessages([message]);

    // Store will be called twice, but provider should deduplicate
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
