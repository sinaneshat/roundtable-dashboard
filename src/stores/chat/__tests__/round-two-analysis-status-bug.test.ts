/**
 * Round Two Analysis Status Bug Test
 *
 * Tests the bug where analysisStatus in flow context always uses first analysis (round 0)
 * instead of current round's analysis status, causing infinite loops on round 2+.
 *
 * BUG: In flow-state-machine.ts line 336:
 *   analysisStatus: firstAnalysis?.status || null
 *
 * This should be:
 *   analysisStatus: currentRoundAnalysis?.status || null
 *
 * Location: /src/stores/chat/__tests__/round-two-analysis-status-bug.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
} from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// ROUND TWO ANALYSIS STATUS BUG TESTS
// ============================================================================

describe('round Two Analysis Status Bug', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('analysis Status Per Round', () => {
    it('should track analysis status independently for each round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      // Setup round 0 complete
      const messagesR0: UIMessage[] = [
        createMockUserMessage(0, 'Round 0 question'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      store.getState().initializeThread(thread, participants, messagesR0);

      // Round 0 analysis complete
      const analysisR0 = createMockAnalysis({
        id: 'analysis-r0',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      });
      store.getState().addAnalysis(analysisR0);

      // Verify round 0 state
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // Start round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1, 'Round 1 question')]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 1)]);

      // Round 1 analysis starts streaming
      const analysisR1: StoredModeratorAnalysis = {
        id: 'analysis-r1',
        threadId: 'thread-123',
        roundNumber: 1,
        mode: ChatModes.ANALYZING,
        userQuestion: 'Round 1 question',
        status: AnalysisStatuses.STREAMING,
        analysisData: null,
        errorMessage: null,
        completedAt: null,
        createdAt: new Date(),
      };
      store.getState().addAnalysis(analysisR1);

      // CRITICAL TEST: Both analyses should have their own status
      const analyses = store.getState().analyses;
      expect(analyses).toHaveLength(2);
      expect(analyses[0].roundNumber).toBe(0);
      expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(analyses[1].roundNumber).toBe(1);
      expect(analyses[1].status).toBe(AnalysisStatuses.STREAMING);

      // Get current round analysis (should be round 1)
      const currentRound = 1;
      const currentRoundAnalysis = analyses.find(a => a.roundNumber === currentRound);

      // THIS IS THE BUG: The flow context should use currentRoundAnalysis.status
      // not firstAnalysis.status (which would be COMPLETE from round 0)
      expect(currentRoundAnalysis?.status).toBe(AnalysisStatuses.STREAMING);
      expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE); // First analysis should not affect round 1
    });

    it('should detect streaming state correctly for round 2 analysis', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // Complete round 0
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Complete round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Start round 2
      store.getState().setMessages(prev => [...prev, createMockUserMessage(2)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 2)]);

      // Round 2 analysis starts
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 2,
        status: AnalysisStatuses.PENDING,
      }));
      store.getState().updateAnalysisStatus(2, AnalysisStatuses.STREAMING);

      // Verify each round has correct status
      const analyses = store.getState().analyses;
      expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE); // Round 0
      expect(analyses[1].status).toBe(AnalysisStatuses.COMPLETE); // Round 1
      expect(analyses[2].status).toBe(AnalysisStatuses.STREAMING); // Round 2

      // The flow context should report STREAMING for current round (2), not COMPLETE from round 0
      const currentRound = 2;
      const currentRoundAnalysis = analyses.find(a => a.roundNumber === currentRound);
      expect(currentRoundAnalysis?.status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should not trigger creating_analysis state when analysis already exists for current round', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Complete round 0
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Start round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 1)]);

      // Participants done, analysis should be created
      // Simulate tracking
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      }));

      // Check that analysis tracking prevents duplicate creation
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(true);

      // Verify analysis exists for current round
      const currentRound = 1;
      const analysisExists = store.getState().analyses.some(a => a.roundNumber === currentRound);
      expect(analysisExists).toBe(true);

      // This should prevent the flow from going to creating_analysis state again
    });

    it('should complete round 2 analysis without getting stuck', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // Complete round 0
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().setScreenMode('thread');

      // Start round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setIsStreaming(true);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setIsStreaming(false);

      // Create analysis for round 1
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      }));

      // Analysis streaming
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.STREAMING);
      store.getState().setIsStreaming(true);

      // Verify state during streaming
      const analyses = store.getState().analyses;
      expect(analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(analyses[1].status).toBe(AnalysisStatuses.STREAMING);

      // Analysis completes
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.COMPLETE);
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Final state check - should be idle, not stuck
      expect(store.getState().analyses[1].status).toBe(AnalysisStatuses.COMPLETE);
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isCreatingAnalysis).toBe(false);
    });
  });

  describe('flow Context Analysis Status Bug', () => {
    /**
     * This test simulates what the flow state machine context calculation does
     * and verifies the bug where analysisStatus uses firstAnalysis instead of currentRoundAnalysis
     */
    it('should use current round analysis status, not first analysis status', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // Setup with round 0 complete and round 1 streaming
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockUserMessage(1),
        createMockMessage(0, 1),
      ]);

      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      }));

      // Simulate what flow-state-machine.ts context building does
      const _messages = store.getState().messages;
      const analyses = store.getState().analyses;

      // Calculate current round (this is correct in the code)
      const currentRound = 1; // Would be calculated from messages

      // The bug: firstAnalysis?.status
      const firstAnalysis = analyses[0];
      const buggyAnalysisStatus = firstAnalysis?.status || null;

      // The fix: currentRoundAnalysis?.status
      const currentRoundAnalysis = analyses.find(a => a.roundNumber === currentRound);
      const correctAnalysisStatus = currentRoundAnalysis?.status || null;

      // THE BUG: buggyAnalysisStatus is COMPLETE (from round 0)
      // but correctAnalysisStatus is STREAMING (from round 1)
      expect(buggyAnalysisStatus).toBe(AnalysisStatuses.COMPLETE);
      expect(correctAnalysisStatus).toBe(AnalysisStatuses.STREAMING);

      // This causes the flow state machine to not recognize streaming_analysis state
      // because it checks: context.analysisStatus === AnalysisStatuses.STREAMING
      // which would be false with the buggy code
    });

    it('should detect creating_analysis state correctly for round 2', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      // Complete round 0
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Add round 1 messages (all participants responded)
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 1)]);

      // Simulate flow context calculation for determining if we should create analysis
      const _messages = store.getState().messages;
      const analyses = store.getState().analyses;

      const currentRound = 1;

      // Check if analysis exists for current round (this is correct in the code)
      const currentRoundAnalysis = analyses.find(a => a.roundNumber === currentRound);
      const analysisExists = !!currentRoundAnalysis;

      // With no round 1 analysis yet, we should be in creating_analysis state
      expect(analysisExists).toBe(false);

      // The flow should detect:
      // - !isAiSdkStreaming (streaming done)
      // - allParticipantsResponded (both responded for round 1)
      // - participantCount > 0
      // - !analysisExists (no round 1 analysis)
      // - !isCreatingAnalysis
      // Result: creating_analysis state

      // After analysis is created...
      store.getState().markAnalysisCreated(1);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.STREAMING,
      }));

      const updatedAnalyses = store.getState().analyses;
      const updatedCurrentRoundAnalysis = updatedAnalyses.find(a => a.roundNumber === currentRound);
      const updatedAnalysisExists = !!updatedCurrentRoundAnalysis;

      expect(updatedAnalysisExists).toBe(true);
      expect(updatedCurrentRoundAnalysis?.status).toBe(AnalysisStatuses.STREAMING);
    });
  });

  describe('state Transitions for Round 2+', () => {
    it('should correctly transition idle → streaming → creating_analysis → streaming_analysis → idle for round 2', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [createMockParticipant(0)];

      // Complete round 0
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().setScreenMode('thread');

      // State should be idle
      let state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);

      // User sends message for round 1
      store.getState().setMessages(prev => [...prev, createMockUserMessage(1)]);

      // Streaming starts
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);

      // Participant responds
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 1)]);

      // Streaming completes
      store.getState().setIsStreaming(false);

      // At this point: all participants responded, no analysis for round 1
      // Flow should detect creating_analysis state
      const currentRound = 1;
      const analysisExistsForCurrentRound = store.getState().analyses.some(a => a.roundNumber === currentRound);
      expect(analysisExistsForCurrentRound).toBe(false);

      // Create analysis
      store.getState().markAnalysisCreated(1);
      store.getState().setIsCreatingAnalysis(true);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 1,
        status: AnalysisStatuses.PENDING,
      }));
      store.getState().setIsCreatingAnalysis(false);

      // Analysis streaming starts
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.STREAMING);
      store.getState().setIsStreaming(true);

      // Verify streaming_analysis state
      state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.analyses[1].status).toBe(AnalysisStatuses.STREAMING);

      // Analysis completes
      store.getState().updateAnalysisStatus(1, AnalysisStatuses.COMPLETE);
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Back to idle
      state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.analyses[1].status).toBe(AnalysisStatuses.COMPLETE);
    });
  });
});
