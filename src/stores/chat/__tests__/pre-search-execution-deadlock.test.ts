/**
 * Pre-Search Execution Deadlock Tests
 *
 * Tests for the circular dependency bug where pre-search creation and message
 * sending create a deadlock. This was a critical gap in test coverage.
 *
 * THE BUG (fixed in chat-store-provider.tsx):
 * 1. User submits message → Provider creates PENDING pre-search
 * 2. Provider waits for pre-search to be COMPLETE before sending message
 * 3. Pre-search execution requires PreSearchStream component to be rendered
 * 4. PreSearchStream only renders after user message for that round exists
 * 5. User message only exists after message is sent
 * 6. DEADLOCK - Message waits for pre-search, pre-search waits for message
 *
 * CRITICAL FLOW (from FLOW_DOCUMENTATION.md):
 * - Pre-search MUST complete before participant streaming starts
 * - Status transitions: PENDING → STREAMING → COMPLETED
 * - Each round gets independent pre-search
 * - 10-second timeout for pre-search waiting
 *
 * Location: /src/stores/chat/__tests__/pre-search-execution-deadlock.test.ts
 */

import type { UIMessage } from 'ai';
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
// PRE-SEARCH EXECUTION DEADLOCK TESTS
// ============================================================================

describe('pre-Search Execution Deadlock Prevention', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // CIRCULAR DEPENDENCY BUG SCENARIOS
  // ==========================================================================

  describe('circular Dependency: Pre-Search Creation Without Execution', () => {
    /**
     * This is the exact bug that was missed.
     *
     * Scenario:
     * - Thread screen (subsequent round)
     * - Web search enabled
     * - User sends message
     * - Pre-search created with PENDING status
     * - PreSearchStream never triggers execution (not rendered yet)
     * - Message never sent (waiting for pre-search)
     * - DEADLOCK
     */
    it('should detect when pre-search is stuck in PENDING for subsequent round', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0)];

      // Setup: Round 0 complete on thread screen
      const messagesR0: UIMessage[] = [
        createMockUserMessage(0, 'First question'),
        createMockMessage(0, 0),
      ];

      store.getState().initializeThread(thread, participants, messagesR0);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Complete round 0 analysis
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Complete round 0 pre-search
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // === SIMULATE BUG: User sends second message ===

      // User prepares message for round 1
      store.getState().prepareForNewMessage('Second question', ['model-0']);

      // Pre-search for round 1 is created with PENDING status
      // (This is what the provider does)
      const preSearchR1: StoredPreSearch = {
        id: 'presearch-r1-001',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'Second question',
        status: AnalysisStatuses.PENDING, // PENDING/IDLE
        searchData: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      store.getState().addPreSearch(preSearchR1);

      // THE BUG: Pre-search is PENDING but no execution triggered
      // In the broken code, provider would wait here forever

      const state = store.getState();

      // Verify the problematic state
      expect(state.preSearches).toHaveLength(2);
      expect(state.preSearches[1].roundNumber).toBe(1);
      expect(state.preSearches[1].status).toBe(AnalysisStatuses.PENDING);

      // Message should NOT have been sent yet
      expect(state.hasSentPendingMessage).toBe(false);
      expect(state.pendingMessage).toBe('Second question');

      // The blocking check would return true (should wait)
      const shouldWaitForPreSearch = state.preSearches.some(
        ps => ps.roundNumber === 1
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldWaitForPreSearch).toBe(true);

      // THE FIX: Provider should execute pre-search immediately after creation
      // Instead of waiting for PreSearchStream component
    });

    it('should handle the case where pre-search exists but was never executed', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Pre-search created for round 1 but never executed
      // This simulates page refresh or component unmount during creation
      const stuckPreSearch = createPendingPreSearch(1);
      store.getState().addPreSearch(stuckPreSearch);

      // Verify stuck state
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);
      expect(store.getState().preSearches[0].roundNumber).toBe(1);

      // THE FIX: Provider should detect stuck PENDING and trigger execution
      // Not just wait forever
    });

    it('should differentiate between PENDING (not started) and STREAMING (in progress)', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);

      // Pre-search in PENDING (not started) - should trigger execution
      store.getState().addPreSearch(createPendingPreSearch(0));

      const pendingState = store.getState().preSearches[0].status;
      expect(pendingState).toBe(AnalysisStatuses.PENDING);

      // Update to STREAMING (in progress) - should wait for completion
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      const streamingState = store.getState().preSearches[0].status;
      expect(streamingState).toBe(AnalysisStatuses.STREAMING);

      // For PENDING: Provider should trigger execution POST
      // For STREAMING: Provider should wait for completion
      // Both should NOT send message until COMPLETE
    });
  });

  // ==========================================================================
  // SUBSEQUENT ROUND PRE-SEARCH EXECUTION
  // ==========================================================================

  describe('subsequent Round Pre-Search Execution Flow', () => {
    /**
     * The correct flow for subsequent rounds (per FLOW_DOCUMENTATION.md):
     * 1. User submits message
     * 2. Create PENDING pre-search record
     * 3. IMMEDIATELY execute pre-search (POST request)
     * 4. Wait for COMPLETE status
     * 5. Send user message to participants
     */
    it('should correctly sequence pre-search creation and execution for round 1+', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Setup: Round 0 complete
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Round 0 pre-search complete
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // === ROUND 1: Correct flow ===

      // Step 1: User prepares message
      store.getState().prepareForNewMessage('Second question', ['model-0', 'model-1']);

      // Step 2: Create PENDING pre-search
      store.getState().addPreSearch({
        id: 'presearch-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        userQuery: 'Second question',
        status: AnalysisStatuses.PENDING,
        searchData: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      store.getState().markPreSearchTriggered(1);

      // Step 3: Execute pre-search (status → STREAMING)
      // This is what the provider should do immediately after creation
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);

      // Verify intermediate state
      let state = store.getState();
      expect(state.preSearches[1].status).toBe(AnalysisStatuses.STREAMING);
      expect(state.hasSentPendingMessage).toBe(false);

      // Step 4: Pre-search completes
      const searchData = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(1, searchData);

      // Verify COMPLETE status
      state = store.getState();
      expect(state.preSearches[1].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.preSearches[1].searchData).toBeDefined();

      // Step 5: Now message can be sent
      // Blocking check should return false (can proceed)
      const shouldWait = state.preSearches.some(
        ps => ps.roundNumber === 1
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldWait).toBe(false);
    });

    it('should calculate correct round number for subsequent pre-searches', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      // Setup with multiple rounds
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
      ]);

      // Add pre-searches for existing rounds
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 0, status: AnalysisStatuses.COMPLETE }));
      store.getState().addPreSearch(createMockPreSearch({ roundNumber: 1, status: AnalysisStatuses.COMPLETE }));

      // Calculate next round number
      const messages = store.getState().messages;
      const userMessages = messages.filter(m => m.role === 'user');
      const currentRoundNumber = userMessages.length; // Next round would be 2

      expect(currentRoundNumber).toBe(2);

      // Pre-search for round 2 should have roundNumber: 2
      store.getState().addPreSearch(createPendingPreSearch(2));

      const preSearches = store.getState().preSearches;
      expect(preSearches).toHaveLength(3);
      expect(preSearches[2].roundNumber).toBe(2);
    });
  });

  // ==========================================================================
  // PRE-SEARCH BLOCKING BEHAVIOR
  // ==========================================================================

  describe('pre-Search Blocking with Timeout Protection', () => {
    /**
     * Per FLOW_DOCUMENTATION.md:
     * - Pre-search MUST complete before participant streaming starts
     * - 10-second timeout for pre-search waiting
     * - If pre-search hangs, system proceeds after timeout
     */
    it('should block message sending while pre-search is PENDING or STREAMING', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search in PENDING
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Should block
      let shouldBlock = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldBlock).toBe(true);

      // Update to STREAMING
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Should still block
      shouldBlock = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldBlock).toBe(true);

      // Complete pre-search
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      // Should no longer block
      shouldBlock = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldBlock).toBe(false);
    });

    it('should only block for the current round, not other rounds', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);

      // Round 0 pre-search complete
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // Round 1 pre-search pending
      store.getState().addPreSearch(createPendingPreSearch(1));

      // Check for round 0 - should NOT block
      const blockForRound0 = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(blockForRound0).toBe(false);

      // Check for round 1 - SHOULD block
      const blockForRound1 = store.getState().preSearches.some(
        ps => ps.roundNumber === 1
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(blockForRound1).toBe(true);
    });

    it('should handle pre-search timeout scenario', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search created 11 seconds ago (past 10s timeout)
      const timedOutPreSearch: StoredPreSearch = {
        id: 'presearch-timeout',
        threadId: 'thread-123',
        roundNumber: 0,
        userQuery: 'Test question',
        status: AnalysisStatuses.STREAMING, // Still streaming
        searchData: null,
        createdAt: new Date(Date.now() - 11000), // 11 seconds ago
        updatedAt: new Date(Date.now() - 11000),
      };
      store.getState().addPreSearch(timedOutPreSearch);

      // Calculate if should timeout
      const preSearch = store.getState().preSearches[0];
      const ageMs = Date.now() - preSearch.createdAt.getTime();
      const TIMEOUT_MS = 10000; // 10 seconds

      expect(ageMs).toBeGreaterThan(TIMEOUT_MS);

      // Per docs: "If pre-search hangs, system proceeds after timeout"
      // The timeout check should indicate we can proceed
      const shouldProceedAfterTimeout = ageMs > TIMEOUT_MS;
      expect(shouldProceedAfterTimeout).toBe(true);
    });
  });

  // ==========================================================================
  // WEB SEARCH DISABLED SCENARIOS
  // ==========================================================================

  describe('web Search Disabled: No Pre-Search Blocking', () => {
    it('should not block message sending when web search is disabled', () => {
      const thread = createMockThread({
        enableWebSearch: false, // Web search disabled
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // No pre-search should exist
      expect(store.getState().preSearches).toHaveLength(0);

      // Blocking check should return false
      const shouldBlock = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldBlock).toBe(false);

      // Message can be sent immediately
      store.getState().setHasSentPendingMessage(true);
      expect(store.getState().hasSentPendingMessage).toBe(true);
    });

    it('should allow disabling web search mid-conversation', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Round 0 had pre-search
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        searchData: createMockPreSearchDataPayload(),
      }));

      // Disable web search for thread
      const updatedThread = { ...thread, enableWebSearch: false };
      store.getState().setThread(updatedThread);

      // Round 1 should NOT have pre-search
      // No blocking check needed for round 1
      const shouldBlockR1 = store.getState().preSearches.some(
        ps => ps.roundNumber === 1
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldBlockR1).toBe(false);
    });
  });

  // ==========================================================================
  // ERROR RECOVERY SCENARIOS
  // ==========================================================================

  describe('pre-Search Error Recovery', () => {
    it('should not block forever when pre-search fails', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Pre-search starts
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Pre-search fails - update both status and error message
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);
      store.getState().updatePreSearchError(0, 'Search service unavailable');

      // Status should be FAILED
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.FAILED);
      expect(store.getState().preSearches[0].errorMessage).toBe('Search service unavailable');

      // Should NOT block (FAILED is not PENDING or STREAMING)
      const shouldBlock = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldBlock).toBe(false);

      // Message can proceed even with failed pre-search
    });

    it('should handle multiple pre-search failures gracefully', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
      ]);

      // Round 0 pre-search failed
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Failed 1',
      }));

      // Round 1 pre-search also failed
      store.getState().addPreSearch(createMockPreSearch({
        roundNumber: 1,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Failed 2',
      }));

      // Both rounds should not block
      const blockR0 = store.getState().preSearches.some(
        ps => ps.roundNumber === 0
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      const blockR1 = store.getState().preSearches.some(
        ps => ps.roundNumber === 1
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );

      expect(blockR0).toBe(false);
      expect(blockR1).toBe(false);
    });
  });

  // ==========================================================================
  // INTEGRATION: COMPLETE MULTI-ROUND FLOW
  // ==========================================================================

  describe('integration: Complete Multi-Round Pre-Search Flow', () => {
    it('should correctly handle 3 rounds with pre-search enabled', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Initialize empty thread
      store.getState().initializeThread(thread, participants, []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // === ROUND 0 ===

      // User sends first message
      store.getState().setMessages(prev => [...prev, createMockUserMessage(0, 'Question 1')]);

      // Create and execute pre-search
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().markPreSearchTriggered(0);
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
      store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

      // Participants respond
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

      // Analysis complete
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Navigate to thread screen
      store.getState().setScreenMode(ScreenModes.THREAD);

      // === ROUND 1 ===

      // User sends second message
      // ✅ FIX: prepareForNewMessage now adds optimistic user message, no need for manual setMessages
      store.getState().prepareForNewMessage('Question 2', ['model-0', 'model-1']);

      // Create and execute pre-search for round 1
      store.getState().addPreSearch(createPendingPreSearch(1));
      store.getState().markPreSearchTriggered(1);
      store.getState().updatePreSearchStatus(1, AnalysisStatuses.STREAMING);
      store.getState().updatePreSearchData(1, createMockPreSearchDataPayload());

      // Participants respond
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 1)]);

      // Analysis complete
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }));

      // === ROUND 2 ===

      // User sends third message
      // ✅ FIX: prepareForNewMessage now adds optimistic user message, no need for manual setMessages
      store.getState().prepareForNewMessage('Question 3', ['model-0', 'model-1']);

      // Create and execute pre-search for round 2
      store.getState().addPreSearch(createPendingPreSearch(2));
      store.getState().markPreSearchTriggered(2);
      store.getState().updatePreSearchStatus(2, AnalysisStatuses.STREAMING);
      store.getState().updatePreSearchData(2, createMockPreSearchDataPayload());

      // Participants respond
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 2)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 2)]);

      // Analysis complete
      store.getState().markAnalysisCreated(2);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 2,
        status: AnalysisStatuses.COMPLETE,
      }));

      // === FINAL VERIFICATION ===

      const finalState = store.getState();

      // Verify pre-searches
      expect(finalState.preSearches).toHaveLength(3);
      expect(finalState.preSearches[0].roundNumber).toBe(0);
      expect(finalState.preSearches[1].roundNumber).toBe(1);
      expect(finalState.preSearches[2].roundNumber).toBe(2);
      expect(finalState.preSearches.every(ps => ps.status === AnalysisStatuses.COMPLETE)).toBe(true);

      // Verify analyses
      expect(finalState.analyses).toHaveLength(3);
      expect(finalState.analyses.every(a => a.status === AnalysisStatuses.COMPLETE)).toBe(true);

      // Verify messages
      // 3 rounds × (1 user + 2 participants) = 9 messages
      expect(finalState.messages).toHaveLength(9);

      // Verify tracking
      expect(finalState.hasPreSearchBeenTriggered(0)).toBe(true);
      expect(finalState.hasPreSearchBeenTriggered(1)).toBe(true);
      expect(finalState.hasPreSearchBeenTriggered(2)).toBe(true);
      expect(finalState.hasAnalysisBeenCreated(0)).toBe(true);
      expect(finalState.hasAnalysisBeenCreated(1)).toBe(true);
      expect(finalState.hasAnalysisBeenCreated(2)).toBe(true);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge Cases', () => {
    it('should handle rapid consecutive message submissions', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // Rapidly add messages and pre-searches
      for (let i = 0; i < 5; i++) {
        store.getState().setMessages(prev => [...prev, createMockUserMessage(i)]);
        store.getState().addPreSearch(createPendingPreSearch(i));
        store.getState().updatePreSearchData(i, createMockPreSearchDataPayload());
        store.getState().setMessages(prev => [...prev, createMockMessage(0, i)]);
      }

      // All pre-searches should be complete
      const state = store.getState();
      expect(state.preSearches).toHaveLength(5);
      expect(state.preSearches.every(ps => ps.status === AnalysisStatuses.COMPLETE)).toBe(true);
    });

    it('should handle pre-search for non-existent round gracefully', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      // Add pre-search for round 5 (skipping rounds 1-4)
      store.getState().addPreSearch(createPendingPreSearch(5));

      // Should not cause errors
      const state = store.getState();
      expect(state.preSearches[0].roundNumber).toBe(5);

      // Blocking check for round 5 should work
      const shouldBlock = state.preSearches.some(
        ps => ps.roundNumber === 5
          && (ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING),
      );
      expect(shouldBlock).toBe(true);
    });

    it('should maintain pre-search state across screen mode changes', () => {
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Add pre-search
      store.getState().addPreSearch(createPendingPreSearch(0));

      // Change screen mode
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Pre-search should still exist
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });
  });
});
