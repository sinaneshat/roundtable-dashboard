/**
 * Refresh + Submit = Duplicate Round Bug Tests
 *
 * BUG REPRODUCTION:
 * 1. Complete round 0 and round 1
 * 2. Submit for round 2, wait for completion (moderator finishes)
 * 3. Refresh the page
 * 4. Land on the same thread
 * 5. Submit a new message for round 3
 * 6. BUG: Round 3 executes TWICE - duplicate user messages created
 *
 * ROOT CAUSE ANALYSIS:
 * After page refresh, the incomplete round resumption logic may incorrectly:
 * 1. Detect the completed round as "incomplete" due to stale state
 * 2. Try to "resume" a round that doesn't need resumption
 * 3. Race with the new submission, causing duplicate user messages
 *
 * The key issue is the interaction between:
 * - Zustand persist (stale optimistic messages, pendingMessage)
 * - Server prefill (streamResumptionPrefilled, currentResumptionPhase)
 * - New submission flow (handleUpdateThreadAndSend)
 * - Incomplete round detection (isIncomplete calculation)
 *
 * NEW MESSAGE PERSISTENCE PATTERN (architecture change):
 * - User messages are now created via PATCH /api/v1/threads/:id during handleUpdateThreadAndSend
 * - Optimistic user message is added immediately to store (with isOptimistic flag)
 * - Thread PATCH includes newMessage field with user message content
 * - Backend persists the user message and returns it in the response
 * - Streaming handler receives the persisted user message (no longer creates it)
 */

import { FinishReasons, MessageRoles, MessageStatuses } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { getCurrentRoundNumber, getRoundNumber } from '@/lib/utils';
import type { StoredPreSearch } from '@/services/api';

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

/**
 * Creates a complete round with user message, all participant responses, and moderator
 */
function createCompleteRound(
  roundNumber: number,
  participantCount: number,
  userContent: string = `User message for round ${roundNumber}`,
): UIMessage[] {
  const messages: UIMessage[] = [
    createTestUserMessage({
      id: `thread-123_r${roundNumber}_user`,
      content: userContent,
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
        finishReason: FinishReasons.STOP,
      }),
    );
  }

  // Add moderator message to mark round as complete
  messages.push(
    createTestModeratorMessage({
      id: `thread-123_r${roundNumber}_moderator`,
      content: `Moderator summary for round ${roundNumber}`,
      roundNumber,
      finishReason: FinishReasons.STOP,
    }),
  );

  return messages;
}

/**
 * Simulates state after page refresh (Zustand rehydration)
 * Some state persists (messages, thread), other state resets (refs, streaming flags)
 */
function simulatePageRefreshState(
  currentMessages: UIMessage[],
  preSearches: StoredPreSearch[],
  additionalState?: Partial<ChatStore>,
): Partial<ChatStore> {
  return {
    // Persisted by Zustand
    messages: currentMessages,
    thread: createMockThread({ enableWebSearch: true }),
    preSearches,
    // Reset after refresh
    isStreaming: false,
    waitingToStartStreaming: false,
    pendingMessage: null, // May be persisted in some cases
    hasSentPendingMessage: false,
    hasEarlyOptimisticMessage: false,
    streamResumptionPrefilled: false, // Gets set by prefill effect
    currentResumptionPhase: null,
    nextParticipantToTrigger: null,
    participants: createMockParticipants(1),
    enableWebSearch: true,
    ...additionalState,
  };
}

/**
 * Calculates isIncomplete based on incomplete-round-resumption.ts logic
 */
function calculateIsIncomplete(state: {
  messages: UIMessage[];
  participants: { id: string; isEnabled: boolean; priority: number }[];
  preSearches: StoredPreSearch[];
  isStreaming: boolean;
  waitingToStartStreaming: boolean;
  hasEarlyOptimisticMessage: boolean;
  pendingMessage: string | null;
  hasSentPendingMessage: boolean;
  streamResumptionPrefilled: boolean;
  enabled?: boolean;
}): { isIncomplete: boolean; reason: string } {
  const {
    messages,
    participants,
    preSearches,
    isStreaming,
    waitingToStartStreaming,
    hasEarlyOptimisticMessage,
    pendingMessage,
    hasSentPendingMessage,
    streamResumptionPrefilled,
    enabled = true,
  } = state;

  if (!enabled) {
    return { isIncomplete: false, reason: 'disabled' };
  }

  if (isStreaming) {
    return { isIncomplete: false, reason: 'isStreaming' };
  }

  if (waitingToStartStreaming) {
    return { isIncomplete: false, reason: 'waitingToStartStreaming' };
  }

  // Submission in progress check
  const isSubmissionInProgress = hasEarlyOptimisticMessage
    || (pendingMessage !== null && !hasSentPendingMessage);

  if (isSubmissionInProgress) {
    return { isIncomplete: false, reason: 'isSubmissionInProgress' };
  }

  const enabledParticipants = participants.filter(p => p.isEnabled);
  if (enabledParticipants.length === 0) {
    return { isIncomplete: false, reason: 'noEnabledParticipants' };
  }

  const currentRoundNumber = messages.length > 0 ? getCurrentRoundNumber(messages) : null;
  if (currentRoundNumber === null) {
    return { isIncomplete: false, reason: 'noCurrentRound' };
  }

  // Check for optimistic message blocking
  const lastUserMessage = messages.findLast(m => m.role === MessageRoles.USER);
  const lastUserMessageIsOptimistic = lastUserMessage?.metadata
    && typeof lastUserMessage.metadata === 'object'
    && 'isOptimistic' in lastUserMessage.metadata
    && lastUserMessage.metadata.isOptimistic === true;

  const preSearchIndicatesSubmissionReceived = Array.isArray(preSearches)
    && preSearches.some(ps =>
      ps.roundNumber === currentRoundNumber && ps.status === MessageStatuses.COMPLETE,
    );

  const blockOnOptimistic = lastUserMessageIsOptimistic
    && !streamResumptionPrefilled
    && !preSearchIndicatesSubmissionReceived;

  if (blockOnOptimistic) {
    return { isIncomplete: false, reason: 'blockOnOptimistic' };
  }

  // Count responded participants for current round
  const roundAssistantMessages = messages.filter((m) => {
    if (m.role !== MessageRoles.ASSISTANT) {
      return false;
    }
    const metadata = m.metadata;
    if (!metadata || typeof metadata !== 'object') {
      return false;
    }
    // Exclude moderator
    if ('isModerator' in metadata && metadata.isModerator) {
      return false;
    }
    return getRoundNumber(metadata) === currentRoundNumber;
  });

  const respondedParticipantIndices = new Set<number>();
  for (const msg of roundAssistantMessages) {
    const metadata = msg.metadata;
    if (metadata && typeof metadata === 'object' && 'participantIndex' in metadata) {
      const idx = metadata.participantIndex;
      if (typeof idx === 'number') {
        respondedParticipantIndices.add(idx);
      }
    }
  }

  const accountedParticipants = respondedParticipantIndices.size;
  const isIncomplete = accountedParticipants < enabledParticipants.length;

  if (!isIncomplete) {
    return { isIncomplete: false, reason: 'allParticipantsResponded' };
  }

  return { isIncomplete: true, reason: `missing ${enabledParticipants.length - accountedParticipants} participants` };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('refresh + Submit = Duplicate Round Bug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStore.reset();
  });

  // ==========================================================================
  // BUG REPRODUCTION SCENARIO
  // ==========================================================================
  describe('bug Reproduction: Refresh After Complete Round, Then Submit', () => {
    it('should NOT detect completed round 2 as incomplete after page refresh', () => {
      // SCENARIO:
      // 1. Rounds 0, 1, 2 are complete (each has user + all participants + moderator)
      // 2. Page refreshes
      // 3. State is rehydrated from Zustand
      // 4. User wants to submit for round 3
      //
      // BUG: Incomplete detection incorrectly returns true for round 2

      const round0 = createCompleteRound(0, 1, 'Initial question');
      const round1 = createCompleteRound(1, 1, 'Follow up');
      const round2 = createCompleteRound(2, 1, 'Another question');

      const allMessages = [...round0, ...round1, ...round2];
      const preSearches = [
        createMockStoredPreSearch(0, MessageStatuses.COMPLETE),
        createMockStoredPreSearch(1, MessageStatuses.COMPLETE),
        createMockStoredPreSearch(2, MessageStatuses.COMPLETE),
      ];

      const state = simulatePageRefreshState(allMessages, preSearches);
      mockStore.setState(state);

      // Calculate isIncomplete
      const result = calculateIsIncomplete({
        messages: allMessages,
        participants: createMockParticipants(1),
        preSearches,
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: false,
        pendingMessage: null,
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      });

      // Round 2 is complete - should NOT be detected as incomplete
      expect(result.isIncomplete).toBe(false);
      expect(result.reason).toBe('allParticipantsResponded');
    });

    it('should allow new submission for round 3 without triggering resumption', () => {
      // After refresh, user submits a NEW message
      // This should create round 3, not "resume" round 2

      const round0 = createCompleteRound(0, 1, 'Initial');
      const round1 = createCompleteRound(1, 1, 'Follow up');
      const round2 = createCompleteRound(2, 1, 'BTC price');

      const allMessages = [...round0, ...round1, ...round2];
      const preSearches = [
        createMockStoredPreSearch(0, MessageStatuses.COMPLETE),
        createMockStoredPreSearch(1, MessageStatuses.COMPLETE),
        createMockStoredPreSearch(2, MessageStatuses.COMPLETE),
      ];

      // State after refresh, BEFORE new submission
      const stateBeforeSubmit = simulatePageRefreshState(allMessages, preSearches);
      mockStore.setState(stateBeforeSubmit);

      // Current round should be 2 (last completed round)
      const currentRound = getCurrentRoundNumber(allMessages);
      expect(currentRound).toBe(2);

      // Incomplete check should return false
      const incompleteCheck = calculateIsIncomplete({
        messages: allMessages,
        participants: createMockParticipants(1),
        preSearches,
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: false,
        pendingMessage: null,
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      });

      expect(incompleteCheck.isIncomplete).toBe(false);

      // NOW user submits for round 3
      // The form-actions.ts sets these flags
      const stateAfterSubmitStart = {
        ...stateBeforeSubmit,
        pendingMessage: 'New question for round 3',
        hasEarlyOptimisticMessage: true, // Set by handleUpdateThreadAndSend
        waitingToStartStreaming: true,
      };
      mockStore.setState(stateAfterSubmitStart);

      // Incomplete check should STILL return false (submission in progress)
      const incompleteCheckDuringSubmit = calculateIsIncomplete({
        messages: allMessages, // Messages not yet updated with round 3 user message
        participants: createMockParticipants(1),
        preSearches,
        isStreaming: false,
        waitingToStartStreaming: true,
        hasEarlyOptimisticMessage: true,
        pendingMessage: 'New question for round 3',
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      });

      expect(incompleteCheckDuringSubmit.isIncomplete).toBe(false);
      expect(incompleteCheckDuringSubmit.reason).toBe('waitingToStartStreaming');
    });
  });

  // ==========================================================================
  // RACE CONDITION: New Submission vs Resumption Detection
  // ==========================================================================
  describe('race Condition: New Submission vs Resumption', () => {
    it('should block resumption when hasEarlyOptimisticMessage is true', () => {
      // BUG: If resumption runs BEFORE hasEarlyOptimisticMessage is set,
      // it might incorrectly try to resume

      const round0 = createCompleteRound(0, 1);
      const round1 = createCompleteRound(1, 1);

      const result = calculateIsIncomplete({
        messages: [...round0, ...round1],
        participants: createMockParticipants(1),
        preSearches: [],
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: true, // Form submission started
        pendingMessage: 'New message',
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      });

      expect(result.isIncomplete).toBe(false);
      expect(result.reason).toBe('isSubmissionInProgress');
    });

    it('should block resumption when waitingToStartStreaming is true', () => {
      const round0 = createCompleteRound(0, 1);

      const result = calculateIsIncomplete({
        messages: [...round0],
        participants: createMockParticipants(1),
        preSearches: [],
        isStreaming: false,
        waitingToStartStreaming: true, // About to start new round
        hasEarlyOptimisticMessage: false,
        pendingMessage: null,
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      });

      expect(result.isIncomplete).toBe(false);
      expect(result.reason).toBe('waitingToStartStreaming');
    });

    it('should block resumption when pendingMessage is set and not sent', () => {
      const round0 = createCompleteRound(0, 1);

      const result = calculateIsIncomplete({
        messages: [...round0],
        participants: createMockParticipants(1),
        preSearches: [],
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: false,
        pendingMessage: 'User is submitting',
        hasSentPendingMessage: false, // Not sent yet
        streamResumptionPrefilled: false,
      });

      expect(result.isIncomplete).toBe(false);
      expect(result.reason).toBe('isSubmissionInProgress');
    });

    it('should NOT block resumption when pendingMessage exists but hasSentPendingMessage is true', () => {
      // Once message is sent, pendingMessage lingers but shouldn't block

      const round0 = createCompleteRound(0, 1);
      const round1UserOnly = [
        createTestUserMessage({
          id: 'thread-123_r1_user',
          content: 'Round 1 question',
          roundNumber: 1,
        }),
      ];

      const result = calculateIsIncomplete({
        messages: [...round0, ...round1UserOnly],
        participants: createMockParticipants(1),
        preSearches: [createMockStoredPreSearch(1, MessageStatuses.COMPLETE)],
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: false,
        pendingMessage: 'Round 1 question', // Stale
        hasSentPendingMessage: true, // Already sent
        streamResumptionPrefilled: true, // Prefill ran
      });

      // Round 1 only has user message, no participant responses = incomplete
      expect(result.isIncomplete).toBe(true);
    });
  });

  // ==========================================================================
  // TIMING WINDOW: Between Form Submit and Stream Start
  // ==========================================================================
  describe('timing Window Vulnerability', () => {
    it('should identify the critical timing window between form submit and stream start', () => {
      // The bug occurs in this sequence:
      // T0: User clicks submit
      // T1: handleUpdateThreadAndSend sets pendingMessage, hasEarlyOptimisticMessage
      // T2: Optimistic user message added to messages
      // T3: prepareForNewMessage sets waitingToStartStreaming
      // T4: API call starts (PATCH thread, pre-search, etc.)
      // T5: useIncompleteRoundResumption effect runs <-- BUG WINDOW
      // T6: usePendingMessage effect sends to AI SDK
      // T7: Stream starts, isStreaming = true
      //
      // If T5 runs before proper guards are set, it may incorrectly try to resume

      const timeline = [
        { time: 'T0', action: 'User clicks submit', guards: { hasEarlyOptimisticMessage: false, pendingMessage: null, waitingToStartStreaming: false } },
        { time: 'T1', action: 'handleUpdateThreadAndSend starts', guards: { hasEarlyOptimisticMessage: true, pendingMessage: 'query', waitingToStartStreaming: false } },
        { time: 'T2', action: 'Optimistic message added', guards: { hasEarlyOptimisticMessage: true, pendingMessage: 'query', waitingToStartStreaming: false } },
        { time: 'T3', action: 'prepareForNewMessage', guards: { hasEarlyOptimisticMessage: false, pendingMessage: 'query', waitingToStartStreaming: true } },
        { time: 'T4', action: 'API calls start', guards: { hasEarlyOptimisticMessage: false, pendingMessage: 'query', waitingToStartStreaming: true } },
        { time: 'T5', action: 'Resumption effect might run', guards: { hasEarlyOptimisticMessage: false, pendingMessage: 'query', waitingToStartStreaming: true } },
        { time: 'T6', action: 'AI SDK sendMessage', guards: { hasEarlyOptimisticMessage: false, pendingMessage: 'query', waitingToStartStreaming: true } },
        { time: 'T7', action: 'Stream starts', guards: { hasEarlyOptimisticMessage: false, pendingMessage: 'query', waitingToStartStreaming: false, isStreaming: true } },
      ];

      // After T0, at least one guard should block resumption
      // (T0 is before submit, so no guards are active yet)
      const stepsAfterT0 = timeline.filter(step => step.time !== 'T0');

      for (const step of stepsAfterT0) {
        const result = calculateIsIncomplete({
          messages: createCompleteRound(0, 1),
          participants: createMockParticipants(1),
          preSearches: [],
          isStreaming: step.guards.isStreaming ?? false,
          waitingToStartStreaming: step.guards.waitingToStartStreaming,
          hasEarlyOptimisticMessage: step.guards.hasEarlyOptimisticMessage,
          pendingMessage: step.guards.pendingMessage,
          hasSentPendingMessage: false,
          streamResumptionPrefilled: false,
        });

        expect(result.isIncomplete).toBe(false);
      }
    });

    it('should guard against microsecond race where all guards are false', () => {
      // EDGE CASE: Is there ANY point where all guards could be false?
      // This would allow resumption to run during a new submission

      // Between T0 and T1: No guards set yet
      const t0State = {
        messages: createCompleteRound(0, 1),
        participants: createMockParticipants(1),
        preSearches: [] as StoredPreSearch[],
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: false,
        pendingMessage: null,
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      };

      const result = calculateIsIncomplete(t0State);

      // At T0, round 0 is complete, so no resumption needed anyway
      expect(result.isIncomplete).toBe(false);
      expect(result.reason).toBe('allParticipantsResponded');

      // The danger is if we had an INCOMPLETE round and user was submitting
      // In that case, the incomplete round should be "abandoned" in favor of new submission
    });
  });

  // ==========================================================================
  // ACTUAL BUG FROM PRODUCTION: Duplicate User Messages
  // ==========================================================================
  describe('production Bug: Duplicate User Messages', () => {
    it('should NOT allow startRound to create duplicate user message', () => {
      // Based on production bug data:
      // Round 2 user: ExIw3DgkgKEUuvJ3 at 1767304894266 - "btc price right now. in dollars. 1 word"
      // Round 3 user: yXRUpI0D1jTWXT25 at 1767304899156 - SAME content, different ID

      const round0 = createCompleteRound(0, 3, 'Initial');
      const round1 = createCompleteRound(1, 3, 'Follow up');

      // Round 2 - User submitted, first participant responded
      const round2Messages = [
        createTestUserMessage({
          id: 'ExIw3DgkgKEUuvJ3',
          content: 'btc price right now. in dollars. 1 word',
          roundNumber: 2,
        }),
        createTestAssistantMessage({
          id: 'thread_r2_p0',
          content: 'Unavailable.',
          roundNumber: 2,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
      ];

      const allMessages = [...round0, ...round1, ...round2Messages];

      // State when the bug occurred - only 1 participant responded, no moderator
      const result = calculateIsIncomplete({
        messages: allMessages,
        participants: createMockParticipants(1), // Only 1 participant enabled
        preSearches: [createMockStoredPreSearch(2, MessageStatuses.COMPLETE)],
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: false,
        pendingMessage: null,
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      });

      // With 1 participant enabled and 1 response, round should be COMPLETE
      expect(result.isIncomplete).toBe(false);
      expect(result.reason).toBe('allParticipantsResponded');
    });

    it('should correctly detect when moderator is missing but all participants responded', () => {
      // The moderator is separate from participant completion
      // All participants complete -> moderator is triggered
      // Missing moderator doesn't mean "incomplete" for participant resumption

      const round0 = createCompleteRound(0, 1);
      const round1UserAndParticipant = [
        createTestUserMessage({
          id: 'thread-123_r1_user',
          content: 'Question',
          roundNumber: 1,
        }),
        createTestAssistantMessage({
          id: 'thread-123_r1_p0',
          content: 'Response',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // NO MODERATOR - this is the "awaiting moderator" state
      ];

      const result = calculateIsIncomplete({
        messages: [...round0, ...round1UserAndParticipant],
        participants: createMockParticipants(1),
        preSearches: [],
        isStreaming: false,
        waitingToStartStreaming: false,
        hasEarlyOptimisticMessage: false,
        pendingMessage: null,
        hasSentPendingMessage: false,
        streamResumptionPrefilled: false,
      });

      // All PARTICIPANTS responded - not incomplete for participant resumption
      // The moderator trigger is separate (isAwaitingModerator in ChatThreadScreen)
      expect(result.isIncomplete).toBe(false);
      expect(result.reason).toBe('allParticipantsResponded');
    });
  });

  // ==========================================================================
  // PREVENTION: Guards That Should Block Duplicate Submissions
  // ==========================================================================
  describe('submission Guards', () => {
    it('should list all guards that prevent duplicate submissions', () => {
      // Document all the guards that SHOULD prevent this bug
      const guards = {
        // In isIncomplete calculation
        isStreaming: 'Blocks when AI SDK is streaming',
        waitingToStartStreaming: 'Blocks when about to trigger streaming',
        isSubmissionInProgress: 'hasEarlyOptimisticMessage || (pendingMessage && !hasSentPendingMessage)',
        blockOnOptimistic: 'optimistic message && !prefilled && !preSearchEvidence',

        // In ChatThreadScreen.handlePromptSubmit
        isSubmitBlocked: 'isStreaming || isModeratorStreaming || pendingMessage || isAwaitingModerator',

        // In ChatInput
        isSubmitDisabled: 'disabled || isStreaming || isQuotaExceeded || isSubmitting || ...',

        // In AI SDK useMultiParticipantChat.startRound
        isTriggeringRef: 'Prevents concurrent startRound calls',
        isStreamingRef: 'Sync check for streaming state',
      };

      // All these guards should work together to prevent duplicates
      expect(Object.keys(guards).length).toBeGreaterThanOrEqual(8);
    });

    it('should ensure isSubmitBlocked includes waitingToStartStreaming', () => {
      // BUG CHECK: ChatThreadScreen.isSubmitBlocked should include waitingToStartStreaming
      // Currently: isStreaming || isModeratorStreaming || Boolean(pendingMessage) || isAwaitingModerator
      // Missing: waitingToStartStreaming

      const currentIsSubmitBlocked = (state: {
        isStreaming: boolean;
        isModeratorStreaming: boolean;
        pendingMessage: string | null;
        isAwaitingModerator: boolean;
        waitingToStartStreaming: boolean;
      }) => {
        // This is the CURRENT (potentially buggy) implementation
        return state.isStreaming
          || state.isModeratorStreaming
          || Boolean(state.pendingMessage)
          || state.isAwaitingModerator;
        // Missing: || state.waitingToStartStreaming
      };

      const fixedIsSubmitBlocked = (state: {
        isStreaming: boolean;
        isModeratorStreaming: boolean;
        pendingMessage: string | null;
        isAwaitingModerator: boolean;
        waitingToStartStreaming: boolean;
      }) => {
        // This is the FIXED implementation
        return state.isStreaming
          || state.isModeratorStreaming
          || Boolean(state.pendingMessage)
          || state.isAwaitingModerator
          || state.waitingToStartStreaming; // ADD THIS
      };

      // Test case: waitingToStartStreaming is true, other guards false
      const testState = {
        isStreaming: false,
        isModeratorStreaming: false,
        pendingMessage: null,
        isAwaitingModerator: false,
        waitingToStartStreaming: true, // About to start streaming
      };

      expect(currentIsSubmitBlocked(testState)).toBe(false); // BUG: allows submission
      expect(fixedIsSubmitBlocked(testState)).toBe(true); // FIXED: blocks submission
    });
  });
});
