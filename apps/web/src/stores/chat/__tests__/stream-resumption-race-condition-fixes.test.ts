import { ChatModes, ThreadStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread } from '@/types/api';
import { act, createTestAssistantMessage, createTestUserMessage, renderHook, waitFor, waitForAsync } from '@/lib/testing';

import { useIncompleteRoundResumption } from '../actions/incomplete-round-resumption';
import type { ChatStore } from '../store-schemas';

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

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    mode: ChatModes.ANALYZING,
    status: ThreadStatuses.ACTIVE,
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

describe('double Trigger Prevention', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should trigger resume only once when incomplete round detected', async () => {
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
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
      }),
    );

    await waitFor(() => {
      expect(mockStore.actions.setNextParticipantToTrigger).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setWaitingToStartStreaming).toHaveBeenCalledWith(true);
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
    }, { timeout: 500 });

    mockStore.actions.setNextParticipantToTrigger.mockClear();
    mockStore.actions.setStreamingRoundNumber.mockClear();
    mockStore.actions.setCurrentParticipantIndex.mockClear();

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
      expect(mockStore.actions.setStreamingRoundNumber).toHaveBeenCalledWith(1);
      expect(mockStore.actions.setCurrentParticipantIndex).toHaveBeenCalledWith(2);
    }, { timeout: 300 });
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
      streamResumptionPrefilled: true,
      currentResumptionPhase: 'pre_search',
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
    }, { timeout: 500 });
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

describe('retry Toggle Timeout', () => {
  beforeEach(() => {
    mockStore.reset();
    vi.clearAllMocks();
  });

  it('should not clear guards during rapid toggle within 100ms', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
    }, { timeout: 500 });

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

  it('should handle trigger failure with timeout and retry', async () => {
    setupIncompleteRound(1, 1, 3);

    const { rerender, unmount } = renderHook(() =>
      useIncompleteRoundResumption({
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
        threadId: 'thread-123',
        enabled: true,
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
      const round2Calls = mockStore.actions.setNextParticipantToTrigger.mock.calls.filter(
        call => call[0] === 0,
      );
      expect(round2Calls.length).toBeGreaterThan(0);
    }, { timeout: 300 });

    const finalTriggerCount = mockStore.actions.setNextParticipantToTrigger.mock.calls.length;
    expect(finalTriggerCount).toBeGreaterThan(round1TriggerCount);
  });
});
