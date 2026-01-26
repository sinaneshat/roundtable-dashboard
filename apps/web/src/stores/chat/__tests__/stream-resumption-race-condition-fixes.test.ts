import { ChatModes, ThreadStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, createTestAssistantMessage, createTestUserMessage, renderHook, waitFor, waitForAsync } from '@/lib/testing';
import type { ChatParticipant, ChatThread } from '@/services/api';

import { useIncompleteRoundResumption } from '../actions/incomplete-round-resumption';
import type { ChatStore } from '../store-schemas';

const mockStore = vi.hoisted(() => {
  let storeState: Partial<ChatStore> = {};
  const actions = {
    clearStreamResumption: vi.fn(),
    prepareForNewMessage: vi.fn(),
    setCurrentParticipantIndex: vi.fn((value: number) => {
      storeState.currentParticipantIndex = value;
    }),
    setExpectedParticipantIds: vi.fn(),
    setIsModeratorStreaming: vi.fn(),
    setIsStreaming: vi.fn((value: boolean) => {
      storeState.isStreaming = value;
    }),
    setIsWaitingForChangelog: vi.fn(),
    setMessages: vi.fn((messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
      if (typeof messages === 'function') {
        storeState.messages = messages(storeState.messages || []);
      } else {
        storeState.messages = messages;
      }
    }),
    setNextParticipantToTrigger: vi.fn((value: number | null) => {
      storeState.nextParticipantToTrigger = value;
    }),
    setStreamingRoundNumber: vi.fn((value: number | null) => {
      storeState.streamingRoundNumber = value;
    }),
    setWaitingToStartStreaming: vi.fn((value: boolean) => {
      storeState.waitingToStartStreaming = value;
    }),
    transitionToModeratorPhase: vi.fn(),
    transitionToParticipantsPhase: vi.fn(),
  };

  return {
    actions,
    getState: () => ({ ...storeState, ...actions }),
    reset: () => {
      storeState = {};
      Object.values(actions).forEach((action) => {
        if (vi.isMockFunction(action)) {
          action.mockClear();
        }
      });
    },
    setState: (newState: Partial<ChatStore>) => {
      storeState = { ...storeState, ...newState };
    },
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

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: 'thread-123',
    mode: ChatModes.ANALYZING,
    status: ThreadStatuses.ACTIVE,
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-123',
    ...overrides,
  } as ChatThread;
}

function createMockParticipants(count = 3): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date(),
    customRoleId: null,
    id: `participant-${i}`,
    isEnabled: true,
    modelId: 'gpt-4',
    priority: i,
    role: '',
    settings: null,
    threadId: 'thread-123',
    updatedAt: new Date(),
  })) as ChatParticipant[];
}

function createIncompleteRoundMessages(
  roundNumber: number,
  respondedParticipantCount: number,
): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      content: `User message for round ${roundNumber}`,
      id: `thread-123_r${roundNumber}_user`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < respondedParticipantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        content: `Assistant ${i} response`,
        finishReason: 'stop',
        id: `thread-123_r${roundNumber}_p${i}`,
        participantId: `participant-${i}`,
        participantIndex: i,
        roundNumber,
      }),
    );
  }

  return messages;
}

function setupIncompleteRound(
  roundNumber: number,
  respondedCount: number,
  totalParticipants = 3,
) {
  const thread = createMockThread();
  const participants = createMockParticipants(totalParticipants);
  const messages = createIncompleteRoundMessages(roundNumber, respondedCount);

  mockStore.setState({
    currentParticipantIndex: 0,
    currentResumptionPhase: null,
    enableWebSearch: false,
    hasEarlyOptimisticMessage: false,
    hasSentPendingMessage: false,
    isModeratorStreaming: false,
    isStreaming: false,
    messages,
    moderatorResumption: null,
    nextParticipantToTrigger: null,
    participants,
    pendingMessage: null,
    preSearches: [],
    preSearchResumption: null,
    resumptionRoundNumber: null,
    streamingRoundNumber: null,
    streamResumptionPrefilled: false,
    thread,
    waitingToStartStreaming: false,
  });

  return { messages, participants, thread };
}

describe('double Trigger Prevention', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should trigger resume only once when incomplete round detected', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, result } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(result.current.isIncomplete).toBeTruthy();
      expect(result.current.nextParticipantIndex).toBe(1);
    });

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

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

  it('should not clear guard during retry toggle within 100ms', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

    const triggerCallsBefore = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(triggerCallsBefore).toBeGreaterThan(0);
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

    const triggerCallsAfter = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(triggerCallsAfter).toBe(triggerCallsBefore);
  });

  it('should clear guard after 100ms if waitingToStartStreaming stays false', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, unmount } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

    const callsBeforeFailure = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(callsBeforeFailure).toBeGreaterThan(0);
    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    await act(async () => {
      await waitForAsync(150);
    });

    unmount();
    mockStore.actions.setNextParticipantToTrigger.mockClear();
    mockStore.actions.setWaitingToStartStreaming.mockClear();

    renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });
  });

  it('should allow triggering next participant on fresh mount after previous completes', async () => {
    // This test verifies that on a fresh page load (simulated by remounting),
    // the hook triggers the next incomplete participant.
    // Note: During a single session, subsequent participants (P2, P3, etc.) are
    // triggered by use-multi-participant-chat.ts, NOT by this resumption hook.
    // This hook is for resuming after page refresh/navigation.

    // Set up with P0 AND P1 already complete (simulating state after page refresh)
    const messagesWithP0P1Complete = [
      createTestUserMessage({ roundNumber: 1 }),
      createTestAssistantMessage({
        content: 'Assistant 0 response',
        finishReason: 'stop',
        id: 'thread-123_r1_p0',
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 1,
      }),
      createTestAssistantMessage({
        content: 'Assistant 1 response',
        finishReason: 'stop',
        id: 'thread-123_r1_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 1,
      }),
    ];

    const thread = createMockThread();
    const participants = createMockParticipants(3);

    mockStore.setState({
      currentParticipantIndex: 0,
      currentResumptionPhase: null,
      enableWebSearch: false,
      hasEarlyOptimisticMessage: false,
      hasSentPendingMessage: false,
      isModeratorStreaming: false,
      isStreaming: false,
      messages: messagesWithP0P1Complete,
      moderatorResumption: null,
      nextParticipantToTrigger: null,
      participants,
      pendingMessage: null,
      preSearches: [],
      preSearchResumption: null,
      resumptionRoundNumber: null,
      streamingRoundNumber: null,
      streamResumptionPrefilled: false,
      thread,
      waitingToStartStreaming: false,
    });

    renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    // On fresh mount with P0 and P1 complete, should trigger P2
    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(2);
      expect(mockStore.actions.setStreamingRoundNumber).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setCurrentParticipantIndex).toHaveBeenCalledWith(2);
    }, { timeout: 500 });
  });
});

describe('aI SDK Resume Blocking', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should block AI SDK resume when streamResumptionPrefilled=true with non-participant phase', async () => {
    setupIncompleteRound(1, 1, 3);
    mockStore.setState({
      currentResumptionPhase: 'pre_search',
      resumptionRoundNumber: 1,
      streamResumptionPrefilled: true,
    });

    renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      const state = mockStore.getState();
      expect(state.streamResumptionPrefilled).toBeTruthy();
      expect(state.currentResumptionPhase).toBe('pre_search');
    });

    await act(async () => {
      await waitForAsync(200);
    });

    expect(mockStore.actions.setWaitingToStartStreaming.mock.calls).toHaveLength(0);
  });

  it('should allow AI SDK resume when streamResumptionPrefilled=false', async () => {
    setupIncompleteRound(1, 1, 3);
    mockStore.setState({ streamResumptionPrefilled: false });

    const { result } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(result.current.isIncomplete).toBeTruthy();
    });

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });
  });

  it('should not interfere with custom resumption when prefilled', async () => {
    setupIncompleteRound(1, 1, 3);
    mockStore.setState({
      currentResumptionPhase: 'participants',
      resumptionRoundNumber: 1,
      streamResumptionPrefilled: true,
    });

    renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await act(async () => {
      await waitForAsync(150);
    });

    const state = mockStore.getState();
    expect(state.currentResumptionPhase).toBe('participants');
    expect(state.streamResumptionPrefilled).toBeTruthy();
  });
});

describe('retry Toggle Timeout', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should not clear guards during rapid toggle within 100ms', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

    const initialTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(initialTriggerCount).toBeGreaterThan(0);

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
      await waitForAsync(150);
    });

    const finalTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;
    expect(finalTriggerCount).toBe(initialTriggerCount);
  });

  it('should clear guards when waitingToStartStreaming stays false for over 100ms', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, unmount } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

    const callsBeforeWait = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(callsBeforeWait).toBeGreaterThan(0);

    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    await act(async () => {
      await waitForAsync(150);
    });

    unmount();
    mockStore.actions.setNextParticipantToTrigger.mockClear();
    mockStore.actions.setWaitingToStartStreaming.mockClear();

    renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });
  });

  it('should distinguish retry toggle from actual trigger failure', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

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

    await act(async () => {
      await waitForAsync(150);
    });

    const callsAfterRetry = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(callsAfterRetry).toBe(callsBeforeRetry);
  });

  it('should clear timeout when streaming starts successfully', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

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
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

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

describe('integration Tests', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should handle complete flow from trigger to streaming', async () => {
    // This test verifies the complete resumption flow for a single participant.
    // Note: Subsequent participants (P2, P3) are triggered by use-multi-participant-chat.ts,
    // not by this hook. This test only verifies the initial trigger works correctly.
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    // Should trigger P1 (first missing participant)
    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

    // Simulate the trigger flow: waiting -> streaming
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

    // Verify P1 was triggered correctly
    const calls = mockStore.actions.setNextParticipantToTrigger.mock.calls;
    expect(calls.some(call => call[0] === 1)).toBeTruthy();

    // P1 completes - this hook does NOT trigger P2 (that's handled by use-multi-participant-chat)
    const messagesAfterStreaming = [
      ...mockStore.getState().messages || [],
      createTestAssistantMessage({
        content: 'Assistant 1 response',
        finishReason: 'stop',
        id: 'thread-123_r1_p1',
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 1,
      }),
    ];

    act(() => {
      mockStore.setState({
        isStreaming: false,
        messages: messagesAfterStreaming,
      });
    });
    rerender();

    // Wait for stream settling period to complete
    await act(async () => {
      await waitForAsync(150);
    });
    rerender();

    // Verify the hook does NOT re-trigger (subsequent participants handled by different hook)
    // The last call should still be P1, not P2
    const finalCalls = mockStore.actions.setNextParticipantToTrigger.mock.calls;
    const p2Calls = finalCalls.filter(call => call[0] === 2);
    expect(p2Calls).toHaveLength(0); // No P2 triggers from this hook
  });

  it('should handle trigger failure with timeout and retry', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, unmount } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });

    const initialCallCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
      call => call[0] === 1,
    ).length;

    expect(initialCallCount).toBeGreaterThan(0);

    act(() => {
      mockStore.setState({ waitingToStartStreaming: false });
    });
    rerender();

    await act(async () => {
      await waitForAsync(150);
    });

    unmount();
    mockStore.actions.setNextParticipantToTrigger.mockClear();
    mockStore.actions.setWaitingToStartStreaming.mockClear();

    renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
    }, { timeout: 500 });
  });

  it('should prevent duplicate triggers across round transitions', async () => {
    setupIncompleteRound(1, 2, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        enabled: true,
        threadId: 'thread-123',
      }),
    );

    // Wait for initial trigger for participant 2 in round 1
    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(2);
    }, { timeout: 500 });

    const round1TriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.length;

    // Complete participant 2
    const messagesWithP2Complete = [
      ...mockStore.getState().messages || [],
      createTestAssistantMessage({
        content: 'Assistant 2 response',
        finishReason: 'stop',
        id: 'thread-123_r1_p2',
        participantId: 'participant-2',
        participantIndex: 2,
        roundNumber: 1,
      }),
    ];

    act(() => {
      mockStore.setState({
        isStreaming: false,
        messages: messagesWithP2Complete,
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
        content: 'User message for round 2',
        id: 'thread-123_r2_user',
        roundNumber: 2,
      }),
    ];

    act(() => {
      mockStore.setState({ messages: round2Messages });
    });
    rerender();

    await waitFor(() => {
      const round2Calls = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
        call => call[0] === 0,
      );
      expect(round2Calls.length).toBeGreaterThan(0);
    }, { timeout: 300 });

    const finalTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.length;
    expect(finalTriggerCount).toBeGreaterThan(round1TriggerCount);
  });
});
