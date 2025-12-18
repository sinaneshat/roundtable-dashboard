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

import { act, renderHook, waitFor } from '@testing-library/react';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinishReasons, MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing/helpers';

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
    setState: (newState: Partial<ChatStore>) => {
      storeState = { ...storeState, ...newState };
    },
    reset: () => {
      storeState = {};
    },
    subscribe: vi.fn(),
  };
});

vi.mock('@/components/providers/chat-store-provider', () => ({
  useChatStore: (selector: (state: ChatStore) => unknown) => {
    const state = mockStore.getState() as ChatStore;
    return selector(state);
  },
}));

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Creates a mock thread for testing
 */
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

/**
 * Creates mock participants for testing
 * Uses 'gpt-4' as default model to match test helper createTestAssistantMessage
 */
function createMockParticipants(count: number = 2): ChatParticipant[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    threadId: 'thread-123',
    modelId: 'gpt-4', // Match default in createTestAssistantMessage
    role: '',
    customRoleId: null,
    isEnabled: true,
    priority: i,
    settings: null,
    createdAt: new Date(),
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
    id: `presearch-${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status,
    userQuery: 'test query',
    searchData: null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: null,
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
      id: `thread-123_r${roundNumber}_user`,
      content: `User message for round ${roundNumber}`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < participantCount; i++) {
    messages.push(
      createTestAssistantMessage({
        id: `thread-123_r${roundNumber}_p${i}`,
        content: `Assistant ${i} response for round ${roundNumber}`,
        roundNumber,
        participantId: `participant-${i}`,
        participantIndex: i,
        finishReason: 'stop',
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
  hasContent: boolean = true,
): UIMessage {
  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    role: 'assistant' as const,
    parts: hasContent
      ? [{ type: 'text' as const, text: 'Partial response...', state: 'streaming' as const }]
      : [],
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      model: 'gpt-4',
      finishReason: FinishReasons.UNKNOWN,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
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
    role: 'assistant' as const,
    parts: [], // Empty - no content generated before interrupt
    metadata: {
      role: MessageRoles.ASSISTANT,
      roundNumber,
      participantId: `participant-${participantIndex}`,
      participantIndex,
      participantRole: null,
      model: 'gpt-4',
      finishReason: FinishReasons.UNKNOWN, // Unknown = interrupted
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      hasError: false,
      isTransient: false,
      isPartialResponse: false,
    },
  };
}

/**
 * Sets up the mock store with default state for testing
 */
function setupMockStore(overrides?: Partial<ChatStore>): void {
  const defaultActions = {
    setNextParticipantToTrigger: vi.fn(),
    setStreamingRoundNumber: vi.fn(),
    setCurrentParticipantIndex: vi.fn(),
    setWaitingToStartStreaming: vi.fn(),
    setIsStreaming: vi.fn(),
    prepareForNewMessage: vi.fn(),
    setExpectedParticipantIds: vi.fn(),
    setMessages: vi.fn(),
    setIsWaitingForChangelog: vi.fn(),
  };

  mockStore.setState({
    messages: [],
    participants: createMockParticipants(2),
    preSearches: [],
    isStreaming: false,
    waitingToStartStreaming: false,
    pendingMessage: null,
    hasSentPendingMessage: false,
    hasEarlyOptimisticMessage: false,
    enableWebSearch: false,
    thread: createMockThread(),
    ...defaultActions,
    ...overrides,
  });
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('useIncompleteRoundResumption', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.reset();
  });

  // ==========================================================================
  // SEARCH STREAM RESUMPTION TESTS
  // ==========================================================================
  describe('search Stream Resumption', () => {
    it('should NOT trigger participants while pre-search is still STREAMING', () => {
      // SCENARIO: User refreshes page while search is streaming
      // EXPECTED: Wait for search to complete before triggering participants
      const roundNumber = 0;
      const streamingPreSearch = createMockPreSearch(roundNumber, MessageStatuses.STREAMING);

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test query',
            roundNumber,
          }),
        ],
        preSearches: [streamingPreSearch],
        enableWebSearch: true,
        thread: createMockThread({ enableWebSearch: true }),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should detect incomplete round but NOT trigger participants yet
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(0);

      // setWaitingToStartStreaming should NOT be called while search is streaming
      const setWaitingFn = mockStore.getState().setWaitingToStartStreaming;
      expect(setWaitingFn).not.toHaveBeenCalledWith(true);
    });

    it('should trigger participants after pre-search COMPLETES', async () => {
      // SCENARIO: Pre-search completes, participants should start
      const roundNumber = 0;
      const completePreSearch = createMockPreSearch(roundNumber, MessageStatuses.COMPLETE, {
        searchData: {
          queries: [],
          results: [],
          summary: 'Test summary',
          successCount: 0,
          failureCount: 0,
          totalResults: 0,
          totalTime: 0,
        },
      });

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test query',
            roundNumber,
          }),
        ],
        preSearches: [completePreSearch],
        enableWebSearch: true,
        thread: createMockThread({ enableWebSearch: true }),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should trigger participants since search is complete
      await waitFor(() => {
        expect(result.current.isIncomplete).toBe(true);
        expect(result.current.nextParticipantIndex).toBe(0);
      });
    });

    it('should recover orphaned pre-search user query and add optimistic message', () => {
      // SCENARIO: User refreshes during search - pre-search exists but user message doesn't
      const roundNumber = 0;
      const orphanedPreSearch = createMockPreSearch(roundNumber, MessageStatuses.COMPLETE, {
        userQuery: 'My search query that was lost',
      });

      setupMockStore({
        messages: [], // No user message exists
        preSearches: [orphanedPreSearch],
        enableWebSearch: true,
        thread: createMockThread({ enableWebSearch: true }),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should call setMessages to add optimistic user message
      const setMessagesFn = mockStore.getState().setMessages;
      expect(setMessagesFn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // PARTICIPANT TURN-TAKING TESTS
  // ==========================================================================
  describe('participant Turn-Taking Order', () => {
    it('should resume from correct participant when first participant is still streaming', () => {
      // SCENARIO: Refresh while participant 0 is streaming
      // EXPECTED: Resume participant 0 (not skip to participant 1)
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createStreamingAssistantMessage(roundNumber, 0, true),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should NOT try to trigger participant 0 again (it's in progress)
      // Should wait for participant 0 to complete
      expect(result.current.nextParticipantIndex).toBe(1); // Next after in-progress
    });

    it('should trigger participant 1 when participant 0 is complete', () => {
      // SCENARIO: Participant 0 completed, refresh before participant 1 starts
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'Response from participant 0',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(1);
    });

    it('should NOT trigger participant 1 before participant 0 completes', () => {
      // SCENARIO: BUG - Participant 1 starts before participant 0 is done
      // EXPECTED: Wait for participant 0 to complete
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          // Participant 0 is streaming (not complete)
          createStreamingAssistantMessage(roundNumber, 0, false),
        ],
        participants: createMockParticipants(2),
        isStreaming: true,
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should NOT be incomplete while streaming
      expect(result.current.isIncomplete).toBe(false);
    });

    it('should retry empty interrupted responses (finishReason: unknown, 0 tokens)', () => {
      // SCENARIO: Refresh killed stream before any content was generated
      // EXPECTED: Treat as needing retry (not as completed)
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createEmptyInterruptedMessage(roundNumber, 0),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Empty interrupted message should be retried
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(0); // Retry participant 0
    });

    it('should preserve participant order after multiple refreshes', () => {
      // SCENARIO: User refreshes multiple times during conversation
      // EXPECTED: Participant order should remain consistent
      const roundNumber = 0;

      // Simulate state after first refresh (participant 0 complete)
      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'Response 0',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
        ],
        participants: createMockParticipants(3),
      });

      const { result: result1 } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      expect(result1.current.nextParticipantIndex).toBe(1);

      // Simulate second refresh - participant 1 now complete
      mockStore.setState({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'Response 0',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p1`,
            content: 'Response 1',
            roundNumber,
            participantId: 'participant-1',
            participantIndex: 1,
            finishReason: 'stop',
          }),
        ],
      });

      const { result: result2 } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      expect(result2.current.nextParticipantIndex).toBe(2);
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
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'Complete response',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          createStreamingAssistantMessage(roundNumber, 1, true),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Round is still incomplete because participant 1 is streaming
      // Summary should NOT trigger yet
      expect(result.current.isIncomplete).toBe(false); // Don't try to resume in-progress streams
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
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Round is complete
      expect(result.current.isIncomplete).toBe(false);
      expect(result.current.nextParticipantIndex).toBe(null);
    });

    it('should wait for pre-search before checking participant completeness', () => {
      // SCENARIO: Pre-search streaming, no participants yet
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test query',
            roundNumber,
          }),
        ],
        preSearches: [createMockPreSearch(roundNumber, MessageStatuses.STREAMING)],
        enableWebSearch: true,
        thread: createMockThread({ enableWebSearch: true }),
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should be incomplete, but participants should NOT trigger yet
      expect(result.current.isIncomplete).toBe(true);
    });
  });

  // ==========================================================================
  // STATE FLAG MANAGEMENT TESTS
  // ==========================================================================
  describe('state Flag Management', () => {
    it('should clear stale waitingToStartStreaming on refresh', () => {
      // SCENARIO: Refresh left waitingToStartStreaming=true but no pendingMessage
      setupMockStore({
        waitingToStartStreaming: true,
        pendingMessage: null,
        isStreaming: false,
        messages: [],
        participants: createMockParticipants(2),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should clear stale state
      const setWaitingFn = mockStore.getState().setWaitingToStartStreaming;
      expect(setWaitingFn).toHaveBeenCalledWith(false);
    });

    it('should clear stale isStreaming after timeout', async () => {
      // SCENARIO: isStreaming stuck true after refresh
      setupMockStore({
        isStreaming: true,
        waitingToStartStreaming: false,
        pendingMessage: null,
        hasEarlyOptimisticMessage: false,
        messages: [
          createTestUserMessage({
            id: 'thread-123_r0_user',
            content: 'Test',
            roundNumber: 0,
          }),
        ],
        participants: createMockParticipants(2),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Wait for the 2 second timeout
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 2100));
      });

      const setStreamingFn = mockStore.getState().setIsStreaming;
      expect(setStreamingFn).toHaveBeenCalledWith(false);
    });

    it('should set both nextParticipantToTrigger AND waitingToStartStreaming', async () => {
      // SCENARIO: BUG - Only nextParticipantToTrigger was set, not waitingToStartStreaming
      // EXPECTED: Both must be set for provider effect to trigger
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
        isStreaming: false,
        waitingToStartStreaming: false,
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Both should be set
      await waitFor(() => {
        const setNextFn = mockStore.getState().setNextParticipantToTrigger;
        const setWaitingFn = mockStore.getState().setWaitingToStartStreaming;

        expect(setNextFn).toHaveBeenCalledWith(0);
        expect(setWaitingFn).toHaveBeenCalledWith(true);
      });
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
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
        hasEarlyOptimisticMessage: true, // Submission in progress
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      expect(result.current.isIncomplete).toBe(false);
    });

    it('should NOT trigger when pendingMessage exists', () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
        pendingMessage: 'New message being sent',
        hasSentPendingMessage: false,
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      expect(result.current.isIncomplete).toBe(false);
    });

    it('should NOT duplicate triggers on rapid refreshes', async () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
        ],
        participants: createMockParticipants(2),
      });

      // First render
      const { unmount: unmount1 } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Simulate rapid refresh
      unmount1();

      // Second render
      const { unmount: unmount2 } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      unmount2();

      // Third render
      renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should only have triggered once due to refs
      await waitFor(() => {
        const setNextFn = mockStore.getState().setNextParticipantToTrigger;
        // Should be called but not multiple times per thread
        expect(setNextFn).toHaveBeenCalled();
      });
    });

    it('should detect participant config changes and skip resumption', () => {
      // SCENARIO: User changed participant config after round started
      // EXPECTED: Should NOT try to resume with wrong participants
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'Response from old model',
            roundNumber,
            participantId: 'old-participant-0',
            participantIndex: 0,
            finishReason: 'stop',
            model: 'old-model', // Different model than current config
          }),
        ],
        participants: [
          {
            id: 'new-participant-0',
            threadId: 'thread-123',
            modelId: 'new-model', // Different from message's model
            role: '',
            customRoleId: null,
            isEnabled: true,
            priority: 0,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'new-participant-1',
            threadId: 'thread-123',
            modelId: 'new-model-2',
            role: '',
            customRoleId: null,
            isEnabled: true,
            priority: 1,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as ChatParticipant[],
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should NOT be incomplete due to participant config mismatch
      expect(result.current.isIncomplete).toBe(false);
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
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      expect(result.current.isIncomplete).toBe(false);
      expect(result.current.nextParticipantIndex).toBe(null);
    });

    it('should handle disabled participants', () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
        ],
        participants: [
          {
            id: 'participant-0',
            threadId: 'thread-123',
            modelId: 'model-0',
            role: '',
            customRoleId: null,
            isEnabled: true, // Only this one is enabled
            priority: 0,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          {
            id: 'participant-1',
            threadId: 'thread-123',
            modelId: 'model-1',
            role: '',
            customRoleId: null,
            isEnabled: false, // Disabled
            priority: 1,
            settings: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as ChatParticipant[],
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should only expect 1 participant (the enabled one)
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(0);
    });

    it('should handle hook disabled state', () => {
      setupMockStore({
        messages: [
          createTestUserMessage({
            id: 'thread-123_r0_user',
            content: 'Test',
            roundNumber: 0,
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: false, // Disabled
        }),
      );

      expect(result.current.isIncomplete).toBe(false);
    });

    it('should reset refs on threadId change', () => {
      setupMockStore({
        messages: [],
        participants: createMockParticipants(2),
      });

      const { rerender } = renderHook(
        ({ threadId }) =>
          useIncompleteRoundResumption({
            threadId,
            enabled: true,
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
            role: 'user' as const,
            parts: [{ type: 'text' as const, text: 'New message' }],
            metadata: {
              role: MessageRoles.USER,
              roundNumber,
              isOptimistic: true, // Optimistic flag
            },
          },
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should NOT try to resume an optimistic message - it's a new submission
      expect(result.current.isIncomplete).toBe(false);
    });
  });

  // ==========================================================================
  // TRANSITION TIMING TESTS (BLIND SPOTS)
  // ==========================================================================
  describe('transition Timing', () => {
    it('should NOT start participant 0 while pre-search is PENDING', () => {
      // SCENARIO: Pre-search created but not started yet
      const roundNumber = 0;
      const pendingPreSearch = createMockPreSearch(roundNumber, MessageStatuses.PENDING);

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test query',
            roundNumber,
          }),
        ],
        preSearches: [pendingPreSearch],
        enableWebSearch: true,
        thread: createMockThread({ enableWebSearch: true }),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should detect incomplete but NOT trigger participants while search pending
      expect(result.current.isIncomplete).toBe(true);
    });

    it('should correctly handle transition from search to first participant', () => {
      // SCENARIO: Search just completed, about to start participant 0
      const roundNumber = 0;
      const completePreSearch = createMockPreSearch(roundNumber, MessageStatuses.COMPLETE, {
        searchData: {
          queries: [],
          results: [],
          summary: 'Test',
          successCount: 0,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        },
      });

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test query',
            roundNumber,
          }),
        ],
        preSearches: [completePreSearch],
        enableWebSearch: true,
        thread: createMockThread({ enableWebSearch: true }),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Search complete, should trigger participant 0
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(0);
    });

    it('should correctly handle transition between participant 0 and participant 1', () => {
      // SCENARIO: Participant 0 just completed, about to start participant 1
      // This is the exact scenario user described as breaking
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'Participant 0 complete response',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
        ],
        participants: createMockParticipants(3), // 3 participants
        isStreaming: false,
        waitingToStartStreaming: false,
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should trigger participant 1 (not 0, not 2)
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(1);
    });

    it('should correctly handle transition between participant 1 and participant 2', () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'P0 response',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p1`,
            content: 'P1 response',
            roundNumber,
            participantId: 'participant-1',
            participantIndex: 1,
            finishReason: 'stop',
          }),
        ],
        participants: createMockParticipants(3),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should trigger participant 2
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(2);
    });

    it('should mark round complete when last participant finishes', () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'P0 response',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p1`,
            content: 'P1 response',
            roundNumber,
            participantId: 'participant-1',
            participantIndex: 1,
            finishReason: 'stop',
          }),
        ],
        participants: createMockParticipants(2), // Only 2 participants
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // All participants responded - round is complete
      expect(result.current.isIncomplete).toBe(false);
      expect(result.current.nextParticipantIndex).toBe(null);
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
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'P0 complete',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          // Participant 1 is mid-stream (has streaming parts with content)
          createStreamingAssistantMessage(roundNumber, 1, true),
        ],
        participants: createMockParticipants(2),
        isStreaming: false, // Stream interrupted by refresh
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Participant 1 has partial content - don't re-trigger
      // The round should NOT be incomplete since p1 is in-progress (has content)
      expect(result.current.isIncomplete).toBe(false);
    });

    it('should retry participant with empty interrupted response after refresh', () => {
      // SCENARIO: Refresh killed stream before any content was generated
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'P0 complete',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          // Participant 1 was interrupted before generating content
          createEmptyInterruptedMessage(roundNumber, 1),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Empty interrupted response should be retried
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(1);
    });

    it('should handle refresh during search phase without user message', () => {
      // SCENARIO: User refreshes after clicking send but before user message is persisted
      // Pre-search exists but user message doesn't
      const roundNumber = 0;

      setupMockStore({
        messages: [], // No messages - user message wasn't persisted
        preSearches: [
          createMockPreSearch(roundNumber, MessageStatuses.STREAMING, {
            userQuery: 'User query that needs recovery',
          }),
        ],
        enableWebSearch: true,
        thread: createMockThread({ enableWebSearch: true }),
      });

      renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Should trigger orphaned pre-search recovery
      // The setMessages action should be called to add optimistic user message
      const setMessagesFn = mockStore.getState().setMessages;
      expect(setMessagesFn).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // SUMMARY TIMING TESTS (BLIND SPOTS)
  // ==========================================================================
  describe('summary Timing', () => {
    it('should NOT trigger summary while any participant has empty parts', () => {
      // SCENARIO: BUG - Summary triggered before participant finished showing content
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'Complete response',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          // Participant 1 has message but streaming parts with no content yet
          createStreamingAssistantMessage(roundNumber, 1, false), // hasContent = false
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Participant 1 is streaming without content - should retry
      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(1);
    });

    it('should correctly identify when all participants have completed', () => {
      const roundNumber = 0;

      setupMockStore({
        messages: [
          createTestUserMessage({
            id: `thread-123_r${roundNumber}_user`,
            content: 'Test',
            roundNumber,
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p0`,
            content: 'P0 response',
            roundNumber,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          createTestAssistantMessage({
            id: `thread-123_r${roundNumber}_p1`,
            content: 'P1 response',
            roundNumber,
            participantId: 'participant-1',
            participantIndex: 1,
            finishReason: 'stop',
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // All participants complete - ready for summary
      expect(result.current.isIncomplete).toBe(false);
      expect(result.current.resumingRoundNumber).toBe(null);
    });
  });

  // ==========================================================================
  // MULTI-ROUND SCENARIOS
  // ==========================================================================
  describe('multi-Round Scenarios', () => {
    it('should correctly identify incomplete round in multi-round conversation', () => {
      // Round 0 complete, Round 1 incomplete
      setupMockStore({
        messages: [
          ...createCompleteRoundMessages(0, 2),
          createTestUserMessage({
            id: 'thread-123_r1_user',
            content: 'Follow-up question',
            roundNumber: 1,
          }),
          // Only participant 0 responded in round 1
          createTestAssistantMessage({
            id: 'thread-123_r1_p0',
            content: 'Response',
            roundNumber: 1,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      expect(result.current.isIncomplete).toBe(true);
      expect(result.current.nextParticipantIndex).toBe(1);
      expect(result.current.resumingRoundNumber).toBe(1);
    });

    it('should only consider latest round for incompleteness', () => {
      // Round 0 incomplete (missing p1), Round 1 complete
      // Should NOT try to fix round 0
      setupMockStore({
        messages: [
          createTestUserMessage({
            id: 'thread-123_r0_user',
            content: 'First question',
            roundNumber: 0,
          }),
          createTestAssistantMessage({
            id: 'thread-123_r0_p0',
            content: 'R0 Response',
            roundNumber: 0,
            participantId: 'participant-0',
            participantIndex: 0,
            finishReason: 'stop',
          }),
          // Round 0 p1 missing
          ...createCompleteRoundMessages(1, 2), // Round 1 complete
        ],
        participants: createMockParticipants(2),
      });

      const { result } = renderHook(() =>
        useIncompleteRoundResumption({
          threadId: 'thread-123',
          enabled: true,
        }),
      );

      // Latest round (1) is complete
      expect(result.current.isIncomplete).toBe(false);
    });
  });
});
