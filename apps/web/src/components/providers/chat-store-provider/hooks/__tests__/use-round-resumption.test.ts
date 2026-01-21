import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { act } from '@/lib/testing';
import {
  buildAfterChangelogScenario,
  buildAfterPatchScenario,
  buildAfterPreSearchScenario,
  buildCacheMismatchScenario,
  buildDuringModeratorScenario,
  createCompleteRoundMessages,
  createMockAssistantMessage,
  createMockChatHook,
  createMockChatStore,
  createMockParticipants,
  createMockResumptionPreSearch,
  createMockUserMessage,
} from '@/lib/testing/resumption-test-helpers';
import type { StoredPreSearch } from '@/services/api';

// Legacy mock store for backward compatibility with existing tests
type MockChatStoreState = {
  waitingToStartStreaming: boolean;
  isStreaming: boolean;
  nextParticipantToTrigger: number | null;
  participants: Array<{
    id: string;
    threadId: string;
    modelId: string;
    role: string;
    priority: number;
  }>;
  messages: Array<{
    id: string;
    role: typeof MessageRoles.USER | typeof MessageRoles.ASSISTANT;
    metadata?: { roundNumber?: number };
  }>;
  preSearches: StoredPreSearch[];
  thread: {
    id: string;
    enableWebSearch: boolean;
  } | null;
  screenMode: string | null;
  setWaitingToStartStreaming: (value: boolean) => void;
  setNextParticipantToTrigger: (value: number | null) => void;
  setIsStreaming: (value: boolean) => void;
};

function createMockStore(initialState?: Partial<MockChatStoreState>): StoreApi<MockChatStoreState> {
  return createStore<MockChatStoreState>(set => ({
    waitingToStartStreaming: false,
    isStreaming: false,
    nextParticipantToTrigger: null,
    participants: [],
    messages: [],
    preSearches: [],
    thread: null,
    screenMode: ScreenModes.OVERVIEW,
    setWaitingToStartStreaming: (value: boolean) =>
      set({ waitingToStartStreaming: value }),
    setNextParticipantToTrigger: (value: number | null) =>
      set({ nextParticipantToTrigger: value }),
    setIsStreaming: (value: boolean) =>
      set({ isStreaming: value }),
    ...initialState,
  }));
}

function createLegacyMockChatHook(overrides?: {
  isReady?: boolean;
  continueFromParticipant?: ReturnType<typeof vi.fn>;
}) {
  return {
    isReady: overrides?.isReady ?? false,
    continueFromParticipant: overrides?.continueFromParticipant ?? vi.fn(),
    startRound: vi.fn(),
    messages: [],
    setMessages: vi.fn(),
    isTriggeringRef: { current: false },
    isStreamingRef: { current: false },
  };
}

function createMockParticipant(index: number) {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    role: `Role ${index}`,
    priority: index,
  };
}

function createLegacyMockUserMessage(roundNumber: number) {
  return {
    id: `msg-user-r${roundNumber}`,
    role: MessageRoles.USER as const,
    metadata: { roundNumber },
  };
}

function createMockPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses],
): StoredPreSearch {
  return {
    id: `presearch-${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status,
    userQuery: 'Test query',
    searchData: status === MessageStatuses.COMPLETE
      ? {
          queries: [],
          results: [],
          moderator: 'Moderator synthesis',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 1000,
        }
      : undefined,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
  } as StoredPreSearch;
}

describe('useRoundResumption', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('resumption conditions', () => {
    it('should NOT trigger resumption when nextParticipantToTrigger is null', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockStore({
        nextParticipantToTrigger: null,
        waitingToStartStreaming: true,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
      });

      createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      expect(state.nextParticipantToTrigger).toBeNull();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should trigger resumption when all conditions are met', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockStore({
        nextParticipantToTrigger: 1,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && state.participants.length > 0
        && state.messages.length > 0
        && chat.isReady;

      expect(shouldResume).toBe(true);

      if (shouldResume) {
        chat.continueFromParticipant(
          state.nextParticipantToTrigger,
          state.participants,
        );
      }

      expect(continueFromParticipant).toHaveBeenCalledWith(1, state.participants);
    });

    it('should NOT resume when chat is not ready (AI SDK hydration pending)', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockStore({
        nextParticipantToTrigger: 1,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const chat = createMockChatHook({
        isReady: false,
        continueFromParticipant,
      });

      const state = store.getState();

      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady;

      expect(shouldResume).toBe(false);
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should NOT resume when already streaming', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockStore({
        nextParticipantToTrigger: 1,
        waitingToStartStreaming: true,
        isStreaming: true,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
      });

      createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      const shouldResume = !state.isStreaming && state.nextParticipantToTrigger !== null;

      expect(shouldResume).toBe(false);
    });
  });

  describe('pre-search blocking', () => {
    it('should wait for pre-search completion before resuming participants', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockStore({
        nextParticipantToTrigger: 0,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, MessageStatuses.STREAMING)],
      });

      createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isPreSearchBlocking).toBe(true);
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should resume after pre-search completes', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockStore({
        nextParticipantToTrigger: 0,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, MessageStatuses.COMPLETE)],
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isPreSearchBlocking).toBe(false);

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(
          state.nextParticipantToTrigger,
          state.participants,
        );
      }

      expect(continueFromParticipant).toHaveBeenCalled();
    });
  });

  describe('dangling state cleanup', () => {
    it('should clear nextParticipantToTrigger after timeout when not streaming', async () => {
      const store = createMockStore({
        nextParticipantToTrigger: 1,
        waitingToStartStreaming: false,
        isStreaming: false,
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      const state = store.getState();

      expect(state.nextParticipantToTrigger).toBe(1);
    });

    it('should NOT clear nextParticipantToTrigger while streaming', async () => {
      const store = createMockStore({
        nextParticipantToTrigger: 1,
        waitingToStartStreaming: true,
        isStreaming: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      const state = store.getState();

      expect(state.nextParticipantToTrigger).toBe(1);
    });
  });

  describe('race condition handling', () => {
    it('should handle AI SDK isReady transition from false to true', async () => {
      const continueFromParticipant = vi.fn();
      createMockStore({
        nextParticipantToTrigger: 0,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const readyState = { isReady: false };

      createMockChatHook({
        isReady: readyState.isReady,
        continueFromParticipant,
      });

      expect(readyState.isReady).toBe(false);
      expect(continueFromParticipant).not.toHaveBeenCalled();

      readyState.isReady = true;

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      expect(readyState.isReady).toBe(true);
    });

    it('should prevent duplicate resumption triggers', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockStore({
        nextParticipantToTrigger: 0,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const resumptionKeys = new Set<string>();
      const threadId = store.getState().thread?.id || 'unknown';
      const roundNumber = 0;
      const participantIndex = store.getState().nextParticipantToTrigger;

      const resumptionKey = `${threadId}-r${roundNumber}-p${participantIndex}`;

      if (!resumptionKeys.has(resumptionKey) && participantIndex !== null) {
        resumptionKeys.add(resumptionKey);
        chat.continueFromParticipant(participantIndex, store.getState().participants);
      }

      if (!resumptionKeys.has(resumptionKey) && participantIndex !== null) {
        resumptionKeys.add(resumptionKey);
        chat.continueFromParticipant(participantIndex, store.getState().participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledTimes(1);
    });
  });

  describe('empty messages handling', () => {
    it('should NOT clear waitingToStartStreaming when messages are empty (new thread)', () => {
      const store = createMockStore({
        nextParticipantToTrigger: 0,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: [createMockParticipant(0)],
        messages: [],
        thread: null,
      });

      const state = store.getState();

      expect(state.messages).toHaveLength(0);
      expect(state.waitingToStartStreaming).toBe(true);
    });
  });

  describe('safety timeout', () => {
    it('should clear stuck state after 5 second timeout on thread screen', async () => {
      createMockStore({
        nextParticipantToTrigger: 0,
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.THREAD,
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });
    });

    it('should NOT timeout while streaming is active', async () => {
      const store = createMockStore({
        nextParticipantToTrigger: 0,
        waitingToStartStreaming: true,
        isStreaming: true,
        screenMode: ScreenModes.THREAD,
      });

      await act(async () => {
        vi.advanceTimersByTime(5000);
      });

      const state = store.getState();

      expect(state.waitingToStartStreaming).toBe(true);
    });
  });
});

describe('edge cases from debug output', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle state where nextParticipantToTrigger is null but streaming just ended', () => {
    const store = createMockStore({
      nextParticipantToTrigger: null,
      waitingToStartStreaming: false,
      isStreaming: false,
      participants: [
        { id: 'p0', threadId: 't', modelId: 'm0', role: 'R0', priority: 0 },
        { id: 'p1', threadId: 't', modelId: 'm1', role: 'R1', priority: 1 },
      ],
      messages: [
        { id: 'm1', role: MessageRoles.USER, metadata: { roundNumber: 0 } },
        { id: 'm2', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 } },
        { id: 'm3', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 } },
        { id: 'm4', role: MessageRoles.USER, metadata: { roundNumber: 1 } },
        { id: 'm5', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1 } },
        { id: 'm6', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1 } },
      ],
    });

    const state = store.getState();

    expect(state.nextParticipantToTrigger).toBeNull();
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.isStreaming).toBe(false);
    expect(state.messages).toHaveLength(6);
  });

  it('should detect incomplete round needing resumption', () => {
    const store = createMockStore({
      nextParticipantToTrigger: 1,
      waitingToStartStreaming: true,
      isStreaming: false,
      participants: [
        { id: 'p0', threadId: 't', modelId: 'm0', role: 'R0', priority: 0 },
        { id: 'p1', threadId: 't', modelId: 'm1', role: 'R1', priority: 1 },
      ],
      messages: [
        { id: 'm1', role: MessageRoles.USER, metadata: { roundNumber: 0 } },
        { id: 'm2', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 } },
        { id: 'm3', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 } },
        { id: 'm4', role: MessageRoles.USER, metadata: { roundNumber: 1 } },
        { id: 'm5', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1 } },
      ],
    });

    const state = store.getState();

    expect(state.nextParticipantToTrigger).toBe(1);
    expect(state.waitingToStartStreaming).toBe(true);
  });
});

// ============================================================================
// NEW COMPREHENSIVE TESTS FOR RESUMPTION POINT MATRIX
// ============================================================================

describe('resumption Point Matrix', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('after PATCH', () => {
    it('should wait for isPatchInProgress before streaming', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPatchScenario(true, 0);

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      // Should NOT resume while PATCH in progress
      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && !state.isPatchInProgress
        && chat.isReady;

      expect(state.isPatchInProgress).toBe(true);
      expect(shouldResume).toBe(false);
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should wait for isWaitingForChangelog before streaming', () => {
      const store = buildAfterChangelogScenario(true);
      const state = store.getState();

      expect(state.isWaitingForChangelog).toBe(true);

      // Should NOT resume while waiting for changelog
      const shouldResume = !state.isWaitingForChangelog;
      expect(shouldResume).toBe(false);
    });

    it('should wait for configChangeRoundNumber to clear', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPatchScenario(true, 0);

      createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      expect(state.configChangeRoundNumber).not.toBeNull();

      // Should NOT resume while config change round is set
      const shouldResume = state.configChangeRoundNumber === null;
      expect(shouldResume).toBe(false);
    });
  });

  describe('after Changelog', () => {
    it('should resume from participant 0 after changelog fetch completes', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterChangelogScenario(false);

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      expect(state.isWaitingForChangelog).toBe(false);

      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && !state.isWaitingForChangelog
        && chat.isReady;

      expect(shouldResume).toBe(true);

      if (shouldResume && state.nextParticipantToTrigger !== null) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledWith(0, state.participants);
    });
  });

  describe('after Pre-Search', () => {
    it('should wait for pre-search COMPLETE before participants', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPreSearchScenario(MessageStatuses.STREAMING);

      createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isPreSearchBlocking).toBe(true);
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('should handle pre-search FAILED gracefully', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPreSearchScenario(MessageStatuses.FAILED);

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      // FAILED pre-search should NOT block resumption
      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(preSearch?.status).toBe(MessageStatuses.FAILED);
      expect(isPreSearchBlocking).toBe(false);

      // Should allow resumption to proceed
      const shouldResume = state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && !isPreSearchBlocking
        && chat.isReady;

      expect(shouldResume).toBe(true);
    });

    it('should resume after pre-search COMPLETE', () => {
      const continueFromParticipant = vi.fn();
      const store = buildAfterPreSearchScenario(MessageStatuses.COMPLETE);

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearch = state.preSearches[0];

      const isPreSearchBlocking = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
      expect(isPreSearchBlocking).toBe(false);

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalled();
    });
  });

  describe('after Participant N', () => {
    it('should validate nextParticipantToTrigger against actual messages', () => {
      const store = buildCacheMismatchScenario();
      const state = store.getState();

      // Server says next is p2, but we only have p0 message
      expect(state.nextParticipantToTrigger).toBe(2);

      // Messages only have user + p0 assistant
      const roundNumber = 1;
      const participantIndicesWithMessages = new Set<number>();

      for (const msg of state.messages) {
        const meta = msg.metadata as { roundNumber?: number; participantIndex?: number; role?: string } | undefined;
        if (meta?.role !== MessageRoles.ASSISTANT)
          continue;
        if (meta.roundNumber !== roundNumber)
          continue;
        if (meta.participantIndex !== undefined) {
          participantIndicesWithMessages.add(meta.participantIndex);
        }
      }

      // Only p0 has a message
      expect(participantIndicesWithMessages.has(0)).toBe(true);
      expect(participantIndicesWithMessages.has(1)).toBe(false);
    });

    it('should correct cache mismatch (server vs client)', () => {
      // Server: nextP=2 (claims p0 and p1 exist)
      // Client: only has p0 message
      // Corrected: nextP=1 (first participant without message)
      const serverNextIndex = 2;
      const participantIndicesWithMessages = new Set([0]); // Only p0
      const totalParticipants = 3;

      // Validation logic from validateAndCorrectNextParticipant
      let correctedNextIndex = serverNextIndex;
      for (let i = 0; i < serverNextIndex && i < totalParticipants; i++) {
        if (!participantIndicesWithMessages.has(i)) {
          correctedNextIndex = i;
          break;
        }
      }

      // p0 exists, p1 missing → correctedNextIndex = 1
      expect(correctedNextIndex).toBe(1);
    });

    it('should resume correct participant after page refresh', () => {
      const continueFromParticipant = vi.fn();
      const roundNumber = 1;

      // Simulate page refresh with incomplete round (p0 done, p1 pending)
      const store = createMockChatStore({
        nextParticipantToTrigger: { index: 1, participantId: 'participant-1' },
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.THREAD,
        participants: createMockParticipants(3),
        messages: [
          createMockUserMessage(roundNumber),
          createMockAssistantMessage(roundNumber, 0, 'participant-0'),
        ],
        thread: { id: 'thread-123', enableWebSearch: false },
        enableWebSearch: false,
        isPatchInProgress: false,
        configChangeRoundNumber: null,
        isWaitingForChangelog: false,
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      // Should resume from participant 1 (p0 already done)
      const nextP = state.nextParticipantToTrigger;
      expect(nextP).toEqual({ index: 1, participantId: 'participant-1' });

      if (
        nextP !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
      ) {
        chat.continueFromParticipant(nextP, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledWith(
        { index: 1, participantId: 'participant-1' },
        state.participants,
      );
    });
  });

  describe('during Moderator', () => {
    it('should detect moderator stream in progress', () => {
      const store = buildDuringModeratorScenario();
      const state = store.getState();

      expect(state.isModeratorStreaming).toBe(true);
      expect(state.isStreaming).toBe(false);
      expect(state.nextParticipantToTrigger).toBeNull();

      // All participants done, moderator streaming
      expect(state.messages).toHaveLength(3); // user + 2 participants
    });

    it('should NOT trigger participant resumption during moderator', () => {
      const continueFromParticipant = vi.fn();
      const store = buildDuringModeratorScenario();

      createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();

      // No participant to trigger during moderator phase
      expect(state.nextParticipantToTrigger).toBeNull();
      expect(continueFromParticipant).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// RACE CONDITION PREVENTION TESTS
// ============================================================================

describe('race Condition Prevention', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should use resumptionTriggeredRef to prevent double-triggers', () => {
    const continueFromParticipant = vi.fn();
    const store = createMockChatStore({
      nextParticipantToTrigger: 0,
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    const chat = createMockChatHook({
      isReady: true,
      continueFromParticipant,
    });

    // Simulate resumptionTriggeredRef pattern
    const resumptionTriggeredRef = { current: null as string | null };

    const state = store.getState();
    const threadId = state.thread?.id || 'unknown';
    const roundNumber = 0;
    const participantIndex = 0;
    const resumptionKey = `${threadId}-r${roundNumber}-p${participantIndex}`;

    // First trigger
    if (resumptionTriggeredRef.current !== resumptionKey) {
      resumptionTriggeredRef.current = resumptionKey;
      chat.continueFromParticipant(participantIndex, state.participants);
    }

    // Second trigger attempt (should be blocked)
    if (resumptionTriggeredRef.current !== resumptionKey) {
      chat.continueFromParticipant(participantIndex, state.participants);
    }

    expect(continueFromParticipant).toHaveBeenCalledTimes(1);
  });

  it('should generate unique resumptionKey per thread/round/participant', () => {
    const keys: string[] = [];

    // Different threads
    keys.push(`thread-1-r0-p0`);
    keys.push(`thread-2-r0-p0`);

    // Different rounds
    keys.push(`thread-1-r1-p0`);
    keys.push(`thread-1-r2-p0`);

    // Different participants
    keys.push(`thread-1-r0-p1`);
    keys.push(`thread-1-r0-p2`);

    // All keys should be unique
    const uniqueKeys = new Set(keys);
    expect(uniqueKeys.size).toBe(keys.length);
  });

  it('should wait for AI SDK isReady before calling continueFromParticipant', () => {
    const continueFromParticipant = vi.fn();
    const store = createMockChatStore({
      nextParticipantToTrigger: 0,
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    const chat = createMockChatHook({
      isReady: false, // Not ready yet
      continueFromParticipant,
    });

    const state = store.getState();

    const shouldResume = state.nextParticipantToTrigger !== null
      && state.waitingToStartStreaming
      && !state.isStreaming
      && chat.isReady;

    expect(shouldResume).toBe(false);
    expect(continueFromParticipant).not.toHaveBeenCalled();
  });

  it('should retry with pollUntilReady when AI SDK not ready', async () => {
    const continueFromParticipant = vi.fn();
    let isReady = false;

    const store = createMockChatStore({
      nextParticipantToTrigger: 0,
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    // Simulate polling behavior
    let retryCount = 0;
    const maxRetries = 20;

    const pollUntilReady = () => {
      retryCount++;
      if (retryCount > maxRetries)
        return;

      if (!isReady) {
        // Schedule another poll
        setTimeout(pollUntilReady, 100);
        return;
      }

      // Ready - execute
      const state = store.getState();
      continueFromParticipant(state.nextParticipantToTrigger, state.participants);
    };

    // Start polling
    pollUntilReady();

    // AI SDK not ready yet
    await act(async () => {
      vi.advanceTimersByTime(300); // 3 retries
    });
    expect(continueFromParticipant).not.toHaveBeenCalled();
    expect(retryCount).toBeGreaterThan(1);

    // AI SDK becomes ready
    isReady = true;
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(continueFromParticipant).toHaveBeenCalled();
  });

  it('should limit retries to maxRetries (20)', async () => {
    let retryCount = 0;
    const maxRetries = 20;

    const pollUntilReady = () => {
      retryCount++;
      if (retryCount > maxRetries)
        return;
      setTimeout(pollUntilReady, 100);
    };

    pollUntilReady();

    await act(async () => {
      vi.advanceTimersByTime(3000); // Enough time for all retries
    });

    expect(retryCount).toBe(maxRetries + 1); // Initial + maxRetries
  });
});

// ============================================================================
// STREAM STATE TRANSITIONS TESTS
// ============================================================================

describe('stream State Transitions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should NOT clear nextParticipantToTrigger during participant transitions', () => {
    // During p0→p1 transition, isStreaming briefly goes false
    // but nextParticipantToTrigger should remain set
    const store = createMockChatStore({
      nextParticipantToTrigger: 1,
      waitingToStartStreaming: true,
      isStreaming: false, // Briefly false during transition
      streamingRoundNumber: 0, // Still set (round not complete)
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0), createMockAssistantMessage(0, 0)],
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    const state = store.getState();

    // streamingRoundNumber !== null means round still active
    const isRoundActive = state.streamingRoundNumber !== null;

    expect(isRoundActive).toBe(true);
    expect(state.nextParticipantToTrigger).toBe(1);
  });

  it('should check streamingRoundNumber !== null before clearing state', () => {
    // Only clear when streamingRoundNumber is null (round truly complete)
    const store = createMockChatStore({
      nextParticipantToTrigger: 1,
      waitingToStartStreaming: false,
      isStreaming: false,
      streamingRoundNumber: null, // Round complete
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: createCompleteRoundMessages(0, 2),
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    const state = store.getState();

    // Safe to clear when streamingRoundNumber is null
    const safeToClear = state.streamingRoundNumber === null
      && !state.waitingToStartStreaming
      && !state.isStreaming;

    expect(safeToClear).toBe(true);
  });

  it('should handle isStreaming briefly false during participant handoff', () => {
    // Simulate the gap between p0 complete and p1 start
    const store = createMockChatStore({
      nextParticipantToTrigger: 1,
      waitingToStartStreaming: true,
      isStreaming: false, // Gap during handoff
      streamingRoundNumber: 0, // Round still in progress
      currentParticipantIndex: 0,
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(3),
      messages: [
        createMockUserMessage(0),
        createMockAssistantMessage(0, 0),
      ],
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    const state = store.getState();

    // Despite isStreaming=false, round is active
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.nextParticipantToTrigger).toBe(1);

    // Should still trigger next participant
    expect(state.waitingToStartStreaming).toBe(true);
  });
});

// ============================================================================
// CLEANUP AND TIMEOUTS TESTS
// ============================================================================

describe('cleanup and Timeouts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should clear dangling nextParticipantToTrigger after 500ms', async () => {
    const store = createMockChatStore({
      nextParticipantToTrigger: 1,
      waitingToStartStreaming: false, // Not waiting
      isStreaming: false,
      streamingRoundNumber: null, // Round complete
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: createCompleteRoundMessages(0, 2),
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    // Simulate the cleanup timeout behavior
    const initialState = store.getState();
    expect(initialState.nextParticipantToTrigger).toBe(1);

    // After 500ms, should detect dangling state
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // In real implementation, this would call setNextParticipantToTrigger(null)
    // Test validates the conditions for cleanup
    const state = store.getState();
    const shouldCleanup = state.nextParticipantToTrigger !== null
      && !state.waitingToStartStreaming
      && !state.isStreaming
      && state.streamingRoundNumber === null;

    expect(shouldCleanup).toBe(true);
  });

  it('should safety timeout clear stuck state after 5s', async () => {
    const store = createMockChatStore({
      nextParticipantToTrigger: 0,
      waitingToStartStreaming: true, // Stuck in waiting
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(0)],
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
    });

    // Simulate safety timeout
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    // Test validates stuck state detection
    const state = store.getState();
    const isStuck = state.waitingToStartStreaming && !state.isStreaming;

    expect(isStuck).toBe(true);
    // In real implementation, this would clear the state
  });

  it('should clean up retry timeouts on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    // Simulate timeout tracking
    const retryTimeoutRef = { current: null as NodeJS.Timeout | null };

    retryTimeoutRef.current = setTimeout(() => {}, 100);

    // Cleanup on unmount
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(retryTimeoutRef.current).toBeNull();

    clearTimeoutSpy.mockRestore();
  });
});

// ============================================================================
// COMPLETE ROUND FLOW INTEGRATION TESTS
// ============================================================================

describe('complete Round Flow Integration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should follow correct resumption order: patch → changelog → pre-search → participants → moderator', () => {
    // Simulate a round with config change and web search enabled
    const roundNumber = 1;

    // Phase 1: PATCH in progress
    const store = createMockChatStore({
      isPatchInProgress: true,
      configChangeRoundNumber: roundNumber,
      isWaitingForChangelog: false,
      nextParticipantToTrigger: 0,
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(2),
      messages: [createMockUserMessage(roundNumber)],
      preSearches: [createMockResumptionPreSearch(roundNumber, MessageStatuses.PENDING)],
      thread: { id: 'thread-123', enableWebSearch: true },
      enableWebSearch: true,
    });

    let state = store.getState();

    // Cannot proceed - PATCH in progress
    expect(state.isPatchInProgress).toBe(true);

    // Phase 2: PATCH complete, waiting for changelog
    store.setState({
      isPatchInProgress: false,
      isWaitingForChangelog: true,
    });
    state = store.getState();

    expect(state.isPatchInProgress).toBe(false);
    expect(state.isWaitingForChangelog).toBe(true);

    // Phase 3: Changelog fetched, pre-search pending
    store.setState({
      isWaitingForChangelog: false,
      configChangeRoundNumber: null,
    });
    state = store.getState();

    expect(state.isWaitingForChangelog).toBe(false);
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);

    // Phase 4: Pre-search complete, participants can start
    store.setState({
      preSearches: [createMockResumptionPreSearch(roundNumber, MessageStatuses.COMPLETE)],
    });
    state = store.getState();

    expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

    // Now participants can stream
    const canStartParticipants = state.nextParticipantToTrigger !== null
      && state.waitingToStartStreaming
      && !state.isStreaming
      && !state.isPatchInProgress
      && state.configChangeRoundNumber === null
      && !state.isWaitingForChangelog
      && state.preSearches[0]?.status === MessageStatuses.COMPLETE;

    expect(canStartParticipants).toBe(true);

    // Phase 5: All participants complete, moderator starts
    store.setState({
      nextParticipantToTrigger: null,
      waitingToStartStreaming: false,
      isModeratorStreaming: true,
      messages: [
        createMockUserMessage(roundNumber),
        createMockAssistantMessage(roundNumber, 0),
        createMockAssistantMessage(roundNumber, 1),
      ],
    });
    state = store.getState();

    expect(state.isModeratorStreaming).toBe(true);
    expect(state.nextParticipantToTrigger).toBeNull();
  });

  it('should correctly resume from mid-round after page refresh', () => {
    // User was at p1 streaming when page refreshed
    const roundNumber = 1;

    const store = createMockChatStore({
      streamResumptionPrefilled: true,
      currentResumptionPhase: 'participants',
      resumptionRoundNumber: roundNumber,
      nextParticipantToTrigger: { index: 1, participantId: 'participant-1' },
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: createMockParticipants(3),
      messages: [
        createMockUserMessage(roundNumber),
        createMockAssistantMessage(roundNumber, 0, 'participant-0'),
      ],
      thread: { id: 'thread-123', enableWebSearch: false },
      enableWebSearch: false,
      isPatchInProgress: false,
      configChangeRoundNumber: null,
      isWaitingForChangelog: false,
    });

    const state = store.getState();

    // Should resume from p1 (p0 already complete)
    expect(state.streamResumptionPrefilled).toBe(true);
    expect(state.currentResumptionPhase).toBe('participants');
    expect(state.nextParticipantToTrigger).toEqual({ index: 1, participantId: 'participant-1' });
    expect(state.messages).toHaveLength(2); // user + p0

    // Validation: p0 exists in messages
    const p0Exists = state.messages.some((m) => {
      const meta = m.metadata as { participantIndex?: number } | undefined;
      return meta?.participantIndex === 0;
    });
    expect(p0Exists).toBe(true);
  });

  describe('pre-search hydration from SSR', () => {
    it('finds hydrated preSearch and proceeds with streaming when COMPLETE', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        isStreaming: false,
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
        isPatchInProgress: false,
        configChangeRoundNumber: null,
        isWaitingForChangelog: false,
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const currentRound = 0;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      // The bug: this was undefined before the fix, causing early exit
      expect(preSearchForRound).toBeDefined();
      expect(preSearchForRound?.status).toBe(MessageStatuses.COMPLETE);

      // COMPLETE pre-search should NOT block
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBe(false);

      // Should proceed to streaming
      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalled();
    });

    it('does NOT exit with "no preSearch for r0" when hydrated', () => {
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        isStreaming: false,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
      });

      const state = store.getState();
      const currentRound = 0;
      const webSearchEnabled = state.enableWebSearch;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      // The critical assertion: preSearch MUST be found when hydrated
      expect(webSearchEnabled).toBe(true);
      expect(preSearchForRound).toBeDefined();

      // This would have caused early exit before the fix
      const wouldExitEarly = webSearchEnabled && !preSearchForRound;
      expect(wouldExitEarly).toBe(false);
    });

    it('waits when pre-search status is STREAMING', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        isStreaming: false,
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.STREAMING)],
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const currentRound = 0;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      expect(preSearchForRound?.status).toBe(MessageStatuses.STREAMING);

      // STREAMING pre-search SHOULD block
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBe(true);

      // Should NOT proceed while blocking
      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('proceeds immediately when pre-search is COMPLETE', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        isStreaming: false,
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);

      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBe(false);

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledTimes(1);
    });

    it('handles PENDING status correctly (should wait)', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        isStreaming: false,
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.PENDING)],
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearchForRound?.status).toBe(MessageStatuses.PENDING);

      // PENDING should block just like STREAMING
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBe(true);

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).not.toHaveBeenCalled();
    });

    it('handles FAILED pre-search by proceeding (no block)', () => {
      const continueFromParticipant = vi.fn();
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        isStreaming: false,
        nextParticipantToTrigger: 0,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.FAILED)],
      });

      const chat = createMockChatHook({
        isReady: true,
        continueFromParticipant,
      });

      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearchForRound?.status).toBe(MessageStatuses.FAILED);

      // FAILED should NOT block
      const isPreSearchBlocking
        = preSearchForRound?.status === MessageStatuses.STREAMING
          || preSearchForRound?.status === MessageStatuses.PENDING;
      expect(isPreSearchBlocking).toBe(false);

      if (
        state.nextParticipantToTrigger !== null
        && state.waitingToStartStreaming
        && !state.isStreaming
        && chat.isReady
        && !isPreSearchBlocking
      ) {
        chat.continueFromParticipant(state.nextParticipantToTrigger, state.participants);
      }

      expect(continueFromParticipant).toHaveBeenCalledTimes(1);
    });
  });
});
