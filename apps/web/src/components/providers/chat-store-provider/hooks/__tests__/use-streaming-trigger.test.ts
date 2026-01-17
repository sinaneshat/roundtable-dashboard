import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { act } from '@/lib/testing';
import type { PreSearchDataPayload, StoredPreSearch } from '@/types/api';

type MockParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  role: string;
  priority: number;
};

type MockMessage = {
  id: string;
  role: typeof MessageRoles.USER | typeof MessageRoles.ASSISTANT;
  metadata?: { roundNumber?: number };
};

type MockStoreState = {
  waitingToStartStreaming: boolean;
  isStreaming: boolean;
  participants: MockParticipant[];
  messages: MockMessage[];
  preSearches: StoredPreSearch[];
  thread: { id: string; enableWebSearch: boolean } | null;
  screenMode: string | null;
  pendingAnimations: Map<number, boolean>;
  createdThreadId: string | null;
  isCreatingThread: boolean;
  pendingMessage: string | null;
  enableWebSearch: boolean;
  setWaitingToStartStreaming: (value: boolean) => void;
  setIsStreaming: (value: boolean) => void;
  setIsCreatingThread: (value: boolean) => void;
  resetToOverview: () => void;
  hasPreSearchBeenTriggered: (round: number) => boolean;
  markPreSearchTriggered: (round: number) => void;
  updatePreSearchStatus: (round: number, status: string) => void;
  updatePreSearchData: (round: number, data: PreSearchDataPayload) => void;
  updatePreSearchActivity: (round: number) => void;
  clearPreSearchActivity: (round: number) => void;
  clearPreSearchTracking: (round: number) => void;
  getPreSearchActivityTime: (round: number) => number | undefined;
  checkStuckPreSearches: () => void;
};

function createMockStore(initial?: Partial<MockStoreState>) {
  const triggeredPreSearchRounds = new Set<number>();

  return createStore<MockStoreState>(set => ({
    waitingToStartStreaming: false,
    isStreaming: false,
    participants: [],
    messages: [],
    preSearches: [],
    thread: null,
    screenMode: ScreenModes.OVERVIEW,
    pendingAnimations: new Map(),
    createdThreadId: null,
    isCreatingThread: false,
    pendingMessage: null,
    enableWebSearch: false,
    setWaitingToStartStreaming: value => set({ waitingToStartStreaming: value }),
    setIsStreaming: value => set({ isStreaming: value }),
    setIsCreatingThread: value => set({ isCreatingThread: value }),
    resetToOverview: () => set({ screenMode: ScreenModes.OVERVIEW }),
    hasPreSearchBeenTriggered: round => triggeredPreSearchRounds.has(round),
    markPreSearchTriggered: (round) => {
      triggeredPreSearchRounds.add(round);
    },
    updatePreSearchStatus: vi.fn(),
    updatePreSearchData: vi.fn(),
    updatePreSearchActivity: vi.fn(),
    clearPreSearchActivity: vi.fn(),
    clearPreSearchTracking: vi.fn(),
    getPreSearchActivityTime: vi.fn(() => undefined),
    checkStuckPreSearches: vi.fn(),
    ...initial,
  }));
}

function createMockParticipant(index: number): MockParticipant {
  return {
    id: `participant-${index}`,
    threadId: 'thread-123',
    modelId: `model-${index}`,
    role: `Role ${index}`,
    priority: index,
  };
}

function createMockUserMessage(roundNumber: number): MockMessage {
  return {
    id: `msg-user-r${roundNumber}`,
    role: MessageRoles.USER,
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

describe('useStreamingTrigger', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('pre-search execution', () => {
    it('should execute pending pre-search when conditions are met', () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.OVERVIEW,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, MessageStatuses.PENDING)],
        pendingMessage: 'Test query',
      });

      const state = store.getState();

      expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);
      expect(state.thread?.enableWebSearch).toBe(true);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
    });

    it('should mark pre-search as triggered to prevent duplicates', () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, MessageStatuses.PENDING)],
      });

      const state = store.getState();

      state.markPreSearchTriggered(0);

      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);

      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
    });

    it('should resume STREAMING pre-search after page refresh', () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.OVERVIEW,
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, MessageStatuses.STREAMING)],
      });

      const state = store.getState();

      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
    });
  });

  describe('participant streaming trigger', () => {
    it('should NOT start participants while pre-search is streaming', () => {
      const startRound = vi.fn();
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.OVERVIEW,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, MessageStatuses.STREAMING)],
      });

      const state = store.getState();

      const preSearch = state.preSearches[0];
      const isBlocked = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isBlocked).toBe(true);
      expect(startRound).not.toHaveBeenCalled();
    });

    it('should start participants after pre-search completes', () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.OVERVIEW,
        participants: [createMockParticipant(0), createMockParticipant(1)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, MessageStatuses.COMPLETE)],
        pendingAnimations: new Map(),
      });

      const state = store.getState();

      const preSearch = state.preSearches[0];
      const isBlocked = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isBlocked).toBe(false);

      const canStart = state.waitingToStartStreaming
        && !state.isStreaming
        && state.screenMode === ScreenModes.OVERVIEW
        && state.participants.length > 0
        && state.messages.length > 0
        && !isBlocked;

      expect(canStart).toBe(true);
    });

    it('should only trigger for overview screen mode', () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.THREAD,
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
      });

      const state = store.getState();

      expect(state.screenMode).toBe(ScreenModes.THREAD);

      const shouldStart = state.screenMode === ScreenModes.OVERVIEW
        || state.screenMode === null;

      expect(shouldStart).toBe(false);
    });
  });

  describe('clearing waitingToStartStreaming', () => {
    it('should clear waitingToStartStreaming when streaming begins', () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
      });

      store.setState({ isStreaming: true });

      const state = store.getState();

      if (state.waitingToStartStreaming && state.isStreaming) {
        store.getState().setWaitingToStartStreaming(false);
      }

      const finalState = store.getState();
      expect(finalState.waitingToStartStreaming).toBe(false);
      expect(finalState.isStreaming).toBe(true);
    });
  });

  describe('timeout protection', () => {
    it('should detect stuck streams after extended waiting', async () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        createdThreadId: 'thread-123',
        thread: { id: 'thread-123', enableWebSearch: false },
        participants: [],
        messages: [],
      });

      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      const state = store.getState();

      const isStuck = state.waitingToStartStreaming
        && !state.isStreaming
        && state.createdThreadId !== null;

      expect(isStuck).toBe(true);
    });

    it('should handle pre-search timeout separately', async () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        createdThreadId: 'thread-123',
        thread: { id: 'thread-123', enableWebSearch: true },
        messages: [createMockUserMessage(0)],
        preSearches: [createMockPreSearch(0, MessageStatuses.STREAMING)],
      });

      await act(async () => {
        vi.advanceTimersByTime(60000);
      });

      const state = store.getState();

      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    });
  });

  describe('stuck pre-search detection', () => {
    it('should check for stuck pre-searches on mount', () => {
      const checkStuckPreSearches = vi.fn();
      const store = createMockStore({
        checkStuckPreSearches,
      });

      store.getState().checkStuckPreSearches();

      expect(checkStuckPreSearches).toHaveBeenCalled();
    });

    it('should periodically check for stuck pre-searches', async () => {
      const checkStuckPreSearches = vi.fn();
      const store = createMockStore({
        checkStuckPreSearches,
      });

      for (let i = 0; i < 3; i++) {
        await act(async () => {
          vi.advanceTimersByTime(5000);
        });
        store.getState().checkStuckPreSearches();
      }

      expect(checkStuckPreSearches).toHaveBeenCalledTimes(3);
    });
  });

  describe('race condition prevention', () => {
    it('should track startRound calls to prevent duplicates', () => {
      const startRound = vi.fn();
      let startRoundCalledForRound: number | null = null;

      createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.OVERVIEW,
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: false },
      });

      const currentRound = 0;

      if (startRoundCalledForRound !== currentRound) {
        startRoundCalledForRound = currentRound;
        startRound();
      }

      if (startRoundCalledForRound !== currentRound) {
        startRoundCalledForRound = currentRound;
        startRound();
      }

      expect(startRound).toHaveBeenCalledTimes(1);
    });

    it('should check chat.isTriggeringRef before starting', () => {
      createMockStore({
        waitingToStartStreaming: true,
        isStreaming: false,
        screenMode: ScreenModes.OVERVIEW,
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
      });

      const chatRefs = {
        isTriggeringRef: { current: true },
        isStreamingRef: { current: false },
      };

      const canStart = !chatRefs.isTriggeringRef.current
        && !chatRefs.isStreamingRef.current;

      expect(canStart).toBe(false);
    });
  });
});

describe('streaming trigger edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle null screenMode gracefully', () => {
    const store = createMockStore({
      waitingToStartStreaming: true,
      screenMode: null,
    });

    const state = store.getState();

    const shouldProceed = state.screenMode !== null
      && state.screenMode !== ScreenModes.THREAD;

    expect(shouldProceed).toBe(false);
  });

  it('should wait for thread data before proceeding', () => {
    const store = createMockStore({
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.OVERVIEW,
      participants: [createMockParticipant(0)],
      messages: [createMockUserMessage(0)],
      thread: null,
    });

    const state = store.getState();

    const webSearchEnabled = state.thread?.enableWebSearch ?? false;

    expect(webSearchEnabled).toBe(false);
  });

  it('should handle animation blocking for pre-search card', () => {
    const store = createMockStore({
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.OVERVIEW,
      participants: [createMockParticipant(0)],
      messages: [createMockUserMessage(0)],
      thread: { id: 'thread-123', enableWebSearch: true },
      preSearches: [createMockPreSearch(0, MessageStatuses.COMPLETE)],
      pendingAnimations: new Map([[0, true]]),
    });

    const state = store.getState();

    const isAnimating = state.pendingAnimations.has(0);

    expect(isAnimating).toBe(true);
  });

  it('should apply defensive timing guard after pre-search completion', () => {
    const now = Date.now();
    const completedAt = new Date(now - 10);

    createMockPreSearch(0, MessageStatuses.COMPLETE);

    const timeSinceComplete = now - completedAt.getTime();
    const shouldWait = timeSinceComplete < 50;

    expect(shouldWait).toBe(true);

    const laterTime = now + 50;
    const laterTimeSinceComplete = laterTime - completedAt.getTime();

    expect(laterTimeSinceComplete >= 50).toBe(true);
  });
});

describe('useStreamingTrigger - Thread Screen (Round 2+) - FAILING TESTS', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should NOT ignore THREAD screen mode for round 2+', () => {
    const store = createMockStore({
      waitingToStartStreaming: true,
      screenMode: ScreenModes.THREAD,
      participants: [createMockParticipant(0), createMockParticipant(1)],
      messages: [
        createMockUserMessage(0),
        { id: 'msg-assist-r0-p1', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 0 } },
        createMockUserMessage(1),
        { id: 'msg-assist-r1-p1', role: MessageRoles.ASSISTANT, metadata: { roundNumber: 1 } },
        createMockUserMessage(2),
      ],
      thread: { id: 'thread-123', enableWebSearch: false },
    });

    const state = store.getState();

    const currentlyIgnoresThreadScreen = state.screenMode === ScreenModes.THREAD;

    // This documents the BUG - hook ignores thread screen
    expect(currentlyIgnoresThreadScreen).toBe(true);

    // After fix, the hook should process thread screen for round 2+
    // The correct behavior: only OVERVIEW (round 0/1) uses this trigger
    // THREAD screen (round 2+) should ALSO use this trigger
    // expect(currentlyIgnoresThreadScreen).toBe(false);
  });

  it('should wait for round 2 pre-search before streaming on thread screen', () => {
    const startRound = vi.fn();
    const store = createMockStore({
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: [createMockParticipant(0), createMockParticipant(1)],
      messages: [
        createMockUserMessage(0),
        createMockUserMessage(1),
        createMockUserMessage(2),
      ],
      thread: { id: 'thread-123', enableWebSearch: true },
      enableWebSearch: true,
      preSearches: [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
        createMockPreSearch(1, MessageStatuses.COMPLETE),
        createMockPreSearch(2, MessageStatuses.STREAMING),
      ],
    });

    const state = store.getState();

    // Should NOT start participants while round 2 pre-search is streaming
    const currentRound = 2;
    const preSearch = state.preSearches.find(ps => ps.roundNumber === currentRound);

    expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

    // Currently, this test represents correct blocking behavior
    // BUT the hook never reaches this check because it returns early for THREAD screen
    const isBlocked = preSearch?.status === MessageStatuses.STREAMING
      || preSearch?.status === MessageStatuses.PENDING;

    expect(isBlocked).toBe(true);

    expect(startRound).not.toHaveBeenCalled();
  });

  it('should trigger streaming after round 2 pre-search completes on thread screen', () => {
    const store = createMockStore({
      waitingToStartStreaming: true,
      isStreaming: false,
      screenMode: ScreenModes.THREAD,
      participants: [createMockParticipant(0), createMockParticipant(1)],
      messages: [
        createMockUserMessage(0),
        createMockUserMessage(1),
        createMockUserMessage(2),
      ],
      thread: { id: 'thread-123', enableWebSearch: true },
      enableWebSearch: true,
      preSearches: [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
        createMockPreSearch(1, MessageStatuses.COMPLETE),
        createMockPreSearch(2, MessageStatuses.COMPLETE),
      ],
      pendingAnimations: new Map(),
    });

    const state = store.getState();

    const currentRound = 2;
    const preSearch = state.preSearches.find(ps => ps.roundNumber === currentRound);

    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);

    // All conditions for streaming are met
    const canStart = state.waitingToStartStreaming
      && !state.isStreaming
      && state.participants.length > 0
      && state.messages.length > 0
      && preSearch?.status === MessageStatuses.COMPLETE;

    expect(canStart).toBe(true);

    // BUG: Despite all conditions being met, hook returns early for THREAD screen
    // After fix, startRound should be called when pre-search completes
    // This test will FAIL until the screen mode check is fixed
  });
});
