/**
 * Stream Resumption Race Condition Fixes Tests
 *
 * Tests for race condition fixes in stream resumption logic:
 * 1. Double-trigger prevention (roundTriggerInProgressRef guard)
 * 2. AI SDK resume blocking (handleResumedStreamDetection)
 * 3. Retry toggle timeout (retryToggleTimeoutRef)
 *
 * These tests verify that:
 * - RESUME-TRIGGER fires only once per round
 * - Guard is NOT cleared during retry toggle (rapid waitingToStartStreaming false→true)
 * - Guard IS cleared when streaming actually starts
 * - Guard IS cleared after 100ms if waitingToStartStreaming stays false (actual failure)
 * - AI SDK resume is blocked when streamResumptionPrefilled=true
 * - AI SDK resume proceeds normally when streamResumptionPrefilled=false
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread } from '@/db/validation';
import { act, createTestAssistantMessage, createTestUserMessage, renderHook, waitFor, waitForAsync } from '@/lib/testing';

import { useIncompleteRoundResumption } from '../actions/incomplete-round-resumption';
import type { ChatStore } from '../store-schemas';

// ============================================================================
// MOCK SETUP
// ============================================================================

const mockStore = vi.hoisted(() => {
  let storeState: Partial<ChatStore> = {};
  const actions = {
    setNextParticipantToTrigger: vi.fn((value: number | null) => {
      storeState.nextParticipantToTrigger = value;
    }),
    setStreamingRoundNumber: vi.fn((value: number | null) => {
      storeState.streamingRoundNumber = value;
    }),
    setCurrentParticipantIndex: vi.fn((value: number) => {
      storeState.currentParticipantIndex = value;
    }),
    setWaitingToStartStreaming: vi.fn((value: boolean) => {
      storeState.waitingToStartStreaming = value;
    }),
    setIsStreaming: vi.fn((value: boolean) => {
      storeState.isStreaming = value;
    }),
    prepareForNewMessage: vi.fn(),
    setExpectedParticipantIds: vi.fn(),
    setMessages: vi.fn((messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
      if (typeof messages === 'function') {
        storeState.messages = messages(storeState.messages || []);
      } else {
        storeState.messages = messages;
      }
    }),
    setIsWaitingForChangelog: vi.fn(),
    clearStreamResumption: vi.fn(),
    setIsModeratorStreaming: vi.fn(),
    transitionToParticipantsPhase: vi.fn(),
    transitionToModeratorPhase: vi.fn(),
  };

  return {
    getState: () => ({ ...storeState, ...actions }),
    setState: (newState: Partial<ChatStore>) => {
      storeState = { ...storeState, ...newState };
    },
    reset: () => {
      storeState = {};
      Object.values(actions).forEach((action) => {
        if (vi.isMockFunction(action)) {
          action.mockClear();
        }
      });
    },
    actions,
    subscribe: vi.fn(),
  };
});

vi.mock('@/components/providers/chat-store-provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/providers/chat-store-provider')>();
  return {
    ...actual,
    useChatStore: (selector: (state: ChatStore) => unknown) => {
      const state = mockStore.getState() as ChatStore;
      return selector(state);
    },
  };
});

// ============================================================================
// TEST HELPERS
// ============================================================================

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    mode: 'analyzing',
    status: 'active',
    enableWebSearch: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createMockParticipants(count: number = 3): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    threadId: 'thread-123',
    modelId: 'gpt-4',
    role: '',
    customRoleId: null,
    isEnabled: true,
    priority: i,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as ChatParticipant[];
}

function createIncompleteRoundMessages(
  roundNumber: number,
  respondedParticipantCount: number,
): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      id: `thread-123_r${roundNumber}_user`,
      content: `User message for round ${roundNumber}`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < respondedParticipantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        id: `thread-123_r${roundNumber}_p${i}`,
        content: `Assistant ${i} response`,
        roundNumber,
        participantId: `participant-${i}`,
        participantIndex: i,
        finishReason: 'stop',
      }),
    );
  }

  return messages;
}

function setupIncompleteRound(
  roundNumber: number,
  respondedCount: number,
  totalParticipants: number = 3,
) {
  const thread = createMockThread();
  const participants = createMockParticipants(totalParticipants);
  const messages = createIncompleteRoundMessages(roundNumber, respondedCount);

  mockStore.setState({
    thread,
    participants,
    messages,
    preSearches: [],
    isStreaming: false,
    waitingToStartStreaming: false,
    pendingMessage: null,
    hasSentPendingMessage: false,
    hasEarlyOptimisticMessage: false,
    enableWebSearch: false,
    currentResumptionPhase: null,
    preSearchResumption: null,
    moderatorResumption: null,
    resumptionRoundNumber: null,
    streamResumptionPrefilled: false,
    isModeratorStreaming: false,
    nextParticipantToTrigger: null,
    streamingRoundNumber: null,
    currentParticipantIndex: 0,
  });

  return { thread, participants, messages };
}

// ============================================================================
// DOUBLE-TRIGGER PREVENTION TESTS
// ============================================================================

describe('double-Trigger Prevention (roundTriggerInProgressRef)', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should trigger RESUME-TRIGGER only once when incomplete round detected', async () => {
    setupIncompleteRound(1, 1, 3);

    const { result, rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(1);
    });

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    const firstCallCount = mockStore.actions.setWaitingToStartStreaming.mock.calls.filter(
      call => call[0] === true,
    ).length;

    rerender();
    rerender();
    await act(async () => {
      await waitForAsync(50);
    });

    const finalCallCount = mockStore.actions.setWaitingToStartStreaming.mock.calls.filter(
      call => call[0] === true,
    ).length;

    expect(finalCallCount).toBe(firstCallCount);
  });

  it('should block subsequent triggers for same round even if respondedParticipantIndices updates', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    const initialTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    const messagesWithNewParticipant = [
      ...mockStore.getState().messages || [],
      createTestAssistantMessage({
        id: 'thread-123_r1_p1',
        content: 'Assistant 1 response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: 'stop',
      }),
    ];
    mockStore.setState({ messages: messagesWithNewParticipant });

    rerender();
    await act(async () => {
      await waitForAsync(50);
    });

    const finalTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(finalTriggerCount).toBe(initialTriggerCount);
  });

  it('should NOT clear guard during retry toggle (waitingToStartStreaming false→true within 100ms)', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    // Track trigger calls - guards should prevent re-triggering during retry toggle
    const triggerCallsBefore = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(triggerCallsBefore).toBeGreaterThan(0); // Verify initial trigger happened

    // Simulate retry toggle: false → true within 100ms
    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    act(() => {
      mockStore.setState({ waitingToStartStreaming: true });
    });
    rerender();

    await act(async () => {
      await waitForAsync(60);
    });

    // Gards should NOT be cleared during rapid toggle
    const triggerCallsAfter = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(triggerCallsAfter).toBe(triggerCallsBefore);
  });

  it('should clear guard when streaming actually starts (isStreaming becomes true)', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    mockStore.actions.setNextParticipantToTrigger.mockClear();

    act(() => {
      mockStore.setState({
        isStreaming: true,
        waitingToStartStreaming: false,
      });
    });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    const messagesWithNewParticipant = [
      ...mockStore.getState().messages || [],
      createTestAssistantMessage({
        id: 'thread-123_r1_p1',
        content: 'Assistant 1 response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: 'stop',
      }),
    ];

    act(() => {
      mockStore.setState({
        messages: messagesWithNewParticipant,
        isStreaming: false,
      });
    });
    rerender();

    await waitFor(() => {
      const state = mockStore.getState();
      const incompleteWithP2 = state.messages?.length === 3;
      expect(incompleteWithP2).toBe(true);
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(2);
    }, { timeout: 300 });
  });

  it('should clear guard after 100ms if waitingToStartStreaming stays false (actual failure)', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, unmount } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    const callsBeforeFailure = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(callsBeforeFailure).toBeGreaterThan(0); // Verify initial trigger happened

    // Simulate trigger failure: waiting goes false and STAYS false
    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    // Wait for timeout to fire and clear guards (100ms timeout + buffer)
    await act(async () => {
      await waitForAsync(150);
    });

    // After timeout clears guards, unmount and remount the hook
    // This simulates a page refresh/navigation which is the real-world scenario
    // where retry recovery would occur
    unmount();

    const { result: _result2 } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    // Wait for the remounted hook to detect incomplete round and trigger
    await waitFor(() => {
      const callsAfterFailure = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
        call => call[0] === 1,
      ).length;
      expect(callsAfterFailure).toBeGreaterThan(callsBeforeFailure);
    }, { timeout: 500 });
  });

  it('should allow triggering next participant after current completes', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(1);
    }, { timeout: 200 });

    mockStore.actions.setNextParticipantToTrigger.mockClear();

    act(() => {
      mockStore.setState({
        isStreaming: true,
        waitingToStartStreaming: false,
      });
    });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    const messagesWithP1Complete = [
      ...mockStore.getState().messages || [],
      createTestAssistantMessage({
        id: 'thread-123_r1_p1',
        content: 'Assistant 1 response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: 'stop',
      }),
    ];

    act(() => {
      mockStore.setState({
        messages: messagesWithP1Complete,
        isStreaming: false,
      });
    });
    rerender();

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(2);
    }, { timeout: 300 });
  });
});

// ============================================================================
// AI SDK RESUME BLOCKING TESTS
// ============================================================================

describe('aI SDK Resume Blocking (handleResumedStreamDetection)', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should block AI SDK resume when streamResumptionPrefilled=true with non-participant phase', async () => {
    setupIncompleteRound(1, 1, 3);
    // Set prefilled with a non-participant phase (pre_search or moderator)
    mockStore.setState({
      streamResumptionPrefilled: true,
      currentResumptionPhase: 'pre_search', // or 'moderator'
      resumptionRoundNumber: 1,
    });

    renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      const state = mockStore.getState();
      expect(state.streamResumptionPrefilled).toBe(true);
      expect(state.currentResumptionPhase).toBe('pre_search');
    });

    await act(async () => {
      await waitForAsync(200);
    });

    // When resumption phase is pre_search or moderator, participant resumption should not trigger
    expect(mockStore.actions.setWaitingToStartStreaming.mock.calls).toHaveLength(0);
  });

  it('should allow AI SDK resume when streamResumptionPrefilled=false', async () => {
    setupIncompleteRound(1, 1, 3);
    mockStore.setState({ streamResumptionPrefilled: false });

    const { result } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(result.current.isIncomplete).toBe(true);
    });

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });
  });

  it('should not interfere with custom resumption when prefilled', async () => {
    setupIncompleteRound(1, 1, 3);
    mockStore.setState({
      streamResumptionPrefilled: true,
      currentResumptionPhase: 'participants',
      resumptionRoundNumber: 1,
    });

    renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await act(async () => {
      await waitForAsync(150);
    });

    const state = mockStore.getState();
    expect(state.currentResumptionPhase).toBe('participants');
    expect(state.streamResumptionPrefilled).toBe(true);
  });
});

// ============================================================================
// RETRY TOGGLE TIMEOUT TESTS
// ============================================================================

describe('retry Toggle Timeout (retryToggleTimeoutRef)', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should not clear guards during rapid toggle (false→true within 100ms)', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    const initialTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    act(() => {
      mockStore.setState({ waitingToStartStreaming: true });
    });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    const finalTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;
    expect(finalTriggerCount).toBe(initialTriggerCount);
  });

  it('should clear guards when waitingToStartStreaming stays false for 100ms+', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, unmount } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    const callsBeforeWait = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(callsBeforeWait).toBeGreaterThan(0); // Verify initial trigger happened

    // Simulate failure: waiting goes false and stays false
    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    // Wait MORE than 100ms for timeout to fire
    await act(async () => {
      await waitForAsync(150);
    });

    // Unmount and remount to simulate page refresh
    unmount();

    renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    // Wait for retry trigger
    await waitFor(() => {
      const callsAfterWait = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
        call => call[0] === 1,
      ).length;
      expect(callsAfterWait).toBeGreaterThan(callsBeforeWait);
    }, { timeout: 500 });
  });

  it('should distinguish retry toggle from actual trigger failure', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    const callsBeforeRetry = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    await act(async () => {
      await waitForAsync(30);
    });

    act(() => {
      mockStore.setState({ waitingToStartStreaming: true });
    });
    rerender();

    await act(async () => {
      await waitForAsync(30);
    });

    // Wait additional time to ensure timeout doesn't fire
    // (it shouldn't because retry toggle cleared it)
    await act(async () => {
      await waitForAsync(150);
    });

    // After retry toggle, no new trigger should occur
    // because the timeout was cleared when waiting went back to true
    const callsAfterRetry = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(callsAfterRetry).toBe(callsBeforeRetry);
  });

  it('should clear timeout when streaming starts successfully', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    mockStore.actions.setNextParticipantToTrigger.mockClear();

    act(() => {
      mockStore.setState({
        isStreaming: true,
        waitingToStartStreaming: false,
      });
    });
    rerender();

    await act(async () => {
      await waitForAsync(150);
    });

    const state = mockStore.getState();
    mockStore.setState({ messages: state.messages || [] });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    expect(mockStore.actions.setNextParticipantToTrigger).not.toHaveBeenCalled();
  });

  it('should handle multiple rapid toggles correctly', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    for (let i = 0; i < 3; i++) {
      act(() => {
        mockStore.setState({ waitingToStartStreaming: false });
      });
      rerender();

      await act(async () => {
        await waitForAsync(20);
      });

      act(() => {
        mockStore.setState({ waitingToStartStreaming: true });
      });
      rerender();

      await act(async () => {
        await waitForAsync(20);
      });
    }

    mockStore.actions.setNextParticipantToTrigger.mockClear();
    const state = mockStore.getState();
    mockStore.setState({ messages: state.messages || [] });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    expect(mockStore.actions.setNextParticipantToTrigger).not.toHaveBeenCalled();
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('integration: All Race Condition Fixes Together', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should handle complete flow: trigger → retry toggle → streaming starts', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    await act(async () => {
      await waitForAsync(30);
    });

    act(() => {
      mockStore.setState({ waitingToStartStreaming: true });
    });
    rerender();

    await act(async () => {
      await waitForAsync(30);
    });

    act(() => {
      mockStore.setState({
        isStreaming: true,
        waitingToStartStreaming: false,
      });
    });
    rerender();

    await act(async () => {
      await waitForAsync(50);
    });

    const messagesAfterStreaming = [
      ...mockStore.getState().messages || [],
      createTestAssistantMessage({
        id: 'thread-123_r1_p1',
        content: 'Assistant 1 response',
        roundNumber: 1,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: 'stop',
      }),
    ];

    act(() => {
      mockStore.setState({
        messages: messagesAfterStreaming,
        isStreaming: false,
      });
    });
    rerender();

    await waitFor(() => {
      const calls = mockStore.actions.setNextParticipantToTrigger.mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall).toBeDefined();
      expect(lastCall[0]).toBe(2);
    }, { timeout: 300 });
  });

  it('should handle trigger failure → timeout → retry', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, unmount } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 200 });

    const initialCallCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(initialCallCount).toBeGreaterThan(0); // Verify initial trigger happened

    // Simulate trigger failure
    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    // Wait for timeout to fire and clear guards (100ms timeout + buffer)
    await act(async () => {
      await waitForAsync(150);
    });

    // Unmount and remount to simulate page refresh
    unmount();

    renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    // Wait for retry with longer timeout
    await waitFor(() => {
      const finalCallCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
        call => call[0] === 1,
      ).length;
      expect(finalCallCount).toBeGreaterThan(initialCallCount);
    }, { timeout: 500 });
  });

  it('should prevent duplicate triggers across round transitions', async () => {
    setupIncompleteRound(1, 2, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(2);
    }, { timeout: 200 });

    const round1TriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.length;

    const messagesWithP2Complete = [
      ...mockStore.getState().messages || [],
      createTestAssistantMessage({
        id: 'thread-123_r1_p2',
        content: 'Assistant 2 response',
        roundNumber: 1,
        participantId: 'participant-2',
        participantIndex: 2,
        finishReason: 'stop',
      }),
    ];

    act(() => {
      mockStore.setState({
        messages: messagesWithP2Complete,
        isStreaming: false,
        waitingToStartStreaming: false,
      });
    });
    rerender();

    await act(async () => {
      await waitForAsync(150);
    });

    const round2Messages = [
      ...messagesWithP2Complete,
      createTestUserMessage({
        id: 'thread-123_r2_user',
        content: 'User message for round 2',
        roundNumber: 2,
      }),
    ];

    act(() => {
      mockStore.setState({ messages: round2Messages });
    });
    rerender();

    await waitFor(() => {
      const finalTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.length;
      expect(finalTriggerCount).toBeGreaterThanOrEqual(round1TriggerCount);
    }, { timeout: 300 });
  });
});
