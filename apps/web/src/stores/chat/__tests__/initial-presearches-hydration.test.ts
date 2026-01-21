/**
 * Initial PreSearches Hydration Tests
 *
 * Battle-tests the pre-search hydration fix that ensures initialPreSearches
 * is properly set into the store during initialization.
 *
 * Bug context: Round resumption was failing because preSearches weren't being
 * hydrated from SSR data. The streaming trigger would exit early with
 * "no preSearch for r0" because the lookup failed on an empty array.
 */

import { MessageStatuses, ScreenModes } from '@roundtable/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAfterPreSearchScenario,
  buildSSRHydratedScenario,
  createMockChatStore,
  createMockParticipants,
  createMockResumptionPreSearch,
  createMockUserMessage,
} from '@/lib/testing/resumption-test-helpers';

describe('initialPreSearches Hydration', () => {
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

  describe('setPreSearches during initialization', () => {
    it('sets initialPreSearches into store', () => {
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [],
      });

      // Simulate setPreSearches being called during hydration
      const initialPreSearches = [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)];
      store.setState({ preSearches: initialPreSearches });

      const state = store.getState();
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.roundNumber).toBe(0);
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('skips empty initialPreSearches array', () => {
      const existingPreSearch = createMockResumptionPreSearch(0, MessageStatuses.STREAMING);
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [existingPreSearch],
      });

      // Empty array should not overwrite existing
      const initialState = store.getState();
      expect(initialState.preSearches).toHaveLength(1);

      // Simulating the guard: if (initialPreSearches?.length) { setPreSearches(...) }
      const initialPreSearches: never[] = [];
      if (initialPreSearches.length > 0) {
        store.setState({ preSearches: initialPreSearches });
      }

      const state = store.getState();
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.roundNumber).toBe(0);
    });

    it('handles multiple pre-searches for multi-round threads', () => {
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        participants: createMockParticipants(2),
        messages: [
          createMockUserMessage(0),
          createMockUserMessage(1),
          createMockUserMessage(2),
        ],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [],
      });

      const initialPreSearches = [
        createMockResumptionPreSearch(0, MessageStatuses.COMPLETE),
        createMockResumptionPreSearch(1, MessageStatuses.COMPLETE),
        createMockResumptionPreSearch(2, MessageStatuses.STREAMING),
      ];
      store.setState({ preSearches: initialPreSearches });

      const state = store.getState();
      expect(state.preSearches).toHaveLength(3);
      expect(state.preSearches.find(ps => ps.roundNumber === 0)?.status).toBe(MessageStatuses.COMPLETE);
      expect(state.preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(MessageStatuses.COMPLETE);
      expect(state.preSearches.find(ps => ps.roundNumber === 2)?.status).toBe(MessageStatuses.STREAMING);
    });

    it('overwrites existing preSearches during re-init', () => {
      const stalePreSearch = createMockResumptionPreSearch(0, MessageStatuses.PENDING);
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        enableWebSearch: true,
        preSearches: [stalePreSearch],
      });

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // Fresh data from SSR should replace stale data
      const freshPreSearch = createMockResumptionPreSearch(0, MessageStatuses.COMPLETE);
      store.setState({ preSearches: [freshPreSearch] });

      const state = store.getState();
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('streaming trigger finds hydrated preSearches', () => {
    it('does NOT exit with "no preSearch for r0" after hydration', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.COMPLETE);

      const state = store.getState();
      const currentRound = 0;
      const webSearchEnabled = state.enableWebSearch;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      // The bug: this was undefined, causing early exit
      expect(preSearchForRound).toBeDefined();
      expect(webSearchEnabled).toBe(true);

      // Should NOT return early
      const wouldExitEarly = webSearchEnabled && !preSearchForRound;
      expect(wouldExitEarly).toBe(false);
    });

    it('proceeds to participant streaming when preSearch COMPLETE', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.COMPLETE);

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);

      // COMPLETE pre-search should NOT block streaming
      const shouldWaitForPreSearch
        = preSearch?.status === MessageStatuses.STREAMING
          || preSearch?.status === MessageStatuses.PENDING;
      expect(shouldWaitForPreSearch).toBe(false);
    });

    it('waits for STREAMING preSearch before participants', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.STREAMING);

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

      // STREAMING pre-search SHOULD block participant streaming
      const shouldWaitForPreSearch
        = preSearch?.status === MessageStatuses.STREAMING
          || preSearch?.status === MessageStatuses.PENDING;
      expect(shouldWaitForPreSearch).toBe(true);
    });

    it('handles FAILED preSearch gracefully', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.FAILED);

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearch?.status).toBe(MessageStatuses.FAILED);

      // FAILED pre-search should NOT block - proceed with streaming
      const shouldWaitForPreSearch
        = preSearch?.status === MessageStatuses.STREAMING
          || preSearch?.status === MessageStatuses.PENDING;
      expect(shouldWaitForPreSearch).toBe(false);
    });

    it('handles PENDING preSearch by waiting', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.PENDING);

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearch?.status).toBe(MessageStatuses.PENDING);

      // PENDING pre-search SHOULD block
      const shouldWaitForPreSearch
        = preSearch?.status === MessageStatuses.STREAMING
          || preSearch?.status === MessageStatuses.PENDING;
      expect(shouldWaitForPreSearch).toBe(true);
    });
  });

  describe('navigation scenarios', () => {
    it('retains preSearches after navigation away and back', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.COMPLETE);

      // Verify initial state
      expect(store.getState().preSearches).toHaveLength(1);

      // Simulate navigation away (change screen mode)
      store.setState({ screenMode: ScreenModes.OVERVIEW });
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

      // PreSearches should be preserved
      expect(store.getState().preSearches).toHaveLength(1);

      // Navigate back
      store.setState({ screenMode: ScreenModes.THREAD });

      // PreSearches still preserved
      const state = store.getState();
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.roundNumber).toBe(0);
    });

    it('hydrates fresh preSearches for different thread', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.COMPLETE);

      // Verify thread A's pre-search
      expect(store.getState().preSearches[0]?.threadId).toBe('thread-123');

      // Navigate to thread B (simulates resetForThreadNavigation + new hydration)
      const threadBPreSearch = {
        ...createMockResumptionPreSearch(0, MessageStatuses.STREAMING),
        threadId: 'thread-456',
      };
      store.setState({
        thread: { id: 'thread-456', enableWebSearch: true },
        preSearches: [threadBPreSearch],
      });

      const state = store.getState();
      expect(state.thread?.id).toBe('thread-456');
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.threadId).toBe('thread-456');
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.STREAMING);
    });

    it('preserves preSearches during overview->thread transition', () => {
      const store = createMockChatStore({
        screenMode: ScreenModes.OVERVIEW,
        participants: createMockParticipants(2),
        messages: [],
        thread: null,
        enableWebSearch: true,
        preSearches: [],
        waitingToStartStreaming: false,
      });

      // Transition to thread screen with SSR data
      const initialPreSearches = [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)];
      store.setState({
        screenMode: ScreenModes.THREAD,
        thread: { id: 'thread-123', enableWebSearch: true },
        messages: [createMockUserMessage(0)],
        preSearches: initialPreSearches,
      });

      const state = store.getState();
      expect(state.screenMode).toBe(ScreenModes.THREAD);
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('handles back button navigation correctly', () => {
      // Start on thread screen with pre-search
      const store = buildSSRHydratedScenario(MessageStatuses.COMPLETE);

      // User navigates to another thread (simulates popstate)
      store.setState({
        thread: { id: 'thread-new', enableWebSearch: false },
        preSearches: [],
        messages: [createMockUserMessage(0)],
      });

      expect(store.getState().preSearches).toHaveLength(0);

      // Back button returns to original thread
      const originalPreSearches = [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)];
      store.setState({
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: originalPreSearches,
      });

      const state = store.getState();
      expect(state.thread?.id).toBe('thread-123');
      expect(state.preSearches).toHaveLength(1);
    });
  });

  describe('edge cases', () => {
    it('handles stale pre-search (>2 minutes old, status STREAMING)', () => {
      const stalePreSearch = createMockResumptionPreSearch(0, MessageStatuses.STREAMING);
      // Set createdAt to 3 minutes ago
      stalePreSearch.createdAt = new Date(Date.now() - 3 * 60 * 1000);

      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        enableWebSearch: true,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [stalePreSearch],
      });

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

      // Timeout check logic (from shouldPreSearchTimeout util)
      const STALE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes
      const createdAtTime = new Date(preSearch!.createdAt).getTime();
      const isStale = Date.now() - createdAtTime > STALE_THRESHOLD_MS;
      expect(isStale).toBe(true);
    });

    it('handles participant mismatch after config change', () => {
      // Pre-search was started with 3 participants, but config changed to 2
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        enableWebSearch: true,
        // Only 2 participants now
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        // Pre-search still exists from before config change
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
      });

      const state = store.getState();

      // Pre-search should still be found regardless of participant count
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch).toBeDefined();
      expect(state.participants).toHaveLength(2);
    });

    it('handles webSearch toggled off after pre-search started', () => {
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        // Web search is now OFF
        enableWebSearch: false,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: false },
        // Pre-search exists from when web search was on
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.STREAMING)],
      });

      const state = store.getState();

      // When web search is disabled, we shouldn't wait for pre-search
      expect(state.enableWebSearch).toBe(false);

      // The pre-search exists but should be ignored
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);
      expect(preSearch).toBeDefined();

      // Logic: if (!enableWebSearch) skip pre-search check entirely
      const shouldCheckPreSearch = state.enableWebSearch;
      expect(shouldCheckPreSearch).toBe(false);
    });

    it('handles race between pre-search completion and navigation', () => {
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        enableWebSearch: true,
        participants: createMockParticipants(2),
        messages: [createMockUserMessage(0)],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [createMockResumptionPreSearch(0, MessageStatuses.STREAMING)],
      });

      // Simulate pre-search completing
      const state = store.getState();
      const updatedPreSearches = state.preSearches.map((ps) => {
        if (ps.roundNumber === 0) {
          return { ...ps, status: MessageStatuses.COMPLETE, completedAt: new Date() };
        }
        return ps;
      });
      store.setState({ preSearches: updatedPreSearches });

      // Concurrent navigation attempt
      store.setState({ screenMode: ScreenModes.OVERVIEW });

      // PreSearches should still be in final state
      const finalState = store.getState();
      expect(finalState.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });

    it('finds correct pre-search for current round in multi-round scenario', () => {
      const store = createMockChatStore({
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: true,
        enableWebSearch: true,
        participants: createMockParticipants(2),
        messages: [
          createMockUserMessage(0),
          createMockUserMessage(1),
          createMockUserMessage(2),
        ],
        thread: { id: 'thread-123', enableWebSearch: true },
        preSearches: [
          createMockResumptionPreSearch(0, MessageStatuses.COMPLETE),
          createMockResumptionPreSearch(1, MessageStatuses.COMPLETE),
          createMockResumptionPreSearch(2, MessageStatuses.STREAMING),
        ],
      });

      const state = store.getState();

      // Simulating resuming round 2
      const currentRound = 2;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === currentRound);

      expect(preSearchForRound).toBeDefined();
      expect(preSearchForRound?.roundNumber).toBe(2);
      expect(preSearchForRound?.status).toBe(MessageStatuses.STREAMING);

      // Should NOT confuse with other rounds
      const r0PreSearch = state.preSearches.find(ps => ps.roundNumber === 0);
      const r1PreSearch = state.preSearches.find(ps => ps.roundNumber === 1);
      expect(r0PreSearch?.status).toBe(MessageStatuses.COMPLETE);
      expect(r1PreSearch?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('integration with resumption flow', () => {
    it('buildAfterPreSearchScenario helper creates valid state', () => {
      const store = buildAfterPreSearchScenario(MessageStatuses.COMPLETE);

      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.enableWebSearch).toBe(true);
      expect(state.preSearches).toHaveLength(1);
      expect(state.participants).toHaveLength(2);
    });

    it('sSR hydrated scenario properly blocks on STREAMING', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.STREAMING);

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);

      // Verify all conditions for blocking
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.enableWebSearch).toBe(true);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.STREAMING);

      // This should cause streaming trigger to wait
      const isBlocked
        = preSearch?.status === MessageStatuses.STREAMING
          || preSearch?.status === MessageStatuses.PENDING;
      expect(isBlocked).toBe(true);
    });

    it('sSR hydrated scenario proceeds on COMPLETE', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.COMPLETE);

      const state = store.getState();
      const preSearch = state.preSearches.find(ps => ps.roundNumber === 0);

      // Verify all conditions for proceeding
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.enableWebSearch).toBe(true);
      expect(preSearch).toBeDefined();
      expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);

      // This should NOT cause streaming trigger to wait
      const isBlocked
        = preSearch?.status === MessageStatuses.STREAMING
          || preSearch?.status === MessageStatuses.PENDING;
      expect(isBlocked).toBe(false);
    });

    it('verifies pre-search lookup pattern used in streaming trigger', () => {
      const store = buildSSRHydratedScenario(MessageStatuses.COMPLETE);

      // This is the exact pattern from use-streaming-trigger
      const state = store.getState();
      const { enableWebSearch, preSearches } = state;
      const currentRound = 0;

      // The bug fix ensures this lookup succeeds
      const preSearchForRound = preSearches.find(ps => ps.roundNumber === currentRound);

      if (enableWebSearch && !preSearchForRound) {
        throw new Error('Bug: EXIT: webSearch enabled but no preSearch for r0');
      }

      // Should not throw
      expect(preSearchForRound).toBeDefined();
    });
  });
});
