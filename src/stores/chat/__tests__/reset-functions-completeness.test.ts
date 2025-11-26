/**
 * Reset Functions Completeness Tests
 *
 * These tests ensure that all reset functions clear ALL required flags.
 * They serve as documentation and protection against future bugs where
 * developers forget to clear specific fields.
 *
 * PATTERN: Each test sets ALL streaming-related flags to non-default values,
 * calls the reset function, and verifies ALL expected fields are cleared.
 *
 * Location: /src/stores/chat/__tests__/reset-functions-completeness.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// RESET FUNCTIONS COMPLETENESS TESTS
// ============================================================================

describe('reset Functions Completeness', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Helper to set ALL streaming-related flags to non-default values
   * This ensures tests catch any flag that isn't being reset
   */
  function setAllStreamingFlags() {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);

    // Set ALL flags to non-default values
    store.getState().setIsStreaming(true);
    store.getState().setIsCreatingAnalysis(true);
    store.getState().setIsRegenerating(true);
    store.getState().setIsWaitingForChangelog(true);
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setHasSentPendingMessage(true);
    store.getState().setCurrentParticipantIndex(5);
    store.getState().setStreamingRoundNumber(3);
    store.getState().setRegeneratingRoundNumber(2);
    store.getState().setCurrentRoundNumber(3);
    store.getState().setPendingMessage('test message');
    store.getState().setExpectedParticipantIds(['p1', 'p2']);

    // Set tracking
    store.getState().markAnalysisCreated(0);
    store.getState().markAnalysisCreated(1);
    store.getState().markPreSearchTriggered(0);
    store.getState().markPreSearchTriggered(1);

    // Verify all flags are set
    const state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.isCreatingAnalysis).toBe(true);
    expect(state.isRegenerating).toBe(true);
    expect(state.isWaitingForChangelog).toBe(true);
    expect(state.waitingToStartStreaming).toBe(true);
    expect(state.hasSentPendingMessage).toBe(true);
    expect(state.currentParticipantIndex).toBe(5);
    expect(state.streamingRoundNumber).toBe(3);
    expect(state.regeneratingRoundNumber).toBe(2);
    expect(state.currentRoundNumber).toBe(3);
    expect(state.pendingMessage).toBe('test message');
    expect(state.expectedParticipantIds).toEqual(['p1', 'p2']);
    expect(state.hasAnalysisBeenCreated(0)).toBe(true);
    expect(state.hasAnalysisBeenCreated(1)).toBe(true);
    expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
    expect(state.hasPreSearchBeenTriggered(1)).toBe(true);
  }

  describe('completeStreaming', () => {
    it('should clear ALL streaming, analysis, pending message, and regeneration flags', () => {
      setAllStreamingFlags();

      // Call completeStreaming
      store.getState().completeStreaming();

      // Verify ALL expected flags are cleared
      const state = store.getState();

      // Streaming flags - ALL must be cleared
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.currentRoundNumber).toBe(null);
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);

      // Analysis flags - ALL must be cleared
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pending message flags - ALL must be cleared
      expect(state.pendingMessage).toBe(null);
      expect(state.expectedParticipantIds).toBe(null);
      expect(state.hasSentPendingMessage).toBe(false);

      // Regeneration flags - ALL must be cleared
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBe(null);

      // Tracking - should NOT be cleared by completeStreaming
      expect(state.hasAnalysisBeenCreated(0)).toBe(true);
      expect(state.hasAnalysisBeenCreated(1)).toBe(true);
    });
  });

  describe('prepareForNewMessage', () => {
    it('should clear streaming/regeneration flags and set up new message state', () => {
      setAllStreamingFlags();

      // Call prepareForNewMessage
      store.getState().prepareForNewMessage('new question', ['model-new']);

      // Verify expected flags are cleared/set
      const state = store.getState();

      // Streaming flags - ALL must be cleared
      expect(state.isStreaming).toBe(false);
      // ✅ FIX: prepareForNewMessage only adds optimistic message on THREAD screen
      // setAllStreamingFlags() doesn't set screenMode to THREAD, so no optimistic message is added
      // and streamingRoundNumber remains null
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.currentRoundNumber).toBe(null);
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);

      // Regeneration flags - ALL must be cleared
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBe(null);

      // Analysis - isCreatingAnalysis cleared
      expect(state.isCreatingAnalysis).toBe(false);

      // New message state - set up for new message
      expect(state.isWaitingForChangelog).toBe(true);
      expect(state.pendingMessage).toBe('new question');
      expect(state.expectedParticipantIds).toEqual(['model-new']);
      expect(state.hasSentPendingMessage).toBe(false);

      // ✅ FIX: prepareForNewMessage only adds optimistic message on THREAD screen
      // setAllStreamingFlags() doesn't set screenMode to THREAD, so messages unchanged (2 from initial setup)
      expect(state.messages).toHaveLength(2);

      // Tracking - should NOT be cleared
      expect(state.hasAnalysisBeenCreated(0)).toBe(true);
      expect(state.hasAnalysisBeenCreated(1)).toBe(true);
    });

    it('should preserve expectedParticipantIds if empty array passed', () => {
      setAllStreamingFlags();

      // Call with empty participant IDs
      store.getState().prepareForNewMessage('new question', []);

      // Should preserve existing expectedParticipantIds
      const state = store.getState();
      expect(state.expectedParticipantIds).toEqual(['p1', 'p2']);
    });

    // ============================================================================
    // ✅ CRITICAL BUG PREVENTION: Screen mode determines optimistic message behavior
    // These tests prevent duplicate user messages in UI (BUG: mid-conversation-web-search)
    // ============================================================================

    it('should NOT add optimistic user message on OVERVIEW screen (thread creation)', () => {
      // Setup: Initialize with round 0 messages on OVERVIEW screen
      const thread = createMockThread({ id: 'thread-overview' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'Initial question'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW); // OVERVIEW screen!

      const messagesBefore = store.getState().messages.length;

      // Action: Call prepareForNewMessage on OVERVIEW screen
      store.getState().prepareForNewMessage('Follow up question', ['model-0']);

      const state = store.getState();

      // ✅ CRITICAL: No optimistic message should be added on OVERVIEW screen
      // Backend handles user message creation for thread creation
      expect(state.messages).toHaveLength(messagesBefore); // Messages unchanged
      expect(state.streamingRoundNumber).toBe(null); // Not tracking round
      expect(state.pendingMessage).toBe('Follow up question'); // Message prepared
    });

    it('should ADD optimistic user message on THREAD screen (subsequent messages)', () => {
      // Setup: Initialize with round 0 messages on THREAD screen
      const thread = createMockThread({ id: 'thread-detail' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'Initial question'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD); // THREAD screen!

      const messagesBefore = store.getState().messages.length;

      // Action: Call prepareForNewMessage on THREAD screen
      store.getState().prepareForNewMessage('Follow up question', ['model-0']);

      const state = store.getState();

      // ✅ CRITICAL: Optimistic message SHOULD be added on THREAD screen
      // For instant UI feedback before pre-search completes
      expect(state.messages).toHaveLength(messagesBefore + 1); // One optimistic message added
      expect(state.streamingRoundNumber).toBe(1); // Tracking round 1

      // Verify the optimistic message has correct structure
      const optimisticMessage = state.messages[state.messages.length - 1];
      expect(optimisticMessage.role).toBe('user');
      expect(optimisticMessage.id).toContain('optimistic-user-');
      expect((optimisticMessage.metadata as { isOptimistic?: boolean }).isOptimistic).toBe(true);
      expect((optimisticMessage.metadata as { roundNumber?: number }).roundNumber).toBe(1);
    });

    it('should use correct round number for optimistic message', () => {
      // Setup: Initialize with round 0 AND round 1 messages
      const thread = createMockThread({ id: 'thread-multi-round' });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'Question 1'),
        createMockMessage(0, 0),
        createMockUserMessage(1, 'Question 2'),
        createMockMessage(0, 1),
      ]);
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Action: Prepare message for round 2
      store.getState().prepareForNewMessage('Question 3', ['model-0']);

      const state = store.getState();
      const optimisticMessage = state.messages[state.messages.length - 1];

      // ✅ CRITICAL: Round number should be calculated correctly (2, not 0 or 1)
      expect(state.streamingRoundNumber).toBe(2);
      expect((optimisticMessage.metadata as { roundNumber?: number }).roundNumber).toBe(2);
    });

    it('should NOT create duplicate messages when switching from OVERVIEW to THREAD', () => {
      // Setup: Start on OVERVIEW, then switch to THREAD
      const thread = createMockThread({ id: 'thread-switch' });
      const participants = [createMockParticipant(0)];

      // Initialize on OVERVIEW (simulates thread creation)
      store.getState().initializeThread(thread, participants, [
        createMockUserMessage(0, 'Initial question'),
        createMockMessage(0, 0),
      ]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // First prepareForNewMessage on OVERVIEW (should NOT add message)
      store.getState().prepareForNewMessage('Message A', ['model-0']);
      const messagesAfterOverview = store.getState().messages.length;

      // Clear pending state (simulates message sent)
      store.getState().setPendingMessage(null);

      // Switch to THREAD screen
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Second prepareForNewMessage on THREAD (SHOULD add message)
      store.getState().prepareForNewMessage('Message B', ['model-0']);
      const messagesAfterThread = store.getState().messages.length;

      // ✅ CRITICAL: Only ONE new message should be added (for THREAD screen)
      // OVERVIEW call: +0 messages
      // THREAD call: +1 message
      expect(messagesAfterThread).toBe(messagesAfterOverview + 1);
    });
  });

  describe('startRegeneration', () => {
    it('should clear streaming/analysis/pending flags and set regeneration state', () => {
      setAllStreamingFlags();

      // Call startRegeneration
      store.getState().startRegeneration(1);

      // Verify expected flags are cleared/set
      const state = store.getState();

      // Streaming flags - ALL must be cleared
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.currentRoundNumber).toBe(null);
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);

      // Analysis flags - ALL must be cleared
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pending message flags - ALL must be cleared
      expect(state.pendingMessage).toBe(null);
      expect(state.expectedParticipantIds).toBe(null);
      expect(state.hasSentPendingMessage).toBe(false);

      // Regeneration state - set for regeneration
      expect(state.isRegenerating).toBe(true);
      expect(state.regeneratingRoundNumber).toBe(1);

      // Tracking for round 1 - should be cleared
      expect(state.hasAnalysisBeenCreated(1)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);

      // Tracking for other rounds - should NOT be cleared
      expect(state.hasAnalysisBeenCreated(0)).toBe(true);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(true);
    });
  });

  describe('completeRegeneration', () => {
    it('should clear ALL streaming, analysis, pending message, and regeneration flags', () => {
      setAllStreamingFlags();

      // Call completeRegeneration
      store.getState().completeRegeneration(1);

      // Verify ALL expected flags are cleared
      const state = store.getState();

      // Streaming flags - ALL must be cleared
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.currentRoundNumber).toBe(null);
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);

      // Analysis flags - ALL must be cleared
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pending message flags - ALL must be cleared
      expect(state.pendingMessage).toBe(null);
      expect(state.expectedParticipantIds).toBe(null);
      expect(state.hasSentPendingMessage).toBe(false);

      // Regeneration flags - ALL must be cleared
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBe(null);

      // Tracking - should NOT be cleared by completeRegeneration
      expect(state.hasAnalysisBeenCreated(0)).toBe(true);
      expect(state.hasAnalysisBeenCreated(1)).toBe(true);
    });
  });

  describe('resetThreadState', () => {
    it('should clear ALL streaming-related flags and tracking', () => {
      setAllStreamingFlags();

      // Call resetThreadState
      store.getState().resetThreadState();

      // Verify ALL flags are cleared
      const state = store.getState();

      // Streaming flags - ALL must be cleared
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.currentRoundNumber).toBe(null);
      expect(state.waitingToStartStreaming).toBe(false);

      // Analysis flags - ALL must be cleared
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pending message flags - ALL must be cleared
      expect(state.pendingMessage).toBe(null);
      expect(state.expectedParticipantIds).toBe(null);
      expect(state.hasSentPendingMessage).toBe(false);

      // Regeneration flags - ALL must be cleared
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBe(null);

      // Tracking - ALL must be cleared (fresh Sets)
      expect(state.hasAnalysisBeenCreated(0)).toBe(false);
      expect(state.hasAnalysisBeenCreated(1)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    });
  });

  describe('resetToOverview', () => {
    it('should clear ALL state including thread data', () => {
      setAllStreamingFlags();

      // Add analysis to verify it's cleared
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Call resetToOverview
      store.getState().resetToOverview();

      // Verify ALL flags are cleared
      const state = store.getState();

      // Thread data - must be cleared
      expect(state.thread).toBe(null);
      expect(state.participants).toEqual([]);
      expect(state.messages).toEqual([]);
      expect(state.analyses).toEqual([]);

      // Streaming flags - ALL must be cleared
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.currentRoundNumber).toBe(null);
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);

      // Analysis flags - ALL must be cleared
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pending message flags - ALL must be cleared
      expect(state.pendingMessage).toBe(null);
      expect(state.expectedParticipantIds).toBe(null);
      expect(state.hasSentPendingMessage).toBe(false);

      // Regeneration flags - ALL must be cleared
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBe(null);

      // Tracking - ALL must be cleared (fresh Sets)
      expect(state.hasAnalysisBeenCreated(0)).toBe(false);
      expect(state.hasAnalysisBeenCreated(1)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    });
  });

  describe('resetToNewChat', () => {
    it('should clear ALL state and stop streaming', () => {
      setAllStreamingFlags();

      // Mock stop function
      const mockStop = vi.fn();
      store.setState({ stop: mockStop });

      // Add analysis to verify it's cleared
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      // Call resetToNewChat
      store.getState().resetToNewChat();

      // Verify stop was called
      expect(mockStop).toHaveBeenCalled();

      // Verify ALL flags are cleared (same as resetToOverview)
      const state = store.getState();

      // Thread data - must be cleared
      expect(state.thread).toBe(null);
      expect(state.participants).toEqual([]);
      expect(state.messages).toEqual([]);
      expect(state.analyses).toEqual([]);

      // Streaming flags - ALL must be cleared
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBe(null);
      expect(state.currentRoundNumber).toBe(null);
      expect(state.waitingToStartStreaming).toBe(false);
      expect(state.currentParticipantIndex).toBe(0);

      // Analysis flags - ALL must be cleared
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);

      // Pending message flags - ALL must be cleared
      expect(state.pendingMessage).toBe(null);
      expect(state.expectedParticipantIds).toBe(null);
      expect(state.hasSentPendingMessage).toBe(false);

      // Regeneration flags - ALL must be cleared
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBe(null);

      // Tracking - ALL must be cleared (fresh Sets)
      expect(state.hasAnalysisBeenCreated(0)).toBe(false);
      expect(state.hasAnalysisBeenCreated(1)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(0)).toBe(false);
      expect(state.hasPreSearchBeenTriggered(1)).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('should be safe to call completeStreaming multiple times', () => {
      setAllStreamingFlags();

      // Call multiple times
      store.getState().completeStreaming();
      store.getState().completeStreaming();
      store.getState().completeStreaming();

      // Should still be in clean state
      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.pendingMessage).toBe(null);
    });

    it('should be safe to call completeRegeneration multiple times', () => {
      setAllStreamingFlags();

      // Call multiple times
      store.getState().completeRegeneration(0);
      store.getState().completeRegeneration(0);
      store.getState().completeRegeneration(0);

      // Should still be in clean state
      const state = store.getState();
      expect(state.isRegenerating).toBe(false);
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('state Consistency After Reset Sequences', () => {
    it('should handle: prepareForNewMessage → completeStreaming', () => {
      setAllStreamingFlags();

      store.getState().prepareForNewMessage('question', ['p1']);
      store.getState().completeStreaming();

      const state = store.getState();
      // All flags should be cleared, pendingMessage should be null (cleared by completeStreaming)
      expect(state.pendingMessage).toBe(null);
      expect(state.isStreaming).toBe(false);
      expect(state.isWaitingForChangelog).toBe(false);
    });

    it('should handle: startRegeneration → completeRegeneration', () => {
      setAllStreamingFlags();

      store.getState().startRegeneration(1);

      // Verify regeneration state
      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(1);

      store.getState().completeRegeneration(1);

      // All flags should be cleared
      const state = store.getState();
      expect(state.isRegenerating).toBe(false);
      expect(state.regeneratingRoundNumber).toBe(null);
      expect(state.isStreaming).toBe(false);
    });
  });
});
