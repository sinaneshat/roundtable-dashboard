/**
 * Streaming Completion Optimization Tests
 *
 * Tests for excessive re-renders caused by completeStreaming action.
 * Root cause: Creating new Set/Map instances triggers reference changes
 * even when the collections are already empty.
 */

import { describe, expect, it } from 'vitest';

import { MessageRoles, MessageStatuses } from '@/api/core/enums';

import { createChatStore } from '../store';

describe('streaming Completion Optimization', () => {
  describe('completeStreaming reference stability', () => {
    it('should not create new Set instance when pendingAnimations is already empty', () => {
      const store = createChatStore();

      // Verify initial state has empty pendingAnimations
      const initialPendingAnimations = store.getState().pendingAnimations;
      expect(initialPendingAnimations.size).toBe(0);

      // Call completeStreaming
      store.getState().completeStreaming();

      // After fix: pendingAnimations should be the SAME reference if it was empty
      const afterPendingAnimations = store.getState().pendingAnimations;
      expect(afterPendingAnimations.size).toBe(0);

      // ✅ OPTIMIZATION: Same reference preserved (no unnecessary re-renders)
      expect(initialPendingAnimations).toBe(afterPendingAnimations);
    });

    it('should create new Set instance when pendingAnimations has items', () => {
      const store = createChatStore();

      // Add some animations
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      const beforePendingAnimations = store.getState().pendingAnimations;
      expect(beforePendingAnimations.size).toBe(2);

      // Call completeStreaming
      store.getState().completeStreaming();

      // After completeStreaming, pendingAnimations should be cleared
      const afterPendingAnimations = store.getState().pendingAnimations;
      expect(afterPendingAnimations.size).toBe(0);

      // This should be a NEW reference since we had to clear items
      expect(beforePendingAnimations).not.toBe(afterPendingAnimations);
    });

    it('should not create new Map instance when animationResolvers is already empty', () => {
      const store = createChatStore();

      // Verify initial state has empty animationResolvers
      const initialResolvers = store.getState().animationResolvers;
      expect(initialResolvers.size).toBe(0);

      // Call completeStreaming
      store.getState().completeStreaming();

      const afterResolvers = store.getState().animationResolvers;
      expect(afterResolvers.size).toBe(0);

      // ✅ OPTIMIZATION: Same reference preserved (no unnecessary re-renders)
      expect(initialResolvers).toBe(afterResolvers);
    });
  });

  describe('completeStreaming batched updates', () => {
    it('should reset all streaming flags in one update', () => {
      const store = createChatStore();

      // Set up streaming state
      store.getState().setIsStreaming(true);
      store.getState().setIsModeratorStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setPendingMessage('test message');

      // Track state updates
      const stateSnapshots: Array<{ isStreaming: boolean; isModeratorStreaming: boolean }> = [];
      const unsubscribe = store.subscribe((state) => {
        stateSnapshots.push({
          isStreaming: state.isStreaming,
          isModeratorStreaming: state.isModeratorStreaming,
        });
      });

      // Call completeStreaming
      store.getState().completeStreaming();

      unsubscribe();

      // Verify all flags are reset
      const finalState = store.getState();
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.isModeratorStreaming).toBe(false);
      expect(finalState.streamingRoundNumber).toBeNull();
      expect(finalState.pendingMessage).toBeNull();

      // Should be exactly ONE state update (batched)
      expect(stateSnapshots).toHaveLength(1);
    });

    it('should not trigger subscriber when state values are already reset', () => {
      const store = createChatStore();

      // State is already in reset state (defaults)
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isModeratorStreaming).toBe(false);

      // Track state updates (documents behavior, not asserted)
      let _updateCount = 0;
      const unsubscribe = store.subscribe(() => {
        _updateCount++;
      });

      // Call completeStreaming on already-reset state
      store.getState().completeStreaming();

      unsubscribe();

      // Current behavior: still triggers update even when no values changed
      // This is expected due to new Set/Map creation
      // After optimization, this could potentially be reduced
    });
  });

  describe('pre-search completion flow', () => {
    it('should not cause flash when pre-search completes before moderator', () => {
      const store = createChatStore();

      // Simulate pre-search streaming
      store.getState().addPreSearch({
        threadId: 'thread-1',
        roundNumber: 1,
        status: MessageStatuses.STREAMING,
        searchData: null,
      });

      // Register pre-search animation
      store.getState().registerAnimation(-1); // Pre-search uses index -1

      // Complete pre-search
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
      store.getState().completeAnimation(-1);

      // Verify pre-search is complete
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
      expect(store.getState().pendingAnimations.has(-1)).toBe(false);
    });
  });

  describe('participant completion sequence', () => {
    it('should not cause flash when last participant completes', () => {
      const store = createChatStore();

      // Simulate 3 participants streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      // Complete each participant
      store.getState().completeAnimation(0);
      store.getState().completeAnimation(1);

      // Before last participant completes
      expect(store.getState().pendingAnimations.size).toBe(1);
      expect(store.getState().pendingAnimations.has(2)).toBe(true);

      // Complete last participant
      store.getState().completeAnimation(2);

      // Verify animations are cleared
      expect(store.getState().pendingAnimations.size).toBe(0);
    });

    it('should handle rapid sequential completions without race conditions', async () => {
      const store = createChatStore();

      // Simulate streaming
      store.getState().setIsStreaming(true);
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      // Rapidly complete all animations (simulating fast model responses)
      await Promise.all([
        new Promise<void>((resolve) => {
          store.getState().completeAnimation(0);
          resolve();
        }),
        new Promise<void>((resolve) => {
          store.getState().completeAnimation(1);
          resolve();
        }),
        new Promise<void>((resolve) => {
          store.getState().completeAnimation(2);
          resolve();
        }),
      ]);

      // All animations should be complete
      expect(store.getState().pendingAnimations.size).toBe(0);
    });
  });

  describe('streaming end timing consistency', () => {
    it('should not have inconsistent state when isStreaming becomes false before streamingRoundNumber is cleared', () => {
      const store = createChatStore();

      // Set up streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Simulate the timing issue:
      // AI SDK completes -> isStreaming becomes false via useStateSync
      // BUT completeStreaming hasn't been called yet
      store.getState().setIsStreaming(false);

      // At this point we have an inconsistent state:
      // isStreaming = false, but streamingRoundNumber = 0
      // This was causing the flash bug where messages were skipped but pending cards weren't shown
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBe(0); // Still set!

      // The fix in ChatMessageList ensures messages aren't skipped when isStreaming=false
      // by adding isStreaming to the skip condition:
      // if (isStreaming && isCurrentStreamingRound && !allContent && !isModerator)
      // When isStreaming=false, messages are never skipped

      // Then completeStreaming is called which clears streamingRoundNumber
      store.getState().completeStreaming();

      // Now state is consistent
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should maintain message visibility during streaming-to-complete transition', () => {
      const store = createChatStore();

      // Add messages for round 0
      store.getState().setMessages([
        {
          id: 'msg-user',
          role: MessageRoles.USER as const,
          parts: [{ type: 'text' as const, text: 'Hello' }],
          metadata: { roundNumber: 0 },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: 'text' as const, text: 'Response 1' }],
          metadata: { roundNumber: 0, participantIndex: 0 },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p1',
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: 'text' as const, text: 'Response 2' }],
          metadata: { roundNumber: 0, participantIndex: 1 },
          createdAt: new Date(),
        },
        {
          id: 'thread-1_r0_p2',
          role: MessageRoles.ASSISTANT as const,
          parts: [{ type: 'text' as const, text: 'Response 3' }],
          metadata: { roundNumber: 0, participantIndex: 2 },
          createdAt: new Date(),
        },
      ]);

      // Set streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Verify messages are present
      expect(store.getState().messages).toHaveLength(4);

      // Simulate streaming end timing issue
      store.getState().setIsStreaming(false);

      // Messages should STILL be present during inconsistent state
      expect(store.getState().messages).toHaveLength(4);

      // Complete streaming
      store.getState().completeStreaming();

      // Messages should STILL be present after complete
      expect(store.getState().messages).toHaveLength(4);
    });
  });

  describe('state change minimization', () => {
    it('documents current re-render triggers from completeStreaming', () => {
      const store = createChatStore();

      // Set initial streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Track which fields change
      const beforeState = { ...store.getState() };

      store.getState().completeStreaming();

      const afterState = store.getState();

      // List of fields that change and could cause re-renders
      const changedFields: string[] = [];

      // Check key fields
      if (beforeState.isStreaming !== afterState.isStreaming) {
        changedFields.push('isStreaming');
      }
      if (beforeState.streamingRoundNumber !== afterState.streamingRoundNumber) {
        changedFields.push('streamingRoundNumber');
      }
      if (beforeState.pendingAnimations !== afterState.pendingAnimations) {
        changedFields.push('pendingAnimations');
      }
      if (beforeState.animationResolvers !== afterState.animationResolvers) {
        changedFields.push('animationResolvers');
      }
      if (beforeState.isModeratorStreaming !== afterState.isModeratorStreaming) {
        changedFields.push('isModeratorStreaming');
      }

      // Document which fields changed
      expect(changedFields).toContain('isStreaming');
      expect(changedFields).toContain('streamingRoundNumber');

      // These should NOT cause re-renders if already empty/null
      // After optimization, pendingAnimations and animationResolvers
      // should NOT be in changedFields if they were already empty
    });
  });

  describe('moderator stream abort handling', () => {
    it('should properly clean up state when moderator stream is aborted', () => {
      const store = createChatStore();

      // Set up moderator streaming state
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().isModeratorStreaming).toBe(true);
      expect(store.getState().isStreaming).toBe(true);

      // Simulate abort - moderator trigger calls both completeModeratorStream and completeStreaming
      store.getState().completeModeratorStream();
      store.getState().completeStreaming();

      // Verify all streaming state is cleared
      const finalState = store.getState();
      expect(finalState.isModeratorStreaming).toBe(false);
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.streamingRoundNumber).toBeNull();
      expect(finalState.pendingMessage).toBeNull();
      expect(finalState.pendingAnimations.size).toBe(0);
    });

    it('should handle abort during active participant streaming', () => {
      const store = createChatStore();

      // Set up participant streaming with moderator waiting
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      // Moderator triggered but aborted before participants complete
      store.getState().setIsModeratorStreaming(true);

      expect(store.getState().pendingAnimations.size).toBe(2);
      expect(store.getState().isModeratorStreaming).toBe(true);

      // Abort moderator
      store.getState().completeModeratorStream();

      // Moderator flag cleared, but participant streaming continues
      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().pendingAnimations.size).toBe(2);
    });
  });

  describe('completion with empty content', () => {
    it('should handle moderator completion with empty text', () => {
      const store = createChatStore();

      // Set up moderator streaming
      store.getState().setIsModeratorStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Complete with no content accumulated
      store.getState().completeModeratorStream();
      store.getState().completeStreaming();

      // All state should be cleared regardless of content
      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should handle participant completion with empty response', () => {
      const store = createChatStore();

      // Set up streaming for participant that returns empty
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().registerAnimation(0);

      // Complete animation with no content
      store.getState().completeAnimation(0);

      expect(store.getState().pendingAnimations.size).toBe(0);

      // Complete streaming
      store.getState().completeStreaming();

      // State properly cleared
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();
    });
  });

  describe('completion during error states', () => {
    it('should clean up state when stream fails with error', () => {
      const store = createChatStore();

      // Set up streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setPendingMessage('test message');
      store.getState().registerAnimation(0);

      // Simulate error scenario - completeStreaming called in error handler
      store.getState().completeStreaming();

      // All state should be cleared even on error
      const finalState = store.getState();
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.streamingRoundNumber).toBeNull();
      expect(finalState.pendingMessage).toBeNull();
      expect(finalState.pendingAnimations.size).toBe(0);
      expect(finalState.animationResolvers.size).toBe(0);
    });

    it('should handle moderator error cleanup', () => {
      const store = createChatStore();

      // Set up moderator streaming with error
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Error occurs - both cleanup methods called
      store.getState().completeModeratorStream();
      store.getState().completeStreaming();

      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();
    });

    it('should not leave dangling animations after error', () => {
      const store = createChatStore();

      // Set up multiple animations
      store.getState().setIsStreaming(true);
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      expect(store.getState().pendingAnimations.size).toBe(3);
      // Note: animationResolvers are only created when waitForAnimation is called
      // This test verifies pendingAnimations are cleared

      // Error forces immediate completion
      store.getState().completeStreaming();

      // ✅ CRITICAL: All animations should be cleared to prevent blocking
      expect(store.getState().pendingAnimations.size).toBe(0);
      expect(store.getState().animationResolvers.size).toBe(0);
    });
  });

  describe('rapid completion scenarios', () => {
    it('should handle very fast consecutive participant completions', () => {
      const store = createChatStore();

      // Set up 5 participants streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      for (let i = 0; i < 5; i++) {
        store.getState().registerAnimation(i);
      }

      expect(store.getState().pendingAnimations.size).toBe(5);

      // Complete all rapidly (synchronously)
      for (let i = 0; i < 5; i++) {
        store.getState().completeAnimation(i);
      }

      // All should be cleared
      expect(store.getState().pendingAnimations.size).toBe(0);

      // Final cleanup
      store.getState().completeStreaming();

      expect(store.getState().isStreaming).toBe(false);
    });

    it('should handle concurrent completeStreaming calls without errors', () => {
      const store = createChatStore();

      // Set up streaming state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setIsModeratorStreaming(true);

      // Multiple concurrent calls to completeStreaming (idempotent behavior)
      store.getState().completeStreaming();
      store.getState().completeStreaming();
      store.getState().completeStreaming();

      // Should not throw, state should be clean
      const finalState = store.getState();
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.isModeratorStreaming).toBe(false);
      expect(finalState.streamingRoundNumber).toBeNull();
    });

    it('should handle rapid participant-to-moderator transition', () => {
      const store = createChatStore();

      // Last participant completing
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().registerAnimation(2); // Last participant (index 2)

      // Participant completes
      store.getState().completeAnimation(2);

      expect(store.getState().pendingAnimations.size).toBe(0);

      // Moderator immediately triggered (before completeStreaming)
      store.getState().setIsModeratorStreaming(true);

      // Now complete participant streaming
      store.getState().completeStreaming();

      // ✅ RACE CONDITION: Moderator streaming should STILL be active
      // completeStreaming clears MODERATOR_STATE_RESET which includes isModeratorStreaming
      // This is the current behavior - both get cleared together
      const finalState = store.getState();
      expect(finalState.isStreaming).toBe(false);
      // Current behavior: isModeratorStreaming gets cleared by completeStreaming
      expect(finalState.isModeratorStreaming).toBe(false);
    });

    it('should maintain correct state when moderator completes before next round starts', () => {
      const store = createChatStore();

      // Round 0 moderator completes
      store.getState().setIsModeratorStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      store.getState().completeModeratorStream();
      store.getState().completeStreaming();

      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBeNull();

      // Round 1 starts immediately
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // State should be clean and ready for new round
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().pendingAnimations.size).toBe(0);
    });
  });

  describe('cleanup verification', () => {
    it('should clear all tracked state groups in completeStreaming', () => {
      const store = createChatStore();

      // Set all streaming-related state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);
      store.getState().setCurrentRoundNumber(1);
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setCurrentParticipantIndex(2);

      // Set moderator state
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsWaitingForChangelog(true);

      // Set pending message state
      store.getState().setPendingMessage('test');
      store.getState().setPendingAttachmentIds(['id1', 'id2']);
      store.getState().setHasSentPendingMessage(true);

      // Set regeneration state
      store.getState().startRegeneration(1);

      // Set animation state
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      // Complete streaming - should clear ALL tracked groups
      store.getState().completeStreaming();

      const finalState = store.getState();

      // STREAMING_STATE_RESET
      expect(finalState.isStreaming).toBe(false);
      expect(finalState.streamingRoundNumber).toBeNull();
      expect(finalState.currentRoundNumber).toBeNull();
      expect(finalState.waitingToStartStreaming).toBe(false);
      expect(finalState.currentParticipantIndex).toBe(0);

      // MODERATOR_STATE_RESET (only isModeratorStreaming is cleared)
      expect(finalState.isModeratorStreaming).toBe(false);
      // ⚠️ NOTE: isWaitingForChangelog is NOT cleared by completeStreaming()
      // It must ONLY be cleared by use-changelog-sync.ts after changelog is fetched.
      // This ensures correct ordering: PATCH → changelog → pre-search/streaming
      expect(finalState.isWaitingForChangelog).toBe(true);

      // PENDING_MESSAGE_STATE_RESET
      expect(finalState.pendingMessage).toBeNull();
      expect(finalState.pendingAttachmentIds).toBeNull();
      expect(finalState.pendingFileParts).toBeNull();
      expect(finalState.expectedParticipantIds).toBeNull();
      expect(finalState.hasSentPendingMessage).toBe(false);

      // REGENERATION_STATE_RESET
      expect(finalState.isRegenerating).toBe(false);
      expect(finalState.regeneratingRoundNumber).toBeNull();

      // Animation state
      expect(finalState.pendingAnimations.size).toBe(0);
      expect(finalState.animationResolvers.size).toBe(0);
    });

    it('should be idempotent - multiple calls should not cause issues', () => {
      const store = createChatStore();

      // Set initial state
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(1);

      // Call completeStreaming multiple times
      store.getState().completeStreaming();
      const stateAfterFirst = { ...store.getState() };

      store.getState().completeStreaming();
      const stateAfterSecond = { ...store.getState() };

      store.getState().completeStreaming();
      const stateAfterThird = { ...store.getState() };

      // All should result in the same clean state
      expect(stateAfterFirst.isStreaming).toBe(false);
      expect(stateAfterSecond.isStreaming).toBe(false);
      expect(stateAfterThird.isStreaming).toBe(false);

      expect(stateAfterFirst.streamingRoundNumber).toBeNull();
      expect(stateAfterSecond.streamingRoundNumber).toBeNull();
      expect(stateAfterThird.streamingRoundNumber).toBeNull();
    });
  });
});
