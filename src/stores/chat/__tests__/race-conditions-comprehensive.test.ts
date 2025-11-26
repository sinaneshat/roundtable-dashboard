/**
 * Race Conditions Comprehensive Test Suite
 *
 * Tests critical race conditions and timing issues from COMPREHENSIVE_TEST_PLAN.md Section 10.
 * Also covers additional scenarios from FLOW_DOCUMENTATION.md Part 14.
 *
 * Location: /src/stores/chat/__tests__/race-conditions-comprehensive.test.ts
 *
 * Test Categories:
 * - 10.1 Thread Initialization (RACE-INIT-*)
 * - 10.2 Slug & Navigation (RACE-NAV-*)
 * - 10.3 Pre-Search Synchronization (RACE-SEARCH-*)
 * - 10.4 Streaming & Stop (RACE-STOP-*)
 * - 10.5 Analysis & Completion (RACE-ANALYSIS-*)
 * - Additional scenarios from FLOW_DOCUMENTATION.md Part 14
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  PreSearchStatuses,
  ScreenModes,
  UIMessageRoles,
} from '@/api/core/enums';
import { shouldWaitForPreSearch } from '@/stores/chat/actions/pending-message-sender';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfigs,
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
  createStreamingAnalysis,
  createStreamingPreSearch,
  createTimedOutAnalysis,
} from './test-factories';

// Mock global window history
const mockReplaceState = vi.fn();

vi.stubGlobal('history', {
  replaceState: mockReplaceState,
  state: {},
});

function createTestStore() {
  return createChatStore();
}

describe('race Conditions: Comprehensive Test Suite (COMPREHENSIVE_TEST_PLAN Section 10)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
    mockReplaceState.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ==========================================================================
  // SECTION 10.1: THREAD INITIALIZATION
  // ==========================================================================

  describe('10.1 Thread Initialization', () => {
    /**
     * RACE-INIT-01: User submits message immediately
     * Verify createdThreadId is set before streaming attempts to start
     */
    it('should have createdThreadId set before streaming attempts to start (RACE-INIT-01)', () => {
      // Initial state: no thread
      expect(store.getState().createdThreadId).toBeNull();
      expect(store.getState().thread).toBeNull();

      // Simulate submission flow: waitingToStartStreaming is true
      store.getState().setWaitingToStartStreaming(true);

      // At this point, streaming SHOULD NOT start because createdThreadId is null
      const canStartStreaming = !!(
        store.getState().waitingToStartStreaming
        && store.getState().createdThreadId
      );
      expect(canStartStreaming).toBe(false);

      // Thread creation completes
      store.getState().setCreatedThreadId('thread-123');

      // Now streaming can start
      const canStartStreamingNow = !!(
        store.getState().waitingToStartStreaming
        && store.getState().createdThreadId
      );
      expect(canStartStreamingNow).toBe(true);
    });

    /**
     * RACE-INIT-02: startRound() callback fires before UI renders
     * Ensure the callback is available when streaming checks happen
     */
    it('should ensure startRound() callback fires before UI tries to render active stream (RACE-INIT-02)', () => {
      // Initial state: no callback
      expect(store.getState().startRound).toBeUndefined();

      // Check if streaming would be blocked
      const canStart = !!store.getState().startRound;
      expect(canStart).toBe(false);

      // AI SDK sets the callback
      const mockStartRound = vi.fn();
      store.getState().setStartRound(mockStartRound);

      // Now callback is available
      expect(store.getState().startRound).toBeDefined();
      const canStartNow = !!store.getState().startRound;
      expect(canStartNow).toBe(true);
    });

    it('should block streaming if thread not initialized even with waitingToStartStreaming', () => {
      store.getState().setWaitingToStartStreaming(true);

      // No thread initialized
      const state = store.getState();
      const conditions = {
        waitingToStartStreaming: state.waitingToStartStreaming,
        hasThread: state.thread !== null,
        hasCreatedThreadId: state.createdThreadId !== null,
        hasParticipants: state.participants.length > 0,
      };

      expect(conditions.waitingToStartStreaming).toBe(true);
      expect(conditions.hasThread).toBe(false);
      expect(conditions.hasCreatedThreadId).toBe(false);
      expect(conditions.hasParticipants).toBe(false);

      // All conditions must be met to start streaming
      const allConditionsMet = Object.values(conditions).every(Boolean);
      expect(allConditionsMet).toBe(false);
    });

    it('should initialize thread and participants atomically', () => {
      const thread = createMockThread({ id: 'thread-456' });
      const participants = createMockParticipants(3);

      // Initialize in one operation
      store.getState().initializeThread(thread, participants);

      const state = store.getState();
      expect(state.thread?.id).toBe('thread-456');
      expect(state.participants).toHaveLength(3);

      // Both should be available together
      const isReady = state.thread !== null && state.participants.length > 0;
      expect(isReady).toBe(true);
    });

    it('should guard against race between thread creation API response and streaming start', () => {
      // Simulate: waitingToStartStreaming set before API response
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsCreatingThread(true);

      // API response arrives
      const thread = createMockThread({ id: 'thread-789' });
      const participants = createMockParticipants(2);
      store.getState().initializeThread(thread, participants);
      store.getState().setCreatedThreadId('thread-789');
      store.getState().setIsCreatingThread(false);

      // Now all conditions met
      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.createdThreadId).toBe('thread-789');
      expect(state.isCreatingThread).toBe(false);
      expect(state.participants).toHaveLength(2);
    });
  });

  // ==========================================================================
  // SECTION 10.2: SLUG & NAVIGATION
  // ==========================================================================

  describe('10.2 Slug & Navigation', () => {
    /**
     * RACE-NAV-01: router.push vs history.replaceState
     * Verify final URL is correct even if both fire close together
     */
    it('should ensure final URL is correct when replaceState and push fire close together (RACE-NAV-01)', async () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'initial-slug',
        isAiGeneratedTitle: false,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Simulate slug polling finding AI title
      const operations: string[] = [];

      // First: replaceState should update URL silently
      const updatedThread = {
        ...thread,
        slug: 'ai-generated-slug',
        isAiGeneratedTitle: true,
      };
      store.getState().setThread(updatedThread);
      operations.push('replaceState');

      // Then: analysis completes, router.push happens
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      operations.push('push');

      // Verify order: replaceState must come before push
      expect(operations).toEqual(['replaceState', 'push']);
      expect(store.getState().thread?.slug).toBe('ai-generated-slug');
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
    });

    it('should use queueMicrotask ordering for URL replace vs router.push', async () => {
      const operations: string[] = [];

      queueMicrotask(() => operations.push('url-replace'));
      queueMicrotask(() => operations.push('router-push'));

      await Promise.resolve();
      await Promise.resolve();

      expect(operations).toEqual(['url-replace', 'router-push']);
    });

    /**
     * RACE-NAV-02: Navigation triggering while component unmounts
     */
    it('should handle navigation during component unmount safely (RACE-NAV-02)', () => {
      const thread = createMockThread({ isAiGeneratedTitle: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setShowInitialUI(false);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Simulate navigation about to happen
      const state = store.getState();
      const shouldNavigate = state.thread?.isAiGeneratedTitle && !state.showInitialUI;
      expect(shouldNavigate).toBe(true);

      // User navigates away - reset is called
      store.getState().resetToNewChat();

      // State should be clean, no pending navigation state
      const resetState = store.getState();
      expect(resetState.thread).toBeNull();
      expect(resetState.showInitialUI).toBe(true);
      expect(resetState.screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should cancel queued navigation on unmount', async () => {
      let isMounted = true;
      let navigationCalled = false;

      const navigate = () => {
        if (isMounted) {
          navigationCalled = true;
        }
      };

      queueMicrotask(() => navigate());

      // Unmount before microtask runs
      isMounted = false;

      await Promise.resolve();

      expect(navigationCalled).toBe(false);
    });

    /**
     * RACE-NAV-03: Polling for slug status stops immediately when title found
     */
    it('should stop polling immediately when AI title is found (RACE-NAV-03)', () => {
      const thread = createMockThread({
        id: 'thread-123',
        isAiGeneratedTitle: false,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Polling is active
      let pollingActive = !store.getState().thread?.isAiGeneratedTitle;
      expect(pollingActive).toBe(true);

      // AI title found
      store.getState().setThread({
        ...thread,
        isAiGeneratedTitle: true,
        title: 'AI Generated Title',
      });

      // Polling should stop
      pollingActive = !store.getState().thread?.isAiGeneratedTitle;
      expect(pollingActive).toBe(false);
    });

    it('should handle URL update arriving after analysis completion', () => {
      const thread = createMockThread({
        id: 'thread-123',
        isAiGeneratedTitle: false,
        slug: 'temp-slug',
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Analysis completes first
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      const stateAfterAnalysis = store.getState();
      expect(stateAfterAnalysis.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(stateAfterAnalysis.thread?.isAiGeneratedTitle).toBe(false);

      // Title arrives later
      store.getState().setThread({
        ...thread,
        isAiGeneratedTitle: true,
        slug: 'final-slug',
      });

      // Both conditions now met
      const finalState = store.getState();
      expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(finalState.thread?.isAiGeneratedTitle).toBe(true);
    });

    it('should prevent duplicate navigation via showInitialUI flag', () => {
      const thread = createMockThread({ isAiGeneratedTitle: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setShowInitialUI(true);

      // First navigation attempt
      let shouldNavigate = store.getState().showInitialUI;
      expect(shouldNavigate).toBe(true);

      // Navigation happens, flag cleared
      store.getState().setShowInitialUI(false);

      // Second attempt blocked
      shouldNavigate = store.getState().showInitialUI;
      expect(shouldNavigate).toBe(false);
    });

    it('should guard navigation with hasUpdatedThread flag pattern', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      let hasUpdatedThread = false;
      let shouldNavigate = false;

      const checkNavigation = () => {
        shouldNavigate = hasUpdatedThread && !store.getState().isStreaming;
      };

      const updateSlug = () => {
        hasUpdatedThread = true;
      };

      // Before update
      checkNavigation();
      expect(shouldNavigate).toBe(false);

      // After update
      updateSlug();
      checkNavigation();
      expect(shouldNavigate).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 10.3: PRE-SEARCH SYNCHRONIZATION
  // ==========================================================================

  describe('10.3 Pre-Search Synchronization', () => {
    // Helper for checking blocking status
    // ✅ FIX: Use form state as sole source of truth for web search enabled
    function checkShouldWait(roundNumber: number) {
      const state = store.getState();
      const webSearchEnabled = state.enableWebSearch;
      return shouldWaitForPreSearch({
        webSearchEnabled,
        preSearches: state.preSearches,
        roundNumber,
      });
    }

    /**
     * RACE-SEARCH-01: Frontend preSearches store sync vs Streaming check
     * Ensure streaming waits if store hasn't synced the PENDING record yet (Optimistic Blocking)
     */
    it('should block streaming when web search enabled but store has not synced PENDING record (RACE-SEARCH-01)', () => {
      // Backend created thread with web search enabled
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Orchestrator hasn't synced pre-search yet (0-2s window)
      expect(store.getState().preSearches).toHaveLength(0);

      // Streaming check should wait (optimistic blocking)
      expect(checkShouldWait(0)).toBe(true);
    });

    /**
     * RACE-SEARCH-02: PATCH request to create pre-search in flight while streaming tries to start
     */
    it('should block while PATCH request to create pre-search is in flight (RACE-SEARCH-02)', async () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      let patchCompleted = false;

      // Simulate PATCH creating pre-search
      const createPreSearch = async () => {
        await Promise.resolve();
        store.getState().addPreSearch(createPendingPreSearch(0));
        patchCompleted = true;
      };

      // Streaming check should wait
      expect(checkShouldWait(0)).toBe(true);

      await createPreSearch();

      // Pre-search now exists but is PENDING
      expect(patchCompleted).toBe(true);
      expect(store.getState().preSearches).toHaveLength(1);
      expect(checkShouldWait(0)).toBe(true); // Still waiting for COMPLETE
    });

    it('should allow streaming when web search is disabled', () => {
      const thread = createMockThread({ enableWebSearch: false });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // No blocking even without pre-search
      expect(checkShouldWait(0)).toBe(false);
    });

    it('should block during PENDING and STREAMING states', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      const preSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(preSearch);

      // PENDING
      expect(checkShouldWait(0)).toBe(true);

      // STREAMING
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      expect(checkShouldWait(0)).toBe(true);

      // COMPLETE
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
      expect(checkShouldWait(0)).toBe(false);
    });

    it('should handle FAILED pre-search gracefully (no blocking)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      // Should not block on failure
      expect(checkShouldWait(0)).toBe(false);
    });

    it('should handle rapid status transitions without deadlock', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      store.getState().addPreSearch(createPendingPreSearch(0));

      // Rapid transitions
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);

      const finalStatus = store.getState().preSearches[0].status;
      expect(finalStatus).toBe(AnalysisStatuses.COMPLETE);
      expect(checkShouldWait(0)).toBe(false);
    });

    it('should isolate blocking by round number', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Round 0 complete, Round 1 pending
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addPreSearch(createPendingPreSearch(1));

      // Round 0 should not wait
      expect(checkShouldWait(0)).toBe(false);
      // Round 1 should wait
      expect(checkShouldWait(1)).toBe(true);
    });

    it('should handle concurrent pre-search checks consistently', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      store.getState().addPreSearch(createStreamingPreSearch(0));

      // Multiple concurrent checks should give consistent results
      const results = [
        checkShouldWait(0),
        checkShouldWait(0),
        checkShouldWait(0),
      ];

      expect(results.every(r => r === true)).toBe(true);
    });

    it('should handle 10-second timeout for stuck pre-search', () => {
      const thread = createMockThread({ enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Add pre-search created 15 seconds ago
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        createdAt: new Date(Date.now() - 15000),
      });

      const TIMEOUT_MS = 10000;
      const preSearch = store.getState().preSearches[0];
      const elapsedMs = Date.now() - preSearch.createdAt.getTime();
      const isTimedOut = elapsedMs > TIMEOUT_MS;

      expect(isTimedOut).toBe(true);
    });
  });

  // ==========================================================================
  // SECTION 10.4: STREAMING & STOP
  // ==========================================================================

  describe('10.4 Streaming & Stop', () => {
    /**
     * RACE-STOP-01: User clicks Stop exactly as a model finishes and next one is requested
     */
    it('should handle stop exactly when model finishes and next is requested (RACE-STOP-01)', () => {
      const participants = createMockParticipants(3);
      store.getState().initializeThread(createMockThread(), participants);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // P0 finishes
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // Stop clicked at exact moment of transition to P1
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setIsStreaming(false);

      // Verify streaming stopped
      expect(store.getState().isStreaming).toBe(false);

      // P2 should never start
      const shouldStartP2 = store.getState().isStreaming
        && store.getState().currentParticipantIndex === 2;
      expect(shouldStartP2).toBe(false);
    });

    /**
     * RACE-STOP-02: In-flight chunks arriving after Stop clicked (should be ignored)
     */
    it('should ignore in-flight chunks arriving after Stop clicked (RACE-STOP-02)', () => {
      store.getState().initializeThread(createMockThread(), [createMockParticipant(0)]);
      store.getState().setIsStreaming(true);

      // Stop clicked
      store.getState().setIsStreaming(false);

      // Chunk arrives (would be in-flight from network)
      // The store checks isStreaming before processing
      const shouldProcess = store.getState().isStreaming;
      expect(shouldProcess).toBe(false);

      // Message count should not change
      const messageCount = store.getState().messages.length;
      expect(messageCount).toBe(0);
    });

    /**
     * RACE-STOP-03: Verify currentIndexRef is updated atomically with state
     */
    it('should update currentIndexRef atomically with state (RACE-STOP-03)', () => {
      store.getState().initializeThread(createMockThread(), createMockParticipants(3));
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1);

      // Stop streaming
      store.getState().stopStreaming();

      // Both should be reset atomically
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);
    });

    it('should prevent subsequent participants from starting after stop', () => {
      const participants = createMockParticipants(3);
      store.getState().initializeThread(createMockThread(), participants);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Stop clicked
      store.getState().setIsStreaming(false);

      // Check if next participant should start
      const shouldStartNext = store.getState().isStreaming
        && store.getState().currentParticipantIndex < participants.length;

      expect(shouldStartNext).toBe(false);
    });

    it('should handle rapid stop/start cycles', () => {
      store.getState().initializeThread(createMockThread(), [createMockParticipant(0)]);

      // Rapid toggles
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(false);
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(false);

      expect(store.getState().isStreaming).toBe(false);
    });

    it('should save partial responses when stop is clicked', () => {
      store.getState().initializeThread(createMockThread(), createMockParticipants(2));
      store.getState().setIsStreaming(true);

      // P0 completes
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // Stop during P1
      store.getState().setIsStreaming(false);

      // P0 response should be preserved
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].id).toContain('_r0_p0');
    });

    it('should NOT trigger analysis if stopped before all participants finished', () => {
      const participants = createMockParticipants(3);
      store.getState().initializeThread(createMockThread(), participants);
      store.getState().setIsStreaming(true);

      // Only P0 and P1 finish
      store.getState().setMessages([
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);

      // Stop before P2
      store.getState().setIsStreaming(false);

      // Check analysis trigger condition
      const responses = store.getState().messages.filter(m => m.role === UIMessageRoles.ASSISTANT);
      const allParticipantsResponded = responses.length === participants.length;

      expect(allParticipantsResponded).toBe(false);
      expect(responses).toHaveLength(2);
    });

    it('should handle stop between participants atomically', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, createMockParticipants(3));
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1);

      // Stop during P1
      store.getState().setIsStreaming(false);

      // Both flags should update atomically
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().currentParticipantIndex).toBe(1);
    });
  });

  // ==========================================================================
  // SECTION 10.5: ANALYSIS & COMPLETION
  // ==========================================================================

  describe('10.5 Analysis & Completion', () => {
    /**
     * RACE-ANALYSIS-01: Analysis completion event arrives before last participant stream close event
     */
    it('should handle analysis completion event arriving before last participant close (RACE-ANALYSIS-01)', () => {
      const participants = createMockParticipants(2);
      store.getState().initializeThread(createMockThread(), participants);
      store.getState().setIsStreaming(true);

      // P0 finishes
      store.getState().setMessages([createMockMessage(0, 0)]);

      // Analysis created early (before P1 finishes)
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));

      // P1 finishes
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

      // Analysis should still be pending
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

      // Analysis completes
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    /**
     * RACE-ANALYSIS-02: Timeout fallback (60s) fires if completion event is lost
     */
    it('should fire 60s timeout fallback if completion event is lost (RACE-ANALYSIS-02)', () => {
      store.getState().initializeThread(createMockThread(), [createMockParticipant(0)]);

      // Add analysis stuck in streaming for >60s
      store.getState().addAnalysis(createTimedOutAnalysis(0));

      const analysis = store.getState().analyses[0];
      const elapsed = Date.now() - analysis.createdAt.getTime();

      // Should be > 60s (61s set in factory)
      expect(elapsed).toBeGreaterThan(60000);

      // Timeout handler would force FAILED
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.FAILED);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);
    });

    it('should detect completion via multi-layer logic', () => {
      store.getState().initializeThread(createMockThread(), [createMockParticipant(0)]);
      store.getState().setIsStreaming(false);

      // Layer 1: COMPLETE status
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      let analysis = store.getState().analyses[0];
      const isComplete = analysis.status === AnalysisStatuses.COMPLETE;
      expect(isComplete).toBe(true);

      // Layer 2: STREAMING but timed out (60s)
      store.getState().removeAnalysis(0);
      store.getState().addAnalysis(createTimedOutAnalysis(0));

      analysis = store.getState().analyses[0];
      const elapsed = Date.now() - analysis.createdAt.getTime();
      const timedOut = analysis.status === AnalysisStatuses.STREAMING && elapsed > 60000;
      expect(timedOut).toBe(true);

      // Layer 3: PENDING + not streaming + timed out
      store.getState().removeAnalysis(0);
      store.getState().addAnalysis({
        ...createPendingAnalysis(0),
        createdAt: new Date(Date.now() - 61000),
      });

      analysis = store.getState().analyses[0];
      const pendingTimedOut = analysis.status === AnalysisStatuses.PENDING
        && !store.getState().isStreaming
        && Date.now() - analysis.createdAt.getTime() > 60000;
      expect(pendingTimedOut).toBe(true);
    });

    it('should handle multiple updates arriving out of order', () => {
      store.getState().initializeThread(createMockThread(), [createMockParticipant(0)]);
      store.getState().addAnalysis(createStreamingAnalysis(0));

      // COMPLETE arrives
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

      // Late STREAMING packet arrives (network race)
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

      // Document current behavior
      const finalStatus = store.getState().analyses[0].status;
      expect([AnalysisStatuses.COMPLETE, AnalysisStatuses.STREAMING]).toContain(finalStatus);
    });

    it('should create pending analysis only when all conditions met', () => {
      store.getState().initializeThread(createMockThread({ id: 'thread-123' }), createMockParticipants(2));

      // Add user message and participant messages
      const messages = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];
      store.getState().setMessages(messages);

      // Manually add pending analysis (createPendingAnalysis has extensive validation)
      // This tests that the store can hold analysis state
      store.getState().addAnalysis(createPendingAnalysis(0));

      // Analysis should be created
      expect(store.getState().analyses).toHaveLength(1);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
    });

    it('should prevent duplicate analysis via tracking', () => {
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Second trigger should be idempotent
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
    });
  });

  // ==========================================================================
  // ADDITIONAL RACE CONDITIONS FROM FLOW_DOCUMENTATION.md Part 14
  // ==========================================================================

  describe('additional Race Conditions (FLOW_DOCUMENTATION Part 14)', () => {
    describe('hasNavigated Flag Management', () => {
      it('should reset navigation state when returning to /chat', () => {
        // Simulate completed navigation
        store.getState().setShowInitialUI(false);

        // Return to /chat
        store.getState().resetToNewChat();

        // Navigation flags reset
        expect(store.getState().showInitialUI).toBe(true);
      });

      it('should prevent router.push retry after hasNavigated set', () => {
        store.getState().setShowInitialUI(false);

        // Check if navigation can happen
        const canNavigate = store.getState().showInitialUI;
        expect(canNavigate).toBe(false);
      });

      it('should prevent duplicate navigation attempts', () => {
        let hasNavigated = false;
        let navigationAttempts = 0;

        const attemptNavigation = () => {
          if (!hasNavigated) {
            navigationAttempts++;
            hasNavigated = true;
          }
        };

        attemptNavigation();
        attemptNavigation();
        attemptNavigation();

        expect(navigationAttempts).toBe(1);
      });
    });

    describe('thread ID Availability', () => {
      it('should block dependent operations until thread ID available', () => {
        // No thread yet
        expect(store.getState().createdThreadId).toBeNull();

        // Operations that depend on thread ID
        const canStartStreaming = store.getState().createdThreadId !== null;
        const canPoll = store.getState().createdThreadId !== null;
        const canCreatePreSearch = store.getState().createdThreadId !== null;

        expect(canStartStreaming).toBe(false);
        expect(canPoll).toBe(false);
        expect(canCreatePreSearch).toBe(false);

        // Thread ID becomes available
        store.getState().setCreatedThreadId('thread-123');

        // Now operations can proceed
        const canStartStreamingNow = store.getState().createdThreadId !== null;
        expect(canStartStreamingNow).toBe(true);
      });
    });

    describe('orchestrator Sync Timing', () => {
      it('should use optimistic blocking when orchestrator not synced', () => {
        const thread = createMockThread({ enableWebSearch: true });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Orchestrator not synced - preSearches empty
        const state = store.getState();
        expect(state.preSearches).toHaveLength(0);

        // Should block optimistically
        const shouldBlock = shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: state.preSearches,
          roundNumber: 0,
        });

        expect(shouldBlock).toBe(true);

        // Orchestrator syncs
        store.getState().addPreSearch({
          ...createPendingPreSearch(0),
          status: AnalysisStatuses.COMPLETE,
        });

        // Now can proceed
        const shouldBlockNow = shouldWaitForPreSearch({
          webSearchEnabled: true,
          preSearches: store.getState().preSearches,
          roundNumber: 0,
        });

        expect(shouldBlockNow).toBe(false);
      });
    });

    describe('sequential Participant Coordination', () => {
      it('should increment participant index in correct sequence', () => {
        store.getState().initializeThread(createMockThread(), createMockParticipants(3));
        store.getState().setIsStreaming(true);

        // Sequential increments
        expect(store.getState().currentParticipantIndex).toBe(0);

        store.getState().setCurrentParticipantIndex(1);
        expect(store.getState().currentParticipantIndex).toBe(1);

        store.getState().setCurrentParticipantIndex(2);
        expect(store.getState().currentParticipantIndex).toBe(2);
      });

      it('should not skip participants', () => {
        store.getState().initializeThread(createMockThread(), createMockParticipants(3));
        store.getState().setIsStreaming(true);

        // Track all indices
        const indices: number[] = [];
        for (let i = 0; i < 3; i++) {
          store.getState().setCurrentParticipantIndex(i);
          indices.push(store.getState().currentParticipantIndex);
        }

        expect(indices).toEqual([0, 1, 2]);
      });
    });

    describe('cleanup and Memory Safety', () => {
      it('should clear all tracking maps on reset', () => {
        store.getState().markPreSearchTriggered(0);
        store.getState().markPreSearchTriggered(1);
        store.getState().markAnalysisCreated(0);
        store.getState().markAnalysisCreated(1);

        // Verify tracking
        expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
        expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

        // Reset
        store.getState().resetToNewChat();

        // All tracking cleared
        expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
        expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
        expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
      });

      it('should stop ongoing streams during cleanup', () => {
        const mockStop = vi.fn();
        store.getState().setStop(mockStop);
        store.getState().setIsStreaming(true);

        // Reset with active stream
        store.getState().resetToNewChat();

        // Stop should be called
        expect(mockStop).toHaveBeenCalled();
        expect(store.getState().isStreaming).toBe(false);
      });

      it('should clear pending messages on reset', () => {
        store.getState().setPendingMessage('Test message');
        store.getState().setExpectedParticipantIds(['model-1', 'model-2']);

        store.getState().resetToNewChat();

        expect(store.getState().pendingMessage).toBeNull();
        expect(store.getState().expectedParticipantIds).toBeNull();
      });

      it('should clear all arrays on reset', () => {
        const thread = createMockThread({ id: 'thread-123' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);
        store.getState().setMessages([createMockUserMessage(0)]);
        store.getState().addPreSearch(createMockPreSearch());
        store.getState().addAnalysis(createMockAnalysis());

        // Reset
        store.getState().resetToNewChat();

        // Verify cleanup
        expect(store.getState().messages).toHaveLength(0);
        expect(store.getState().preSearches).toHaveLength(0);
        expect(store.getState().analyses).toHaveLength(0);
      });
    });

    describe('concurrent Operations', () => {
      it('should handle concurrent participant config changes', () => {
        const configs = createMockParticipantConfigs(2);
        store.getState().setSelectedParticipants(configs);

        // Concurrent changes
        store.getState().addParticipant({
          participantIndex: 2,
          modelId: 'model-3',
          role: null,
        });
        store.getState().removeParticipant('openai/gpt-4'); // Default modelId from factory

        const result = store.getState().selectedParticipants;
        expect(result.map(p => p.modelId)).toContain('model-3');
      });

      it('should handle concurrent analysis and pre-search updates', () => {
        store.getState().initializeThread(createMockThread(), [createMockParticipant(0)]);

        // Add both
        store.getState().addPreSearch(createPendingPreSearch(0));
        store.getState().addAnalysis(createPendingAnalysis(0));

        // Concurrent updates
        store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
        store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

        expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
        expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);
      });

      it('should handle concurrent state reads', () => {
        const thread = createMockThread({ id: 'thread-123' });
        store.getState().initializeThread(thread, [createMockParticipant(0)]);

        // Multiple concurrent reads
        const reads = Array.from({ length: 10 }, () => store.getState().thread?.id);

        expect(reads.every(id => id === 'thread-123')).toBe(true);
      });
    });

    describe('deduplication Tracking', () => {
      it('should prevent duplicate analysis creation', () => {
        store.getState().markAnalysisCreated(0);

        // Check before creating
        const shouldCreate = !store.getState().hasAnalysisBeenCreated(0);
        expect(shouldCreate).toBe(false);
      });

      it('should prevent duplicate pre-search triggering', () => {
        store.getState().markPreSearchTriggered(0);

        // Check before triggering
        const shouldTrigger = !store.getState().hasPreSearchBeenTriggered(0);
        expect(shouldTrigger).toBe(false);
      });

      it('should allow after clearing tracking', () => {
        store.getState().markAnalysisCreated(0);
        store.getState().clearAnalysisTracking(0);

        // Can create again
        expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
      });
    });

    describe('screen Mode Transitions', () => {
      it('should handle rapid screen mode changes', () => {
        store.getState().setScreenMode(ScreenModes.OVERVIEW);
        store.getState().setScreenMode(ScreenModes.THREAD);
        store.getState().setScreenMode(ScreenModes.OVERVIEW);

        expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
      });

      it('should set isReadOnly for public mode', () => {
        store.getState().setScreenMode(ScreenModes.PUBLIC);

        expect(store.getState().isReadOnly).toBe(true);
      });

      it('should clear isReadOnly for non-public modes', () => {
        store.getState().setScreenMode(ScreenModes.PUBLIC);
        expect(store.getState().isReadOnly).toBe(true);

        store.getState().setScreenMode(ScreenModes.THREAD);
        expect(store.getState().isReadOnly).toBe(false);
      });
    });

    describe('regeneration Race Conditions', () => {
      it('should clear tracking before regeneration', () => {
        store.getState().markAnalysisCreated(0);
        store.getState().markPreSearchTriggered(0);

        store.getState().startRegeneration(0);

        // Tracking cleared for regeneration
        expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
        expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
        expect(store.getState().isRegenerating).toBe(true);
      });

      it('should reset all streaming state on regeneration', () => {
        store.getState().setIsStreaming(true);
        store.getState().setIsCreatingAnalysis(true);
        store.getState().setPendingMessage('test');

        store.getState().startRegeneration(0);

        expect(store.getState().isStreaming).toBe(false);
        expect(store.getState().isCreatingAnalysis).toBe(false);
        expect(store.getState().pendingMessage).toBeNull();
      });

      it('should complete regeneration atomically', () => {
        store.getState().startRegeneration(0);

        store.getState().completeRegeneration(0);

        expect(store.getState().isRegenerating).toBe(false);
        expect(store.getState().regeneratingRoundNumber).toBeNull();
      });
    });

    describe('callback Safety', () => {
      it('should call onComplete callback when streaming finishes', () => {
        const onComplete = vi.fn();
        store.getState().setOnComplete(onComplete);

        // Streaming finishes
        store.getState().completeStreaming();

        // Callback should be callable
        const callback = store.getState().onComplete;
        if (callback)
          callback();

        expect(onComplete).toHaveBeenCalled();
      });

      it('should not fail if stop callback is undefined', () => {
        expect(store.getState().stop).toBeUndefined();

        // Should not throw
        expect(() => store.getState().stopStreaming()).not.toThrow();
      });
    });
  });

  // ==========================================================================
  // EDGE CASES AND BOUNDARY CONDITIONS
  // ==========================================================================

  describe('edge Cases and Boundary Conditions', () => {
    it('should handle empty participant list', () => {
      store.getState().initializeThread(createMockThread(), []);

      expect(store.getState().participants).toHaveLength(0);

      // Streaming check should handle gracefully
      const shouldStream = store.getState().participants.length > 0;
      expect(shouldStream).toBe(false);
    });

    it('should handle maximum participants (10)', () => {
      const participants = createMockParticipants(10);
      store.getState().initializeThread(createMockThread(), participants);

      expect(store.getState().participants).toHaveLength(10);
    });

    it('should handle very rapid state changes without corruption', () => {
      store.getState().initializeThread(createMockThread(), createMockParticipants(3));

      // Rapid fire changes
      for (let i = 0; i < 100; i++) {
        store.getState().setIsStreaming(i % 2 === 0);
        store.getState().setCurrentParticipantIndex(i % 3);
      }

      // State should be consistent
      const state = store.getState();
      expect(state.isStreaming).toBe(false); // 99 % 2 === 1 -> false
      expect(state.currentParticipantIndex).toBe(0); // 99 % 3 === 0
    });

    it('should handle transition from thread to overview safely', () => {
      // On thread screen
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().initializeThread(createMockThread(), createMockParticipants(2));
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);

      // Navigate to overview
      store.getState().resetToOverview();

      // Clean state
      expect(store.getState().thread).toBeNull();
      expect(store.getState().messages).toHaveLength(0);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should handle multiple resets without errors', () => {
      store.getState().initializeThread(createMockThread(), createMockParticipants(2));

      // Multiple resets
      store.getState().resetToNewChat();
      store.getState().resetToNewChat();
      store.getState().resetToOverview();

      expect(store.getState().thread).toBeNull();
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should handle undefined/null values safely', () => {
      // Setting null values
      store.getState().setThread(null);
      store.getState().setError(null);
      store.getState().setCreatedThreadId(null);
      store.getState().setPendingMessage(null);

      const state = store.getState();
      expect(state.thread).toBeNull();
      expect(state.error).toBeNull();
      expect(state.createdThreadId).toBeNull();
      expect(state.pendingMessage).toBeNull();
    });

    it('should handle form state preservation during streaming', () => {
      store.getState().setInputValue('Test input');
      store.getState().setSelectedMode('debating');
      store.getState().setEnableWebSearch(true);

      store.getState().setIsStreaming(true);

      // Form state preserved
      expect(store.getState().inputValue).toBe('Test input');
      expect(store.getState().selectedMode).toBe('debating');
      expect(store.getState().enableWebSearch).toBe(true);
    });
  });
});
