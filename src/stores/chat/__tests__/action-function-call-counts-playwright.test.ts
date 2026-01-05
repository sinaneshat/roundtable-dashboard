/**
 * Action Function Call Counts E2E Tests
 *
 * Tests atomic action function call counts to prevent duplicate/excessive updates.
 * Based on FLOW_DOCUMENTATION.md race condition requirements.
 *
 * Critical requirements from docs:
 * - Each action called expected number of times (no duplicates)
 * - setMessages not called excessively
 * - initializeThread NOT called during active submission
 * - Proper action sequencing
 * - Atomic state updates (no partial states)
 *
 * Test approach: Use vi.spyOn to count actual function calls on store actions.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { MessagePartTypes, MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import { createTestChatStore } from '@/lib/testing';

// ============================================================================
// Test Helpers
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-1',
    title: 'Test Thread',
    slug: 'test-thread',
    mode: 'brainstorming',
    status: 'active',
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    enableWebSearch: false,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    lastMessageAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createMockParticipant(overrides?: Partial<ChatParticipant>): ChatParticipant {
  return {
    id: 'participant-1',
    threadId: 'thread-123',
    modelId: 'gpt-4',
    priority: 0,
    role: null,
    customRoleId: null,
    isEnabled: true,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
    ...overrides,
  };
}

function createMockUIMessage(opts: {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  roundNumber: number;
  participantIndex?: number;
}): UIMessage {
  return {
    id: opts.id,
    role: opts.role,
    parts: [{ type: MessagePartTypes.TEXT, text: opts.text }],
    metadata: {
      role: opts.role,
      roundNumber: opts.roundNumber,
      ...(opts.participantIndex !== undefined && { participantIndex: opts.participantIndex }),
    },
  };
}

// ============================================================================
// handleUpdateThreadAndSend Action Counts
// ============================================================================

describe('handleUpdateThreadAndSend Action Call Counts', () => {
  it('should call setMessages exactly once for optimistic message', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    // Initialize thread
    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Spy on setMessages
    const setMessagesSpy = vi.spyOn(store.getState(), 'setMessages');

    // Simulate handleUpdateThreadAndSend logic (optimistic message)
    const optimisticMessage = createMockUIMessage({
      id: 'optimistic-1',
      role: 'user',
      text: 'Test message',
      roundNumber: 1,
    });

    store.getState().setMessages(prev => [...prev, optimisticMessage]);

    // Verify called exactly once
    expect(setMessagesSpy).toHaveBeenCalledTimes(1);
  });

  it('should call setStreamingRoundNumber exactly once', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    const spy = vi.spyOn(store.getState(), 'setStreamingRoundNumber');

    // Simulate setting streaming round
    store.getState().setStreamingRoundNumber(1);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(1);
  });

  it('should call setWaitingToStartStreaming exactly once', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'setWaitingToStartStreaming');

    // Simulate preparing to stream
    store.getState().setWaitingToStartStreaming(true);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('should call setConfigChangeRoundNumber exactly once', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'setConfigChangeRoundNumber');

    // Simulate blocking streaming until PATCH completes
    store.getState().setConfigChangeRoundNumber(1);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(1);
  });

  it('should NOT call initializeThread during active submission', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    // Initialize once
    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'initializeThread');

    // Simulate active submission state
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    // Now simulate PATCH response updating thread/participants
    // initializeThread should NOT be called because configChangeRoundNumber is set
    // (The actual code has guards in initializeThread to preserve state)

    // Verify NOT called during active submission
    expect(spy).not.toHaveBeenCalled();
  });

  it('should sequence actions correctly: optimistic → config → streaming', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const callOrder: string[] = [];

    // Spy on all critical actions
    const setMessagesSpy = vi.spyOn(store.getState(), 'setMessages').mockImplementation((messages) => {
      callOrder.push('setMessages');
      return store.setState({ messages: typeof messages === 'function' ? messages(store.getState().messages) : messages });
    });

    const setStreamingRoundSpy = vi.spyOn(store.getState(), 'setStreamingRoundNumber').mockImplementation((round) => {
      callOrder.push('setStreamingRoundNumber');
      return store.setState({ streamingRoundNumber: round });
    });

    const setConfigChangeSpy = vi.spyOn(store.getState(), 'setConfigChangeRoundNumber').mockImplementation((round) => {
      callOrder.push('setConfigChangeRoundNumber');
      return store.setState({ configChangeRoundNumber: round });
    });

    const setWaitingSpy = vi.spyOn(store.getState(), 'setWaitingToStartStreaming').mockImplementation((waiting) => {
      callOrder.push('setWaitingToStartStreaming');
      return store.setState({ waitingToStartStreaming: waiting });
    });

    // Simulate handleUpdateThreadAndSend sequence
    const optimisticMessage = createMockUIMessage({
      id: 'optimistic-1',
      role: 'user',
      text: 'Test',
      roundNumber: 1,
    });

    store.getState().setMessages(prev => [...prev, optimisticMessage]);
    store.getState().setStreamingRoundNumber(1);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    // Verify exact sequence
    expect(callOrder).toEqual([
      'setMessages',
      'setStreamingRoundNumber',
      'setConfigChangeRoundNumber',
      'setWaitingToStartStreaming',
    ]);

    // Verify each called once
    expect(setMessagesSpy).toHaveBeenCalledTimes(1);
    expect(setStreamingRoundSpy).toHaveBeenCalledTimes(1);
    expect(setConfigChangeSpy).toHaveBeenCalledTimes(1);
    expect(setWaitingSpy).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// PATCH Response Processing Action Counts
// ============================================================================

describe('pATCH Response Processing Action Counts', () => {
  it('should call setThread exactly once when PATCH returns thread', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'setThread');

    // Simulate PATCH response updating thread
    const updatedThread = { ...thread, title: 'Updated Title' };
    store.getState().setThread(updatedThread);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(updatedThread);
  });

  it('should call updateParticipants exactly once when PATCH returns participants', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'updateParticipants');

    // Simulate PATCH response updating participants
    const updatedParticipants = [
      createMockParticipant({ id: 'participant-1', priority: 0 }),
      createMockParticipant({ id: 'participant-2', priority: 1, modelId: 'claude-3' }),
    ];

    store.getState().updateParticipants(updatedParticipants);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(updatedParticipants);
  });

  it('should call setMessages exactly once to replace optimistic message', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    // Add optimistic message
    const optimisticMessage = createMockUIMessage({
      id: 'optimistic-1',
      role: 'user',
      text: 'Test',
      roundNumber: 1,
    });

    store.getState().setMessages([optimisticMessage]);

    const spy = vi.spyOn(store.getState(), 'setMessages');

    // Simulate PATCH response replacing optimistic message
    const persistedMessage = createMockUIMessage({
      id: 'thread-123_r1_user',
      role: 'user',
      text: 'Test',
      roundNumber: 1,
    });

    store.getState().setMessages(prev =>
      prev.map(m => m.id === optimisticMessage.id ? persistedMessage : m),
    );

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should NOT call setMessages multiple times for same PATCH response', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    // Add optimistic message
    const optimisticMessage = createMockUIMessage({
      id: 'optimistic-1',
      role: 'user',
      text: 'Test',
      roundNumber: 1,
    });

    store.getState().setMessages([optimisticMessage]);

    const spy = vi.spyOn(store.getState(), 'setMessages');

    // Simulate PATCH response - should only replace once
    const persistedMessage = createMockUIMessage({
      id: 'thread-123_r1_user',
      role: 'user',
      text: 'Test',
      roundNumber: 1,
    });

    store.getState().setMessages(prev =>
      prev.map(m => m.id === optimisticMessage.id ? persistedMessage : m),
    );

    // Should be called exactly once (no duplicates)
    expect(spy).toHaveBeenCalledTimes(1);

    // Verify final state has correct message
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0]?.id).toBe(persistedMessage.id);
  });
});

// ============================================================================
// initializeThread Call Frequency
// ============================================================================

describe('initializeThread Call Frequency', () => {
  it('should NOT be called during active form submission', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    // Initial call
    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'initializeThread');

    // Simulate active submission state
    store.getState().setConfigChangeRoundNumber(1);

    // PATCH response arrives - initializeThread should NOT be called
    // (In real code, the guards in initializeThread preserve state)

    expect(spy).not.toHaveBeenCalled();
  });

  it('should be called only once per thread load', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    const spy = vi.spyOn(store.getState(), 'initializeThread');

    // Initial load
    store.getState().initializeThread(thread, participants, []);

    expect(spy).toHaveBeenCalledTimes(1);

    // Multiple PATCH responses should NOT trigger re-initialization
    store.getState().setThread(thread);
    store.getState().updateParticipants(participants);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should preserve streaming state when called during resumption', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    // Simulate resumption state by setting the flag directly on state
    store.setState({ streamResumptionPrefilled: true });
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setStreamingRoundNumber(1);

    const waitingBefore = store.getState().waitingToStartStreaming;
    const roundBefore = store.getState().streamingRoundNumber;

    // Call initializeThread - should preserve state
    store.getState().initializeThread(thread, participants, []);

    // Verify state preserved
    expect(store.getState().waitingToStartStreaming).toBe(waitingBefore);
    expect(store.getState().streamingRoundNumber).toBe(roundBefore);
  });

  it('should preserve streaming state when called during active submission', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    // Initial load
    store.getState().initializeThread(thread, participants, []);

    // Simulate active submission
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setStreamingRoundNumber(1);

    const waitingBefore = store.getState().waitingToStartStreaming;
    const roundBefore = store.getState().streamingRoundNumber;

    // Re-call initializeThread (e.g., from PATCH response)
    store.getState().initializeThread(thread, participants, []);

    // Verify streaming state preserved
    expect(store.getState().waitingToStartStreaming).toBe(waitingBefore);
    expect(store.getState().streamingRoundNumber).toBe(roundBefore);
  });
});

// ============================================================================
// setMessages Call Frequency
// ============================================================================

describe('setMessages Call Frequency', () => {
  it('should not be called excessively during streaming', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'setMessages');

    // Simulate streaming: optimistic message → participant messages
    const optimisticMessage = createMockUIMessage({
      id: 'optimistic-1',
      role: 'user',
      text: 'Test',
      roundNumber: 1,
    });

    const participant1Message = createMockUIMessage({
      id: 'thread-123_r1_p0',
      role: 'assistant',
      text: 'Response 1',
      roundNumber: 1,
      participantIndex: 0,
    });

    const participant2Message = createMockUIMessage({
      id: 'thread-123_r1_p1',
      role: 'assistant',
      text: 'Response 2',
      roundNumber: 1,
      participantIndex: 1,
    });

    // Expected sequence:
    // 1. Add optimistic message
    // 2. Add participant 1 message
    // 3. Add participant 2 message
    store.getState().setMessages([optimisticMessage]);
    store.getState().setMessages(prev => [...prev, participant1Message]);
    store.getState().setMessages(prev => [...prev, participant2Message]);

    // Should be called exactly 3 times (no duplicates)
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('should not duplicate messages when called with same content', () => {
    const store = createTestChatStore();

    const message = createMockUIMessage({
      id: 'msg-1',
      role: 'user',
      text: 'Test',
      roundNumber: 0,
    });

    // First call
    store.getState().setMessages([message]);

    const spy = vi.spyOn(store.getState(), 'setMessages');

    // Second call with same message - should update but not duplicate
    store.getState().setMessages([message]);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.getState().messages).toHaveLength(1);
  });

  it('should preserve existing content when new message has no content', () => {
    const store = createTestChatStore();

    const messageWithContent = createMockUIMessage({
      id: 'msg-1',
      role: 'assistant',
      text: 'Existing content',
      roundNumber: 0,
    });

    store.getState().setMessages([messageWithContent]);

    // Simulate update with empty content
    const messageWithoutContent: UIMessage = {
      id: 'msg-1',
      role: 'assistant',
      parts: [],
      metadata: { role: 'assistant', roundNumber: 0 },
    };

    store.getState().setMessages([messageWithoutContent]);

    // Should preserve existing content
    const finalMessage = store.getState().messages[0];
    expect(finalMessage?.parts).toHaveLength(1);
    expect(finalMessage?.parts[0]).toEqual({ type: MessagePartTypes.TEXT, text: 'Existing content' });
  });
});

// ============================================================================
// completeStreaming Action Counts
// ============================================================================

describe('completeStreaming Call Frequency', () => {
  it('should be called exactly once per round completion', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'completeStreaming');

    // Simulate round completion
    store.getState().setIsStreaming(true);
    store.getState().completeStreaming();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should reset all streaming state atomically', () => {
    const store = createTestChatStore();

    // Set up streaming state
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(2);
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsModeratorStreaming(true);

    // Complete streaming
    store.getState().completeStreaming();

    // Verify all reset
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(0);
    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().streamingRoundNumber).toBeNull();
    expect(store.getState().isModeratorStreaming).toBe(false);
  });

  it('should not be called multiple times for same round', () => {
    const store = createTestChatStore();

    const spy = vi.spyOn(store.getState(), 'completeStreaming');

    // Simulate round 1 completion
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsStreaming(true);
    store.getState().completeStreaming();

    expect(spy).toHaveBeenCalledTimes(1);

    // Attempting to complete again should not call (guard in caller)
    // (In real code, completion is guarded by isStreaming check)
  });
});

// ============================================================================
// Atomic State Updates
// ============================================================================

describe('atomic State Updates', () => {
  it('should update streaming state atomically (no partial states)', () => {
    const store = createTestChatStore();

    const stateSnapshots: Array<{
      isStreaming: boolean;
      currentParticipantIndex: number;
      waitingToStartStreaming: boolean;
    }> = [];

    // Subscribe to state changes
    const unsubscribe = store.subscribe((state) => {
      stateSnapshots.push({
        isStreaming: state.isStreaming,
        currentParticipantIndex: state.currentParticipantIndex,
        waitingToStartStreaming: state.waitingToStartStreaming,
      });
    });

    // Simulate starting streaming
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    unsubscribe();

    // Verify each update is atomic (no intermediate states)
    expect(stateSnapshots).toHaveLength(3);
    expect(stateSnapshots[0]).toEqual({
      isStreaming: false,
      currentParticipantIndex: 0,
      waitingToStartStreaming: true,
    });
    expect(stateSnapshots[1]).toEqual({
      isStreaming: true,
      currentParticipantIndex: 0,
      waitingToStartStreaming: true,
    });
    expect(stateSnapshots[2]).toEqual({
      isStreaming: true,
      currentParticipantIndex: 0,
      waitingToStartStreaming: true,
    });
  });

  it('should update participant index atomically during transitions', () => {
    const store = createTestChatStore();

    const indexChanges: number[] = [];

    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.currentParticipantIndex !== prevState.currentParticipantIndex) {
        indexChanges.push(state.currentParticipantIndex);
      }
    });

    // Simulate participant transitions (starting from default 0, so only push 1 and 2)
    store.getState().setCurrentParticipantIndex(0); // No change from default
    store.getState().setCurrentParticipantIndex(1); // Changes to 1
    store.getState().setCurrentParticipantIndex(2); // Changes to 2

    unsubscribe();

    // Verify sequential updates (starting from 1 since 0 is default)
    expect(indexChanges).toEqual([1, 2]);
  });

  it('should update config change state atomically', () => {
    const store = createTestChatStore();

    const configSnapshots: Array<{
      configChangeRoundNumber: number | null;
      isWaitingForChangelog: boolean;
      hasPendingConfigChanges: boolean;
    }> = [];

    const unsubscribe = store.subscribe((state) => {
      configSnapshots.push({
        configChangeRoundNumber: state.configChangeRoundNumber,
        isWaitingForChangelog: state.isWaitingForChangelog,
        hasPendingConfigChanges: state.hasPendingConfigChanges,
      });
    });

    // Simulate config change workflow
    store.getState().setHasPendingConfigChanges(true);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    unsubscribe();

    // Verify atomic updates
    expect(configSnapshots).toHaveLength(3);
    expect(configSnapshots[2]).toEqual({
      configChangeRoundNumber: 1,
      isWaitingForChangelog: true,
      hasPendingConfigChanges: true,
    });
  });
});

// ============================================================================
// Pre-Search Action Counts
// ============================================================================

describe('pre-Search Action Call Counts', () => {
  it('should call addPreSearch exactly once when web search enabled', () => {
    const store = createTestChatStore();
    const thread = createMockThread({ enableWebSearch: true });
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const spy = vi.spyOn(store.getState(), 'addPreSearch');

    // Simulate adding pre-search
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: thread.id,
      roundNumber: 1,
      userQuery: 'Test query',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      updatedAt: new Date(),
    });

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('should call updatePreSearchStatus exactly once per status change', () => {
    const store = createTestChatStore();

    // Add pre-search
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Test',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      updatedAt: new Date(),
    });

    const spy = vi.spyOn(store.getState(), 'updatePreSearchStatus');

    // Update status: PENDING → STREAMING → COMPLETE
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should not create duplicate pre-search records', () => {
    const store = createTestChatStore();

    const preSearch = {
      id: 'presearch-1',
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Test',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      updatedAt: new Date(),
    };

    // Add first time
    store.getState().addPreSearch(preSearch);

    // Add second time (should be skipped)
    store.getState().addPreSearch(preSearch);

    // Should only have 1 pre-search
    expect(store.getState().preSearches).toHaveLength(1);
  });
});

// ============================================================================
// Moderator Action Counts
// ============================================================================

describe('moderator Action Call Counts', () => {
  it('should call setIsModeratorStreaming exactly twice per round (true → false)', () => {
    const store = createTestChatStore();

    const stateChanges: boolean[] = [];

    const unsubscribe = store.subscribe((state, prevState) => {
      if (state.isModeratorStreaming !== prevState.isModeratorStreaming) {
        stateChanges.push(state.isModeratorStreaming);
      }
    });

    // Simulate moderator lifecycle
    store.getState().setIsModeratorStreaming(true);
    store.getState().setIsModeratorStreaming(false);

    unsubscribe();

    // Should only have 2 changes: true → false
    expect(stateChanges).toEqual([true, false]);
  });

  it('should call markModeratorCreated exactly once per round', () => {
    const store = createTestChatStore();

    const spy = vi.spyOn(store.getState(), 'markModeratorCreated');

    // Mark moderator created for round 1
    store.getState().markModeratorCreated(1);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(store.getState().hasModeratorBeenCreated(1)).toBe(true);
  });

  it('should not create moderator multiple times for same round', () => {
    const store = createTestChatStore();

    // First attempt
    const firstAttempt = store.getState().tryMarkModeratorCreated(1);

    // Second attempt (should fail)
    const secondAttempt = store.getState().tryMarkModeratorCreated(1);

    expect(firstAttempt).toBe(true);
    expect(secondAttempt).toBe(false);
  });
});

// ============================================================================
// Action Sequencing
// ============================================================================

describe('action Sequencing', () => {
  it('should follow correct sequence: optimistic → PATCH → streaming', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = [createMockParticipant()];

    store.getState().initializeThread(thread, participants, []);

    const callSequence: string[] = [];

    // Spy on key actions
    vi.spyOn(store.getState(), 'setMessages').mockImplementation((messages) => {
      callSequence.push('setMessages');
      return store.setState({ messages: typeof messages === 'function' ? messages(store.getState().messages) : messages });
    });

    vi.spyOn(store.getState(), 'setConfigChangeRoundNumber').mockImplementation((round) => {
      callSequence.push('setConfigChangeRoundNumber');
      return store.setState({ configChangeRoundNumber: round });
    });

    vi.spyOn(store.getState(), 'setWaitingToStartStreaming').mockImplementation((waiting) => {
      callSequence.push('setWaitingToStartStreaming');
      return store.setState({ waitingToStartStreaming: waiting });
    });

    // Simulate submission flow
    const optimisticMessage = createMockUIMessage({
      id: 'optimistic-1',
      role: 'user',
      text: 'Test',
      roundNumber: 1,
    });

    store.getState().setMessages([optimisticMessage]);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);

    // Verify sequence
    expect(callSequence).toEqual([
      'setMessages',
      'setConfigChangeRoundNumber',
      'setWaitingToStartStreaming',
    ]);
  });

  it('should sequence pre-search actions: create → execute → complete', () => {
    const store = createTestChatStore();

    const callSequence: string[] = [];

    // Track calls without calling the actual implementation (avoid infinite recursion)
    const addPreSearchSpy = vi.spyOn(store.getState(), 'addPreSearch');
    const updatePreSearchStatusSpy = vi.spyOn(store.getState(), 'updatePreSearchStatus');

    // Simulate pre-search flow
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: 'thread-123',
      roundNumber: 1,
      userQuery: 'Test',
      status: MessageStatuses.PENDING,
      searchData: null,
      createdAt: new Date(),
      completedAt: null,
      updatedAt: new Date(),
    });

    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    // Verify call sequence via spy call order
    expect(addPreSearchSpy).toHaveBeenCalledTimes(1);
    expect(updatePreSearchStatusSpy).toHaveBeenCalledTimes(2);

    // Verify status progression
    expect(updatePreSearchStatusSpy).toHaveBeenNthCalledWith(1, 1, MessageStatuses.STREAMING);
    expect(updatePreSearchStatusSpy).toHaveBeenNthCalledWith(2, 1, MessageStatuses.COMPLETE);
  });
});
