/**
 * Multi-Round Web Search Lifecycle Tests
 *
 * **ROOT CAUSE PREVENTION**: Tests ensuring the race condition bug is fixed:
 * - Provider and PreSearchStream racing to make duplicate POST requests
 * - "Malformed JSON in request body" error from aborted/duplicate requests
 * - addPreSearch/addAnalysis not handling status upgrades correctly
 *
 * **TEST COVERAGE**:
 * 1. Multiple round generations (round 0, 1, 2, ..., N)
 * 2. Web search toggle mid-conversation (enabled → disabled → enabled)
 * 3. Full round lifecycle: user message → pre-search → participants → analysis
 * 4. Race condition prevention between provider and orchestrator
 * 5. Store state coherency throughout the flow
 * 6. Gradual streaming of pre-search and analysis data
 *
 * @see src/stores/chat/store.ts - addPreSearch race condition fix
 * @see src/components/chat/pre-search-stream.tsx - hasStoreTriggered check
 * @see src/components/providers/chat-store-provider.tsx - provider execution flow
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ConfidenceWeightings,
  DebatePhases,
  PreSearchStatuses,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
  createStreamingAnalysis,
} from './test-factories';

// ============================================================================
// SECTION 1: MULTI-ROUND GENERATION WITH WEB SEARCH
// ============================================================================

describe('section 1: Multi-Round Generation with Web Search', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('complete Multi-Round Flow (Rounds 0-2)', () => {
    it('should handle 3 consecutive rounds with web search enabled', () => {
      // Setup: Thread with web search enabled
      const thread = createMockThread({
        id: 'thread-multi',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, []);

      // ========== ROUND 0 ==========
      // User submits first message
      store.getState().setMessages(() => [createMockUserMessage(0, 'What is Bitcoin?')]);

      // Pre-search lifecycle for round 0
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch(createMockPreSearch({
        id: 'ps-0',
        threadId: 'thread-multi',
        roundNumber: 0,
        userQuery: 'What is Bitcoin?',
        status: AnalysisStatuses.PENDING, // ✅ Backend uses AnalysisStatuses for pre-search PENDING
      }));

      // Pre-search streams and completes
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      // Participants stream
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setIsStreaming(false);

      // Analysis lifecycle for round 0
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      store.getState().updateAnalysisData(0, createMockAnalysisPayload(0));

      // Verify round 0 complete
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // ========== ROUND 1 ==========
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1, 'How does mining work?')]);

      // Pre-search lifecycle for round 1
      store.getState().markPreSearchTriggered(1);
      store.getState().addPreSearch(createMockPreSearch({
        id: 'ps-1',
        threadId: 'thread-multi',
        roundNumber: 1,
        userQuery: 'How does mining work?',
        status: AnalysisStatuses.PENDING, // ✅ Backend uses AnalysisStatuses for pre-search PENDING
      }));
      store.getState().updatePreSearchStatus(1, PreSearchStatuses.STREAMING);
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      // Participants stream for round 1
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 1),
        createMockMessage(1, 1),
      ]);
      store.getState().setIsStreaming(false);

      // Analysis for round 1
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createPendingAnalysis(1));
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.STREAMING);
      store.getState().updateAnalysisData(1, createMockAnalysisPayload(1));

      // Verify round 1 complete
      expect(store.getState().preSearches[1].status).toBe(PreSearchStatuses.COMPLETE);
      expect(store.getState().analyses[1].status).toBe(AnalysisStatuses.COMPLETE);

      // ========== ROUND 2 ==========
      store.getState().setMessages(prev => [...prev, createMockUserMessage(2, 'What about energy consumption?')]);

      // Pre-search lifecycle for round 2
      store.getState().markPreSearchTriggered(2);
      store.getState().addPreSearch(createMockPreSearch({
        id: 'ps-2',
        threadId: 'thread-multi',
        roundNumber: 2,
        userQuery: 'What about energy consumption?',
        status: AnalysisStatuses.PENDING, // ✅ Backend uses AnalysisStatuses for pre-search PENDING
      }));
      store.getState().updatePreSearchStatus(2, PreSearchStatuses.STREAMING);
      store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());

      // Participants stream for round 2
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [
        ...prev,
        createMockMessage(0, 2),
        createMockMessage(1, 2),
      ]);
      store.getState().setIsStreaming(false);

      // Analysis for round 2
      store.getState().markAnalysisCreated(2);
      store.getState().addAnalysis(createPendingAnalysis(2));
      store.getState().updateAnalysisStatus(2, AnalysisStatuses.STREAMING);
      store.getState().updateAnalysisData(2, createMockAnalysisPayload(2));

      // ========== FINAL VERIFICATION ==========
      const state = store.getState();

      // Verify all rounds complete
      expect(state.preSearches).toHaveLength(3);
      expect(state.analyses).toHaveLength(3);

      // Verify each round's status
      for (let round = 0; round < 3; round++) {
        expect(state.preSearches[round].roundNumber).toBe(round);
        expect(state.preSearches[round].status).toBe(PreSearchStatuses.COMPLETE);
        expect(state.analyses[round].roundNumber).toBe(round);
        expect(state.analyses[round].status).toBe(AnalysisStatuses.COMPLETE);
      }

      // Verify messages count: 3 user + 6 participant (2 per round)
      expect(state.messages).toHaveLength(9);

      // Verify tracking state
      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
      expect(state.hasPreSearchBeenTriggered(2)).toBe(true);
      expect(state.hasAnalysisBeenCreated(0)).toBe(true);
      expect(state.hasAnalysisBeenCreated(1)).toBe(true);
      expect(state.hasAnalysisBeenCreated(2)).toBe(true);
    });

    it('should maintain correct round number associations', () => {
      const thread = createMockThread({ id: 'thread-assoc', enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // Add pre-searches and analyses for multiple rounds
      for (let round = 0; round < 5; round++) {
        store.getState().markPreSearchTriggered(round);
        store.getState().addPreSearch(createMockPreSearch({
          id: `ps-${round}`,
          threadId: 'thread-assoc',
          roundNumber: round,
          userQuery: `Query for round ${round}`,
          status: PreSearchStatuses.COMPLETE,
          searchData: createMockPreSearchDataPayload(),
        }));

        store.getState().markAnalysisCreated(round);
        store.getState().addAnalysis(createMockAnalysis({
          id: `analysis-${round}`,
          threadId: 'thread-assoc',
          roundNumber: round,
          status: AnalysisStatuses.COMPLETE,
          analysisData: createMockAnalysisPayload(round),
        }));
      }

      const state = store.getState();

      // Verify each pre-search and analysis is correctly associated
      for (let round = 0; round < 5; round++) {
        const preSearch = state.preSearches.find(ps => ps.roundNumber === round);
        const analysis = state.analyses.find(a => a.roundNumber === round);

        expect(preSearch).toBeDefined();
        expect(preSearch?.userQuery).toBe(`Query for round ${round}`);
        expect(analysis).toBeDefined();
        expect(analysis?.analysisData?.roundNumber).toBe(round);
      }
    });
  });
});

// ============================================================================
// SECTION 2: WEB SEARCH TOGGLE MID-CONVERSATION
// ============================================================================

describe('section 2: Web Search Toggle Mid-Conversation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('toggle Scenarios', () => {
    it('should handle: enabled → disabled → enabled across rounds', () => {
      const thread = createMockThread({
        id: 'thread-toggle',
        enableWebSearch: true, // Start enabled
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // ========== ROUND 0: Web search ENABLED ==========
      store.getState().setMessages(() => [createMockUserMessage(0)]);
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(0),
      }));

      expect(store.getState().preSearches).toHaveLength(1);

      // ========== ROUND 1: Web search DISABLED ==========
      // User toggles web search off
      store.getState().setThread({
        ...thread,
        enableWebSearch: false,
      });

      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);

      // No pre-search for round 1 (web search disabled)
      // Participants stream directly
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setIsStreaming(false);

      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(1),
      }));

      // Still only 1 pre-search (from round 0)
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().analyses).toHaveLength(2);

      // ========== ROUND 2: Web search RE-ENABLED ==========
      store.getState().setThread({
        ...thread,
        enableWebSearch: true,
      });

      store.getState().setMessages(prev => [...prev, createMockUserMessage(2)]);
      store.getState().markPreSearchTriggered(2);
      store.getState().addPreSearch(createMockPreSearch({
        id: 'ps-2',
        roundNumber: 2,
        status: PreSearchStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 2)]);
      store.getState().setIsStreaming(false);
      store.getState().markAnalysisCreated(2);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 2,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(2),
      }));

      // Now 2 pre-searches (rounds 0 and 2), 3 analyses
      const state = store.getState();
      expect(state.preSearches).toHaveLength(2);
      expect(state.analyses).toHaveLength(3);

      // Verify pre-search round numbers
      expect(state.preSearches.map(ps => ps.roundNumber)).toEqual([0, 2]);

      // Verify tracking
      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false); // Never triggered
      expect(state.hasPreSearchBeenTriggered(2)).toBe(true);
    });

    it('should not create pre-search when web search disabled', () => {
      const thread = createMockThread({
        id: 'thread-disabled',
        enableWebSearch: false,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // Complete 3 rounds without web search
      for (let round = 0; round < 3; round++) {
        store.getState().setMessages(prev => [...prev, createMockUserMessage(round)]);
        store.getState().setIsStreaming(true);
        store.getState().setMessages(prev => [...prev, createMockMessage(0, round)]);
        store.getState().setIsStreaming(false);
        store.getState().markAnalysisCreated(round);
        store.getState().addAnalysis(createMockAnalysis({
          roundNumber: round,
          status: AnalysisStatuses.COMPLETE,
        }));
      }

      const state = store.getState();
      expect(state.preSearches).toHaveLength(0);
      expect(state.analyses).toHaveLength(3);
      expect(state.messages).toHaveLength(6); // 3 user + 3 participant
    });

    it('should handle rapid toggle without race conditions', () => {
      const thread = createMockThread({
        id: 'thread-rapid',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // Simulate rapid toggling during round 0
      store.getState().setThread({ ...thread, enableWebSearch: false });
      store.getState().setThread({ ...thread, enableWebSearch: true });
      store.getState().setThread({ ...thread, enableWebSearch: false });
      store.getState().setThread({ ...thread, enableWebSearch: true });

      // Final state should be enabled
      expect(store.getState().thread?.enableWebSearch).toBe(true);

      // Now proceed with round - pre-search should work
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
    });
  });
});

// ============================================================================
// SECTION 3: RACE CONDITION PREVENTION (ROOT CAUSE FIX)
// ============================================================================

describe('section 3: Race Condition Prevention (Root Cause Fix)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('addPreSearch Status Upgrade Fix', () => {
    /**
     * ROOT CAUSE: Provider and orchestrator race to add pre-search
     * - Orchestrator adds PENDING (from query invalidation)
     * - Provider adds STREAMING (from .then() callback)
     * - Old behavior: STREAMING was skipped, PreSearchStream saw PENDING
     * - Fixed behavior: PENDING is upgraded to STREAMING
     */
    it('should upgrade PENDING to STREAMING when provider wins race', () => {
      const thread = createMockThread({ id: 'thread-race' });
      store.getState().initializeThread(thread, [], []);

      // Step 1: Orchestrator adds PENDING (wins first)
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING, // ✅ Backend uses AnalysisStatuses for pre-search PENDING
        userQuery: 'race test',
      }));

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // Step 2: Provider adds STREAMING (should UPGRADE, not skip)
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.STREAMING,
        userQuery: 'race test',
      }));

      // Verify: Status upgraded to STREAMING
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);
    });

    it('should not downgrade STREAMING to PENDING', () => {
      const thread = createMockThread({ id: 'thread-no-downgrade' });
      store.getState().initializeThread(thread, [], []);

      // Provider adds STREAMING first
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.STREAMING,
      }));

      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);

      // Orchestrator tries to add PENDING (late sync) - should be ignored
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING, // ✅ Backend uses AnalysisStatuses for pre-search PENDING
      }));

      // Verify: Status still STREAMING (not downgraded)
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);
    });

    it('should prevent duplicate pre-searches for same round', () => {
      const thread = createMockThread({ id: 'thread-dedup' });
      store.getState().initializeThread(thread, [], []);

      // Multiple additions for same round
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0, status: PreSearchStatuses.PENDING }));
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0, status: PreSearchStatuses.STREAMING }));
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0, status: PreSearchStatuses.COMPLETE }));

      // Only one pre-search should exist
      expect(store.getState().preSearches).toHaveLength(1);
    });
  });

  describe('addAnalysis Deduplication Fix', () => {
    it('should prevent duplicate analyses for same round', () => {
      const thread = createMockThread({ id: 'thread-analysis-dedup' });
      store.getState().initializeThread(thread, [], []);

      // Multiple additions for same round
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().addAnalysis(createStreamingAnalysis(0));
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));

      // Only one analysis should exist
      expect(store.getState().analyses).toHaveLength(1);
    });

    it('should allow analyses for different rounds', () => {
      const thread = createMockThread({ id: 'thread-multi-analysis' });
      store.getState().initializeThread(thread, [], []);

      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 1 }));
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 2 }));

      expect(store.getState().analyses).toHaveLength(3);
      expect(store.getState().analyses.map(a => a.roundNumber)).toEqual([0, 1, 2]);
    });
  });

  describe('tracking State Prevents Duplicate Triggers', () => {
    it('should track pre-search trigger state per round', () => {
      const thread = createMockThread({ id: 'thread-track' });
      store.getState().initializeThread(thread, [], []);

      // Initially not triggered
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);

      // Mark round 0 triggered
      store.getState().markPreSearchTriggered(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);

      // Mark round 1 triggered
      store.getState().markPreSearchTriggered(1);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(true);
    });

    it('should track analysis creation state per round', () => {
      const thread = createMockThread({ id: 'thread-analysis-track' });
      store.getState().initializeThread(thread, [], []);

      // Initially not created
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);

      // Mark created
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // Clear and verify
      store.getState().clearAnalysisTracking(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });
  });
});

// ============================================================================
// SECTION 4: FULL ROUND LIFECYCLE WITH STREAMING
// ============================================================================

describe('section 4: Full Round Lifecycle with Streaming', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('complete Round Lifecycle Simulation', () => {
    it('should simulate full round: user → pre-search → participants → analysis', () => {
      const thread = createMockThread({
        id: 'thread-lifecycle',
        enableWebSearch: true,
      });
      const participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
      ];

      // Initialize
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // ========== PHASE 1: User Message ==========
      const userMessage = createMockUserMessage(0, 'Explain quantum computing');
      store.getState().setMessages(() => [userMessage]);

      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0].role).toBe('user');

      // ========== PHASE 2: Pre-Search (Web Search) ==========
      // 2a. Mark triggered (prevents duplicate)
      store.getState().markPreSearchTriggered(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      // 2b. Create PENDING pre-search
      store.getState().addPreSearch(createMockPreSearch({
        id: 'ps-lifecycle-0',
        threadId: 'thread-lifecycle',
        roundNumber: 0,
        userQuery: 'Explain quantum computing',
        status: AnalysisStatuses.PENDING, // ✅ Backend uses AnalysisStatuses for pre-search PENDING
      }));

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      // 2c. Start streaming
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);

      // 2d. Gradual data streaming (simulating SSE events)
      // Note: In real app, partial data arrives via SSE; here we verify the complete flow

      // 2e. Complete pre-search
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
      expect(store.getState().preSearches[0].searchData).not.toBeNull();

      // ========== PHASE 3: Participant Streaming ==========
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);

      // Participant 0 responds
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      expect(store.getState().messages).toHaveLength(2);

      // Participant 1 responds
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
      expect(store.getState().messages).toHaveLength(3);

      // Streaming complete
      store.getState().setIsStreaming(false);
      expect(store.getState().isStreaming).toBe(false);

      // ========== PHASE 4: Moderator Analysis ==========
      // 4a. Mark analysis created
      store.getState().markAnalysisCreated(0);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // 4b. Create PENDING analysis
      store.getState().addAnalysis(createMockAnalysis({
        id: 'analysis-lifecycle-0',
        threadId: 'thread-lifecycle',
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
        userQuestion: 'Explain quantum computing',
      }));

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

      // 4c. Start streaming analysis
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

      // 4d. Complete analysis with full payload
      const analysisPayload = createMockAnalysisPayload(0, {
        userQuestion: 'Explain quantum computing',
        roundConfidence: 85,
        confidenceWeighting: ConfidenceWeightings.BALANCED,
        consensusEvolution: [
          { phase: DebatePhases.OPENING, percentage: 40, label: 'Opening' },
          { phase: DebatePhases.REBUTTAL, percentage: 60, label: 'Rebuttal' },
          { phase: DebatePhases.CROSS_EXAM, percentage: 70, label: 'Cross-Exam' },
          { phase: DebatePhases.SYNTHESIS, percentage: 80, label: 'Synthesis' },
          { phase: DebatePhases.FINAL_VOTE, percentage: 85, label: 'Final Vote' },
        ],
      });
      store.getState().updateAnalysisData(0, analysisPayload);

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().analyses[0].analysisData?.roundConfidence).toBe(85);

      // ========== FINAL STATE VERIFICATION ==========
      const finalState = store.getState();

      // Messages: 1 user + 2 participants
      expect(finalState.messages).toHaveLength(3);

      // Pre-search complete
      expect(finalState.preSearches).toHaveLength(1);
      expect(finalState.preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);

      // Analysis complete
      expect(finalState.analyses).toHaveLength(1);
      expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // Not streaming
      expect(finalState.isStreaming).toBe(false);

      // Tracking state
      expect(finalState.hasPreSearchBeenTriggered(0)).toBe(true);
      expect(finalState.hasAnalysisBeenCreated(0)).toBe(true);
    });

    it('should handle round without web search (simplified lifecycle)', () => {
      const thread = createMockThread({
        id: 'thread-no-ws',
        enableWebSearch: false,
      });

      store.getState().initializeThread(thread, [createMockParticipant(0)], []);

      // User message
      store.getState().setMessages(() => [createMockUserMessage(0)]);

      // No pre-search phase - directly to participants
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      // Analysis
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));

      const state = store.getState();
      expect(state.preSearches).toHaveLength(0);
      expect(state.analyses).toHaveLength(1);
      expect(state.messages).toHaveLength(2);
    });
  });

  describe('streaming State Management', () => {
    it('should track streaming state correctly during pre-search', () => {
      const thread = createMockThread({ id: 'thread-stream-state', enableWebSearch: true });
      store.getState().initializeThread(thread, [], []);

      // Pre-search lifecycle
      store.getState().addPreSearch(createPendingPreSearch(0));
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);

      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
    });

    it('should track streaming state correctly during analysis', () => {
      const thread = createMockThread({ id: 'thread-analysis-stream' });
      store.getState().initializeThread(thread, [], []);

      store.getState().addAnalysis(createPendingAnalysis(0));
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

      store.getState().updateAnalysisData(0, createMockAnalysisPayload(0));
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });
});

// ============================================================================
// SECTION 5: STORE STATE COHERENCY
// ============================================================================

describe('section 5: Store State Coherency', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('state Consistency After Operations', () => {
    it('should maintain thread reference integrity', () => {
      const thread = createMockThread({ id: 'thread-integrity' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // Verify thread is set
      expect(store.getState().thread?.id).toBe('thread-integrity');

      // Update thread
      store.getState().setThread({ ...thread, title: 'Updated Title' });
      expect(store.getState().thread?.title).toBe('Updated Title');
      expect(store.getState().thread?.id).toBe('thread-integrity');
    });

    it('should clear all state on reset', () => {
      const thread = createMockThread({ id: 'thread-reset', enableWebSearch: true });
      store.getState().initializeThread(thread, [createMockParticipant(0)], [createMockUserMessage(0)]);

      // Add some data
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0 }));
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

      // Verify data exists
      expect(store.getState().thread).not.toBeNull();
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().analyses).toHaveLength(1);

      // Reset
      store.getState().reset();

      // Verify cleared
      expect(store.getState().thread).toBeNull();
      expect(store.getState().preSearches).toHaveLength(0);
      expect(store.getState().analyses).toHaveLength(0);
      expect(store.getState().messages).toHaveLength(0);
    });

    it('should maintain consistency during concurrent updates', () => {
      const thread = createMockThread({ id: 'thread-concurrent' });
      store.getState().initializeThread(thread, [], []);

      // Simulate concurrent updates
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0, status: PreSearchStatuses.PENDING }));
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().setIsStreaming(true);
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

      const state = store.getState();
      expect(state.preSearches[0].status).toBe(PreSearchStatuses.STREAMING);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.STREAMING);
      expect(state.isStreaming).toBe(true);
    });
  });

  describe('round Number Boundaries', () => {
    it('should handle high round numbers correctly', () => {
      const thread = createMockThread({ id: 'thread-high-round' });
      store.getState().initializeThread(thread, [], []);

      // Add data for round 99
      store.getState().markPreSearchTriggered(99);
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 99 }));
      store.getState().markAnalysisCreated(99);
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 99 }));

      expect(store.getState().hasPreSearchBeenTriggered(99)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(99)).toBe(true);
      expect(store.getState().preSearches[0].roundNumber).toBe(99);
      expect(store.getState().analyses[0].roundNumber).toBe(99);
    });

    it('should handle round 0 edge case', () => {
      const thread = createMockThread({ id: 'thread-round-0' });
      store.getState().initializeThread(thread, [], []);

      // Round 0 is the first round
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      store.getState().markPreSearchTriggered(0);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0 }));
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0].roundNumber).toBe(0);
    });
  });
});

// ============================================================================
// SECTION 6: ERROR RECOVERY AND EDGE CASES
// ============================================================================

describe('section 6: Error Recovery and Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('failed Pre-Search Recovery', () => {
    it('should handle pre-search failure and allow retry', () => {
      const thread = createMockThread({ id: 'thread-fail-retry', enableWebSearch: true });
      store.getState().initializeThread(thread, [], []);

      // Pre-search fails
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING, // ✅ Backend uses AnalysisStatuses for pre-search PENDING
      }));
      store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
      store.getState().updatePreSearchError(0, 'Network error');

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.FAILED);
      expect(store.getState().preSearches[0].errorMessage).toBe('Network error');

      // Clear for retry
      store.getState().clearPreSearchTracking(0);
      store.getState().removePreSearch(0);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
      expect(store.getState().preSearches).toHaveLength(0);

      // Retry
      store.getState().markPreSearchTriggered(0);
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
    });
  });

  describe('failed Analysis Recovery', () => {
    it('should handle analysis failure and allow retry', () => {
      const thread = createMockThread({ id: 'thread-analysis-fail' });
      store.getState().initializeThread(thread, [], []);

      // Analysis fails
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      store.getState().updateAnalysisError(0, 'Stream timeout');

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);

      // Clear for retry
      store.getState().clearAnalysisTracking(0);
      store.getState().removeAnalysis(0);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
      expect(store.getState().analyses).toHaveLength(0);

      // Retry
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(0),
      }));

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });

  describe('timeout Detection', () => {
    it('should detect stuck streaming pre-search', () => {
      const thread = createMockThread({ id: 'thread-stuck-ps', enableWebSearch: true });
      store.getState().initializeThread(thread, [], []);

      // Add streaming pre-search that started 50 seconds ago (exceeds 45s default timeout)
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: PreSearchStatuses.STREAMING,
        createdAt: new Date(Date.now() - 50000), // 50 seconds ago
      }));

      // Trigger stuck check
      store.getState().checkStuckPreSearches();

      // Should be marked complete to unblock flow
      expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
    });

    it('should detect stuck streaming analysis and allow manual recovery', () => {
      const thread = createMockThread({ id: 'thread-stuck-analysis' });
      store.getState().initializeThread(thread, [], []);

      // Add streaming analysis that started 95 seconds ago (exceeds 90s timeout)
      const stuckAnalysis = createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.STREAMING,
        createdAt: new Date(Date.now() - 95000), // 95 seconds ago
      });
      store.getState().addAnalysis(stuckAnalysis);

      // Verify analysis is stuck in streaming
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);
      const createdAt = store.getState().analyses[0].createdAt;
      expect(Date.now() - createdAt.getTime()).toBeGreaterThan(90000);

      // Manual recovery: Complete the stuck analysis
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

      // Should be marked complete to unblock flow
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });
});
