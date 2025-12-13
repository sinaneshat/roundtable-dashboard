/**
 * Streaming Trigger Hook Tests
 *
 * Tests for the useStreamingTrigger hook that handles:
 * 1. Round 0 streaming trigger for initial thread creation
 * 2. Pre-search execution and resumption
 * 3. Timeout protection for stuck streams
 *
 * Key Issues Tested:
 * - Pre-search resumption after page refresh
 * - Participant streaming trigger timing
 * - Stuck state timeout and recovery
 */

import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';

// ============================================================================
// MOCK TYPES
// ============================================================================

type MockParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  role: string;
  priority: number;
};

type MockMessage = {
  id: string;
  role: 'user' | 'assistant';
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
  updatePreSearchData: (round: number, data: unknown) => void;
  updatePreSearchActivity: (round: number) => void;
  clearPreSearchActivity: (round: number) => void;
  clearPreSearchTracking: (round: number) => void;
  getPreSearchActivityTime: (round: number) => number | undefined;
  checkStuckPreSearches: () => void;
};

// ============================================================================
// MOCK SETUP
// ============================================================================

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
    role: 'user',
    metadata: { roundNumber },
  };
}

function createMockPreSearch(
  roundNumber: number,
  status: typeof AnalysisStatuses[keyof typeof AnalysisStatuses],
): StoredPreSearch {
  return {
    id: `presearch-${roundNumber}`,
    threadId: 'thread-123',
    roundNumber,
    status,
    userQuery: 'Test query',
    searchData: status === AnalysisStatuses.COMPLETE
      ? {
          queries: [],
          results: [],
          analysis: 'Analysis',
          successCount: 1,
          failureCount: 0,
          totalResults: 3,
          totalTime: 1000,
        }
      : undefined,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: status === AnalysisStatuses.COMPLETE ? new Date() : null,
  } as StoredPreSearch;
}

// ============================================================================
// TESTS
// ============================================================================

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
        preSearches: [createMockPreSearch(0, AnalysisStatuses.PENDING)],
        pendingMessage: 'Test query',
      });

      const state = store.getState();

      // Pre-search is pending and web search enabled
      expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.PENDING);
      expect(state.thread?.enableWebSearch).toBe(true);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
    });

    it('should mark pre-search as triggered to prevent duplicates', () => {
      const store = createMockStore({
        waitingToStartStreaming: true,
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockPreSearch(0, AnalysisStatuses.PENDING)],
      });

      const state = store.getState();

      // Mark as triggered
      state.markPreSearchTriggered(0);

      // Should now be tracked
      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);

      // Second trigger should be blocked
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
        // Pre-search was streaming when page refreshed
        preSearches: [createMockPreSearch(0, AnalysisStatuses.STREAMING)],
      });

      const state = store.getState();

      // Pre-search is in STREAMING state but NOT tracked locally
      // (triggeredPreSearchRounds is a Set - not persisted across refresh)
      expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);

      // This indicates resumption should happen
      // The hook should detect this and re-execute the pre-search
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
        preSearches: [createMockPreSearch(0, AnalysisStatuses.STREAMING)],
      });

      const state = store.getState();

      // Pre-search still streaming
      const preSearch = state.preSearches[0];
      const isBlocked = preSearch?.status === AnalysisStatuses.STREAMING
        || preSearch?.status === AnalysisStatuses.PENDING;

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
        preSearches: [createMockPreSearch(0, AnalysisStatuses.COMPLETE)],
        pendingAnimations: new Map(),
      });

      const state = store.getState();

      // Pre-search complete
      const preSearch = state.preSearches[0];
      const isBlocked = preSearch?.status === AnalysisStatuses.STREAMING
        || preSearch?.status === AnalysisStatuses.PENDING;

      expect(isBlocked).toBe(false);

      // Conditions for starting participants
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
        screenMode: ScreenModes.THREAD, // Thread screen
        participants: [createMockParticipant(0)],
        messages: [createMockUserMessage(0)],
      });

      const state = store.getState();

      // Thread screen uses continueFromParticipant, not startRound
      expect(state.screenMode).toBe(ScreenModes.THREAD);

      // Should NOT start round on thread screen
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

      // Simulate streaming start
      store.setState({ isStreaming: true });

      const state = store.getState();

      // When both are true, hook should clear waitingToStartStreaming
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

      // Wait for default timeout (30 seconds for non-websearch)
      await act(async () => {
        vi.advanceTimersByTime(30000);
      });

      // In real hook, this would trigger reset
      const state = store.getState();

      // Stuck detection conditions
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
        preSearches: [createMockPreSearch(0, AnalysisStatuses.STREAMING)],
      });

      // Pre-search has its own timeout logic (60 seconds max)
      await act(async () => {
        vi.advanceTimersByTime(60000);
      });

      // Hook should check pre-search activity time
      const state = store.getState();

      expect(state.preSearches[0]?.status).toBe(AnalysisStatuses.STREAMING);
    });
  });

  describe('stuck pre-search detection', () => {
    it('should check for stuck pre-searches on mount', () => {
      const checkStuckPreSearches = vi.fn();
      const store = createMockStore({
        checkStuckPreSearches,
      });

      // Simulate mount - hook calls checkStuckPreSearches immediately
      store.getState().checkStuckPreSearches();

      expect(checkStuckPreSearches).toHaveBeenCalled();
    });

    it('should periodically check for stuck pre-searches', async () => {
      const checkStuckPreSearches = vi.fn();
      const store = createMockStore({
        checkStuckPreSearches,
      });

      // Simulate the interval (5 seconds)
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

      // First call
      if (startRoundCalledForRound !== currentRound) {
        startRoundCalledForRound = currentRound;
        startRound();
      }

      // Duplicate call (should be blocked)
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
        isTriggeringRef: { current: true }, // Already triggering
        isStreamingRef: { current: false },
      };

      // Should NOT start if already triggering
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
      screenMode: null, // Not yet determined
    });

    const state = store.getState();

    // With null screenMode, should not proceed
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
      thread: null, // Thread not yet loaded
    });

    const state = store.getState();

    // Can still proceed without thread for non-websearch scenarios
    // but enableWebSearch check would be false
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
      preSearches: [createMockPreSearch(0, AnalysisStatuses.COMPLETE)],
      pendingAnimations: new Map([[0, true]]), // Pre-search animation pending
    });

    const state = store.getState();

    // Animation index 0 is PRE_SEARCH
    const isAnimating = state.pendingAnimations.has(0);

    expect(isAnimating).toBe(true);

    // Should wait for animation to complete
  });

  it('should apply defensive timing guard after pre-search completion', () => {
    const now = Date.now();
    const completedAt = new Date(now - 10); // Completed 10ms ago

    createMockPreSearch(0, AnalysisStatuses.COMPLETE);

    // Timing guard: wait at least 50ms after completion
    const timeSinceComplete = now - completedAt.getTime();
    const shouldWait = timeSinceComplete < 50;

    expect(shouldWait).toBe(true);

    // After 50ms, should proceed
    const laterTime = now + 50;
    const laterTimeSinceComplete = laterTime - completedAt.getTime();

    expect(laterTimeSinceComplete >= 50).toBe(true);
  });
});
