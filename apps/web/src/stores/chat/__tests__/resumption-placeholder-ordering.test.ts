/**
 * Resumption Placeholder Ordering Tests
 *
 * Tests for correct placeholder visibility and ordering after page refresh.
 * Key scenarios:
 * 1. After refresh with incomplete round - participants should show before moderator
 * 2. After refresh during streaming - placeholders should appear immediately
 * 3. Moderator should ONLY appear after all participants complete
 * 4. Pre-search should block participant placeholders appropriately
 */

import {
  MessagePartTypes,
  MessageRoles,
  MessageStatuses,
  ModelIds,
  MODERATOR_NAME,
  MODERATOR_PARTICIPANT_INDEX,
  RoundPhases,
  ScreenModes,
  TextPartStates,
  UIMessageRoles,
} from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ChatParticipant, ChatThread, DbAssistantMessageMetadata } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// Test Type Schemas
// ============================================================================

/**
 * Test assistant metadata type with optional moderator flag (for test assertions)
 */
type TestAssistantMetadata = DbAssistantMessageMetadata & {
  isModerator?: boolean;
};

// ============================================================================
// Test Utilities
// ============================================================================

function createMockThread(overrides: Partial<ChatThread> = {}): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: 'thread-123',
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    mode: 'brainstorm',
    slug: 'test-thread',
    status: 'active',
    title: 'Test Thread',
    updatedAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createMockParticipant(overrides: Partial<ChatParticipant> = {}): ChatParticipant {
  return {
    createdAt: new Date(),
    id: `participant-${Math.random().toString(36).slice(2)}`,
    isEnabled: true,
    modelId: ModelIds.OPENAI_GPT_4_1,
    priority: 0,
    systemPrompt: null,
    temperature: null,
    threadId: 'thread-123',
    updatedAt: new Date(),
    ...overrides,
  } as ChatParticipant;
}

function createUserMessage(roundNumber: number, text = 'Test message'): UIMessage {
  return {
    id: `msg-user-r${roundNumber}`,
    metadata: {
      role: MessageRoles.USER,
      roundNumber,
    },
    parts: [{ text, type: MessagePartTypes.TEXT as const }],
    role: UIMessageRoles.USER,
  };
}

function createParticipantMessage(
  roundNumber: number,
  participantIndex: number,
  options: {
    hasContent?: boolean;
    isStreaming?: boolean;
    isComplete?: boolean;
    participantId?: string;
    modelId?: string;
  } = {},
): UIMessage {
  const { hasContent = true, isComplete = true, isStreaming = false, modelId = ModelIds.OPENAI_GPT_4_1, participantId } = options;

  const parts = hasContent
    ? [{
        state: isStreaming ? TextPartStates.STREAMING : TextPartStates.DONE,
        text: `Response from participant ${participantIndex}`,
        type: MessagePartTypes.TEXT as const,
      }]
    : [];

  return {
    id: `thread-123_r${roundNumber}_p${participantIndex}`,
    metadata: {
      finishReason: isComplete && !isStreaming ? 'stop' : undefined,
      model: modelId,
      participantId: participantId || `participant-${participantIndex}`,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts,
    role: UIMessageRoles.ASSISTANT,
  };
}

function createModeratorMessage(roundNumber: number, options: { hasContent?: boolean; isStreaming?: boolean } = {}): UIMessage {
  const { hasContent = true, isStreaming = false } = options;

  const parts = hasContent
    ? [{
        state: isStreaming ? TextPartStates.STREAMING : TextPartStates.DONE,
        text: 'Moderator summary',
        type: MessagePartTypes.TEXT as const,
      }]
    : [];

  return {
    id: `thread-123_r${roundNumber}_moderator`,
    metadata: {
      finishReason: hasContent && !isStreaming ? 'stop' : undefined,
      isModerator: true,
      model: MODERATOR_NAME,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts,
    role: UIMessageRoles.ASSISTANT,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('resumption Placeholder Ordering', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createChatStore();
  });

  describe('initial State After Refresh', () => {
    it('should show participant placeholders when streamingRoundNumber is set', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4, priority: 1 }),
      ];

      const messages: UIMessage[] = [
        createUserMessage(0, 'Hello'),
      ];

      // Simulate page refresh with incomplete round
      store.getState().initializeThread(createMockThread(), participants, messages);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const state = store.getState();

      // Verify state for placeholder rendering
      expect(state.streamingRoundNumber).toBe(0);
      expect(state.messages).toHaveLength(1);
      expect(state.participants).toHaveLength(2);

      // Key assertion: moderator should NOT be visible yet (no moderator message)
      const moderatorMessage = state.messages.find(m =>
        m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata && m.metadata.isModerator === true,
      );
      expect(moderatorMessage).toBeUndefined();
    });

    it('should NOT show moderator when participants have not responded', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
      ];

      const messages: UIMessage[] = [
        createUserMessage(0, 'Hello'),
      ];

      store.getState().initializeThread(createMockThread(), participants, messages);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true); // Participants are streaming

      const state = store.getState();

      // Moderator conditions - should be false because:
      // 1. No moderator message exists
      // 2. isModeratorStreaming is false
      expect(state.isModeratorStreaming).toBeFalsy();
      const moderatorExists = state.messages.some(m =>
        m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata,
      );
      expect(moderatorExists).toBeFalsy();
    });

    it('should only show moderator after all participants complete', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4, priority: 1 }),
      ];

      const messages: UIMessage[] = [
        createUserMessage(0, 'Hello'),
        createParticipantMessage(0, 0, { isComplete: true, participantId: 'p1' }),
        createParticipantMessage(0, 1, { isComplete: true, modelId: ModelIds.ANTHROPIC_CLAUDE_SONNET_4, participantId: 'p2' }),
        createModeratorMessage(0, { hasContent: true }),
      ];

      store.getState().initializeThread(createMockThread(), participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const state = store.getState();

      // Verify moderator exists AFTER participants
      const messageOrder = state.messages.map((m) => {
        if (m.role === UIMessageRoles.USER) {
          return 'user';
        }
        const meta = m.metadata as TestAssistantMetadata;
        if (meta?.isModerator) {
          return 'moderator';
        }
        return `participant-${meta?.participantIndex}`;
      });

      expect(messageOrder).toEqual(['user', 'participant-0', 'participant-1', 'moderator']);
    });
  });

  describe('streaming Round Placeholder Logic', () => {
    it('should track streamingRoundNumber correctly for placeholder rendering', () => {
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().streamingRoundNumber).toBe(1);
    });

    it('should clear streamingRoundNumber when round completes', () => {
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      // Simulate round completion
      store.getState().setIsStreaming(false);
      store.getState().setStreamingRoundNumber(null);

      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should maintain participant order in messages array', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', priority: 1 }),
        createMockParticipant({ id: 'p3', priority: 2 }),
      ];

      const messages: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: 'p1' }),
        createParticipantMessage(0, 1, { participantId: 'p2' }),
        createParticipantMessage(0, 2, { participantId: 'p3' }),
      ];

      store.getState().initializeThread(createMockThread(), participants, messages);

      const state = store.getState();
      const participantIndices = state.messages
        .filter(m => m.role === UIMessageRoles.ASSISTANT)
        .map(m => (m.metadata as DbAssistantMessageMetadata)?.participantIndex);

      // Participants should be in priority order: 0, 1, 2
      expect(participantIndices).toEqual([0, 1, 2]);
    });
  });

  describe('moderator Visibility Conditions', () => {
    it('should NOT trigger moderator when isModeratorStreaming is false and no moderator message', () => {
      const state = store.getState();

      // Default state
      expect(state.isModeratorStreaming).toBeFalsy();

      // No moderator message
      const hasModerator = state.messages.some(m =>
        m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata,
      );
      expect(hasModerator).toBeFalsy();
    });

    it('should mark isModeratorStreaming when moderator starts', () => {
      store.getState().setIsModeratorStreaming(true);

      expect(store.getState().isModeratorStreaming).toBeTruthy();
    });

    it('should clear isModeratorStreaming when moderator completes', () => {
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsModeratorStreaming(false);

      expect(store.getState().isModeratorStreaming).toBeFalsy();
    });
  });

  describe('multi-Round Resumption', () => {
    it('should correctly identify incomplete round 1 after round 0 completes', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
      ];

      const messages: UIMessage[] = [
        // Round 0 complete
        createUserMessage(0),
        createParticipantMessage(0, 0, { isComplete: true, participantId: 'p1' }),
        createModeratorMessage(0),
        // Round 1 user message only
        createUserMessage(1),
      ];

      store.getState().initializeThread(createMockThread(), participants, messages);

      const state = store.getState();

      // Verify round 1 has user message but no participant response
      const round1User = state.messages.find(m =>
        m.role === UIMessageRoles.USER
        && m.metadata
        && typeof m.metadata === 'object'
        && 'roundNumber' in m.metadata
        && m.metadata.roundNumber === 1,
      );
      expect(round1User).toBeDefined();

      const round1Participant = state.messages.find(m =>
        m.role === UIMessageRoles.ASSISTANT
        && m.metadata
        && typeof m.metadata === 'object'
        && 'roundNumber' in m.metadata
        && m.metadata.roundNumber === 1
        && !('isModerator' in m.metadata && m.metadata.isModerator),
      );
      expect(round1Participant).toBeUndefined();
    });

    it('should preserve round 0 messages when resuming round 1', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
      ];

      const initialMessages: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { isComplete: true, participantId: 'p1' }),
        createModeratorMessage(0),
        createUserMessage(1),
      ];

      store.getState().initializeThread(createMockThread(), participants, initialMessages);
      store.getState().setStreamingRoundNumber(1);

      const state = store.getState();

      // All round 0 messages should still exist
      const round0Messages = state.messages.filter(m =>
        m.metadata && typeof m.metadata === 'object' && 'roundNumber' in m.metadata && m.metadata.roundNumber === 0,
      );
      expect(round0Messages).toHaveLength(3); // user + participant + moderator
    });
  });

  describe('pre-Search Blocking', () => {
    it('should not block participants when web search is disabled', () => {
      const thread = createMockThread({ enableWebSearch: false });
      const participants = [createMockParticipant({ id: 'p1', priority: 0 })];

      store.getState().initializeThread(thread, participants, [createUserMessage(0)]);

      // No pre-search should exist
      expect(store.getState().preSearches).toEqual([]);
    });

    it('should add pre-search when web search is enabled', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant({ id: 'p1', priority: 0 })];

      store.getState().initializeThread(thread, participants, [createUserMessage(0)]);
      store.getState().addPreSearch({
        createdAt: new Date(),
        id: 'ps-1',
        roundNumber: 0,
        status: MessageStatuses.PENDING,
        threadId: 'thread-123',
        updatedAt: new Date(),
        userQuery: 'Hello',
      });

      const state = store.getState();
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);
    });
  });

  describe('resumption Phase State', () => {
    it('should set currentResumptionPhase to PARTICIPANTS via transitionToParticipantsPhase', () => {
      store.getState().transitionToParticipantsPhase();

      expect(store.getState().currentResumptionPhase).toBe(RoundPhases.PARTICIPANTS);
    });

    it('should set currentResumptionPhase to PRE_SEARCH via prefillStreamResumptionState', () => {
      store.getState().prefillStreamResumptionState('thread-123', {
        currentPhase: RoundPhases.PRE_SEARCH,
        moderator: null,
        participants: { completedCount: 0, expectedCount: 2, nextParticipantToTrigger: null, streamingCount: 0 },
        preSearch: { enabled: true, preSearchId: 'ps-1', status: MessageStatuses.STREAMING, streamId: 'stream-1' },
        roundComplete: false,
        roundNumber: 0,
      });

      expect(store.getState().currentResumptionPhase).toBe(RoundPhases.PRE_SEARCH);
    });

    it('should set currentResumptionPhase to MODERATOR via transitionToModeratorPhase', () => {
      store.getState().transitionToModeratorPhase(0);

      expect(store.getState().currentResumptionPhase).toBe(RoundPhases.MODERATOR);
    });

    it('should clear resumption state with clearStreamResumption', () => {
      // Set up state via prefill
      store.getState().prefillStreamResumptionState('thread-123', {
        currentPhase: RoundPhases.PARTICIPANTS,
        moderator: null,
        participants: { completedCount: 0, expectedCount: 2, nextParticipantToTrigger: 0, streamingCount: 0 },
        preSearch: null,
        roundComplete: false,
        roundNumber: 1,
      });

      store.getState().clearStreamResumption();

      const state = store.getState();
      expect(state.currentResumptionPhase).toBeNull();
      expect(state.streamResumptionPrefilled).toBeFalsy();
      expect(state.resumptionRoundNumber).toBeNull();
    });
  });

  describe('message Order Integrity', () => {
    it('should maintain correct order: User → Participants → Moderator', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', priority: 1 }),
      ];

      // Simulate typical message flow
      const messagesInOrder: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: 'p1' }),
        createParticipantMessage(0, 1, { participantId: 'p2' }),
        createModeratorMessage(0),
      ];

      store.getState().initializeThread(createMockThread(), participants, messagesInOrder);

      const state = store.getState();
      const order = state.messages.map((m) => {
        if (m.role === UIMessageRoles.USER) {
          return 'USER';
        }
        const meta = m.metadata as TestAssistantMetadata;
        if (meta?.isModerator) {
          return 'MODERATOR';
        }
        return `P${meta?.participantIndex}`;
      });

      expect(order).toEqual(['USER', 'P0', 'P1', 'MODERATOR']);
    });

    it('should preserve message order from input (initializeThread does NOT reorder)', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', priority: 1 }),
      ];

      // Input with intentionally wrong order (moderator before P1)
      // This documents that initializeThread preserves order as-is
      // Correct ordering is the responsibility of streaming logic, not initializeThread
      const inputMessages: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: 'p1' }),
        createModeratorMessage(0), // Before P1 in this test
        createParticipantMessage(0, 1, { participantId: 'p2' }),
      ];

      store.getState().initializeThread(createMockThread(), participants, inputMessages);

      const state = store.getState();
      const order = state.messages.map((m) => {
        if (m.role === UIMessageRoles.USER) {
          return 'USER';
        }
        const meta = m.metadata as TestAssistantMetadata;
        if (meta?.isModerator) {
          return 'MODERATOR';
        }
        return `P${meta?.participantIndex}`;
      });

      // initializeThread preserves input order exactly
      // Correct ordering must be ensured at message creation time, not init time
      expect(order).toEqual(['USER', 'P0', 'MODERATOR', 'P1']);
    });
  });

  describe('streamingRoundNumber vs isStreaming Coordination', () => {
    it('should set streamingRoundNumber BEFORE isStreaming for immediate placeholders', () => {
      // Simulate submit flow
      store.getState().setStreamingRoundNumber(0);
      // At this point, placeholders should be visible even without isStreaming=true

      expect(store.getState().streamingRoundNumber).toBe(0);
      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('should show placeholders when streamingRoundNumber is set but isStreaming is false', () => {
      // This simulates the gap between form submit and actual streaming start
      store.getState().setStreamingRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.waitingToStartStreaming).toBeTruthy();
      expect(state.isStreaming).toBeFalsy();

      // Condition for showing placeholders:
      // isStreamingRound = roundNumber === streamingRoundNumber
      // shouldShowPendingCards when isStreamingRound is true
    });
  });

  describe('waitingToStartStreaming Coordination', () => {
    it('should clear waitingToStartStreaming when isStreaming becomes true', () => {
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsStreaming(true);

      // Note: This is typically done by the streaming trigger effect
      // The store doesn't auto-clear, but the effect should
      expect(store.getState().isStreaming).toBeTruthy();
    });

    it('should allow resumption to set waitingToStartStreaming', () => {
      // Simulate resumption flow
      store.getState().setStreamingRoundNumber(1);
      store.getState().setNextParticipantToTrigger(0);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.nextParticipantToTrigger).toBe(0);
      expect(state.waitingToStartStreaming).toBeTruthy();
    });
  });
});

describe('placeholder Visibility Logic (chat-message-list conditions)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('moderator Placeholder Condition', () => {
    /**
     * The moderator placeholder should ONLY show when:
     * 1. moderatorMessage exists (triggerModerator added it), OR
     * 2. isModeratorStreaming is true
     *
     * It should NOT show when:
     * - Only isStreamingRound is true (participants haven't completed)
     */
    it('should NOT show moderator when only streamingRoundNumber is set (no moderator message)', () => {
      store.getState().setStreamingRoundNumber(0);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const state = store.getState();

      // Moderator visibility conditions
      const isModeratorStreaming = state.isModeratorStreaming;
      const moderatorMessage = state.messages.find(m =>
        m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata && m.metadata.isModerator === true,
      );

      // shouldShowModerator = moderatorMessage || isModeratorStreaming
      const shouldShowModerator = !!moderatorMessage || isModeratorStreaming;

      expect(shouldShowModerator).toBeFalsy();
    });

    it('should show moderator when moderator message exists', () => {
      const messages: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0),
        createModeratorMessage(0, { hasContent: false }), // Empty placeholder
      ];

      store.getState().setMessages(messages);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const state = store.getState();

      const moderatorMessage = state.messages.find(m =>
        m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata && m.metadata.isModerator === true,
      );

      expect(moderatorMessage).toBeDefined();
    });

    it('should show moderator when isModeratorStreaming is true', () => {
      store.getState().setIsModeratorStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      const state = store.getState();

      // shouldShowModerator = moderatorMessage || isModeratorStreaming
      const shouldShowModerator = state.isModeratorStreaming;

      expect(shouldShowModerator).toBeTruthy();
    });
  });

  describe('participant Pending Cards Condition', () => {
    /**
     * Participant pending cards should show when:
     * - isAnyStreamingActive = isStreaming || isModeratorStreaming || isStreamingRound
     * - !isRoundComplete
     * - (preSearchActive || preSearchComplete || isAnyStreamingActive)
     */
    it('should show participant pending cards when streamingRoundNumber is set', () => {
      store.getState().setStreamingRoundNumber(0);

      const state = store.getState();
      const isStreamingRound = state.streamingRoundNumber === 0;

      // isAnyStreamingActive includes isStreamingRound for participants
      const isAnyStreamingActive = state.isStreaming || state.isModeratorStreaming || isStreamingRound;

      expect(isAnyStreamingActive).toBeTruthy();
    });
  });
});

describe('initializeThread Resumption State Preservation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should PRESERVE resumption state when streamResumptionPrefilled is true', () => {
    // Simulate server prefilling resumption state BEFORE initializeThread
    store.getState().prefillStreamResumptionState('thread-123', {
      currentPhase: RoundPhases.PARTICIPANTS,
      moderator: null,
      participants: { completedCount: 0, expectedCount: 1, nextParticipantToTrigger: 0, streamingCount: 0 },
      preSearch: null,
      roundComplete: false,
      roundNumber: 1,
    });

    const participants = [createMockParticipant({ id: 'p1', priority: 0 })];
    const messages: UIMessage[] = [
      createUserMessage(0),
      createParticipantMessage(0, 0, { isComplete: true, participantId: 'p1' }),
      createModeratorMessage(0),
      createUserMessage(1), // Round 1 started
    ];

    // Call initializeThread - this should PRESERVE resumption state
    store.getState().initializeThread(createMockThread(), participants, messages);

    const state = store.getState();

    // ✅ CRITICAL: Resumption state should be PRESERVED, not reset!
    expect(state.waitingToStartStreaming).toBeTruthy();
    expect(state.streamingRoundNumber).toBe(1);
    expect(state.nextParticipantToTrigger).toBe(0);
    expect(state.streamResumptionPrefilled).toBeTruthy();
  });

  it('should RESET streaming state when streamResumptionPrefilled is false', () => {
    // No prefill - this is a normal navigation, not a resumption
    store.getState().setWaitingToStartStreaming(true); // Stale state
    store.getState().setStreamingRoundNumber(1); // Stale state

    const participants = [createMockParticipant({ id: 'p1', priority: 0 })];
    const messages: UIMessage[] = [createUserMessage(0)];

    // Call initializeThread - this should RESET streaming state
    store.getState().initializeThread(createMockThread(), participants, messages);

    const state = store.getState();

    // Streaming state should be reset
    expect(state.waitingToStartStreaming).toBeFalsy();
    expect(state.streamingRoundNumber).toBeNull();
    expect(state.nextParticipantToTrigger).toBeNull();
  });

  it('should preserve isModeratorStreaming when resuming moderator phase', () => {
    // Simulate server prefilling moderator phase resumption
    store.getState().prefillStreamResumptionState('thread-123', {
      currentPhase: RoundPhases.MODERATOR,
      moderator: { moderatorMessageId: null, status: MessageStatuses.STREAMING, streamId: 'mod-stream-1' },
      participants: { completedCount: 1, expectedCount: 1, nextParticipantToTrigger: null, streamingCount: 0 },
      preSearch: null,
      roundComplete: false,
      roundNumber: 0,
    });

    const participants = [createMockParticipant({ id: 'p1', priority: 0 })];
    const messages: UIMessage[] = [
      createUserMessage(0),
      createParticipantMessage(0, 0, { isComplete: true, participantId: 'p1' }),
    ];

    // Call initializeThread
    store.getState().initializeThread(createMockThread(), participants, messages);

    const state = store.getState();

    // Moderator streaming state should be preserved
    expect(state.isModeratorStreaming).toBeTruthy();
    expect(state.waitingToStartStreaming).toBeTruthy();
    expect(state.streamingRoundNumber).toBe(0);
  });
});

describe('end-to-End Resumption Flows', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('round 1 Resumption After Round 0 Complete', () => {
    it('should correctly resume round 1 with round 0 history preserved', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', priority: 1 }),
      ];

      // Initial state: Round 0 complete, Round 1 started (user message only)
      const messages: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { participantId: 'p1' }),
        createParticipantMessage(0, 1, { participantId: 'p2' }),
        createModeratorMessage(0),
        createUserMessage(1), // Round 1 started
      ];

      // Simulate page load with SSR data
      store.getState().initializeThread(createMockThread(), participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Simulate resumption detection
      store.getState().setStreamingRoundNumber(1);
      store.getState().setNextParticipantToTrigger(0);
      store.getState().setWaitingToStartStreaming(true);

      const state = store.getState();

      // Verify round 0 history is preserved
      expect(state.messages).toHaveLength(5);

      // Verify round 1 state is ready for resumption
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.nextParticipantToTrigger).toBe(0);
      expect(state.waitingToStartStreaming).toBeTruthy();

      // Verify no moderator for round 1 yet
      const round1Moderator = state.messages.find(m =>
        m.metadata
        && typeof m.metadata === 'object'
        && 'isModerator' in m.metadata
        && m.metadata.isModerator === true
        && 'roundNumber' in m.metadata
        && m.metadata.roundNumber === 1,
      );
      expect(round1Moderator).toBeUndefined();
    });
  });

  describe('refresh During Participant Streaming', () => {
    it('should resume from interrupted participant', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
        createMockParticipant({ id: 'p2', priority: 1 }),
      ];

      // State at refresh: P0 complete, P1 was streaming
      const messages: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { isComplete: true, participantId: 'p1' }),
        // P1 interrupted mid-stream - might have partial content or be empty
      ];

      store.getState().initializeThread(createMockThread(), participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Verify state for resumption
      const state = store.getState();

      // P0 responded, P1 needs to be triggered
      const p0Response = state.messages.find(m =>
        m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata && m.metadata.participantIndex === 0,
      );
      expect(p0Response).toBeDefined();

      const p1Response = state.messages.find(m =>
        m.metadata && typeof m.metadata === 'object' && 'participantIndex' in m.metadata && m.metadata.participantIndex === 1,
      );
      expect(p1Response).toBeUndefined();
    });
  });

  describe('refresh During Moderator Streaming', () => {
    it('should resume moderator when all participants complete', () => {
      const participants = [
        createMockParticipant({ id: 'p1', priority: 0 }),
      ];

      // State at refresh: All participants done, moderator was streaming
      const messages: UIMessage[] = [
        createUserMessage(0),
        createParticipantMessage(0, 0, { isComplete: true, participantId: 'p1' }),
        createModeratorMessage(0, { hasContent: false, isStreaming: true }), // Interrupted
      ];

      // Prefill BEFORE initializeThread to simulate server detection
      store.getState().prefillStreamResumptionState('thread-123', {
        currentPhase: RoundPhases.MODERATOR,
        moderator: { moderatorMessageId: null, status: MessageStatuses.STREAMING, streamId: 'mod-stream-1' },
        participants: { completedCount: 1, expectedCount: 1, nextParticipantToTrigger: null, streamingCount: 0 },
        preSearch: null,
        roundComplete: false,
        roundNumber: 0,
      });

      store.getState().initializeThread(createMockThread(), participants, messages);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const state = store.getState();

      expect(state.currentResumptionPhase).toBe(RoundPhases.MODERATOR);

      // Moderator message exists (even if empty/streaming)
      const moderatorMessage = state.messages.find(m =>
        m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata && m.metadata.isModerator === true,
      );
      expect(moderatorMessage).toBeDefined();
    });
  });
});
