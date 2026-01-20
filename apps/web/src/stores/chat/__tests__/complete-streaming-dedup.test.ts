/**
 * Complete Streaming Deduplication Tests
 *
 * Tests that verify completeStreaming() is called efficiently without redundant calls.
 * Validates:
 * - completeStreaming() includes MODERATOR_STATE_RESET (no separate completeModeratorStream needed)
 * - State transitions happen in a single batch, not multiple cascading updates
 * - Re-renders are minimized during round completion
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createChatStore } from '@/stores/chat';

describe('completeStreaming Deduplication', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  describe('state Reset Batching', () => {
    it('should reset all streaming flags in a single completeStreaming call', () => {
      // Set up streaming state
      store.getState().setIsModeratorStreaming(true);
      store.setState({
        isStreaming: true,
        streamingRoundNumber: 1,
        currentRoundNumber: 1,
        waitingToStartStreaming: true,
        currentParticipantIndex: 2,
      });

      // Verify pre-conditions
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().isModeratorStreaming).toBe(true);
      expect(store.getState().streamingRoundNumber).toBe(1);
      expect(store.getState().waitingToStartStreaming).toBe(true);
      expect(store.getState().currentParticipantIndex).toBe(2);

      // Track state changes
      const stateChanges: Array<{ action: string }> = [];
      store.subscribe((state, prevState) => {
        if (state !== prevState) {
          stateChanges.push({ action: 'state_change' });
        }
      });

      // Call completeStreaming once
      store.getState().completeStreaming();

      // Verify all flags are reset
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBe(null);
      expect(store.getState().currentRoundNumber).toBe(null);
      expect(store.getState().waitingToStartStreaming).toBe(false);
      expect(store.getState().currentParticipantIndex).toBe(0);
    });

    it('should include MODERATOR_STATE_RESET in completeStreaming', () => {
      // Set moderator streaming state
      store.getState().setIsModeratorStreaming(true);
      store.setState({ isWaitingForChangelog: true });

      expect(store.getState().isModeratorStreaming).toBe(true);
      expect(store.getState().isWaitingForChangelog).toBe(true);

      // completeStreaming should reset isModeratorStreaming
      store.getState().completeStreaming();

      expect(store.getState().isModeratorStreaming).toBe(false);
      // ⚠️ CRITICAL: isWaitingForChangelog is NOT cleared by completeStreaming
      // It must ONLY be cleared by use-changelog-sync.ts after changelog is fetched
      // This ensures correct ordering: PATCH → changelog → pre-search/streaming
      expect(store.getState().isWaitingForChangelog).toBe(true);
    });

    it('should not require separate completeModeratorStream call', () => {
      // Simulate full round completion state
      store.setState({
        isStreaming: true,
        isModeratorStreaming: true,
        currentParticipantIndex: 3,
        streamingRoundNumber: 0,
      });

      // A single completeStreaming should handle everything
      store.getState().completeStreaming();

      // All states should be reset
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(store.getState().streamingRoundNumber).toBe(null);
    });
  });

  describe('animation State Reset', () => {
    it('should reset animation state with fresh Set/Map instances when they have items', () => {
      // Set up animation state - registerAnimation adds to pendingAnimations
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);

      expect(store.getState().pendingAnimations.size).toBe(2);

      // Get references before reset
      const oldPendingAnimations = store.getState().pendingAnimations;

      // Complete streaming should create new Set instance since pendingAnimations has items
      store.getState().completeStreaming();

      const newPendingAnimations = store.getState().pendingAnimations;

      // New instance should be empty
      expect(newPendingAnimations.size).toBe(0);

      // Should be new instance since old one had items
      expect(newPendingAnimations).not.toBe(oldPendingAnimations);
    });

    it('should reuse empty Set/Map instances for optimization', () => {
      // Don't add any animations - collections start empty
      const oldPendingAnimations = store.getState().pendingAnimations;
      const oldAnimationResolvers = store.getState().animationResolvers;

      expect(oldPendingAnimations.size).toBe(0);
      expect(oldAnimationResolvers.size).toBe(0);

      // Complete streaming should REUSE empty instances (optimization)
      store.getState().completeStreaming();

      const newPendingAnimations = store.getState().pendingAnimations;
      const newAnimationResolvers = store.getState().animationResolvers;

      // Should reuse same references when already empty (prevents unnecessary re-renders)
      expect(newPendingAnimations).toBe(oldPendingAnimations);
      expect(newAnimationResolvers).toBe(oldAnimationResolvers);
    });

    it('should handle waitForAnimation promise lifecycle', async () => {
      // Register animation and wait for it
      store.getState().registerAnimation(0);

      const animationPromise = store.getState().waitForAnimation(0);

      // Complete the animation
      store.getState().completeAnimation(0);

      // Promise should resolve
      await expect(animationPromise).resolves.toBeUndefined();
    });
  });

  describe('pending Message State Reset', () => {
    it('should reset all pending message related state', () => {
      // Set up pending message state
      store.setState({
        pendingMessage: 'Test message',
        pendingAttachmentIds: ['attach-1', 'attach-2'],
        pendingFileParts: [{ type: 'file', mimeType: 'image/png', url: 'https://example.com/file.png' }],
        expectedParticipantIds: ['p1', 'p2'],
        hasSentPendingMessage: true,
      });

      expect(store.getState().pendingMessage).toBe('Test message');
      expect(store.getState().pendingAttachmentIds?.length).toBe(2);
      expect(store.getState().hasSentPendingMessage).toBe(true);

      // Complete streaming should reset all
      store.getState().completeStreaming();

      expect(store.getState().pendingMessage).toBe(null);
      expect(store.getState().pendingAttachmentIds).toBe(null);
      expect(store.getState().pendingFileParts).toBe(null);
      expect(store.getState().expectedParticipantIds).toBe(null);
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });
  });

  describe('regeneration State Reset', () => {
    it('should reset regeneration state', () => {
      // Set up regeneration state
      store.setState({
        isRegenerating: true,
        regeneratingRoundNumber: 2,
      });

      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(2);

      // Complete streaming should reset regeneration state
      store.getState().completeStreaming();

      expect(store.getState().isRegenerating).toBe(false);
      expect(store.getState().regeneratingRoundNumber).toBe(null);
    });
  });

  describe('idempotency', () => {
    it('should be safe to call completeStreaming multiple times', () => {
      // Set up state
      store.setState({
        isStreaming: true,
        isModeratorStreaming: true,
        currentParticipantIndex: 2,
      });

      // First call
      store.getState().completeStreaming();

      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isModeratorStreaming).toBe(false);

      // Second call should not throw or cause issues
      expect(() => {
        store.getState().completeStreaming();
      }).not.toThrow();

      // State should remain reset
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isModeratorStreaming).toBe(false);
    });
  });

  describe('subscription Batching', () => {
    it('should trigger single subscription notification for completeStreaming', () => {
      // Set up state
      store.setState({
        isStreaming: true,
        isModeratorStreaming: true,
        currentParticipantIndex: 2,
        streamingRoundNumber: 1,
      });

      // Count subscription notifications
      const notifications: ReturnType<typeof store.getState>[] = [];
      const unsubscribe = store.subscribe((state) => {
        notifications.push(state);
      });

      // Call completeStreaming
      store.getState().completeStreaming();

      // Clean up
      unsubscribe();

      // Should only have 1 notification (batched update)
      expect(notifications).toHaveLength(1);
    });
  });
});
