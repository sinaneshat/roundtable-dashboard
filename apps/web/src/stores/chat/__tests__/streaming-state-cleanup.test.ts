/**
 * Streaming State Cleanup Between Rounds Tests
 *
 * Tests for proper state cleanup when transitioning between conversation rounds.
 * Verifies that streaming state (isStreaming, currentParticipantIndex, streamingRoundNumber, etc.)
 * is properly cleared after a round completes and doesn't carry over to the next round.
 *
 * Critical issues to prevent:
 * - isStreaming persisting after all participants complete
 * - currentParticipantIndex not resetting to 0
 * - streamingRoundNumber not being cleared
 * - Pending message state persisting incorrectly
 * - Moderator state bleeding into next round
 * - Stale animation state blocking new rounds
 *
 * Architecture:
 * - STREAMING_STATE_RESET: isStreaming, streamingRoundNumber, currentRoundNumber, waitingToStartStreaming, currentParticipantIndex
 * - MODERATOR_STATE_RESET: isModeratorStreaming, isWaitingForChangelog
 * - PENDING_MESSAGE_STATE_RESET: pendingMessage, pendingAttachmentIds, pendingFileParts, expectedParticipantIds, hasSentPendingMessage
 * - REGENERATION_STATE_RESET: isRegenerating, regeneratingRoundNumber
 *
 * Reset Groups (store-defaults.ts):
 * - completeStreaming() should clear ALL state groups
 * - completeModeratorStream() should clear MODERATOR_STATE_RESET
 * - Navigation/thread reset should clear everything
 */

import { MessageRoles, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createTestModeratorMessage } from '@/lib/testing';
import type { ApiMessage } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST HELPERS
// ============================================================================

/**
 * Create a mock participant message for testing
 */
function createParticipantMessage(
  participantIndex: number,
  roundNumber: number,
  content = 'Test response',
): ApiMessage {
  return {
    createdAt: new Date(),
    id: `thread-1_r${roundNumber}_p${participantIndex}`,
    metadata: {
      model: `model-${participantIndex}`,
      participantIndex,
      role: MessageRoles.ASSISTANT,
      roundNumber,
    },
    parts: [{ text: content, type: 'text' }],
    role: MessageRoles.ASSISTANT,
  };
}

/**
 * Create a mock user message for testing
 */
function createUserMessage(roundNumber: number, content = 'User query'): ApiMessage {
  return {
    createdAt: new Date(),
    id: `user-r${roundNumber}`,
    metadata: { roundNumber },
    parts: [{ text: content, type: 'text' }],
    role: MessageRoles.USER,
  };
}

/**
 * Simulate a complete round with 3 participants and moderator
 */
function simulateCompleteRound(store: ReturnType<typeof createChatStore>, roundNumber: number) {
  const messages: ApiMessage[] = [];

  // User message
  messages.push(createUserMessage(roundNumber));

  // 3 participant responses
  messages.push(createParticipantMessage(0, roundNumber, 'Response from model 1'));
  messages.push(createParticipantMessage(1, roundNumber, 'Response from model 2'));
  messages.push(createParticipantMessage(2, roundNumber, 'Response from model 3'));

  // Moderator message
  messages.push(
    createTestModeratorMessage({
      content: 'Round moderator',
      id: `moderator-r${roundNumber}`,
      roundNumber,
    }),
  );

  store.getState().setMessages(messages);
}

// ============================================================================
// STREAMING STATE CLEANUP TESTS
// ============================================================================

describe('streaming State Cleanup Between Rounds', () => {
  describe('basic State Cleanup After Round Completion', () => {
    it('should clear isStreaming when round completes', () => {
      const store = createChatStore();

      // Set up streaming for round 0
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(2);

      expect(store.getState().isStreaming).toBeTruthy();
      expect(store.getState().streamingRoundNumber).toBe(0);
      expect(store.getState().currentParticipantIndex).toBe(2);

      // Complete the round
      store.getState().completeStreaming();

      // ✅ CRITICAL: All streaming state should be cleared
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().currentParticipantIndex).toBe(0);
    });

    it('should clear currentRoundNumber when streaming completes', () => {
      const store = createChatStore();

      store.getState().setCurrentRoundNumber(1);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsStreaming(true);

      expect(store.getState().currentRoundNumber).toBe(1);

      store.getState().completeStreaming();

      // ✅ CRITICAL: currentRoundNumber should be cleared
      expect(store.getState().currentRoundNumber).toBeNull();
    });

    it('should clear waitingToStartStreaming when streaming completes', () => {
      const store = createChatStore();

      store.getState().setWaitingToStartStreaming(true);
      store.getState().setIsStreaming(true);

      expect(store.getState().waitingToStartStreaming).toBeTruthy();

      store.getState().completeStreaming();

      // ✅ CRITICAL: waitingToStartStreaming should be cleared
      expect(store.getState().waitingToStartStreaming).toBeFalsy();
    });
  });

  describe('moderator State Cleanup', () => {
    it('should clear moderator state when round completes with moderator', () => {
      const store = createChatStore();

      // Set up moderator streaming
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsWaitingForChangelog(true);
      store.getState().setStreamingRoundNumber(0);

      expect(store.getState().isModeratorStreaming).toBeTruthy();
      expect(store.getState().isWaitingForChangelog).toBeTruthy();

      // Complete moderator stream
      store.getState().completeModeratorStream();

      // ✅ CRITICAL: isModeratorStreaming should be cleared
      expect(store.getState().isModeratorStreaming).toBeFalsy();

      // ⚠️ NOTE: isWaitingForChangelog is NOT cleared by completeModeratorStream()
      // It must ONLY be cleared by use-changelog-sync.ts after changelog is fetched.
      // This ensures correct ordering: PATCH → changelog → pre-search/streaming
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });

    it('should clear moderator state when completeStreaming is called', () => {
      const store = createChatStore();

      // Set moderator state
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsWaitingForChangelog(true);

      // Complete all streaming (includes moderator cleanup)
      store.getState().completeStreaming();

      // ✅ CRITICAL: completeStreaming should clear isModeratorStreaming
      expect(store.getState().isModeratorStreaming).toBeFalsy();

      // ⚠️ NOTE: isWaitingForChangelog is NOT cleared by completeStreaming()
      // It must ONLY be cleared by use-changelog-sync.ts after changelog is fetched.
      // This ensures correct ordering: PATCH → changelog → pre-search/streaming
      expect(store.getState().isWaitingForChangelog).toBeTruthy();
    });
  });

  describe('pending Message State Cleanup', () => {
    it('should clear pending message state when streaming completes', () => {
      const store = createChatStore();

      // Set up pending message
      store.getState().setPendingMessage('Test message');
      store.getState().setPendingAttachmentIds(['attach-1', 'attach-2']);
      store.getState().setExpectedParticipantIds(['model-1', 'model-2']);
      store.getState().setHasSentPendingMessage(true);

      expect(store.getState().pendingMessage).toBe('Test message');
      expect(store.getState().pendingAttachmentIds).toHaveLength(2);
      expect(store.getState().expectedParticipantIds).toHaveLength(2);
      expect(store.getState().hasSentPendingMessage).toBeTruthy();

      // Complete streaming
      store.getState().completeStreaming();

      // ✅ CRITICAL: All pending message state should be cleared
      expect(store.getState().pendingMessage).toBeNull();
      expect(store.getState().pendingAttachmentIds).toBeNull();
      expect(store.getState().expectedParticipantIds).toBeNull();
      expect(store.getState().hasSentPendingMessage).toBeFalsy();
    });

    it('should clear pendingFileParts when streaming completes', () => {
      const store = createChatStore();

      // Set up streaming state first
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Set file parts via prepareForNewMessage (the only way to set them)
      store.getState().prepareForNewMessage(
        'Test message',
        ['model-1'],
        undefined, // no attachment IDs
        [{ name: 'test.pdf', type: 'file', uploadId: 'upload-1', url: 'http://test.com/file' }],
      );

      // Note: prepareForNewMessage sets pendingFileParts but ALSO resets isStreaming=false
      // This is the current behavior - it resets streaming flags as part of preparing
      expect(store.getState().pendingFileParts).toHaveLength(1);
      expect(store.getState().isStreaming).toBeFalsy(); // Reset by prepareForNewMessage

      // Set streaming back to true to simulate actual streaming state
      store.getState().setIsStreaming(true);

      store.getState().completeStreaming();

      // ✅ CRITICAL: File parts should be cleared
      expect(store.getState().pendingFileParts).toBeNull();
    });
  });

  describe('animation State Cleanup', () => {
    it('should clear animation state when streaming completes', () => {
      const store = createChatStore();

      // Register animations for 3 participants
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      expect(store.getState().pendingAnimations.size).toBe(3);

      // Complete all animations
      store.getState().completeAnimation(0);
      store.getState().completeAnimation(1);
      store.getState().completeAnimation(2);

      expect(store.getState().pendingAnimations.size).toBe(0);

      // Complete streaming
      store.getState().completeStreaming();

      // ✅ CRITICAL: Animation state should remain cleared
      expect(store.getState().pendingAnimations.size).toBe(0);
      expect(store.getState().animationResolvers.size).toBe(0);
    });

    it('should forcefully clear pending animations even if not individually completed', () => {
      const store = createChatStore();

      // Register animations but don't complete them individually
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      expect(store.getState().pendingAnimations.size).toBe(2);

      // Complete streaming should force-clear animations
      store.getState().completeStreaming();

      // ✅ CRITICAL: Animations should be cleared even without individual completion
      expect(store.getState().pendingAnimations.size).toBe(0);
      expect(store.getState().animationResolvers.size).toBe(0);
    });
  });

  describe('complete Round to Round Transition', () => {
    it('should not carry over streaming state from round 0 to round 1', () => {
      const store = createChatStore();

      // ===== ROUND 0 =====
      // Simulate round 0 streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentRoundNumber(0);
      store.getState().setCurrentParticipantIndex(2);
      store.getState().setPendingMessage('Round 0 message');

      // Complete round 0
      simulateCompleteRound(store, 0);
      store.getState().completeStreaming();

      // Verify round 0 cleanup
      const afterRound0 = store.getState();
      expect(afterRound0.isStreaming).toBeFalsy();
      expect(afterRound0.streamingRoundNumber).toBeNull();
      expect(afterRound0.currentRoundNumber).toBeNull();
      expect(afterRound0.currentParticipantIndex).toBe(0);
      expect(afterRound0.pendingMessage).toBeNull();

      // ===== ROUND 1 =====
      // Start round 1 with FRESH state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentRoundNumber(1);
      store.getState().setPendingMessage('Round 1 message');

      const duringRound1 = store.getState();
      expect(duringRound1.isStreaming).toBeTruthy();
      expect(duringRound1.streamingRoundNumber).toBe(1);
      expect(duringRound1.currentRoundNumber).toBe(1);
      expect(duringRound1.currentParticipantIndex).toBe(0); // Should start at 0

      // Complete round 1
      simulateCompleteRound(store, 1);
      store.getState().completeStreaming();

      // ✅ CRITICAL: Round 1 should have fresh state, no carry-over from round 0
      const afterRound1 = store.getState();
      expect(afterRound1.isStreaming).toBeFalsy();
      expect(afterRound1.streamingRoundNumber).toBeNull();
      expect(afterRound1.currentRoundNumber).toBeNull();
      expect(afterRound1.currentParticipantIndex).toBe(0);
    });

    it('should handle rapid round transitions without state pollution', () => {
      const store = createChatStore();

      // Rapidly cycle through 5 rounds
      for (let round = 0; round < 5; round++) {
        // Start round
        store.getState().setIsStreaming(true);
        store.getState().setStreamingRoundNumber(round);
        store.getState().setCurrentRoundNumber(round);

        // Verify state is for current round only
        expect(store.getState().streamingRoundNumber).toBe(round);
        expect(store.getState().currentRoundNumber).toBe(round);

        // Complete round
        simulateCompleteRound(store, round);
        store.getState().completeStreaming();

        // Verify cleanup
        expect(store.getState().isStreaming).toBeFalsy();
        expect(store.getState().streamingRoundNumber).toBeNull();
        expect(store.getState().currentRoundNumber).toBeNull();
      }

      // After 5 rounds, state should be clean
      const finalState = store.getState();
      expect(finalState.isStreaming).toBeFalsy();
      expect(finalState.streamingRoundNumber).toBeNull();
      expect(finalState.currentRoundNumber).toBeNull();
      expect(finalState.currentParticipantIndex).toBe(0);
      expect(finalState.pendingAnimations.size).toBe(0);
    });
  });

  describe('full Round Lifecycle with Moderator', () => {
    it('should clear ALL state after complete round with moderator', () => {
      const store = createChatStore();

      // ===== PARTICIPANT STREAMING PHASE =====
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentRoundNumber(0);
      store.getState().setPendingMessage('User message');
      store.getState().setExpectedParticipantIds(['model-1', 'model-2', 'model-3']);

      // Simulate participants responding
      store.getState().registerAnimation(0);
      store.getState().setCurrentParticipantIndex(0);

      store.getState().completeAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().setCurrentParticipantIndex(1);

      store.getState().completeAnimation(1);
      store.getState().registerAnimation(2);
      store.getState().setCurrentParticipantIndex(2);

      store.getState().completeAnimation(2);

      // All participants done
      expect(store.getState().pendingAnimations.size).toBe(0);

      // ===== MODERATOR PHASE =====
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsWaitingForChangelog(true);

      expect(store.getState().isModeratorStreaming).toBeTruthy();

      // Moderator completes
      store.getState().completeModeratorStream();

      expect(store.getState().isModeratorStreaming).toBeFalsy();

      // ⚠️ NOTE: isWaitingForChangelog is NOT cleared by completeModeratorStream()
      // It must ONLY be cleared by use-changelog-sync.ts after changelog is fetched.
      // For this test, we simulate changelog sync clearing the flag
      store.getState().setIsWaitingForChangelog(false);
      store.getState().setConfigChangeRoundNumber(null);

      // ===== FINAL CLEANUP =====
      store.getState().completeStreaming();

      // ✅ CRITICAL: ALL streaming state should be cleared
      const finalState = store.getState();

      // STREAMING_STATE_RESET
      expect(finalState.isStreaming).toBeFalsy();
      expect(finalState.streamingRoundNumber).toBeNull();
      expect(finalState.currentRoundNumber).toBeNull();
      expect(finalState.waitingToStartStreaming).toBeFalsy();
      expect(finalState.currentParticipantIndex).toBe(0);

      // MODERATOR_STATE_RESET (only isModeratorStreaming is in this reset now)
      expect(finalState.isModeratorStreaming).toBeFalsy();
      // ⚠️ changelog flags cleared by simulated changelog sync above
      expect(finalState.isWaitingForChangelog).toBeFalsy();

      // PENDING_MESSAGE_STATE_RESET
      expect(finalState.pendingMessage).toBeNull();
      expect(finalState.pendingAttachmentIds).toBeNull();
      expect(finalState.pendingFileParts).toBeNull();
      expect(finalState.expectedParticipantIds).toBeNull();
      expect(finalState.hasSentPendingMessage).toBeFalsy();

      // Animation state
      expect(finalState.pendingAnimations.size).toBe(0);
      expect(finalState.animationResolvers.size).toBe(0);
    });

    it('should handle moderator streaming interrupting participant cleanup', () => {
      const store = createChatStore();

      // Participant streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().registerAnimation(0);

      // Participant completes
      store.getState().completeAnimation(0);

      // Moderator starts IMMEDIATELY (before completeStreaming is called)
      store.getState().setIsModeratorStreaming(true);

      expect(store.getState().isStreaming).toBeTruthy(); // Still streaming (moderator)
      expect(store.getState().isModeratorStreaming).toBeTruthy();

      // Now complete participant streaming
      store.getState().completeStreaming();

      // ✅ BUG POTENTIAL: completeStreaming clears BOTH participant and moderator flags
      // This is current behavior - both are cleared together
      const afterComplete = store.getState();
      expect(afterComplete.isStreaming).toBeFalsy();
      expect(afterComplete.isModeratorStreaming).toBeFalsy();

      // This documents the current behavior where completeStreaming clears moderator state
      // If this is a bug, the test would fail and reveal the issue
    });
  });

  describe('regeneration State Cleanup', () => {
    it('should clear regeneration state when round completes', () => {
      const store = createChatStore();

      // Start regeneration
      store.getState().startRegeneration(0);

      expect(store.getState().isRegenerating).toBeTruthy();
      expect(store.getState().regeneratingRoundNumber).toBe(0);

      // Complete streaming (includes regeneration cleanup)
      store.getState().completeStreaming();

      // ✅ CRITICAL: Regeneration state should be cleared
      expect(store.getState().isRegenerating).toBeFalsy();
      expect(store.getState().regeneratingRoundNumber).toBeNull();
    });

    it('should not carry over regeneration state to next round', () => {
      const store = createChatStore();

      // Regenerate round 0
      store.getState().startRegeneration(0);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      expect(store.getState().isRegenerating).toBeTruthy();

      // Complete round 0 regeneration
      store.getState().completeStreaming();

      expect(store.getState().isRegenerating).toBeFalsy();
      expect(store.getState().regeneratingRoundNumber).toBeNull();

      // Start new round 1 (not regenerating)
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // ✅ CRITICAL: No regeneration state from round 0
      expect(store.getState().isRegenerating).toBeFalsy();
      expect(store.getState().regeneratingRoundNumber).toBeNull();
    });
  });

  describe('pre-search State and Cleanup', () => {
    it('should not interfere with streaming state cleanup when pre-search completes', () => {
      const store = createChatStore();

      // Add pre-search for round 0
      store.getState().addPreSearch({
        roundNumber: 0,
        searchData: null,
        status: MessageStatuses.STREAMING,
        threadId: 'thread-1',
      });

      // Start participant streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Pre-search completes
      store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
      expect(store.getState().isStreaming).toBeTruthy(); // Participants still streaming

      // Participants complete
      store.getState().completeStreaming();

      // ✅ CRITICAL: Streaming state cleared, pre-search data preserved
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE); // Preserved
    });
  });

  describe('edge Cases and Error States', () => {
    it('should handle completeStreaming being called multiple times', () => {
      const store = createChatStore();

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Call completeStreaming multiple times (idempotent behavior)
      store.getState().completeStreaming();
      store.getState().completeStreaming();
      store.getState().completeStreaming();

      // Should not throw, state should remain clean
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should handle cleanup when no streaming was active', () => {
      const store = createChatStore();

      // State is already clean (defaults)
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Call completeStreaming anyway
      store.getState().completeStreaming();

      // Should not throw, state should remain clean
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should handle partial cleanup when only some state was set', () => {
      const store = createChatStore();

      // Only set some streaming state
      store.getState().setStreamingRoundNumber(0);
      // Don't set isStreaming or currentParticipantIndex

      expect(store.getState().streamingRoundNumber).toBe(0);
      expect(store.getState().isStreaming).toBeFalsy(); // Still default

      // Complete streaming
      store.getState().completeStreaming();

      // ✅ CRITICAL: Even partial state should be cleared
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().isStreaming).toBeFalsy();
    });

    it('should clear state even if messages array is empty', () => {
      const store = createChatStore();

      // Set streaming state but no messages
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setMessages([]); // Empty

      expect(store.getState().messages).toHaveLength(0);

      // Complete streaming
      store.getState().completeStreaming();

      // ✅ CRITICAL: State should be cleared regardless of messages
      expect(store.getState().isStreaming).toBeFalsy();
      expect(store.getState().streamingRoundNumber).toBeNull();
    });
  });

  describe('tracking State Cleanup', () => {
    it('should NOT reset tracking sets when completeStreaming is called', () => {
      const store = createChatStore();

      // Simulate tracking state for round 0
      store.getState().markPreSearchTriggered(0);
      store.getState().markModeratorCreated(0);

      expect(store.getState().triggeredPreSearchRounds.has(0)).toBeTruthy();
      expect(store.getState().createdModeratorRounds.has(0)).toBeTruthy();

      // Complete streaming for round 0
      store.getState().completeStreaming();

      // ✅ IMPORTANT: Tracking state should PERSIST across rounds
      // These sets prevent duplicate triggers and should NOT be cleared by completeStreaming
      expect(store.getState().triggeredPreSearchRounds.has(0)).toBeTruthy();
      expect(store.getState().createdModeratorRounds.has(0)).toBeTruthy();

      // This ensures we don't accidentally re-trigger pre-search or moderator for completed rounds
    });

    it('should preserve moderator trigger tracking across rounds', () => {
      const store = createChatStore();

      // Track moderator for rounds 0 and 1 (correct method name)
      store.getState().markModeratorStreamTriggered('moderator-id-0', 0);
      store.getState().markModeratorStreamTriggered('moderator-id-1', 1);

      expect(store.getState().triggeredModeratorRounds.has(0)).toBeTruthy();
      expect(store.getState().triggeredModeratorRounds.has(1)).toBeTruthy();
      expect(store.getState().triggeredModeratorIds.has('moderator-id-0')).toBeTruthy();
      expect(store.getState().triggeredModeratorIds.has('moderator-id-1')).toBeTruthy();

      // Complete streaming
      store.getState().completeStreaming();

      // ✅ IMPORTANT: Moderator tracking should persist
      expect(store.getState().triggeredModeratorRounds.has(0)).toBeTruthy();
      expect(store.getState().triggeredModeratorRounds.has(1)).toBeTruthy();
      expect(store.getState().triggeredModeratorIds.has('moderator-id-0')).toBeTruthy();
      expect(store.getState().triggeredModeratorIds.has('moderator-id-1')).toBeTruthy();
    });
  });
});
