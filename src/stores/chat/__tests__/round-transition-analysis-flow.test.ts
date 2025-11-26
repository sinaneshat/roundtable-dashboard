/**
 * Round Transition and Analysis Flow Tests
 *
 * BUG REPORT:
 * 1. After submission, UI doesn't feel snappy
 * 2. Analysis doesn't collapse immediately
 * 3. User message doesn't show immediately after submission
 * 4. Streaming doesn't begin promptly
 * 5. Type validation error: "expected object, received undefined"
 *
 * This test catches state inconsistencies during round transitions
 * and analysis completion flows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import type { ChatStoreApi } from '../index';
import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

describe('round transition and analysis flow', () => {
  let store: ChatStoreApi;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('state consistency during round transitions', () => {
    /**
     * BUG: isStreaming=true but streamingRoundNumber=null
     *
     * State dump showed:
     * - isStreaming: true
     * - streamingRoundNumber: null
     * - currentParticipantIndex: 2
     *
     * This is inconsistent - if streaming is active, streamingRoundNumber
     * should be set to the current round being streamed.
     */
    it('should maintain consistent streaming state after prepareForNewMessage', () => {
      const thread = createMockThread({
        id: 'thread-consistency',
        enableWebSearch: false,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'model-a' }),
        createMockParticipant(1, { modelId: 'model-b' }),
        createMockParticipant(2, { modelId: 'model-c' }),
      ];

      // Initialize with round 0 complete
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(0, 1),
        createMockMessage(0, 2),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Submit round 1 message
      store.getState().setExpectedParticipantIds(['model-a', 'model-b', 'model-c']);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Verify state consistency
      const state = store.getState();

      // After prepareForNewMessage, streaming hasn't started yet
      expect(state.isStreaming).toBe(false);
      // But streamingRoundNumber should be set to indicate pending round
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.pendingMessage).toBe('Round 1 question');
      expect(state.hasSentPendingMessage).toBe(false);
    });

    it('should have consistent state when streaming actually starts', () => {
      const thread = createMockThread({
        id: 'thread-streaming-start',
        enableWebSearch: false,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'model-a' }),
        createMockParticipant(1, { modelId: 'model-b' }),
      ];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(0, 1),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Prepare message
      store.getState().setExpectedParticipantIds(['model-a', 'model-b']);
      store.getState().prepareForNewMessage('Test message', []);
      store.getState().setIsWaitingForChangelog(false);

      // Simulate provider sending message (sets hasSentPendingMessage)
      store.getState().setHasSentPendingMessage(true);
      store.getState().setStreamingRoundNumber(1);

      // Simulate streaming starting
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Verify consistency
      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.streamingRoundNumber).toBe(1);
      expect(state.hasSentPendingMessage).toBe(true);
      expect(state.currentParticipantIndex).toBe(0);
    });

    it('should NOT reset streamingRoundNumber while streaming is active', () => {
      const thread = createMockThread({
        id: 'thread-no-reset-during-stream',
        enableWebSearch: false,
      });

      const participants = [
        createMockParticipant(0, { modelId: 'model-a' }),
        createMockParticipant(1, { modelId: 'model-b' }),
      ];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(0, 1),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Start round 1 streaming
      store.getState().setExpectedParticipantIds(['model-a', 'model-b']);
      store.getState().prepareForNewMessage('Test message', []);
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setHasSentPendingMessage(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Progress to participant 1
      store.getState().setCurrentParticipantIndex(1);

      // Verify streamingRoundNumber is still 1
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().currentParticipantIndex).toBe(1);
    });
  });

  describe('optimistic message display', () => {
    /**
     * BUG: User message doesn't show immediately after submission
     *
     * The optimistic user message should appear in messages array
     * immediately after prepareForNewMessage is called.
     */
    it('should add optimistic user message immediately after submission', () => {
      const thread = createMockThread({
        id: 'thread-optimistic',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      const messagesBefore = store.getState().messages;
      expect(messagesBefore).toHaveLength(2);

      // Submit new message
      store.getState().setExpectedParticipantIds(['model-a']);
      store.getState().prepareForNewMessage('New question', []);

      // Optimistic message should appear IMMEDIATELY
      const messagesAfter = store.getState().messages;
      expect(messagesAfter).toHaveLength(3);

      const optimisticMsg = messagesAfter[2];
      expect(optimisticMsg.role).toBe('user');
      expect(optimisticMsg.metadata?.isOptimistic).toBe(true);
      expect(optimisticMsg.metadata?.roundNumber).toBe(1);
    });

    it('should preserve optimistic message during streaming', () => {
      const thread = createMockThread({
        id: 'thread-preserve-optimistic',
        enableWebSearch: false,
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add optimistic message
      store.getState().setExpectedParticipantIds(['model-a']);
      store.getState().prepareForNewMessage('Question', []);

      const optimisticId = store.getState().messages[2].id;

      // Start streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setHasSentPendingMessage(true);

      // Optimistic message should still be there
      const msgAfterStreamStart = store.getState().messages.find(m => m.id === optimisticId);
      expect(msgAfterStreamStart).toBeDefined();
      expect(msgAfterStreamStart?.metadata?.isOptimistic).toBe(true);
    });
  });

  describe('analysis completion flow', () => {
    /**
     * BUG: Type validation error when analysis completes
     * Error: "expected object, received undefined"
     *
     * This happens when the analysis streaming response is invalid
     * or incomplete.
     */
    it('should handle analysis completion with valid data', () => {
      const thread = createMockThread({
        id: 'thread-analysis-complete',
        mode: ChatModes.DEBATING,
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Add pending analysis directly (simulating eager rendering placeholder)
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.PENDING }));

      // Start analysis streaming
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      store.getState().setIsCreatingAnalysis(true);

      // Complete analysis with valid data
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
      store.getState().setIsCreatingAnalysis(false);

      const analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis).toBeDefined();
      expect(analysis?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should handle analysis completion with error', () => {
      const thread = createMockThread({
        id: 'thread-analysis-error',
        mode: ChatModes.DEBATING,
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Add pending analysis
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.PENDING }));

      // Start analysis streaming
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

      // Simulate validation error (backend returns undefined)
      store.getState().updateAnalysisError(0, 'Type validation failed: Value: undefined');

      const analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(analysis).toBeDefined();
      expect(analysis?.status).toBe(AnalysisStatuses.FAILED);
      expect(analysis?.errorMessage).toContain('Type validation failed');
    });

    it('should allow retry after analysis fails', () => {
      const thread = createMockThread({
        id: 'thread-analysis-retry',
        mode: ChatModes.DEBATING,
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);

      // Add and fail analysis
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.PENDING }));
      store.getState().updateAnalysisError(0, 'First attempt failed');

      // Remove failed analysis to allow retry
      store.getState().removeAnalysis(0);
      expect(store.getState().analyses.find(a => a.roundNumber === 0)).toBeUndefined();

      // Retry analysis
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0, status: AnalysisStatuses.PENDING }));

      const retryAnalysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(retryAnalysis).toBeDefined();
      expect(retryAnalysis?.status).toBe(AnalysisStatuses.PENDING);
    });
  });

  describe('previous round analysis collapse', () => {
    /**
     * BUG: Analysis doesn't collapse immediately after submission
     *
     * When user submits a new message, the previous round's analysis
     * should collapse to make room for the new round.
     */
    it('should transition to thread screen after round completes', () => {
      const thread = createMockThread({
        id: 'thread-collapse',
        mode: ChatModes.DEBATING,
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Add complete analysis for round 0
      store.getState().addAnalysis(createMockAnalysis(0, AnalysisStatuses.COMPLETE));

      // Submit round 1 message
      store.getState().setExpectedParticipantIds(['model-a']);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Screen should still be THREAD
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

      // Previous analysis should still exist (just collapsed in UI, not removed)
      const round0Analysis = store.getState().analyses.find(a => a.roundNumber === 0);
      expect(round0Analysis).toBeDefined();
      expect(round0Analysis?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should not block new message when previous analysis is complete', () => {
      const thread = createMockThread({
        id: 'thread-no-block',
        mode: ChatModes.DEBATING,
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Complete round 0 analysis
      store.getState().addAnalysis(createMockAnalysis(0, AnalysisStatuses.COMPLETE));
      store.getState().setIsCreatingAnalysis(false);

      // Should be able to submit new message
      store.getState().setExpectedParticipantIds(['model-a']);
      store.getState().prepareForNewMessage('Round 1 question', []);

      // Message should be prepared
      expect(store.getState().pendingMessage).toBe('Round 1 question');
      expect(store.getState().hasSentPendingMessage).toBe(false);
      // isCreatingAnalysis should NOT block new message
      expect(store.getState().isCreatingAnalysis).toBe(false);
    });
  });

  describe('hasSentPendingMessage and pendingMessage Consistency', () => {
    /**
     * BUG: State dump showed:
     * - pendingMessage: null
     * - hasSentPendingMessage: false
     *
     * After sending, either:
     * - Both should be null/false (message cleared, not sent yet)
     * - Or pendingMessage should exist and hasSentPendingMessage should be true
     */
    it('should have consistent pending message state before sending', () => {
      const thread = createMockThread({
        id: 'thread-pending-consistency',
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      store.getState().setExpectedParticipantIds(['model-a']);
      store.getState().prepareForNewMessage('Test', []);

      // Before sending: pendingMessage exists, hasSentPendingMessage is false
      expect(store.getState().pendingMessage).toBe('Test');
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });

    it('should have consistent pending message state after sending', () => {
      const thread = createMockThread({
        id: 'thread-after-send',
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      store.getState().setExpectedParticipantIds(['model-a']);
      store.getState().prepareForNewMessage('Test', []);

      // Simulate provider sending message
      store.getState().setHasSentPendingMessage(true);
      store.getState().setStreamingRoundNumber(1);

      // After sending: pendingMessage still exists, hasSentPendingMessage is true
      // (pendingMessage is only cleared after streaming completes)
      expect(store.getState().pendingMessage).toBe('Test');
      expect(store.getState().hasSentPendingMessage).toBe(true);
    });

    it('should clear both after streaming completes', () => {
      const thread = createMockThread({
        id: 'thread-clear-after-complete',
      });

      const participants = [createMockParticipant(0, { modelId: 'model-a' })];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      store.getState().setExpectedParticipantIds(['model-a']);
      store.getState().prepareForNewMessage('Test', []);
      store.getState().setHasSentPendingMessage(true);
      store.getState().setIsStreaming(true);

      // Complete streaming
      store.getState().completeStreaming();

      // Both should be reset
      expect(store.getState().pendingMessage).toBeNull();
      expect(store.getState().hasSentPendingMessage).toBe(false);
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();
    });
  });

  describe('multi-participant streaming progress', () => {
    /**
     * Verify that streaming state is consistent as we progress
     * through multiple participants.
     */
    it('should track participant index correctly during streaming', () => {
      const thread = createMockThread({
        id: 'thread-multi-participant',
      });

      const participants = [
        createMockParticipant(0, { modelId: 'model-a' }),
        createMockParticipant(1, { modelId: 'model-b' }),
        createMockParticipant(2, { modelId: 'model-c' }),
      ];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(0, 1),
        createMockMessage(0, 2),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Start round 1
      store.getState().setExpectedParticipantIds(['model-a', 'model-b', 'model-c']);
      store.getState().prepareForNewMessage('Round 1', []);
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setHasSentPendingMessage(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      // Participant 0 streaming
      store.getState().setCurrentParticipantIndex(0);
      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // Participant 1 streaming
      store.getState().setCurrentParticipantIndex(1);
      expect(store.getState().currentParticipantIndex).toBe(1);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // Participant 2 streaming
      store.getState().setCurrentParticipantIndex(2);
      expect(store.getState().currentParticipantIndex).toBe(2);
      expect(store.getState().streamingRoundNumber).toBe(1);

      // All participants done
      store.getState().completeStreaming();
      expect(store.getState().currentParticipantIndex).toBe(0); // Reset to 0
      expect(store.getState().isStreaming).toBe(false);
    });
  });
});
