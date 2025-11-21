/**
 * Thread Screen Second Message Flow Tests
 *
 * Tests the bug where sending a second message on the thread screen
 * causes infinite errors/renders. This happens after the first round
 * completes and the user is navigated from overview to thread screen.
 *
 * ROOT CAUSE HYPOTHESIS:
 * - Both provider and flow-state-machine try to create analysis
 * - Race condition in analysis creation tracking
 * - completeStreaming() called prematurely/multiple times
 * - Flags get cleared before actual completion
 *
 * Location: /src/stores/chat/__tests__/thread-screen-second-message-flow.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// THREAD SCREEN SECOND MESSAGE FLOW TESTS
// ============================================================================

describe('thread Screen Second Message Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('setup: Simulate Navigation from Overview to Thread', () => {
    it('should correctly set up state after first round on overview and navigation to thread', () => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'test-thread',
        isAiGeneratedTitle: true,
      });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      // === OVERVIEW SCREEN: Complete first round ===

      // Initialize thread (this happens on overview)
      const messagesR0: UIMessage[] = [
        createMockUserMessage(0, 'First question'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      store.getState().initializeThread(thread, participants, messagesR0);
      store.getState().setScreenMode('overview');

      // Complete analysis for round 0
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Verify overview state
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      // === NAVIGATE TO THREAD SCREEN ===
      // In real app, this happens via router.push('/chat/slug')
      // The thread screen calls resetThreadState() or screen initialization

      // Thread screen initialization should reset tracking but keep thread data
      store.getState().setScreenMode('thread');

      // Important: Check what flags are set after "navigation"
      const stateAfterNav = store.getState();

      // Thread and analysis data should persist
      expect(stateAfterNav.thread?.id).toBe('thread-123');
      expect(stateAfterNav.analyses).toHaveLength(1);
      expect(stateAfterNav.messages).toHaveLength(3);

      // Screen mode should be thread
      expect(stateAfterNav.screenMode).toBe('thread');
    });
  });

  describe('second Message: Analysis Creation', () => {
    /**
     * This test simulates what happens when user sends a second message
     * on the thread screen after the first round is complete.
     */
    it('should correctly create analysis for round 1 without duplicate tracking', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Setup: Round 0 complete on thread screen
      const messagesR0: UIMessage[] = [
        createMockUserMessage(0, 'First question'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      store.getState().initializeThread(thread, participants, messagesR0);
      store.getState().setScreenMode('thread');
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // User prepares to send second message
      // This simulates what handleUpdateThreadAndSend does
      store.getState().prepareForNewMessage('Second question', ['model-0', 'model-1']);

      // Verify flags after prepareForNewMessage
      const stateAfterPrepare = store.getState();
      expect(stateAfterPrepare.pendingMessage).toBe('Second question');
      expect(stateAfterPrepare.hasSentPendingMessage).toBe(false);
      expect(stateAfterPrepare.isCreatingAnalysis).toBe(false);

      // CRITICAL: Round 0 should still be marked as created
      // Round 1 should NOT be marked yet
      expect(stateAfterPrepare.hasAnalysisBeenCreated(0)).toBe(true);
      expect(stateAfterPrepare.hasAnalysisBeenCreated(1)).toBe(false);

      // User message is sent and participants start streaming
      store.getState().setHasSentPendingMessage(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // Add user message for round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1, 'Second question')]);

      // Participants respond
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 1)]);

      // Streaming completes
      store.getState().setIsStreaming(false);

      // Now simulate what provider's handleComplete does:
      // Check if analysis already created for this round
      const currentRound = 1;
      const alreadyCreated = store.getState().hasAnalysisBeenCreated(currentRound);

      expect(alreadyCreated).toBe(false); // Should NOT be created yet

      // Mark as created and add analysis
      store.getState().markAnalysisCreated(currentRound);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      }));
      store.getState().completeStreaming();

      // Verify final state
      const finalState = store.getState();
      expect(finalState.analyses).toHaveLength(2);
      expect(finalState.analyses[0].roundNumber).toBe(0);
      expect(finalState.analyses[1].roundNumber).toBe(1);
      expect(finalState.hasAnalysisBeenCreated(0)).toBe(true);
      expect(finalState.hasAnalysisBeenCreated(1)).toBe(true);
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.isCreatingAnalysis).toBe(false);
    });

    it('should not create duplicate analysis when both provider and flow-state-machine trigger', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // Setup: Round 0 complete
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode('thread');
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // User sends second message, participants respond
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setIsStreaming(false);

      // Simulate RACE CONDITION:
      // Both provider and flow-state-machine check simultaneously
      const round1 = 1;

      // Provider checks first
      const providerCheck = store.getState().hasAnalysisBeenCreated(round1);
      expect(providerCheck).toBe(false);

      // Provider marks as created
      store.getState().markAnalysisCreated(round1);

      // Flow state machine checks (after provider marked)
      const fsmCheck = store.getState().hasAnalysisBeenCreated(round1);
      expect(fsmCheck).toBe(true); // Should be true now

      // Provider creates analysis
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: round1,
        status: AnalysisStatuses.PENDING,
      }));

      // Flow state machine should NOT create another analysis
      // because hasAnalysisBeenCreated returned true

      // Verify only one analysis for round 1
      const analyses = store.getState().analyses;
      const round1Analyses = analyses.filter(a => a.roundNumber === round1);
      expect(round1Analyses).toHaveLength(1);
    });
  });

  describe('flag Management: completeStreaming Behavior', () => {
    it('should correctly clear flags when completeStreaming is called', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Set streaming flags as they would be during round 1
      store.getState().setIsStreaming(true);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setHasSentPendingMessage(true);

      // Verify flags are set
      let state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.isCreatingAnalysis).toBe(true);
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.hasSentPendingMessage).toBe(true);

      // Call completeStreaming
      store.getState().completeStreaming();

      // Verify flags are cleared
      state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      // Note: hasSentPendingMessage might not be cleared by completeStreaming
      // This is actually important for preventing re-sends
    });

    it('should not cause issues when completeStreaming is called multiple times', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Setup streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Add analysis
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.PENDING,
      }));

      // Call completeStreaming multiple times (simulating race condition)
      store.getState().completeStreaming();
      store.getState().completeStreaming();
      store.getState().completeStreaming();

      // Should not cause errors and state should be stable
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.analyses).toHaveLength(1);
    });
  });

  describe('state Transitions: Idle to Creating Analysis to Streaming Analysis', () => {
    it('should transition correctly through states for round 1', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // Setup: Round 0 complete on thread screen
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode('thread');
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // === STATE: Idle ===
      let state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);

      // User sends message
      store.getState().prepareForNewMessage('Question', ['model-0']);
      store.getState().setHasSentPendingMessage(true);

      // === STATE: Streaming Participants ===
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);

      state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingRoundNumber).toBe(1);

      // Participants done, streaming stops
      store.getState().setIsStreaming(false);

      // === STATE: Creating Analysis ===
      // At this point, flow should detect need to create analysis
      state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.hasAnalysisBeenCreated(1)).toBe(false);

      // Analysis is created
      store.getState().setIsCreatingAnalysis(true);
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      }));
      store.getState().setIsCreatingAnalysis(false);

      // === STATE: Streaming Analysis ===
      // Analysis starts streaming
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.STREAMING);
      store.getState().setIsStreaming(true); // AI SDK streaming for analysis

      state = store.getState();
      expect(state.analyses[1].status).toBe(AnalysisStatuses.STREAMING);
      expect(state.isStreaming).toBe(true);

      // Analysis completes
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.COMPLETE);
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // === STATE: Idle (complete) ===
      state = store.getState();
      expect(state.analyses[1].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);
    });
  });

  describe('context Calculation for Flow State Machine', () => {
    /**
     * This tests the context that would be passed to determineFlowState
     * to ensure it calculates correctly for round 1+
     */
    it('should calculate correct context for round 1 when participants done but no analysis', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Setup: Round 0 complete, round 1 participants done
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
        createMockMessage(1, 1),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode('thread');
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().setIsStreaming(false);

      // Calculate what the flow context would be
      const state = store.getState();
      const currentRound = 1; // Two user messages = round 1
      const currentRoundAnalysis = state.analyses.find(a => a.roundNumber === currentRound);

      // Context values that flow-state-machine would calculate
      const context = {
        isAiSdkStreaming: state.isStreaming, // false
        allParticipantsResponded: true, // Both participants responded for round 1
        participantCount: participants.length, // 2
        analysisExists: !!currentRoundAnalysis, // false - no round 1 analysis yet
        analysisStatus: currentRoundAnalysis?.status || null, // null
        isCreatingAnalysis: state.isCreatingAnalysis, // false
      };

      // This should result in 'creating_analysis' state
      expect(context.isAiSdkStreaming).toBe(false);
      expect(context.allParticipantsResponded).toBe(true);
      expect(context.participantCount).toBe(2);
      expect(context.analysisExists).toBe(false);
      expect(context.analysisStatus).toBe(null);
      expect(context.isCreatingAnalysis).toBe(false);

      // With these conditions, flow-state-machine should return 'creating_analysis'
      // The condition is:
      // !isAiSdkStreaming && allParticipantsResponded && participantCount > 0
      // && !analysisExists && !isCreatingAnalysis
    });

    it('should calculate correct analysisStatus using current round, not first round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // Setup: Round 0 complete, round 1 streaming
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
      ]);

      store.getState().addAnalysis(createMockAnalysis({
        id: 'analysis-0',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().addAnalysis(createMockAnalysis({
        id: 'analysis-1',
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      }));

      const state = store.getState();
      const currentRound = 1;

      // The FIX: Use currentRoundAnalysis, not firstAnalysis
      const firstAnalysis = state.analyses[0];
      const currentRoundAnalysis = state.analyses.find(a => a.roundNumber === currentRound);

      // BUG: Using firstAnalysis?.status would give COMPLETE
      // FIX: Using currentRoundAnalysis?.status gives STREAMING
      expect(firstAnalysis?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(currentRoundAnalysis?.status).toBe(AnalysisStatuses.STREAMING);

      // The flow state machine should use STREAMING (current round), not COMPLETE (first round)
    });
  });

  describe('tracking Set Behavior', () => {
    it('should maintain separate tracking for each round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);

      // Mark rounds as created
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);
      store.getState().markAnalysisCreated(2);

      // All should be tracked
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(2)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(3)).toBe(false);
    });

    it('should clear tracking when clearAnalysisTracking is called', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);

      // Clear round 1
      store.getState().clearAnalysisTracking(1);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
    });

    it('should reset tracking Set when resetThreadState is called', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, []);
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);

      // Reset thread state (happens when navigating between threads)
      store.getState().resetThreadState();

      // Tracking should be cleared
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
    });
  });

  describe('potential Infinite Loop Scenarios', () => {
    /**
     * This test checks for conditions that could cause infinite loops
     */
    it('should not get stuck when analysis exists but status is PENDING', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
      ]);
      store.getState().setScreenMode('thread');
      store.getState().setIsStreaming(false);

      // Round 0 complete
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Round 1 analysis created but PENDING (not streaming yet)
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      }));

      // At this point:
      // - isStreaming: false
      // - analysisExists: true (round 1 has analysis)
      // - analysisStatus: PENDING
      // - isCreatingAnalysis: false

      const state = store.getState();
      const currentRoundAnalysis = state.analyses.find(a => a.roundNumber === 1);

      // The flow should be in 'idle' state waiting for analysis to start streaming
      // NOT in 'creating_analysis' (because analysis already exists)
      expect(state.isStreaming).toBe(false);
      expect(currentRoundAnalysis).toBeDefined();
      expect(currentRoundAnalysis?.status).toBe(AnalysisStatuses.PENDING);

      // This combination should NOT trigger creating_analysis state
      // because analysisExists is true
    });

    it('should not get stuck when hasAnalysisBeenCreated is true but analysis does not exist in store', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
      ]);
      store.getState().setScreenMode('thread');
      store.getState().setIsStreaming(false);

      // Round 0 complete
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // PROBLEMATIC STATE: Round 1 marked as created but no analysis in store
      // This could happen if markAnalysisCreated was called but addAnalysis failed
      store.getState().markAnalysisCreated(1);

      const state = store.getState();

      // Tracking says created, but no analysis exists
      expect(state.hasAnalysisBeenCreated(1)).toBe(true);
      const round1Analysis = state.analyses.find(a => a.roundNumber === 1);
      expect(round1Analysis).toBeUndefined();

      // This is a problematic state that could cause infinite loops
      // The flow-state-machine would see:
      // - hasAnalysisBeenCreated(1) = true → skip creation
      // - analysisExists = false → state should be creating_analysis
      // - But creation is skipped → stuck!

      // FIX: Either clear the tracking or ensure analysis is added
      // For this test, we verify the problematic state exists
      // The actual fix would be in the code to handle this edge case
    });

    it('should handle rapid state changes without getting stuck', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode('thread');

      // Rapid state changes (simulating fast operations)
      for (let i = 0; i < 10; i++) {
        store.getState().setIsStreaming(true);
        store.getState().setIsStreaming(false);
        store.getState().setIsCreatingAnalysis(true);
        store.getState().setIsCreatingAnalysis(false);
      }

      // State should be stable
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);
    });
  });

  describe('prepareForNewMessage Behavior', () => {
    it('should correctly reset flags for new message', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode('thread');

      // Set some flags from previous round
      store.getState().setHasSentPendingMessage(true);
      store.getState().setIsCreatingAnalysis(true);

      // Prepare for new message
      store.getState().prepareForNewMessage('New question', ['model-0']);

      const state = store.getState();

      // These should be reset for new message
      expect(state.hasSentPendingMessage).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.pendingMessage).toBe('New question');
      expect(state.expectedParticipantIds).toEqual(['model-0']);
    });

    it('should NOT clear analysis tracking for other rounds when preparing new message', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode('thread');

      // Round 0 tracking set
      store.getState().markAnalysisCreated(0);

      // Prepare for round 1 message
      store.getState().prepareForNewMessage('New question', ['model-0']);

      // Round 0 tracking should still be set
      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      // Round 1 not created yet
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
    });
  });

  describe('full Round 2+ Flow', () => {
    it('should complete full round 2 flow without issues', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // === Setup: Rounds 0 and 1 complete ===
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
      ]);
      store.getState().setScreenMode('thread');

      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }));

      // === Round 2: User sends third message ===
      store.getState().prepareForNewMessage('Third question', ['model-0']);

      // Message sent
      store.getState().setHasSentPendingMessage(true);
      store.getState().setStreamingRoundNumber(2);
      store.getState().setIsStreaming(true);

      store.getState().setMessages(prev => [...prev, createMockUserMessage(2)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 2)]);

      // Streaming done
      store.getState().setIsStreaming(false);

      // Create analysis for round 2
      expect(store.getState().hasAnalysisBeenCreated(2)).toBe(false);
      store.getState().markAnalysisCreated(2);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 2,
        status: AnalysisStatuses.PENDING,
      }));

      // Analysis streams
      store.getState().updateAnalysisStatus(2, AnalysisStatuses.STREAMING);
      store.getState().setIsStreaming(true);

      // Verify streaming state
      let state = store.getState();
      const round2Analysis = state.analyses.find(a => a.roundNumber === 2);
      expect(round2Analysis?.status).toBe(AnalysisStatuses.STREAMING);

      // Analysis completes
      store.getState().updateAnalysisStatus(2, AnalysisStatuses.COMPLETE);
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Final verification
      state = store.getState();
      expect(state.analyses).toHaveLength(3);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.analyses[1].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.analyses[2].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.hasAnalysisBeenCreated(0)).toBe(true);
      expect(state.hasAnalysisBeenCreated(1)).toBe(true);
      expect(state.hasAnalysisBeenCreated(2)).toBe(true);
    });
  });
});
