/**
 * Feedback System E2E Tests
 *
 * Tests the complete feedback system flow for Like/Dislike functionality
 * based on FLOW_DOCUMENTATION.md Part 5: Thread Detail Page.
 *
 * SCENARIOS TESTED:
 * 1. Basic Like/Dislike Flow - Applies to entire round
 * 2. Toggle Feedback - Remove feedback on second click
 * 3. Switch Feedback - Change from like to dislike (vice versa)
 * 4. Feedback Per Round - Independent feedback per round
 * 5. Feedback Persistence - Load from server
 * 6. Feedback Data Structure - roundNumber, feedbackType
 * 7. Feedback Reset on Regeneration - Clear when round regenerated
 * 8. Multiple Rounds Feedback - Different feedback per round
 * 9. Feedback Loading State - Optimistic updates and pending state
 * 10. Read-Only Mode - Disabled in public/read-only threads
 * 11. Store Integration - feedbackByRound map and actions
 * 12. Concurrent Updates - Rapid click handling
 * 13. Edge Cases - Round boundaries, failed rounds
 *
 * Location: /src/stores/chat/__tests__/feedback-system-flow.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  FeedbackTypes,
  ScreenModes,
} from '@/api/core/enums';
import type { RoundFeedbackData } from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

/**
 * Create a store with initial state for testing
 */
function createTestStore() {
  return createChatStore();
}

/**
 * Setup a thread with completed rounds for feedback testing
 */
function setupThreadWithRounds(
  store: ReturnType<typeof createChatStore>,
  roundCount: number,
  participantCount: number = 2,
) {
  const thread = createMockThread({ id: 'thread-123' });
  const participants = Array.from({ length: participantCount }, (_, i) =>
    createMockParticipant(i, { threadId: 'thread-123' }));

  // Create messages for each round
  const messages = [];
  for (let round = 0; round < roundCount; round++) {
    messages.push(createMockUserMessage(round, `Question for round ${round}`));
    for (let p = 0; p < participantCount; p++) {
      messages.push(createMockMessage(p, round));
    }
  }

  // Create analyses for each round
  const analyses = Array.from({ length: roundCount }, (_, i) =>
    createMockAnalysis({
      id: `analysis-${i}`,
      threadId: 'thread-123',
      roundNumber: i,
      status: AnalysisStatuses.COMPLETE,
    }));

  store.getState().initializeThread(thread, participants, messages);
  store.getState().setAnalyses(analyses);
  store.getState().setScreenMode(ScreenModes.THREAD);

  return { thread, participants, messages, analyses };
}

// ============================================================================
// FEEDBACK SYSTEM FLOW TESTS
// ============================================================================

describe('feedback System Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // BASIC LIKE/DISLIKE FLOW
  // ==========================================================================

  describe('basic Like/Dislike Flow', () => {
    it('should apply like feedback to entire round', () => {
      setupThreadWithRounds(store, 1);

      // User clicks like button for round 0
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });

    it('should apply dislike feedback to entire round', () => {
      setupThreadWithRounds(store, 1);

      // User clicks dislike button for round 0
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });

    it('should store feedback with correct round number', () => {
      setupThreadWithRounds(store, 3);

      // Feedback on different rounds
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);
      store.getState().setFeedback(2, FeedbackTypes.LIKE);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.LIKE);
    });

    it('should set pending feedback when saving to server', () => {
      setupThreadWithRounds(store, 1);

      // Simulate saving feedback
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setPendingFeedback({ roundNumber: 0, type: FeedbackTypes.LIKE });

      const state = store.getState();
      expect(state.pendingFeedback).toEqual({ roundNumber: 0, type: FeedbackTypes.LIKE });
    });

    it('should clear pending feedback after save completes', () => {
      setupThreadWithRounds(store, 1);

      // Set and clear pending
      store.getState().setPendingFeedback({ roundNumber: 0, type: FeedbackTypes.LIKE });
      store.getState().setPendingFeedback(null);

      expect(store.getState().pendingFeedback).toBeNull();
    });
  });

  // ==========================================================================
  // TOGGLE FEEDBACK
  // ==========================================================================

  describe('toggle Feedback', () => {
    it('should remove like feedback when clicking like again', () => {
      setupThreadWithRounds(store, 1);

      // Like the round
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);

      // Click like again to toggle off
      store.getState().setFeedback(0, null);

      expect(store.getState().feedbackByRound.get(0)).toBeNull();
    });

    it('should remove dislike feedback when clicking dislike again', () => {
      setupThreadWithRounds(store, 1);

      // Dislike the round
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);

      // Click dislike again to toggle off
      store.getState().setFeedback(0, null);

      expect(store.getState().feedbackByRound.get(0)).toBeNull();
    });

    it('should return visual state to neutral after toggle', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(0, null);

      // Should be neutral (no green/red background)
      const feedback = store.getState().feedbackByRound.get(0);
      expect(feedback === null || feedback === undefined).toBe(true);
    });
  });

  // ==========================================================================
  // SWITCH FEEDBACK
  // ==========================================================================

  describe('switch Feedback', () => {
    it('should switch from like to dislike', () => {
      setupThreadWithRounds(store, 1);

      // Like first
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);

      // Switch to dislike
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);

      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });

    it('should switch from dislike to like', () => {
      setupThreadWithRounds(store, 1);

      // Dislike first
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);

      // Switch to like
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });

    it('should clear previous feedback when switching', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);

      // Only one feedback should exist (not both)
      const feedbackMap = store.getState().feedbackByRound;
      expect(feedbackMap.size).toBe(1);
      expect(feedbackMap.get(0)).toBe(FeedbackTypes.DISLIKE);
    });
  });

  // ==========================================================================
  // FEEDBACK PER ROUND
  // ==========================================================================

  describe('feedback Per Round', () => {
    it('should maintain independent feedback for each round', () => {
      setupThreadWithRounds(store, 3);

      // Different feedback for each round
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);
      // Round 2 has no feedback

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
      expect(state.feedbackByRound.has(2)).toBe(false);
    });

    it('should not affect other rounds when updating feedback', () => {
      setupThreadWithRounds(store, 3);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.LIKE);
      store.getState().setFeedback(2, FeedbackTypes.LIKE);

      // Change round 1 to dislike
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.LIKE);
    });

    it('should allow clearing feedback for one round while preserving others', () => {
      setupThreadWithRounds(store, 3);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.LIKE);
      store.getState().setFeedback(2, FeedbackTypes.LIKE);

      // Clear only round 1
      store.getState().clearFeedback(1);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.has(1)).toBe(false);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.LIKE);
    });
  });

  // ==========================================================================
  // FEEDBACK PERSISTENCE
  // ==========================================================================

  describe('feedback Persistence', () => {
    it('should load feedback from server on mount', () => {
      setupThreadWithRounds(store, 2);

      const serverFeedback: RoundFeedbackData[] = [
        { roundNumber: 0, feedbackType: FeedbackTypes.LIKE },
        { roundNumber: 1, feedbackType: FeedbackTypes.DISLIKE },
      ];

      store.getState().loadFeedbackFromServer(serverFeedback);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
      expect(state.hasLoadedFeedback).toBe(true);
    });

    it('should set hasLoadedFeedback flag after loading', () => {
      setupThreadWithRounds(store, 1);

      expect(store.getState().hasLoadedFeedback).toBe(false);

      store.getState().loadFeedbackFromServer([]);

      expect(store.getState().hasLoadedFeedback).toBe(true);
    });

    it('should handle empty feedback from server', () => {
      setupThreadWithRounds(store, 1);

      store.getState().loadFeedbackFromServer([]);

      const state = store.getState();
      expect(state.feedbackByRound.size).toBe(0);
      expect(state.hasLoadedFeedback).toBe(true);
    });

    it('should overwrite existing feedback when loading from server', () => {
      setupThreadWithRounds(store, 1);

      // Set local feedback
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // Load server feedback (different)
      store.getState().loadFeedbackFromServer([
        { roundNumber: 0, feedbackType: FeedbackTypes.DISLIKE },
      ]);

      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });
  });

  // ==========================================================================
  // FEEDBACK DATA STRUCTURE
  // ==========================================================================

  describe('feedback Data Structure', () => {
    it('should store feedback with threadId context from thread', () => {
      const { thread: _thread } = setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // Thread ID available from thread state
      expect(store.getState().thread?.id).toBe('thread-123');
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });

    it('should use round number as map key', () => {
      setupThreadWithRounds(store, 3);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(2, FeedbackTypes.DISLIKE);

      const feedbackMap = store.getState().feedbackByRound;
      expect(feedbackMap.has(0)).toBe(true);
      expect(feedbackMap.has(1)).toBe(false);
      expect(feedbackMap.has(2)).toBe(true);
    });

    it('should only store like or dislike values', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      expect([FeedbackTypes.LIKE, FeedbackTypes.DISLIKE]).toContain(
        store.getState().feedbackByRound.get(0),
      );

      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);
      expect([FeedbackTypes.LIKE, FeedbackTypes.DISLIKE]).toContain(
        store.getState().feedbackByRound.get(0),
      );
    });
  });

  // ==========================================================================
  // FEEDBACK RESET ON REGENERATION
  // ==========================================================================

  describe('feedback Reset on Regeneration', () => {
    it('should clear feedback when round is regenerated', () => {
      setupThreadWithRounds(store, 1);

      // Set feedback
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);

      // Clear feedback (during regeneration)
      store.getState().clearFeedback(0);

      expect(store.getState().feedbackByRound.has(0)).toBe(false);
    });

    it('should require user to re-evaluate after regeneration', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().clearFeedback(0);

      // No feedback exists - user must re-evaluate
      const feedback = store.getState().feedbackByRound.get(0);
      expect(feedback).toBeUndefined();
    });

    it('should not affect other rounds when regenerating one round', () => {
      setupThreadWithRounds(store, 3);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);
      store.getState().setFeedback(2, FeedbackTypes.LIKE);

      // Regenerate round 1
      store.getState().clearFeedback(1);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.has(1)).toBe(false);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.LIKE);
    });

    it('should allow new feedback after regeneration completes', () => {
      setupThreadWithRounds(store, 1);

      // Initial feedback
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      // Clear (regeneration)
      store.getState().clearFeedback(0);
      // New feedback after regeneration
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);

      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });
  });

  // ==========================================================================
  // MULTIPLE ROUNDS FEEDBACK
  // ==========================================================================

  describe('multiple Rounds Feedback', () => {
    it('should persist feedback correctly for all rounds', () => {
      setupThreadWithRounds(store, 5);

      // Set feedback for all rounds
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);
      store.getState().setFeedback(2, FeedbackTypes.LIKE);
      store.getState().setFeedback(3, FeedbackTypes.LIKE);
      store.getState().setFeedback(4, FeedbackTypes.DISLIKE);

      const state = store.getState();
      expect(state.feedbackByRound.size).toBe(5);
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(3)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(4)).toBe(FeedbackTypes.DISLIKE);
    });

    it('should show correct UI state per round', () => {
      setupThreadWithRounds(store, 3);

      store.getState().setFeedback(0, FeedbackTypes.LIKE); // Green
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE); // Red
      // Round 2: no feedback (neutral)

      const feedbackMap = store.getState().feedbackByRound;

      // Round 0: green (like)
      expect(feedbackMap.get(0)).toBe(FeedbackTypes.LIKE);
      // Round 1: red (dislike)
      expect(feedbackMap.get(1)).toBe(FeedbackTypes.DISLIKE);
      // Round 2: neutral (no entry)
      expect(feedbackMap.has(2)).toBe(false);
    });

    it('should load multiple rounds feedback from server', () => {
      setupThreadWithRounds(store, 5);

      const serverFeedback: RoundFeedbackData[] = [
        { roundNumber: 0, feedbackType: FeedbackTypes.LIKE },
        { roundNumber: 2, feedbackType: FeedbackTypes.DISLIKE },
        { roundNumber: 4, feedbackType: FeedbackTypes.LIKE },
      ];

      store.getState().loadFeedbackFromServer(serverFeedback);

      const state = store.getState();
      expect(state.feedbackByRound.size).toBe(3);
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.DISLIKE);
      expect(state.feedbackByRound.get(4)).toBe(FeedbackTypes.LIKE);
    });
  });

  // ==========================================================================
  // FEEDBACK LOADING STATE (OPTIMISTIC UI)
  // ==========================================================================

  describe('feedback Loading State', () => {
    it('should update UI immediately on click (optimistic)', () => {
      setupThreadWithRounds(store, 1);

      // Optimistic update
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // Should be set immediately (not waiting for server)
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });

    it('should track pending state during save', () => {
      setupThreadWithRounds(store, 1);

      // Simulate save starting
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setPendingFeedback({ roundNumber: 0, type: FeedbackTypes.LIKE });

      expect(store.getState().pendingFeedback?.roundNumber).toBe(0);
      expect(store.getState().pendingFeedback?.type).toBe(FeedbackTypes.LIKE);
    });

    it('should clear pending state after save', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setPendingFeedback({ roundNumber: 0, type: FeedbackTypes.LIKE });
      store.getState().setPendingFeedback(null);

      expect(store.getState().pendingFeedback).toBeNull();
    });

    it('should handle rapid feedback changes', () => {
      setupThreadWithRounds(store, 1);

      // Rapid clicks: like -> dislike -> like
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // Final state should be the last value
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });
  });

  // ==========================================================================
  // READ-ONLY MODE
  // ==========================================================================

  describe('feedback in Read-Only Mode', () => {
    it('should set read-only state for public threads', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setScreenMode(ScreenModes.PUBLIC);

      expect(store.getState().isReadOnly).toBe(true);
    });

    it('should not be read-only for private threads', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().isReadOnly).toBe(false);
    });

    it('should still allow reading feedback in read-only mode', () => {
      setupThreadWithRounds(store, 1);

      // Load feedback first
      store.getState().loadFeedbackFromServer([
        { roundNumber: 0, feedbackType: FeedbackTypes.LIKE },
      ]);

      // Set to read-only
      store.getState().setScreenMode(ScreenModes.PUBLIC);

      // Can still read feedback
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });
  });

  // ==========================================================================
  // STORE INTEGRATION
  // ==========================================================================

  describe('feedback Store Integration', () => {
    it('should use feedbackByRound Map for storage', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      const feedbackMap = store.getState().feedbackByRound;
      expect(feedbackMap instanceof Map).toBe(true);
    });

    it('should reset feedback on full store reset', () => {
      setupThreadWithRounds(store, 2);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);

      // Reset store
      store.getState().resetFeedback();

      const state = store.getState();
      expect(state.feedbackByRound.size).toBe(0);
      expect(state.pendingFeedback).toBeNull();
      expect(state.hasLoadedFeedback).toBe(false);
    });

    it('should preserve feedback during thread navigation', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // Simulate some state changes (not full reset)
      store.getState().setInputValue('new message');
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(false);

      // Feedback should be preserved
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });
  });

  // ==========================================================================
  // CONCURRENT FEEDBACK UPDATES
  // ==========================================================================

  describe('concurrent Feedback Updates', () => {
    it('should handle rapid clicks on same round', () => {
      setupThreadWithRounds(store, 1);

      // Rapid toggle
      for (let i = 0; i < 10; i++) {
        const value = i % 2 === 0 ? FeedbackTypes.LIKE : FeedbackTypes.DISLIKE;
        store.getState().setFeedback(0, value);
      }

      // Final state should be the last value (dislike for i=9)
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });

    it('should handle concurrent updates to different rounds', () => {
      setupThreadWithRounds(store, 3);

      // Concurrent updates to different rounds
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);
      store.getState().setFeedback(2, FeedbackTypes.LIKE);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.LIKE);
    });

    it('should maintain consistency during rapid operations', () => {
      setupThreadWithRounds(store, 2);

      // Complex sequence of operations
      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.LIKE);
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);
      store.getState().clearFeedback(1);
      store.getState().setFeedback(0, null);
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);

      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBeNull();
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('edge Cases', () => {
    it('should handle feedback on round 0', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });

    it('should handle high round numbers', () => {
      setupThreadWithRounds(store, 10);

      store.getState().setFeedback(9, FeedbackTypes.LIKE);

      expect(store.getState().feedbackByRound.get(9)).toBe(FeedbackTypes.LIKE);
    });

    it('should handle setting feedback for non-existent round', () => {
      setupThreadWithRounds(store, 1);

      // Round 5 doesn't exist but we can still set feedback
      store.getState().setFeedback(5, FeedbackTypes.LIKE);

      expect(store.getState().feedbackByRound.get(5)).toBe(FeedbackTypes.LIKE);
    });

    it('should handle clearing feedback for non-existent round', () => {
      setupThreadWithRounds(store, 1);

      // Clearing non-existent feedback should be safe
      store.getState().clearFeedback(99);

      expect(store.getState().feedbackByRound.has(99)).toBe(false);
    });

    it('should handle empty server feedback gracefully', () => {
      setupThreadWithRounds(store, 1);

      // Empty array from server
      store.getState().loadFeedbackFromServer([]);

      expect(store.getState().feedbackByRound.size).toBe(0);
      expect(store.getState().hasLoadedFeedback).toBe(true);
    });

    it('should handle duplicate round numbers in server data', () => {
      setupThreadWithRounds(store, 1);

      // Server sends duplicates - last one wins
      const serverFeedback: RoundFeedbackData[] = [
        { roundNumber: 0, feedbackType: FeedbackTypes.LIKE },
        { roundNumber: 0, feedbackType: FeedbackTypes.DISLIKE },
      ];

      store.getState().loadFeedbackFromServer(serverFeedback);

      // Map will use last value for duplicate keys
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });

    it('should preserve feedback when updating other state', () => {
      setupThreadWithRounds(store, 1);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // Update other state
      store.getState().setInputValue('test');
      store.getState().setSelectedMode('brainstorming');
      store.getState().setEnableWebSearch(true);

      // Feedback preserved
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
    });

    it('should handle feedback on failed/incomplete rounds', () => {
      setupThreadWithRounds(store, 1);

      // Even if round failed, we can still set feedback
      // (this is allowed because user might want to track that round was problematic)
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);

      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });
  });

  // ==========================================================================
  // FEEDBACK COMPLETE WORKFLOWS
  // ==========================================================================

  describe('complete Feedback Workflows', () => {
    it('should complete full like -> persist -> reload workflow', () => {
      setupThreadWithRounds(store, 1);

      // 1. User clicks like
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // 2. Pending state during save
      store.getState().setPendingFeedback({ roundNumber: 0, type: FeedbackTypes.LIKE });

      // 3. Save completes
      store.getState().setPendingFeedback(null);

      // 4. Later: page reload - load from server
      store.getState().loadFeedbackFromServer([
        { roundNumber: 0, feedbackType: FeedbackTypes.LIKE },
      ]);

      // Verify final state
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(store.getState().pendingFeedback).toBeNull();
      expect(store.getState().hasLoadedFeedback).toBe(true);
    });

    it('should complete regeneration workflow with feedback reset', () => {
      setupThreadWithRounds(store, 1);

      // 1. User provides feedback
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // 2. User triggers regeneration - feedback cleared
      store.getState().clearFeedback(0);
      store.getState().setIsRegenerating(true);
      store.getState().setRegeneratingRoundNumber(0);

      // 3. Regeneration completes
      store.getState().setIsRegenerating(false);
      store.getState().setRegeneratingRoundNumber(null);

      // 4. User provides new feedback
      store.getState().setFeedback(0, FeedbackTypes.DISLIKE);

      // Verify new feedback is set
      expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKE);
    });

    it('should complete multi-round conversation with feedback', () => {
      setupThreadWithRounds(store, 3);

      // Round 0: Complete and liked
      store.getState().setFeedback(0, FeedbackTypes.LIKE);

      // Round 1: Complete and disliked
      store.getState().setFeedback(1, FeedbackTypes.DISLIKE);

      // Round 2: Complete, then regenerated
      store.getState().setFeedback(2, FeedbackTypes.LIKE);
      store.getState().clearFeedback(2);
      store.getState().setFeedback(2, FeedbackTypes.DISLIKE);

      // Final state
      const state = store.getState();
      expect(state.feedbackByRound.get(0)).toBe(FeedbackTypes.LIKE);
      expect(state.feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKE);
      expect(state.feedbackByRound.get(2)).toBe(FeedbackTypes.DISLIKE);
    });
  });

  // ==========================================================================
  // FEEDBACK ANALYTICS DATA
  // ==========================================================================

  describe('feedback Analytics Data', () => {
    it('should count total likes and dislikes', () => {
      setupThreadWithRounds(store, 5);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(1, FeedbackTypes.LIKE);
      store.getState().setFeedback(2, FeedbackTypes.DISLIKE);
      store.getState().setFeedback(3, FeedbackTypes.LIKE);
      // Round 4: no feedback

      const feedbackMap = store.getState().feedbackByRound;
      const likes = Array.from(feedbackMap.values()).filter(f => f === FeedbackTypes.LIKE).length;
      const dislikes = Array.from(feedbackMap.values()).filter(f => f === FeedbackTypes.DISLIKE).length;

      expect(likes).toBe(3);
      expect(dislikes).toBe(1);
    });

    it('should track feedback presence per round', () => {
      setupThreadWithRounds(store, 5);

      store.getState().setFeedback(0, FeedbackTypes.LIKE);
      store.getState().setFeedback(2, FeedbackTypes.DISLIKE);
      store.getState().setFeedback(4, FeedbackTypes.LIKE);

      const feedbackMap = store.getState().feedbackByRound;
      const roundsWithFeedback = Array.from(feedbackMap.keys());

      expect(roundsWithFeedback).toEqual([0, 2, 4]);
    });
  });
});
