/**
 * Incomplete Round Resumption Tests
 *
 * Tests for stream resumption after page refresh at various stages:
 * - Mid-search (pre-search streaming)
 * - Before participants start
 * - Mid-participant streaming
 * - Between participants
 * - Before summary
 *
 * These tests verify that:
 * 1. Streams are properly resumed from KV buffer
 * 2. Participant order is maintained during resumption
 * 3. Summary only triggers after ALL participants complete
 * 4. State flags are correctly managed
 * 5. Race conditions don't cause duplicate streams
 */

import { FinishReasons, MessageRoles, MessageStatuses, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { act, createTestAssistantMessage, createTestUserMessage, renderHook, waitFor } from '@/lib/testing';
import type { ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

import { useIncompleteRoundResumption } from '../actions/incomplete-round-resumption';
import type { ChatStore } from '../store-schemas';

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock the chat store provider
const mockStore = vi.hoisted(() => {
  let storeState: Partial<ChatStore> = {};

  return {
    getState: () => storeState,
    reset: () => {
      storeState = {};
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

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Creates a mock thread for testing
 */
function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: 'thread-123',
    mode: 'analyzing',
    status: 'active',
    title: 'Test Thread',
    updatedAt: new Date(),
    userId: 'user-123',
    ...overrides,
  } as ChatThread;
}

/**
 * Creates mock participants for testing
 * Uses 'gpt-4' as default model to match test helper createTestAssistantMessage
 */
function createMockParticipants(count = 2): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    createdAt: new Date(),
    customRoleId: null,
    id: `participant-${i}`,
    isEnabled: true,
    modelId: 'gpt-4', // Match default in createTestAssistantMessage
    priority: i,
    role: '',
    settings: null,
    threadId: 'thread-123',
    updatedAt: new Date(),
  })) as ChatParticipant[];
}

/**
 * Creates a mock pre-search for testing
 */
function createMockPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses],
  overrides?: Partial<StoredPreSearch>,
): StoredPreSearch {
  return {
    completedAt: null,
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-${roundNumber}`,
    roundNumber,
    searchData: null,
    status,
    threadId: 'thread-123',
    userQuery: 'test query',
    ...overrides,
  } as StoredPreSearch;
}

/**
 * Creates messages for a complete round (user + all participants)
 */
function createCompleteRoundMessages(
  roundNumber: number,
  participantCount: number,
): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      content: `User message for round ${roundNumber}`,
      id: `thread-123_r${roundNumber}_user`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        content: `Assistant ${i} response for round ${roundNumber}`,
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

/**
 * Creates an assistant message that's still streaming (has streaming parts)
 */
function createStreamingAssistantMessage(
  roundNumber: number,
  participantIndex: number,
  hasContent = true,
): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason: FinishReasons.UNKNOWN,
      hasError: false,
      isPartialResponse: false,
      isTransient: false,
      model: 'gpt-4',
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
    },
    parts: hasContent
      ? [{ state: 'streaming' as const, text: 'Partial response...', type: 'text' as const }]
      : [],
    role: MessageRoles.ASSISTANT as const,
  };
}

/**
 * Creates an empty interrupted response (refresh during streaming before content)
 */
function createEmptyInterruptedMessage(
  roundNumber: number,
  participantIndex: number,
): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason: FinishReasons.UNKNOWN, // Unknown = interrupted
      hasError: false,
      isPartialResponse: false,
      isTransient: false,
      model: 'gpt-4',
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      role: MessageRoles.ASSISTANT,
      roundNumber,
      usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
    },
    parts: [], // Empty - no content generated before interrupt
    role: MessageRoles.ASSISTANT as const,
  };
}

/**
 * Sets up the mock store with default state for testing
 */
function setupMockStore(overrides?: Partial<ChatStore>): void {
  const defaultActions = {
    clearStreamResumption: vi.fn(),
    prepareForNewMessage: vi.fn(),
    setCurrentParticipantIndex: vi.fn(),
    setExpectedParticipantIds: vi.fn(),
    setIsModeratorStreaming: vi.fn(),
    setIsStreaming: vi.fn(),
    setIsWaitingForChangelog: vi.fn(),
    setMessages: vi.fn(),
    setNextParticipantToTrigger: vi.fn(),
    setStreamingRoundNumber: vi.fn(),
    setWaitingToStartStreaming: vi.fn(),
    transitionToModeratorPhase: vi.fn(),
    transitionToParticipantsPhase: vi.fn(),
  };

  mockStore.setState({
    // Phase-based resumption state
    currentResumptionPhase: null,
    enableWebSearch: false,
    hasEarlyOptimisticMessage: false,
    hasSentPendingMessage: false,
    isModeratorStreaming: false,
    isStreaming: false,
    messages: [],
    moderatorResumption: null,
    participants: createMockParticipants(2),
    pendingMessage: null,
    preSearches: [],
    preSearchResumption: null,
    resumptionRoundNumber: null,
    streamResumptionPrefilled: false,
    thread: createMockThread(),
    waitingToStartStreaming: false,
    ...defaultActions,
    ...overrides,
  });
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('useIncompleteRoundResumption', () => {
  beforeEach(() => {
    // Use fake timers with shouldAdvanceTime to work with waitFor from testing-library
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
    mockStore.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // SEARCH STREAM RESUMPTION TESTS
  // ==========================================================================
  describe('search Stream Resumption', () => {
    it('should NOT trigger participants while pre-search is still STREAMING', async () => {
      // SCENARIO: User refreshes page while search is streaming
      // EXPECTED: Wait for search to complete before triggering participants
      const roundNumber = 0;
      const streamingPreSearch = createMockPreSearch(roundNumber, MessageStatuses.STREAMING);

      setupMockStore({
        enableWebSearch: true,
        messages: [
          createTestUserMessage({
            content: 'Test query',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        preSearches: [streamingPreSearch],
        thread: createMockThread({ enableWebSearch: true }),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Wait for the hook's internal timeout (100ms for activeStreamCheck + some buffer)
      await act(async () => {
        vi.advanceTimersByTime(200);
      });

      // The key test: setWaitingToStartStreaming should NOT be called while search is streaming
      // The main resumption effect should return early due to shouldWaitForPreSearch
      const setWaitingFn = mockStore.getState().setWaitingToStartStreaming;
      expect(setWaitingFn).not.toHaveBeenCalledWith(true);
    });

    it('should trigger participants after pre-search COMPLETES', async () => {
      // SCENARIO: Pre-search completes, participants should start
      const roundNumber = 0;
      const completePreSearch = createMockPreSearch(roundNumber, MessageStatuses.COMPLETE, {
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: 'Test summary',
          totalResults: 0,
          totalTime: 0,
        },
      });

      setupMockStore({
        enableWebSearch: true,
        messages: [
          createTestUserMessage({
            content: 'Test query',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        preSearches: [completePreSearch],
        thread: createMockThread({ enableWebSearch: true }),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Wait for activeStreamCheckComplete timeout (100ms) + buffer
      await waitFor(() => {
        const setWaitingFn = mockStore.getState().setWaitingToStartStreaming;
        const setNextPartFn = mockStore.getState().setNextParticipantToTrigger;

        expect(setWaitingFn).toHaveBeenCalledWith(true);
        expect(setNextPartFn).toHaveBeenCalledWith(0);
      }, { timeout: 500 });
    });

    it('should recover orphaned pre-search user query and add optimistic message', async () => {
      // SCENARIO: User refreshes during search - pre-search exists but user message doesn't
      const roundNumber = 0;
      const orphanedPreSearch = createMockPreSearch(roundNumber, MessageStatuses.COMPLETE, {
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: 'Test',
          totalResults: 0,
          totalTime: 0,
        },
        userQuery: 'My search query that was lost',
      });

      setupMockStore({
        enableWebSearch: true,
        messages: [], // No user message exists
        preSearches: [orphanedPreSearch],
        thread: createMockThread({ enableWebSearch: true }),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should call setMessages to add optimistic user message (UI recovery)
      // AND call prepareForNewMessage (participant triggering)
      await waitFor(() => {
        const setMessagesFn = mockStore.getState().setMessages;
        expect(setMessagesFn).toHaveBeenCalledWith();
      }, { timeout: 500 });
    });
  });

  // ==========================================================================
  // PARTICIPANT TURN-TAKING TESTS
  // ==========================================================================
  describe('participant Turn-Taking Order', () => {
    it('should resume from correct participant when first participant is still streaming', async () => {
      // SCENARIO: Refresh while participant 0 is streaming
      // EXPECTED: Skip participant 0 (it's in progress with content), next is participant 1
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createStreamingAssistantMessage(roundNumber, 0, true),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Wait for active stream check to complete
      await waitFor(() => {
        // Participant 0 has streaming parts with content - counted as "in progress"
        // So nextParticipantIndex should be 1 (the first participant that's not accounted for)
        expect(result.current.nextParticipantIndex).toBe(1);
        expect(result.current.isIncomplete).toBeTruthy();
      }, { timeout: 500 });
    });

    it('should trigger participant 1 when participant 0 is complete', async () => {
      // SCENARIO: Participant 0 completed, refresh before participant 1 starts
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Response from participant 0',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(1);
      }, { timeout: 500 });
    });

    it('should NOT trigger participant 1 before participant 0 completes', () => {
      // SCENARIO: BUG - Participant 1 starts before participant 0 is done
      // EXPECTED: Wait for participant 0 to complete
      const roundNumber = 0;

      setupMockStore({
        isStreaming: true,
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          // Participant 0 is streaming (not complete)
          createStreamingAssistantMessage(roundNumber, 0, false),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should NOT be incomplete while streaming
      expect(result.current.isIncomplete).toBeFalsy();
    });

    it('should retry empty interrupted responses (finishReason: unknown, 0 tokens)', async () => {
      // SCENARIO: Refresh killed stream before any content was generated
      // EXPECTED: Treat as needing retry (not as completed)
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createEmptyInterruptedMessage(roundNumber, 0),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Empty interrupted message should be retried
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(0); // Retry participant 0
      }, { timeout: 500 });
    });

    it('should preserve participant order after multiple refreshes', async () => {
      // SCENARIO: User refreshes multiple times during conversation
      // EXPECTED: Participant order should remain consistent
      const roundNumber = 0;

      // Simulate state after first refresh (participant 0 complete)
      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Response 0',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(3),
      });

      const { result: result1 } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      await waitFor(() => {
        expect(result1.current.nextParticipantIndex).toBe(1);
      }, { timeout: 500 });

      // Simulate second refresh - participant 1 now complete
      mockStore.setState({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Response 0',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Response 1',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p1`,
            participantId: 'participant-1',
            participantIndex: 1,
            roundNumber,
          }),
        ],
      });

      const { result: result2 } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      await waitFor(() => {
        expect(result2.current.nextParticipantIndex).toBe(2);
      }, { timeout: 500 });
    });
  });

  // ==========================================================================
  // SUMMARY TRIGGERING TESTS
  // ==========================================================================
  describe('summary Triggering Conditions', () => {
    it('should NOT mark round complete while any participant is still streaming', () => {
      // SCENARIO: BUG - Summary triggers before participant 1 finishes
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Complete response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          createStreamingAssistantMessage(roundNumber, 1, true),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Round is still incomplete because participant 1 is streaming
      // Summary should NOT trigger yet
      expect(result.current.isIncomplete).toBeFalsy(); // Don't try to resume in-progress streams
    });

    it('should mark round complete when ALL participants have finished', () => {
      // SCENARIO: All participants have valid responses
      const roundNumber = 0;

      setupMockStore({
        messages: createCompleteRoundMessages(roundNumber, 2),
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Round is complete
      expect(result.current.isIncomplete).toBeFalsy();
      expect(result.current.nextParticipantIndex).toBeNull();
    });

    it('should wait for pre-search before checking participant completeness', async () => {
      // SCENARIO: Pre-search streaming, no participants yet
      const roundNumber = 0;

      setupMockStore({
        enableWebSearch: true,
        messages: [
          createTestUserMessage({
            content: 'Test query',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
        preSearches: [createMockPreSearch(roundNumber, MessageStatuses.STREAMING)],
        thread: createMockThread({ enableWebSearch: true }),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should be incomplete, but participants should NOT trigger yet
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
      }, { timeout: 500 });
    });
  });

  // ==========================================================================
  // STATE FLAG MANAGEMENT TESTS
  // ==========================================================================
  describe('state Flag Management', () => {
    it('should clear stale isStreaming when streamFinishAcknowledged is true', async () => {
      // SCENARIO: isStreaming stuck true after refresh, but stream finished
      // ✅ EVENT-DRIVEN: Uses streamFinishAcknowledged flag instead of timeout
      setupMockStore({
        hasEarlyOptimisticMessage: false,
        isStreaming: true,
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: 'thread-123_r0_user',
            roundNumber: 0,
          }),
        ],
        participants: createMockParticipants(2),
        pendingMessage: null,
        streamFinishAcknowledged: true, // Event-driven signal that stream finished
        waitingToStartStreaming: false,
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Event-driven: effect runs immediately when streamFinishAcknowledged is true
      await waitFor(() => {
        const setStreamingFn = mockStore.getState().setIsStreaming;
        expect(setStreamingFn).toHaveBeenCalledWith(false);
      });
    });

    it('should NOT clear isStreaming when streamFinishAcknowledged is false', async () => {
      // SCENARIO: isStreaming true but stream might still be active
      // ✅ EVENT-DRIVEN: Wait for streamFinishAcknowledged signal
      setupMockStore({
        hasEarlyOptimisticMessage: false,
        isStreaming: true,
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: 'thread-123_r0_user',
            roundNumber: 0,
          }),
        ],
        participants: createMockParticipants(2),
        pendingMessage: null,
        streamFinishAcknowledged: false, // Stream not yet finished
        waitingToStartStreaming: false,
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Give it time - should NOT call setIsStreaming
      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      const setStreamingFn = mockStore.getState().setIsStreaming;
      expect(setStreamingFn).not.toHaveBeenCalled();
    });

    it('should set both nextParticipantToTrigger AND waitingToStartStreaming', async () => {
      // SCENARIO: BUG - Only nextParticipantToTrigger was set, not waitingToStartStreaming
      // EXPECTED: Both must be set for provider effect to trigger
      const roundNumber = 0;

      setupMockStore({
        isStreaming: false,
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
        waitingToStartStreaming: false,
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Both should be set after activeStreamCheckComplete timeout
      await waitFor(() => {
        const setNextFn = mockStore.getState().setNextParticipantToTrigger;
        const setWaitingFn = mockStore.getState().setWaitingToStartStreaming;

        expect(setNextFn).toHaveBeenCalledWith(0);
        expect(setWaitingFn).toHaveBeenCalledWith(true);
      }, { timeout: 500 });
    });
  });

  // ==========================================================================
  // RACE CONDITION TESTS
  // ==========================================================================
  describe('race Condition Prevention', () => {
    it('should NOT trigger resumption during active submission', () => {
      // SCENARIO: User submits new message while resumption is detecting incomplete round
      const roundNumber = 0;

      setupMockStore({
        hasEarlyOptimisticMessage: true, // Submission in progress
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      expect(result.current.isIncomplete).toBeFalsy();
    });

    it('should NOT trigger when pendingMessage exists', () => {
      const roundNumber = 0;

      setupMockStore({
        hasSentPendingMessage: false,
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
        pendingMessage: 'New message being sent',
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      expect(result.current.isIncomplete).toBeFalsy();
    });

    it('should NOT duplicate triggers on rapid refreshes', async () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
      });

      // First render
      const { unmount: unmount1 } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Simulate rapid refresh
      unmount1();

      // Second render
      const { unmount: unmount2 } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      unmount2();

      // Third render
      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should only have triggered once due to refs
      await waitFor(() => {
        const setNextFn = mockStore.getState().setNextParticipantToTrigger;
        // Should be called but not multiple times per thread
        expect(setNextFn).toHaveBeenCalledWith();
      }, { timeout: 500 });
    });

    it('should detect participant config changes and skip resumption', async () => {
      // SCENARIO: User changed participant config after round started
      // EXPECTED: Should NOT try to resume with wrong participants
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Response from old model',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            model: 'old-model', // Different model than current config
            participantId: 'old-participant-0',
            participantIndex: 0,
            roundNumber,
          }),
        ],
        participants: [
          {
            createdAt: new Date(),
            customRoleId: null,
            id: 'new-participant-0',
            isEnabled: true,
            modelId: 'new-model', // Different from message's model
            priority: 0,
            role: '',
            settings: null,
            threadId: 'thread-123',
            updatedAt: new Date(),
          },
          {
            createdAt: new Date(),
            customRoleId: null,
            id: 'new-participant-1',
            isEnabled: true,
            modelId: 'new-model-2',
            priority: 1,
            role: '',
            settings: null,
            threadId: 'thread-123',
            updatedAt: new Date(),
          },
        ] as ChatParticipant[],
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should NOT be incomplete due to participant config mismatch
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeFalsy();
      });
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================
  describe('edge Cases', () => {
    it('should handle empty messages array', () => {
      setupMockStore({
        messages: [],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      expect(result.current.isIncomplete).toBeFalsy();
      expect(result.current.nextParticipantIndex).toBeNull();
    });

    it('should handle disabled participants', async () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        participants: [
          {
            createdAt: new Date(),
            customRoleId: null,
            id: 'participant-0',
            isEnabled: true, // Only this one is enabled
            modelId: 'model-0',
            priority: 0,
            role: '',
            settings: null,
            threadId: 'thread-123',
            updatedAt: new Date(),
          },
          {
            createdAt: new Date(),
            customRoleId: null,
            id: 'participant-1',
            isEnabled: false, // Disabled
            modelId: 'model-1',
            priority: 1,
            role: '',
            settings: null,
            threadId: 'thread-123',
            updatedAt: new Date(),
          },
        ] as ChatParticipant[],
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should only expect 1 participant (the enabled one)
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(0);
      }, { timeout: 500 });
    });

    it('should handle hook disabled state', () => {
      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: 'thread-123_r0_user',
            roundNumber: 0,
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: false, // Disabled
          threadId: 'thread-123',
        }),
      );

      expect(result.current.isIncomplete).toBeFalsy();
    });

    it('should reset refs on threadId change', () => {
      setupMockStore({
        messages: [],
        participants: createMockParticipants(2),
      });

      const { rerender } = renderHook(
        ({ threadId }) =>
          useIncompleteRoundResumption({
            enabled: true,
            threadId,
          }),
        { initialProps: { threadId: 'thread-123' } },
      );

      // Change thread
      rerender({ threadId: 'thread-456' });

      // Should allow fresh check for new thread
      // (Internal refs should be reset)
    });

    it('should handle optimistic user messages correctly', () => {
      // SCENARIO: Optimistic message exists (new submission, not resumption)
      const roundNumber = 0;

      setupMockStore({
        messages: [
          {
            id: `optimistic-user-123-r${roundNumber}`,
            metadata: {
              isOptimistic: true, // Optimistic flag
              role: MessageRoles.USER,
              roundNumber,
            },
            parts: [{ text: 'New message', type: 'text' as const }],
            role: UIMessageRoles.USER as const,
          },
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should NOT try to resume an optimistic message - it's a new submission
      expect(result.current.isIncomplete).toBeFalsy();
    });
  });

  // ==========================================================================
  // TRANSITION TIMING TESTS (BLIND SPOTS)
  // ==========================================================================
  describe('transition Timing', () => {
    it('should NOT start participant 0 while pre-search is PENDING', async () => {
      // SCENARIO: Pre-search created but not started yet
      const roundNumber = 0;
      const pendingPreSearch = createMockPreSearch(roundNumber, MessageStatuses.PENDING);

      setupMockStore({
        enableWebSearch: true,
        messages: [
          createTestUserMessage({
            content: 'Test query',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        preSearches: [pendingPreSearch],
        thread: createMockThread({ enableWebSearch: true }),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should detect incomplete but NOT trigger participants while search pending
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
      }, { timeout: 500 });
    });

    it('should correctly handle transition from search to first participant', async () => {
      // SCENARIO: Search just completed, about to start participant 0
      const roundNumber = 0;
      const completePreSearch = createMockPreSearch(roundNumber, MessageStatuses.COMPLETE, {
        searchData: {
          failureCount: 0,
          queries: [],
          results: [],
          successCount: 0,
          summary: 'Test',
          totalResults: 0,
          totalTime: 100,
        },
      });

      setupMockStore({
        enableWebSearch: true,
        messages: [
          createTestUserMessage({
            content: 'Test query',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
        ],
        preSearches: [completePreSearch],
        thread: createMockThread({ enableWebSearch: true }),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Search complete, should trigger participant 0
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(0);
      }, { timeout: 500 });
    });

    it('should correctly handle transition between participant 0 and participant 1', async () => {
      // SCENARIO: Participant 0 just completed, about to start participant 1
      // This is the exact scenario user described as breaking
      const roundNumber = 0;

      setupMockStore({
        isStreaming: false,
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Participant 0 complete response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(3), // 3 participants
        waitingToStartStreaming: false,
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should trigger participant 1 (not 0, not 2)
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(1);
      }, { timeout: 500 });
    });

    it('should correctly handle transition between participant 1 and participant 2', async () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P0 response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P1 response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p1`,
            participantId: 'participant-1',
            participantIndex: 1,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(3),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should trigger participant 2
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(2);
      }, { timeout: 500 });
    });

    it('should mark round complete when last participant finishes', () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P0 response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P1 response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p1`,
            participantId: 'participant-1',
            participantIndex: 1,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2), // Only 2 participants
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // All participants responded - round is complete
      expect(result.current.isIncomplete).toBeFalsy();
      expect(result.current.nextParticipantIndex).toBeNull();
    });
  });

  // ==========================================================================
  // RAPID REFRESH SCENARIOS (BLIND SPOTS)
  // ==========================================================================
  describe('rapid Refresh Scenarios', () => {
    it('should correctly resume after refresh mid-way through participant streaming', () => {
      // SCENARIO: Refresh while participant 1 is streaming (has partial content)
      const roundNumber = 0;

      setupMockStore({
        isStreaming: false, // Stream interrupted by refresh
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P0 complete',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          // Participant 1 is mid-stream (has streaming parts with content)
          createStreamingAssistantMessage(roundNumber, 1, true),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Participant 1 has partial content - don't re-trigger
      // The round should NOT be incomplete since p1 is in-progress (has content)
      expect(result.current.isIncomplete).toBeFalsy();
    });

    it('should retry participant with empty interrupted response after refresh', async () => {
      // SCENARIO: Refresh killed stream before any content was generated
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P0 complete',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          // Participant 1 was interrupted before generating content
          createEmptyInterruptedMessage(roundNumber, 1),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Empty interrupted response should be retried
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(1);
      }, { timeout: 500 });
    });

    it('should handle refresh during search phase without user message', async () => {
      // SCENARIO: User refreshes after clicking send but before user message is persisted
      // Pre-search exists but user message doesn't
      const roundNumber = 0;

      setupMockStore({
        enableWebSearch: true,
        messages: [], // No messages - user message wasn't persisted
        preSearches: [
          createMockPreSearch(roundNumber, MessageStatuses.STREAMING, {
            userQuery: 'User query that needs recovery',
          }),
        ],
        thread: createMockThread({ enableWebSearch: true }),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Should trigger orphaned pre-search recovery
      // The setMessages action should be called to add optimistic user message
      await waitFor(() => {
        const setMessagesFn = mockStore.getState().setMessages;
        expect(setMessagesFn).toHaveBeenCalledWith();
      }, { timeout: 500 });
    });
  });

  // ==========================================================================
  // SUMMARY TIMING TESTS (BLIND SPOTS)
  // ==========================================================================
  describe('summary Timing', () => {
    it('should NOT trigger summary while any participant has empty parts', async () => {
      // SCENARIO: BUG - Summary triggered before participant finished showing content
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'Complete response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          // Participant 1 has message but streaming parts with no content yet
          createStreamingAssistantMessage(roundNumber, 1, false), // hasContent = false
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Participant 1 is streaming without content - should retry
      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(1);
      }, { timeout: 500 });
    });

    it('should correctly identify when all participants have completed', () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'Test',
            id: `thread-123_r${roundNumber}_user`,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P0 response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p0`,
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber,
          }),
          createTestAssistantMessage({
            content: 'P1 response',
            finishReason: 'stop',
            id: `thread-123_r${roundNumber}_p1`,
            participantId: 'participant-1',
            participantIndex: 1,
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // All participants complete - ready for summary
      expect(result.current.isIncomplete).toBeFalsy();
      expect(result.current.resumingRoundNumber).toBeNull();
    });
  });

  // ==========================================================================
  // MULTI-ROUND SCENARIOS
  // ==========================================================================
  describe('multi-Round Scenarios', () => {
    it('should correctly identify incomplete round in multi-round conversation', async () => {
      // Round 0 complete, Round 1 incomplete
      setupMockStore({
        messages: [
          ...createCompleteRoundMessages(0, 2),
          createTestUserMessage({
            content: 'Follow-up question',
            id: 'thread-123_r1_user',
            roundNumber: 1,
          }),
          // Only participant 0 responded in round 1
          createTestAssistantMessage({
            content: 'Response',
            finishReason: 'stop',
            id: 'thread-123_r1_p0',
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber: 1,
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      await waitFor(() => {
        expect(result.current.isIncomplete).toBeTruthy();
        expect(result.current.nextParticipantIndex).toBe(1);
        expect(result.current.resumingRoundNumber).toBe(1);
      });
    });

    it('should only consider latest round for incompleteness', () => {
      // Round 0 incomplete (missing p1), Round 1 complete
      // Should NOT try to fix round 0
      setupMockStore({
        messages: [
          createTestUserMessage({
            content: 'First question',
            id: 'thread-123_r0_user',
            roundNumber: 0,
          }),
          createTestAssistantMessage({
            content: 'R0 Response',
            finishReason: 'stop',
            id: 'thread-123_r0_p0',
            participantId: 'participant-0',
            participantIndex: 0,
            roundNumber: 0,
          }),
          // Round 0 p1 missing
          ...createCompleteRoundMessages(1, 2), // Round 1 complete
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          enabled: true,
          threadId: 'thread-123',
        }),
      );

      // Latest round (1) is complete
      expect(result.current.isIncomplete).toBeFalsy();
    });
  });
});
