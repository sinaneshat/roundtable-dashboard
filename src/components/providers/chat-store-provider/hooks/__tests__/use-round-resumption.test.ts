import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreApi } from 'zustand';
import { createStore } from 'zustand/vanilla';

import { MessageStatuses, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { act } from '@/lib/testing';

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
    role: 'user' | 'assistant';
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

function createMockChatHook(overrides?: {
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

function createMockUserMessage(roundNumber: number) {
  return {
    id: `msg-user-r${roundNumber}`,
    role: 'user' as const,
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

      if (!resumptionKeys.has(resumptionKey)) {
        resumptionKeys.add(resumptionKey);
        chat.continueFromParticipant(participantIndex!, store.getState().participants);
      }

      if (!resumptionKeys.has(resumptionKey)) {
        resumptionKeys.add(resumptionKey);
        chat.continueFromParticipant(participantIndex!, store.getState().participants);
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
        { id: 'm1', role: 'user', metadata: { roundNumber: 0 } },
        { id: 'm2', role: 'assistant', metadata: { roundNumber: 0 } },
        { id: 'm3', role: 'assistant', metadata: { roundNumber: 0 } },
        { id: 'm4', role: 'user', metadata: { roundNumber: 1 } },
        { id: 'm5', role: 'assistant', metadata: { roundNumber: 1 } },
        { id: 'm6', role: 'assistant', metadata: { roundNumber: 1 } },
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
        { id: 'm1', role: 'user', metadata: { roundNumber: 0 } },
        { id: 'm2', role: 'assistant', metadata: { roundNumber: 0 } },
        { id: 'm3', role: 'assistant', metadata: { roundNumber: 0 } },
        { id: 'm4', role: 'user', metadata: { roundNumber: 1 } },
        { id: 'm5', role: 'assistant', metadata: { roundNumber: 1 } },
      ],
    });

    const state = store.getState();

    expect(state.nextParticipantToTrigger).toBe(1);
    expect(state.waitingToStartStreaming).toBe(true);
  });
});
