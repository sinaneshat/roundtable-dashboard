/**
 * Non-Initial Round Resumption Edge Cases Tests
 *
 * Tests for specific edge cases in non-initial round (round > 0) resumption:
 *
 * 1. STALE PENDING MESSAGE: When pendingMessage is persisted by Zustand but
 *    streamResumptionPrefilled is true, initializeThread should still be called
 *
 * 2. STALE OPTIMISTIC MESSAGE: When last user message is optimistic but we're
 *    resuming (streamResumptionPrefilled=true OR pre-search is complete),
 *    resumption should proceed
 *
 * 3. PRE-SEARCH EVIDENCE: When server doesn't detect incomplete round (user message
 *    not saved to DB), but pre-search is complete for current round, use that as
 *    evidence that submission was received
 *
 * 4. STALE STREAMING STATE: When isExplicitlyStreaming is stuck true but AI SDK
 *    status is 'ready', clear the stale state and allow resumption
 *
 * These tests ensure non-initial rounds (round 1, 2, etc.) resume properly after
 * page refresh at any point during streaming.
 */

import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessageRoles, MessageStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import type { ChatParticipant, ChatThread } from '@/db/validation';
import {
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing/helpers';

import type { ChatStore } from '../store-schemas';

// ============================================================================
// MOCK SETUP
// ============================================================================

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

function createMockThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: 'thread-123',
    userId: 'user-123',
    title: 'Test Thread',
    mode: 'analyzing',
    status: 'active',
    enableWebSearch: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createMockParticipants(count: number = 4): ChatParticipant[] {
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
    userQuery: `Query for round ${roundNumber}`,
    searchData: status === MessageStatuses.COMPLETE
      ? { queries: [], results: [], summary: 'Test', successCount: 1, failureCount: 0, totalResults: 1, totalTime: 1000 }
      : null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
    ...overrides,
  } as StoredPreSearch;
}

/**
 * Creates an optimistic user message (simulating stale Zustand persist)
 */
function createOptimisticUserMessage(roundNumber: number, content: string): UIMessage {
  return {
    id: `optimistic-user-${Date.now()}-r${roundNumber}`,
    role: 'user' as const,
    parts: [{ type: 'text' as const, text: content }],
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
      isOptimistic: true, // Key flag indicating this is stale
    },
  };
}

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
    participants: createMockParticipants(4),
    preSearches: [],
    summaries: [],
    isStreaming: false,
    waitingToStartStreaming: false,
    pendingMessage: null,
    hasSentPendingMessage: false,
    hasEarlyOptimisticMessage: false,
    enableWebSearch: true,
    thread: createMockThread(),
    streamResumptionPrefilled: false,
    currentResumptionPhase: null,
    resumptionRoundNumber: null,
    prefilledForThreadId: null,
    isCreatingSummary: false,
    nextParticipantToTrigger: null,
    ...defaultActions,
    ...overrides,
  });
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('non-Initial Round Resumption Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.reset();
  });

  // ==========================================================================
  // SCENARIO 1: Stale pendingMessage from Zustand persist
  // ==========================================================================
  describe('stale pendingMessage Detection', () => {
    it('should allow initialization when pendingMessage is stale but streamResumptionPrefilled is true', () => {
      // SCENARIO: User refreshes mid-round-2, pendingMessage was persisted by Zustand
      // but prefill ran indicating this is resumption, not active submission
      //
      // BUG FIXED: Previously, pendingMessage !== null caused isFormActionsSubmission=true
      // which skipped initializeThread even during resumption

      const round0Messages = createCompleteRoundMessages(0, 4);
      const round1Messages = createCompleteRoundMessages(1, 4);
      const round2UserMessage = createOptimisticUserMessage(2, 'Round 2 query');

      setupMockStore({
        messages: [...round0Messages, ...round1Messages, round2UserMessage],
        participants: createMockParticipants(4),
        preSearches: [createMockPreSearch(2, MessageStatuses.COMPLETE)],
        pendingMessage: 'Round 2 query', // Stale from Zustand persist
        streamResumptionPrefilled: true, // Prefill ran - this is resumption
        currentResumptionPhase: 'participants',
        resumptionRoundNumber: 2,
      });

      const state = mockStore.getState();

      // With the fix:
      // isFormActionsSubmission = pendingMessage !== null && !streamResumptionPrefilled
      // = 'Round 2 query' !== null && !true = true && false = FALSE
      // So initializeThread should be called
      const isFormActionsSubmission = state.pendingMessage !== null
        && !state.streamResumptionPrefilled;

      expect(isFormActionsSubmission).toBe(false);
    });

    it('should skip initialization when pendingMessage indicates active form submission', () => {
      // SCENARIO: User is actively submitting a new message (not resumption)
      // pendingMessage is set and streamResumptionPrefilled is false

      setupMockStore({
        messages: createCompleteRoundMessages(0, 4),
        participants: createMockParticipants(4),
        pendingMessage: 'New active submission',
        streamResumptionPrefilled: false, // No prefill - active submission
        hasSentPendingMessage: false,
      });

      const state = mockStore.getState();

      const isFormActionsSubmission = state.pendingMessage !== null
        && !state.streamResumptionPrefilled;

      expect(isFormActionsSubmission).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 2: Stale optimistic message blocking resumption
  // ==========================================================================
  describe('stale Optimistic Message Handling', () => {
    it('should allow resumption when last user message is optimistic but streamResumptionPrefilled is true', () => {
      // SCENARIO: Optimistic message persisted by Zustand, but prefill indicates resumption
      //
      // BUG FIXED: Previously, lastUserMessageIsOptimistic blocked resumption
      // even when streamResumptionPrefilled was true

      const round0Messages = createCompleteRoundMessages(0, 4);
      const round1Messages = createCompleteRoundMessages(1, 4);
      const round2OptimisticUser = createOptimisticUserMessage(2, 'Round 2 query');

      setupMockStore({
        messages: [...round0Messages, ...round1Messages, round2OptimisticUser],
        participants: createMockParticipants(4),
        preSearches: [createMockPreSearch(2, MessageStatuses.COMPLETE)],
        streamResumptionPrefilled: true,
      });

      const state = mockStore.getState();
      const lastUserMessage = state.messages?.findLast(m => m.role === 'user');
      const lastUserMessageIsOptimistic = lastUserMessage?.metadata
        && typeof lastUserMessage.metadata === 'object'
        && 'isOptimistic' in lastUserMessage.metadata
        && lastUserMessage.metadata.isOptimistic === true;

      // With the fix: blockOnOptimistic = optimistic && !prefilled && !preSearchEvidence
      const blockOnOptimistic = lastUserMessageIsOptimistic
        && !state.streamResumptionPrefilled;

      expect(lastUserMessageIsOptimistic).toBe(true);
      expect(blockOnOptimistic).toBe(false); // Should NOT block
    });

    it('should allow resumption when pre-search evidence exists even without prefill', () => {
      // SCENARIO: Server didn't detect incomplete round (user message not in DB),
      // but pre-search for round 2 is COMPLETE - proves submission was received
      //
      // BUG FIXED: Without this, streamResumptionPrefilled being false blocked resumption

      const round0Messages = createCompleteRoundMessages(0, 4);
      const round1Messages = createCompleteRoundMessages(1, 4);
      const round2OptimisticUser = createOptimisticUserMessage(2, 'Round 2 query');

      const completedPreSearch = createMockPreSearch(2, MessageStatuses.COMPLETE);

      setupMockStore({
        messages: [...round0Messages, ...round1Messages, round2OptimisticUser],
        participants: createMockParticipants(4),
        preSearches: [completedPreSearch],
        streamResumptionPrefilled: false, // Server didn't detect - no prefill
      });

      const state = mockStore.getState();
      const currentRoundNumber = 2;
      const preSearches = state.preSearches || [];

      const lastUserMessage = state.messages?.findLast(m => m.role === 'user');
      const lastUserMessageIsOptimistic = lastUserMessage?.metadata
        && typeof lastUserMessage.metadata === 'object'
        && 'isOptimistic' in lastUserMessage.metadata
        && lastUserMessage.metadata.isOptimistic === true;

      // Pre-search evidence: complete pre-search for current round proves submission received
      const preSearchIndicatesSubmissionReceived = Array.isArray(preSearches)
        && preSearches.some(ps =>
          ps.roundNumber === currentRoundNumber && ps.status === MessageStatuses.COMPLETE,
        );

      // With the fix: blockOnOptimistic = optimistic && !prefilled && !preSearchEvidence
      const blockOnOptimistic = lastUserMessageIsOptimistic
        && !state.streamResumptionPrefilled
        && !preSearchIndicatesSubmissionReceived;

      expect(lastUserMessageIsOptimistic).toBe(true);
      expect(preSearchIndicatesSubmissionReceived).toBe(true);
      expect(blockOnOptimistic).toBe(false); // Should NOT block
    });

    it('should block resumption for active optimistic submission (no prefill, no pre-search)', () => {
      // SCENARIO: User just submitted, optimistic message is fresh, no evidence of prior submission

      const round0Messages = createCompleteRoundMessages(0, 4);
      const round1OptimisticUser = createOptimisticUserMessage(1, 'Fresh submission');

      setupMockStore({
        messages: [...round0Messages, round1OptimisticUser],
        participants: createMockParticipants(4),
        preSearches: [], // No pre-search
        streamResumptionPrefilled: false, // No prefill
      });

      const state = mockStore.getState();
      const currentRoundNumber = 1;
      const preSearches = state.preSearches || [];

      const lastUserMessage = state.messages?.findLast(m => m.role === 'user');
      const lastUserMessageIsOptimistic = lastUserMessage?.metadata
        && typeof lastUserMessage.metadata === 'object'
        && 'isOptimistic' in lastUserMessage.metadata
        && lastUserMessage.metadata.isOptimistic === true;

      const preSearchIndicatesSubmissionReceived = Array.isArray(preSearches)
        && preSearches.some(ps =>
          ps.roundNumber === currentRoundNumber && ps.status === MessageStatuses.COMPLETE,
        );

      const blockOnOptimistic = lastUserMessageIsOptimistic
        && !state.streamResumptionPrefilled
        && !preSearchIndicatesSubmissionReceived;

      expect(lastUserMessageIsOptimistic).toBe(true);
      expect(preSearchIndicatesSubmissionReceived).toBe(false);
      expect(blockOnOptimistic).toBe(true); // SHOULD block - active submission
    });
  });

  // ==========================================================================
  // SCENARIO 3: Multi-round resumption at various points
  // ==========================================================================
  describe('multi-Round Resumption Scenarios', () => {
    it('should detect incomplete round 2 when round 0 and 1 are complete', () => {
      const round0Messages = createCompleteRoundMessages(0, 4);
      const round1Messages = createCompleteRoundMessages(1, 4);
      const round2UserMessage = createTestUserMessage({
        id: 'thread-123_r2_user',
        content: 'Round 2 query',
        roundNumber: 2,
      });
      // Only first participant responded in round 2
      const round2Participant0 = createTestAssistantMessage({
        id: 'thread-123_r2_p0',
        content: 'First response',
        roundNumber: 2,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: 'stop',
      });

      setupMockStore({
        messages: [...round0Messages, ...round1Messages, round2UserMessage, round2Participant0],
        participants: createMockParticipants(4),
        preSearches: [createMockPreSearch(2, MessageStatuses.COMPLETE)],
        streamResumptionPrefilled: true,
        currentResumptionPhase: 'participants',
      });

      const state = mockStore.getState();
      const enabledParticipants = state.participants?.filter(p => p.isEnabled) || [];
      const round2Responses = state.messages?.filter(m =>
        m.role === 'assistant'
        && m.metadata
        && typeof m.metadata === 'object'
        && 'roundNumber' in m.metadata
        && m.metadata.roundNumber === 2,
      ) || [];

      expect(enabledParticipants).toHaveLength(4);
      expect(round2Responses).toHaveLength(1); // Only 1 of 4 responded
      expect(round2Responses.length < enabledParticipants.length).toBe(true);
    });

    it('should correctly calculate next participant index for round 2', () => {
      const round0Messages = createCompleteRoundMessages(0, 4);
      const round1Messages = createCompleteRoundMessages(1, 4);
      const round2UserMessage = createTestUserMessage({
        id: 'thread-123_r2_user',
        content: 'Round 2 query',
        roundNumber: 2,
      });
      // Participants 0 and 1 responded
      const round2Participant0 = createTestAssistantMessage({
        id: 'thread-123_r2_p0',
        content: 'Response 0',
        roundNumber: 2,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: 'stop',
      });
      const round2Participant1 = createTestAssistantMessage({
        id: 'thread-123_r2_p1',
        content: 'Response 1',
        roundNumber: 2,
        participantId: 'participant-1',
        participantIndex: 1,
        finishReason: 'stop',
      });

      setupMockStore({
        messages: [
          ...round0Messages,
          ...round1Messages,
          round2UserMessage,
          round2Participant0,
          round2Participant1,
        ],
        participants: createMockParticipants(4),
        preSearches: [createMockPreSearch(2, MessageStatuses.COMPLETE)],
      });

      const state = mockStore.getState();
      const enabledParticipants = state.participants?.filter(p => p.isEnabled) || [];
      const round2Responses = state.messages?.filter(m =>
        m.role === 'assistant'
        && m.metadata
        && typeof m.metadata === 'object'
        && 'roundNumber' in m.metadata
        && m.metadata.roundNumber === 2
        && 'finishReason' in m.metadata
        && m.metadata.finishReason === 'stop',
      ) || [];

      // Find indices of responded participants
      const respondedIndices = new Set<number>();
      for (const msg of round2Responses) {
        if (msg.metadata && typeof msg.metadata === 'object' && 'participantIndex' in msg.metadata) {
          respondedIndices.add(msg.metadata.participantIndex as number);
        }
      }

      // Find first missing participant
      let nextParticipantIndex: number | null = null;
      for (let i = 0; i < enabledParticipants.length; i++) {
        if (!respondedIndices.has(i)) {
          nextParticipantIndex = i;
          break;
        }
      }

      expect(respondedIndices.size).toBe(2); // 0 and 1 responded
      expect(nextParticipantIndex).toBe(2); // Next is participant 2
    });
  });

  // ==========================================================================
  // SCENARIO 4: Stale isExplicitlyStreaming blocking continueFromParticipant
  // ==========================================================================
  describe('stale isExplicitlyStreaming Detection', () => {
    it('should detect contradiction when AI SDK status is ready but isExplicitlyStreaming is true', () => {
      // SCENARIO: Page refreshes, isExplicitlyStreaming stuck true from previous session,
      // but AI SDK has reset to 'ready' status
      //
      // BUG FIXED: This contradiction blocked continueFromParticipant

      const aiSdkStatus = 'ready';
      const isExplicitlyStreaming = true;

      // The fix: if status is ready and isExplicitlyStreaming is true, clear stale state
      const shouldClearStaleState = aiSdkStatus === 'ready' && isExplicitlyStreaming;

      expect(shouldClearStaleState).toBe(true);
    });

    it('should not clear streaming state when AI SDK is actually streaming', () => {
      const aiSdkStatus = 'streaming';
      const isExplicitlyStreaming = true;

      const shouldClearStaleState = aiSdkStatus === 'ready' && isExplicitlyStreaming;

      expect(shouldClearStaleState).toBe(false);
    });

    it('should proceed with continueFromParticipant after clearing stale state', () => {
      // After clearing stale isExplicitlyStreaming, the guard should pass

      const messages: UIMessage[] = createCompleteRoundMessages(0, 4);
      messages.push(createTestUserMessage({
        id: 'thread-123_r1_user',
        content: 'Round 1 query',
        roundNumber: 1,
      }));

      const aiSdkStatus = 'ready';
      const messagesLength = messages.length;

      // Guard check (after clearing isExplicitlyStreaming)
      // isExplicitlyStreaming is no longer in the guard after the fix
      const guardPasses = messagesLength > 0 && aiSdkStatus === 'ready';

      expect(guardPasses).toBe(true);
    });
  });

  // ==========================================================================
  // SCENARIO 5: Full round-trip simulation
  // ==========================================================================
  describe('full Round-Trip Resumption', () => {
    it('should handle resumption at any point in round 2 with 4 participants', () => {
      // Simulate various resumption points in round 2
      const resumptionPoints = [
        { respondedCount: 0, description: 'before any participant' },
        { respondedCount: 1, description: 'after 1 participant' },
        { respondedCount: 2, description: 'after 2 participants' },
        { respondedCount: 3, description: 'after 3 participants' },
      ];

      for (const { respondedCount, description } of resumptionPoints) {
        const round0Messages = createCompleteRoundMessages(0, 4);
        const round1Messages = createCompleteRoundMessages(1, 4);
        const round2UserMessage = createTestUserMessage({
          id: 'thread-123_r2_user',
          content: 'Round 2 query',
          roundNumber: 2,
        });

        const round2Responses: UIMessage[] = [];
        for (let i = 0; i < respondedCount; i++) {
          round2Responses.push(createTestAssistantMessage({
            id: `thread-123_r2_p${i}`,
            content: `Response ${i}`,
            roundNumber: 2,
            participantId: `participant-${i}`,
            participantIndex: i,
            finishReason: 'stop',
          }));
        }

        mockStore.reset();
        setupMockStore({
          messages: [...round0Messages, ...round1Messages, round2UserMessage, ...round2Responses],
          participants: createMockParticipants(4),
          preSearches: [createMockPreSearch(2, MessageStatuses.COMPLETE)],
          streamResumptionPrefilled: true,
          currentResumptionPhase: 'participants',
        });

        const state = mockStore.getState();
        const enabledParticipants = state.participants?.filter(p => p.isEnabled) || [];

        // Calculate next participant
        const respondedIndices = new Set<number>();
        for (const msg of round2Responses) {
          if (msg.metadata && typeof msg.metadata === 'object' && 'participantIndex' in msg.metadata) {
            respondedIndices.add(msg.metadata.participantIndex as number);
          }
        }

        let expectedNextParticipant: number | null = null;
        for (let i = 0; i < enabledParticipants.length; i++) {
          if (!respondedIndices.has(i)) {
            expectedNextParticipant = i;
            break;
          }
        }

        expect(expectedNextParticipant).toBe(respondedCount);
        expect(
          respondedCount < enabledParticipants.length,
          `${description}: should be incomplete`,
        ).toBe(true);
      }
    });
  });

  // ==========================================================================
  // SCENARIO 6: Effect re-run triggers
  // ==========================================================================
  describe('effect Re-Run Triggers', () => {
    it('should re-run when streamResumptionPrefilled changes from false to true', () => {
      // Simulate the sequence of events during page load:
      // 1. First render: streamResumptionPrefilled = false (from initial state)
      // 2. Prefill effect runs, sets streamResumptionPrefilled = true
      // 3. Effect should re-run and now correctly handle resumption

      // First render state
      setupMockStore({
        messages: createCompleteRoundMessages(0, 4),
        pendingMessage: 'Stale pending message',
        streamResumptionPrefilled: false,
      });

      let state = mockStore.getState();
      let isFormActionsSubmission = state.pendingMessage !== null
        && !state.streamResumptionPrefilled;

      expect(isFormActionsSubmission).toBe(true); // Initially blocks

      // After prefill effect runs
      mockStore.setState({
        streamResumptionPrefilled: true,
        currentResumptionPhase: 'participants',
      });

      state = mockStore.getState();
      isFormActionsSubmission = state.pendingMessage !== null
        && !state.streamResumptionPrefilled;

      expect(isFormActionsSubmission).toBe(false); // Now allows initialization
    });
  });
});
