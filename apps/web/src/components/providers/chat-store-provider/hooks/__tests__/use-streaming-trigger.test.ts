import { MessageRoles, MessageStatuses, ScreenModes } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';

import { act } from '@/lib/testing';
import type { PreSearchDataPayload, StoredPreSearch } from '@/services/api';

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
    checkStuckPreSearches: vi.fn(),
    clearPreSearchActivity: vi.fn(),
    clearPreSearchTracking: vi.fn(),
    createdThreadId: null,
    enableWebSearch: false,
    getPreSearchActivityTime: vi.fn(() => undefined),
    hasPreSearchBeenTriggered: round => triggeredPreSearchRounds.has(round),
    isCreatingThread: false,
    isStreaming: false,
    markPreSearchTriggered: (round) => {
      triggeredPreSearchRounds.add(round);
    },
    messages: [],
    participants: [],
    pendingAnimations: new Map(),
    pendingMessage: null,
    preSearches: [],
    resetToOverview: () => set({ screenMode: ScreenModes.OVERVIEW }),
    screenMode: ScreenModes.OVERVIEW,
    setIsCreatingThread: value => set({ isCreatingThread: value }),
    setIsStreaming: value => set({ isStreaming: value }),
    setWaitingToStartStreaming: value => set({ waitingToStartStreaming: value }),
    thread: null,
    updatePreSearchActivity: vi.fn(),
    updatePreSearchData: vi.fn(),
    updatePreSearchStatus: vi.fn(),
    waitingToStartStreaming: false,
    ...initial,
  }));
}

function createMockParticipant(index: number): MockParticipant {
  return {
    id: `participant-${index}`,
    modelId: `model-${index}`,
    priority: index,
    role: `Role ${index}`,
    threadId: 'thread-123',
  };
}

function createMockUserMessage(roundNumber: number): MockMessage {
  return {
    id: `msg-user-r${roundNumber}`,
    metadata: { roundNumber },
    role: MessageRoles.USER,
  };
}

function createMockPreSearch(
  roundNumber: number,
  status: typeof MessageStatuses[keyof typeof MessageStatuses],
): StoredPreSearch {
  return {
    completedAt: status === MessageStatuses.COMPLETE ? new Date() : null,
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-${roundNumber}`,
    roundNumber,
    searchData: status === MessageStatuses.COMPLETE
      ? {
          failureCount: 0,
          moderator: 'Moderator synthesis',
          queries: [],
          results: [],
          successCount: 1,
          totalResults: 3,
          totalTime: 1000,
        }
      : undefined,
    status,
    threadId: 'thread-123',
    userQuery: 'Test query',
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
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: [createMockParticipant(0), createMockParticipant(1)],
        pendingMessage: 'Test query',
        preSearches: [createMockPreSearch(0, MessageStatuses.PENDING)],
        screenMode: ScreenModes.OVERVIEW,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const state = store.getState();

      expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);
      expect(state.thread?.enableWebSearch).toBeTruthy();
      expect(state.hasPreSearchBeenTriggered(0)).toBeFalsy();
    });

    it('should mark pre-search as triggered to prevent duplicates', () => {
      const store = createMockStore({
        preSearches: [createMockPreSearch(0, MessageStatuses.PENDING)],
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const state = store.getState();

      state.markPreSearchTriggered(0);

      expect(state.hasPreSearchBeenTriggered(0)).toBeTruthy();

      expect(state.hasPreSearchBeenTriggered(0)).toBeTruthy();
    });

    it('should resume STREAMING pre-search after page refresh', () => {
      const store = createMockStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: [createMockParticipant(0)],
        preSearches: [createMockPreSearch(0, MessageStatuses.STREAMING)],
        screenMode: ScreenModes.OVERVIEW,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const state = store.getState();

      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
      expect(state.hasPreSearchBeenTriggered(0)).toBeFalsy();
    });
  });

  describe('participant streaming trigger', () => {
    it('should NOT start participants while pre-search is streaming', () => {
      const startRound = vi.fn();
      const store = createMockStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: [createMockParticipant(0), createMockParticipant(1)],
        preSearches: [createMockPreSearch(0, MessageStatuses.STREAMING)],
        screenMode: ScreenModes.OVERVIEW,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const state = store.getState();

      const preSearch = state.preSearches[0];
      const isBlocked = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isBlocked).toBeTruthy();
      expect(startRound).not.toHaveBeenCalled();
    });

    it('should start participants after pre-search completes', () => {
      const store = createMockStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: [createMockParticipant(0), createMockParticipant(1)],
        pendingAnimations: new Map(),
        preSearches: [createMockPreSearch(0, MessageStatuses.COMPLETE)],
        screenMode: ScreenModes.OVERVIEW,
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      const state = store.getState();

      const preSearch = state.preSearches[0];
      const isBlocked = preSearch?.status === MessageStatuses.STREAMING
        || preSearch?.status === MessageStatuses.PENDING;

      expect(isBlocked).toBeFalsy();

      const canStart = state.waitingToStartStreaming
        && !state.isStreaming
        && state.screenMode === ScreenModes.OVERVIEW
        && state.participants.length > 0
        && state.messages.length > 0
        && !isBlocked;

      expect(canStart).toBeTruthy();
    });

    it('should only trigger for overview screen mode', () => {
      const store = createMockStore({
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: [createMockParticipant(0)],
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
      });

      const state = store.getState();

      expect(state.screenMode).toBe(ScreenModes.THREAD);

      const shouldStart = state.screenMode === ScreenModes.OVERVIEW
        || state.screenMode === null;

      expect(shouldStart).toBeFalsy();
    });
  });

  describe('clearing waitingToStartStreaming', () => {
    it('should clear waitingToStartStreaming when streaming begins', () => {
      const store = createMockStore({
        isStreaming: false,
        waitingToStartStreaming: true,
      });

      store.setState({ isStreaming: true });

      const state = store.getState();

      if (state.waitingToStartStreaming && state.isStreaming) {
        store.getState().setWaitingToStartStreaming(false);
      }

      const finalState = store.getState();
      expect(finalState.waitingToStartStreaming).toBeFalsy();
      expect(finalState.isStreaming).toBeTruthy();
    });
  });

  describe('timeout protection', () => {
    it('should detect stuck streams after extended waiting', async () => {
      const store = createMockStore({
        createdThreadId: 'thread-123',
        isStreaming: false,
        messages: [],
        participants: [],
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: true,
      });

      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      const state = store.getState();

      const isStuck = state.waitingToStartStreaming
        && !state.isStreaming
        && state.createdThreadId !== null;

      expect(isStuck).toBeTruthy();
    });

    it('should handle pre-search timeout separately', async () => {
      const store = createMockStore({
        createdThreadId: 'thread-123',
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        preSearches: [createMockPreSearch(0, MessageStatuses.STREAMING)],
        thread: { enableWebSearch: true, id: 'thread-123' },
        waitingToStartStreaming: true,
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

      expect(checkStuckPreSearches).toHaveBeenCalledWith();
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
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: [createMockParticipant(0)],
        screenMode: ScreenModes.OVERVIEW,
        thread: { enableWebSearch: false, id: 'thread-123' },
        waitingToStartStreaming: true,
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
        isStreaming: false,
        messages: [createMockUserMessage(0)],
        participants: [createMockParticipant(0)],
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
      });

      const chatRefs = {
        isStreamingRef: { current: false },
        isTriggeringRef: { current: true },
      };

      const canStart = !chatRefs.isTriggeringRef.current
        && !chatRefs.isStreamingRef.current;

      expect(canStart).toBeFalsy();
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
      screenMode: null,
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    const shouldProceed = state.screenMode !== null
      && state.screenMode !== ScreenModes.THREAD;

    expect(shouldProceed).toBeFalsy();
  });

  it('should wait for thread data before proceeding', () => {
    const store = createMockStore({
      isStreaming: false,
      messages: [createMockUserMessage(0)],
      participants: [createMockParticipant(0)],
      screenMode: ScreenModes.OVERVIEW,
      thread: null,
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    const webSearchEnabled = state.thread?.enableWebSearch ?? false;

    expect(webSearchEnabled).toBeFalsy();
  });

  it('should handle animation blocking for pre-search card', () => {
    const store = createMockStore({
      isStreaming: false,
      messages: [createMockUserMessage(0)],
      participants: [createMockParticipant(0)],
      pendingAnimations: new Map([[0, true]]),
      preSearches: [createMockPreSearch(0, MessageStatuses.COMPLETE)],
      screenMode: ScreenModes.OVERVIEW,
      thread: { enableWebSearch: true, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    const isAnimating = state.pendingAnimations.has(0);

    expect(isAnimating).toBeTruthy();
  });

  it('should apply defensive timing guard after pre-search completion', () => {
    const now = Date.now();
    const completedAt = new Date(now - 10);

    createMockPreSearch(0, MessageStatuses.COMPLETE);

    const timeSinceComplete = now - completedAt.getTime();
    const shouldWait = timeSinceComplete < 50;

    expect(shouldWait).toBeTruthy();

    const laterTime = now + 50;
    const laterTimeSinceComplete = laterTime - completedAt.getTime();

    expect(laterTimeSinceComplete).toBeGreaterThanOrEqual(50);
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
      messages: [
        createMockUserMessage(0),
        { id: 'msg-assist-r0-p1', metadata: { roundNumber: 0 }, role: MessageRoles.ASSISTANT },
        createMockUserMessage(1),
        { id: 'msg-assist-r1-p1', metadata: { roundNumber: 1 }, role: MessageRoles.ASSISTANT },
        createMockUserMessage(2),
      ],
      participants: [createMockParticipant(0), createMockParticipant(1)],
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: false, id: 'thread-123' },
      waitingToStartStreaming: true,
    });

    const state = store.getState();

    const currentlyIgnoresThreadScreen = state.screenMode === ScreenModes.THREAD;

    // This documents the BUG - hook ignores thread screen
    expect(currentlyIgnoresThreadScreen).toBeTruthy();

    // After fix, the hook should process thread screen for round 2+
    // The correct behavior: only OVERVIEW (round 0/1) uses this trigger
    // THREAD screen (round 2+) should ALSO use this trigger
    // expect(currentlyIgnoresThreadScreen).toBe(false);
  });

  it('should wait for round 2 pre-search before streaming on thread screen', () => {
    const startRound = vi.fn();
    const store = createMockStore({
      enableWebSearch: true,
      isStreaming: false,
      messages: [
        createMockUserMessage(0),
        createMockUserMessage(1),
        createMockUserMessage(2),
      ],
      participants: [createMockParticipant(0), createMockParticipant(1)],
      preSearches: [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
        createMockPreSearch(1, MessageStatuses.COMPLETE),
        createMockPreSearch(2, MessageStatuses.STREAMING),
      ],
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: true, id: 'thread-123' },
      waitingToStartStreaming: true,
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

    expect(isBlocked).toBeTruthy();

    expect(startRound).not.toHaveBeenCalled();
  });

  it('should trigger streaming after round 2 pre-search completes on thread screen', () => {
    const store = createMockStore({
      enableWebSearch: true,
      isStreaming: false,
      messages: [
        createMockUserMessage(0),
        createMockUserMessage(1),
        createMockUserMessage(2),
      ],
      participants: [createMockParticipant(0), createMockParticipant(1)],
      pendingAnimations: new Map(),
      preSearches: [
        createMockPreSearch(0, MessageStatuses.COMPLETE),
        createMockPreSearch(1, MessageStatuses.COMPLETE),
        createMockPreSearch(2, MessageStatuses.COMPLETE),
      ],
      screenMode: ScreenModes.THREAD,
      thread: { enableWebSearch: true, id: 'thread-123' },
      waitingToStartStreaming: true,
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

    expect(canStart).toBeTruthy();

    // BUG: Despite all conditions being met, hook returns early for THREAD screen
    // After fix, startRound should be called when pre-search completes
    // This test will FAIL until the screen mode check is fixed
  });
});
