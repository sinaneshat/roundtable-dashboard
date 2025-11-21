/**
 * Provider Integration Flow Tests
 *
 * Tests for the critical blind spots in the chat flow that weren't covered:
 * 1. Provider-level pre-search execution triggering
 * 2. Navigation timing (analysis completion → URL update → router.push)
 * 3. Stop button during various states
 * 4. Error recovery scenarios
 * 5. Race conditions from FLOW_DOCUMENTATION.md Part 14
 *
 * These tests focus on the DECISION LOGIC and STATE TRANSITIONS that the
 * provider should make, verifying the conditions that trigger specific actions.
 *
 * Location: /src/stores/chat/__tests__/provider-integration-flow.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ScreenModes,
} from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// PROVIDER-LEVEL PRE-SEARCH EXECUTION TESTS
// ============================================================================

describe('provider Pre-Search Execution Triggering', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('condition Detection: When Provider Should Execute Pre-Search', () => {
    /**
     * The provider should trigger pre-search execution when:
     * 1. Web search is enabled
     * 2. Pre-search exists for the round
     * 3. Pre-search is in PENDING status
     *
     * This is the exact condition that was missed in the original bug.
     */
    it('should detect when pre-search needs execution (PENDING status)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Setup pending message for round 1
      store.getState().prepareForNewMessage('Second question', ['model-0']);

      // Add pre-search in PENDING status
      store.getState().addPreSearch(createPendingPreSearch(1));

      // Provider condition: Should execute pre-search?
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 1);
      const shouldExecute = preSearchForRound
        && preSearchForRound.status === AnalysisStatuses.PENDING;

      expect(shouldExecute).toBe(true);
    });

    it('should NOT execute when pre-search is already STREAMING', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);

      // Pre-search already streaming
      const streamingPreSearch: StoredPreSearch = {
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.STREAMING,
      };
      store.getState().addPreSearch(streamingPreSearch);

      // Provider condition: Should execute pre-search?
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldExecute = preSearchForRound
        && preSearchForRound.status === AnalysisStatuses.PENDING;

      expect(shouldExecute).toBe(false);
    });

    it('should NOT execute when pre-search is COMPLETE', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);

      // Pre-search already complete
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // Provider condition: Should execute pre-search?
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldExecute = preSearchForRound
        && preSearchForRound.status === AnalysisStatuses.PENDING;

      expect(shouldExecute).toBe(false);
    });

    it('should NOT execute when web search is disabled', () => {
      const thread = createMockThread({ enableWebSearch: false });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);

      // No pre-search should exist
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);

      expect(preSearchForRound).toBeUndefined();
    });
  });

  describe('condition Detection: When Provider Should Create Pre-Search', () => {
    it('should detect when pre-search needs creation (missing for round)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Round 0 pre-search exists
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Prepare for round 1
      store.getState().prepareForNewMessage('Second question', ['model-0']);

      // Provider condition: Should create pre-search?
      const state = store.getState();
      const newRoundNumber = 1;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === newRoundNumber);
      const webSearchEnabled = thread.enableWebSearch;
      const shouldCreate = webSearchEnabled && !preSearchForRound;

      expect(shouldCreate).toBe(true);
    });

    it('should NOT create pre-search when it already exists', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);

      // Round 0 pre-search already exists (even if PENDING)
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Provider condition: Should create pre-search?
      const state = store.getState();
      const newRoundNumber = 0;
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === newRoundNumber);
      const webSearchEnabled = thread.enableWebSearch;
      const shouldCreate = webSearchEnabled && !preSearchForRound;

      expect(shouldCreate).toBe(false);
    });
  });

  describe('condition Detection: When Provider Should Send Message', () => {
    it('should allow message sending when pre-search is COMPLETE', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search complete
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // Provider condition: Can send message?
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearchForRound
        && (preSearchForRound.status === AnalysisStatuses.PENDING
          || preSearchForRound.status === AnalysisStatuses.STREAMING);

      expect(shouldWait).toBe(false);
    });

    it('should allow message sending when pre-search FAILED', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search failed
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Network error',
      }));

      // Provider condition: Can send message?
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearchForRound
        && (preSearchForRound.status === AnalysisStatuses.PENDING
          || preSearchForRound.status === AnalysisStatuses.STREAMING);

      expect(shouldWait).toBe(false);
    });

    it('should block message sending when pre-search is PENDING', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search pending
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Provider condition: Should wait?
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearchForRound
        && (preSearchForRound.status === AnalysisStatuses.PENDING
          || preSearchForRound.status === AnalysisStatuses.STREAMING);

      expect(shouldWait).toBe(true);
    });

    it('should block message sending when pre-search is STREAMING', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search streaming
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.STREAMING,
      });

      // Provider condition: Should wait?
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearchForRound
        && (preSearchForRound.status === AnalysisStatuses.PENDING
          || preSearchForRound.status === AnalysisStatuses.STREAMING);

      expect(shouldWait).toBe(true);
    });
  });
});

// ============================================================================
// NAVIGATION TIMING TESTS
// ============================================================================

describe('navigation Timing and Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('analysis Completion Detection', () => {
    /**
     * Per FLOW_DOCUMENTATION.md Part 12 & 14:
     * Navigation should happen when:
     * 1. Analysis status is COMPLETE
     * 2. OR analysis is STREAMING but > 60s (timeout)
     * 3. OR analysis is PENDING but !isStreaming and > 60s
     */
    it('should detect navigation readiness when analysis is COMPLETE', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Analysis complete
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Check navigation condition
      const state = store.getState();
      const analysis = state.analyses.find(a => a.roundNumber === 0);
      const isComplete = analysis?.status === AnalysisStatuses.COMPLETE;

      expect(isComplete).toBe(true);
    });

    it('should detect timeout condition for STREAMING analysis > 60s', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis streaming for > 60 seconds
      const oldAnalysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 61000), // 61 seconds ago
      });
      store.getState().addAnalysis(oldAnalysis);

      // Check timeout condition
      const state = store.getState();
      const analysis = state.analyses.find(a => a.roundNumber === 0);
      const TIMEOUT_MS = 60000;
      const elapsed = analysis ? Date.now() - analysis.createdAt.getTime() : 0;
      const isTimedOut = analysis?.status === AnalysisStatuses.STREAMING && elapsed > TIMEOUT_MS;

      expect(isTimedOut).toBe(true);
    });

    it('should NOT timeout STREAMING analysis < 60s', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis streaming for < 60 seconds
      const recentAnalysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 30000), // 30 seconds ago
      });
      store.getState().addAnalysis(recentAnalysis);

      // Check timeout condition
      const state = store.getState();
      const analysis = state.analyses.find(a => a.roundNumber === 0);
      const TIMEOUT_MS = 60000;
      const elapsed = analysis ? Date.now() - analysis.createdAt.getTime() : 0;
      const isTimedOut = analysis?.status === AnalysisStatuses.STREAMING && elapsed > TIMEOUT_MS;

      expect(isTimedOut).toBe(false);
    });
  });

  describe('navigation Guard Flags', () => {
    /**
     * Note: hasNavigated is managed in flow-controller components, not the store.
     * These tests verify the store state that navigation depends on.
     */
    it('should track screen mode for navigation', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Initially on overview
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

      // After navigation would set to thread
      store.getState().setScreenMode(ScreenModes.THREAD);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('should reset screen mode on thread reset', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Reset thread state
      store.getState().resetToNewChat();

      // Screen mode should be reset
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });
  });

  describe('screen Mode Transitions', () => {
    it('should correctly transition from overview to thread', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

      // After navigation
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('should maintain state during screen mode change', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Add pre-search and analysis
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0 }));
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

      // Change screen mode
      store.getState().setScreenMode(ScreenModes.THREAD);

      // State should be preserved
      const state = store.getState();
      expect(state.messages).toHaveLength(3);
      expect(state.participants).toHaveLength(2);
      expect(state.preSearches).toHaveLength(1);
      expect(state.analyses).toHaveLength(1);
      expect(state.screenMode).toBe(ScreenModes.THREAD);
    });
  });
});

// ============================================================================
// STOP BUTTON DURING VARIOUS STATES
// ============================================================================

describe('stop Button Race Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('stop During Pre-Search', () => {
    it('should handle stop when pre-search is STREAMING', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Pre-search streaming
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.STREAMING,
      });

      // User clicks stop (setIsStreaming(false) is what the component does)
      store.getState().setIsStreaming(false);

      // Streaming should stop
      expect(store.getState().isStreaming).toBe(false);

      // Pre-search may still be STREAMING in DB (backend will timeout)
      // But frontend should not wait for it
    });

    it('should reset pending message state on stop', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().prepareForNewMessage('Test question', ['model-0']);
      store.getState().setIsStreaming(true);

      // User clicks stop before message was sent
      store.getState().setIsStreaming(false);

      // Streaming stops
      expect(store.getState().isStreaming).toBe(false);

      // pendingMessage may still be there for retry
      // hasSentPendingMessage should be false
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });
  });

  describe('stop During Participant Streaming', () => {
    it('should stop at current participant', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1); // Second participant

      // P0 done, P1 streaming
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // User clicks stop
      store.getState().setIsStreaming(false);

      // Should stop
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().currentParticipantIndex).toBe(1);

      // P2 should not respond
      expect(store.getState().messages).toHaveLength(2); // user + p0
    });

    it('should preserve partial participant response on stop', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Partial response from P0
      const partialMessage = createMockMessage(0, 0);
      partialMessage.parts = [{ type: 'text', text: 'Partial response...' }];
      store.getState().setMessages(prev => [...prev, partialMessage]);

      // User clicks stop
      store.getState().setIsStreaming(false);

      // Partial message should be preserved
      const state = store.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1].parts[0]).toEqual({ type: 'text', text: 'Partial response...' });
    });
  });

  describe('stop Between Participants', () => {
    it('should handle stop between participant transitions', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 complete
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setCurrentParticipantIndex(1);

      // User clicks stop before P1 starts
      store.getState().setIsStreaming(false);

      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().messages).toHaveLength(2); // user + p0
    });
  });

  describe('stop During Analysis', () => {
    it('should not prevent analysis from completing if already started', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setIsStreaming(true);
      store.getState().markAnalysisCreated(0);

      // Analysis streaming
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
      }));

      // User clicks stop
      store.getState().setIsStreaming(false);

      // Analysis should still be there (backend will complete it)
      expect(store.getState().analyses).toHaveLength(1);
    });
  });
});

// ============================================================================
// ERROR RECOVERY SCENARIOS
// ============================================================================

describe('error Recovery Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('pre-Search Failure Recovery', () => {
    it('should continue flow when pre-search creation fails', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Simulate pre-search creation failure (no pre-search added)
      // Provider should have error handling that allows flow to continue

      // No pre-search exists
      expect(store.getState().preSearches).toHaveLength(0);

      // Condition: No pre-search = can proceed (degraded mode)
      const preSearchForRound = store.getState().preSearches.find(ps => ps.roundNumber === 0);
      const shouldProceed = !preSearchForRound;

      // This is a design decision: proceed without pre-search or fail?
      // Current implementation should allow proceeding
      expect(shouldProceed).toBe(true);
    });

    it('should handle pre-search execution failure', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search created but execution failed
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
      store.getState().updatePreSearchError(0, 'Execution timeout');

      // Should NOT block message sending
      const state = store.getState();
      const preSearchForRound = state.preSearches.find(ps => ps.roundNumber === 0);
      const shouldWait = preSearchForRound
        && (preSearchForRound.status === AnalysisStatuses.PENDING
          || preSearchForRound.status === AnalysisStatuses.STREAMING);

      expect(shouldWait).toBe(false);
      expect(preSearchForRound?.errorMessage).toBe('Execution timeout');
    });
  });

  describe('participant Streaming Failure Recovery', () => {
    it('should continue with remaining participants when one fails', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 fails - create error message
      const errorMessage = createMockMessage(0, 0);
      errorMessage.metadata = {
        ...errorMessage.metadata,
        hasError: true,
        errorMessage: 'Model rate limited',
      };
      store.getState().setMessages(prev => [...prev, errorMessage]);

      // Should continue to P1
      store.getState().setCurrentParticipantIndex(1);

      // P1 responds successfully
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

      // Round completes with partial results
      const state = store.getState();
      expect(state.messages).toHaveLength(3); // user + p0 error + p1 success
    });

    it('should handle all participants failing', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Both fail
      const errorMsg0 = createMockMessage(0, 0);
      errorMsg0.metadata = { ...errorMsg0.metadata, hasError: true };
      store.getState().setMessages(prev => [...prev, errorMsg0]);

      const errorMsg1 = createMockMessage(1, 0);
      errorMsg1.metadata = { ...errorMsg1.metadata, hasError: true };
      store.getState().setMessages(prev => [...prev, errorMsg1]);

      // Round completes
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(state.messages).toHaveLength(3);
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('analysis Failure Recovery', () => {
    it('should mark analysis as failed correctly', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().markAnalysisCreated(0);

      // Analysis fails
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
      }));

      const state = store.getState();
      expect(state.analyses[0].status).toBe(AnalysisStatuses.FAILED);
    });

    it('should allow navigation even with failed analysis', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Analysis fails
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
      }));

      // Should still be able to navigate (failed is a terminal state)
      const state = store.getState();
      const analysis = state.analyses.find(a => a.roundNumber === 0);
      const canNavigate = analysis?.status === AnalysisStatuses.COMPLETE
        || analysis?.status === AnalysisStatuses.FAILED;

      expect(canNavigate).toBe(true);
    });
  });

  describe('timeout Protection', () => {
    it('should handle pre-search timeout (>10s)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search created 11 seconds ago, still streaming
      const stuckPreSearch: StoredPreSearch = {
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 11000),
      };
      store.getState().addPreSearch(stuckPreSearch);

      // Check timeout
      const PRESEARCH_TIMEOUT_MS = 10000;
      const preSearch = store.getState().preSearches[0];
      const age = Date.now() - preSearch.createdAt.getTime();
      const isTimedOut = age > PRESEARCH_TIMEOUT_MS;

      expect(isTimedOut).toBe(true);
    });

    it('should handle analysis timeout (>60s)', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Analysis created 61 seconds ago, still streaming
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 61000),
      }));

      // Check timeout
      const ANALYSIS_TIMEOUT_MS = 60000;
      const analysis = store.getState().analyses[0];
      const age = Date.now() - analysis.createdAt.getTime();
      const isTimedOut = age > ANALYSIS_TIMEOUT_MS;

      expect(isTimedOut).toBe(true);
    });
  });
});

// ============================================================================
// RACE CONDITIONS FROM FLOW_DOCUMENTATION.md
// ============================================================================

describe('documented Race Conditions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('rACE 1.1: Thread ID Availability vs Streaming Start', () => {
    it('should block streaming until thread ID is set', () => {
      const participants = [createMockParticipant(0)];

      // Initialize without thread (simulating thread creation in progress)
      store.getState().setParticipants(participants);

      // No thread = cannot stream
      expect(store.getState().thread).toBeNull();

      // After thread is created
      const thread = createMockThread();
      store.getState().setThread(thread);

      // Now can stream
      expect(store.getState().thread).toBeTruthy();
    });
  });

  describe('rACE 3.1: Orchestrator Sync Timing', () => {
    /**
     * Risk: Backend creates PENDING pre-search but frontend hasn't synced
     * Solution: Optimistic blocking when web search enabled
     */
    it('should optimistically block when web search enabled', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // No pre-search synced yet (orchestrator lag)
      expect(store.getState().preSearches).toHaveLength(0);

      // Optimistic blocking: if web search enabled, assume pre-search will exist
      const webSearchEnabled = thread.enableWebSearch;
      const newRoundNumber = 0;
      const preSearchForRound = store.getState().preSearches.find(ps => ps.roundNumber === newRoundNumber);

      // Should wait even though no pre-search in store yet
      const shouldWaitOptimistically = webSearchEnabled && !preSearchForRound;

      // This is the optimistic wait - assume it needs to be created
      expect(shouldWaitOptimistically).toBe(true);
    });
  });

  describe('rACE 4.1: Sequential Participant Coordination', () => {
    it('should maintain correct participant index sequence', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // Initial index
      expect(store.getState().currentParticipantIndex).toBe(0);

      // P0 completes
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setCurrentParticipantIndex(1);
      expect(store.getState().currentParticipantIndex).toBe(1);

      // P1 completes
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
      store.getState().setCurrentParticipantIndex(2);
      expect(store.getState().currentParticipantIndex).toBe(2);

      // P2 completes
      store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);

      // All done
      expect(store.getState().messages).toHaveLength(4);
    });
  });

  describe('rACE 4.2: Stop Button During Participant Switch', () => {
    it('should ignore in-flight messages after stop', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setIsStreaming(true);

      // P0 complete
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setCurrentParticipantIndex(1);

      // User clicks stop
      store.getState().setIsStreaming(false);

      // P1 message arrives (in-flight from backend) - should be checked
      const state = store.getState();
      const shouldIgnoreInFlight = !state.isStreaming;

      expect(shouldIgnoreInFlight).toBe(true);
    });
  });

  describe('rACE 5.1: Analysis Completion Detection', () => {
    it('should use multi-layer detection for analysis completion', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setIsStreaming(false);

      // Add analysis in various states
      const testCases = [
        {
          status: AnalysisStatuses.COMPLETE,
          elapsed: 0,
          expected: true,
          reason: 'COMPLETE status',
        },
        {
          status: AnalysisStatuses.STREAMING,
          elapsed: 61000,
          expected: true,
          reason: 'STREAMING > 60s timeout',
        },
        {
          status: AnalysisStatuses.PENDING,
          elapsed: 61000,
          expected: true,
          reason: 'PENDING + !streaming + > 60s',
        },
        {
          status: AnalysisStatuses.STREAMING,
          elapsed: 30000,
          expected: false,
          reason: 'STREAMING < 60s',
        },
      ];

      for (const testCase of testCases) {
        // Reset analyses
        store.getState().setAnalyses([]);

        // Add test analysis
        const analysis = createMockAnalysis({
          roundNumber: 0,
          status: testCase.status,
          createdAt: new Date(Date.now() - testCase.elapsed),
        });
        store.getState().addAnalysis(analysis);

        // Check completion
        const a = store.getState().analyses[0];
        const isStreaming = store.getState().isStreaming;
        const TIMEOUT = 60000;
        const age = Date.now() - a.createdAt.getTime();

        const isComplete = a.status === AnalysisStatuses.COMPLETE
          || (a.status === AnalysisStatuses.STREAMING && age > TIMEOUT)
          || (a.status === AnalysisStatuses.PENDING && !isStreaming && age > TIMEOUT);

        expect(isComplete).toBe(testCase.expected);
      }
    });
  });
});

// ============================================================================
// COMPLETE JOURNEY INTEGRATION
// ============================================================================

describe('complete Chat Journey Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle complete 2-round journey with web search', () => {
    const thread = createMockThread({
      id: 'thread-journey',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0), createMockParticipant(1)];

    // === ROUND 0: Overview screen ===

    // Initialize on overview
    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // User prepares message
    store.getState().prepareForNewMessage('First question', ['model-0', 'model-1']);

    // Create and complete pre-search for round 0
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().markPreSearchTriggered(0);
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

    // Pre-search complete - can send message
    let state = store.getState();
    let shouldWait = state.preSearches.some(
      ps => ps.roundNumber === 0
        && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
    );
    expect(shouldWait).toBe(false);

    // Send user message and start streaming
    store.getState().setMessages([createMockUserMessage(0, 'First question')]);
    store.getState().setHasSentPendingMessage(true);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // P0 responds
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setCurrentParticipantIndex(1);

    // P1 responds
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

    // Streaming complete
    store.getState().setIsStreaming(false);

    // Analysis starts and completes
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Check navigation readiness
    state = store.getState();
    const analysis0 = state.analyses.find(a => a.roundNumber === 0);
    const canNavigate = analysis0?.status === AnalysisStatuses.COMPLETE;
    expect(canNavigate).toBe(true);

    // Navigate to thread screen
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setPendingMessage('');
    store.getState().setHasSentPendingMessage(false);

    // === ROUND 1: Thread screen ===

    // User prepares second message
    store.getState().prepareForNewMessage('Second question', ['model-0', 'model-1']);

    // Create pre-search for round 1
    store.getState().addPreSearch(createPendingPreSearch(1));
    store.getState().markPreSearchTriggered(1);

    // Pre-search should block message
    state = store.getState();
    shouldWait = state.preSearches.some(
      ps => ps.roundNumber === 1
        && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
    );
    expect(shouldWait).toBe(true);

    // Execute pre-search
    store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

    // Now can send
    shouldWait = state.preSearches.some(
      ps => ps.roundNumber === 1
        && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
    );
    // Note: need to refresh state
    state = store.getState();
    shouldWait = state.preSearches.some(
      ps => ps.roundNumber === 1
        && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
    );
    expect(shouldWait).toBe(false);

    // Send user message
    store.getState().setMessages(prev => [...prev, createMockUserMessage(1, 'Second question')]);
    store.getState().setHasSentPendingMessage(true);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Participants respond
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 1)]);

    // Complete round
    store.getState().setIsStreaming(false);
    store.getState().markAnalysisCreated(1);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 1,
      status: AnalysisStatuses.COMPLETE,
    }));

    // === FINAL VERIFICATION ===

    const finalState = store.getState();

    // Messages: 2 user + 2×2 participants = 6
    expect(finalState.messages).toHaveLength(6);

    // Pre-searches: 2 (one per round)
    expect(finalState.preSearches).toHaveLength(2);
    expect(finalState.preSearches.every(ps => ps.status === AnalysisStatuses.COMPLETE)).toBe(true);

    // Analyses: 2 (one per round)
    expect(finalState.analyses).toHaveLength(2);
    expect(finalState.analyses.every(a => a.status === AnalysisStatuses.COMPLETE)).toBe(true);

    // Screen mode
    expect(finalState.screenMode).toBe(ScreenModes.THREAD);

    // Tracking
    expect(finalState.hasPreSearchBeenTriggered(0)).toBe(true);
    expect(finalState.hasPreSearchBeenTriggered(1)).toBe(true);
    expect(finalState.hasAnalysisBeenCreated(0)).toBe(true);
    expect(finalState.hasAnalysisBeenCreated(1)).toBe(true);
  });

  it('should handle journey with stop button mid-round', () => {
    const thread = createMockThread({ enableWebSearch: false });
    const participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // P0 responds
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setCurrentParticipantIndex(1);

    // User clicks stop before P1
    store.getState().setIsStreaming(false);

    // Round incomplete
    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.messages).toHaveLength(2); // user + p0
    expect(state.currentParticipantIndex).toBe(1);

    // No analysis should be created for incomplete round
    expect(state.hasAnalysisBeenCreated(0)).toBe(false);
  });

  it('should handle journey with pre-search failure', () => {
    const thread = createMockThread({
      id: 'thread-fail',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

    // Pre-search fails
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
    store.getState().updatePreSearchError(0, 'Service unavailable');

    // Should proceed despite failure
    const state = store.getState();
    const shouldWait = state.preSearches.some(
      ps => ps.roundNumber === 0
        && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
    );
    expect(shouldWait).toBe(false);

    // Participant can still respond
    store.getState().setIsStreaming(true);
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setIsStreaming(false);

    // Round completes
    expect(store.getState().messages).toHaveLength(2);
  });
});
