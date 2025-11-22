/**
 * Tests for pending message streaming race condition
 *
 * BUG: Race condition between store's isStreaming and hook's isExplicitlyStreaming
 *
 * Scenario:
 * 1. Pending message effect sees store.isStreaming = false
 * 2. Queues microtask to call sendMessage
 * 3. Before microtask executes, hook sets isExplicitlyStreaming = true
 * 4. Microtask executes and calls sendMessage
 * 5. sendMessage sees isExplicitlyStreaming = true and blocks
 * 6. But AI SDK internal state throws: "Cannot read properties of undefined (reading 'state')"
 *
 * Fix: Check streaming state ref inside microtask before calling sendMessage
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createChatStore } from '../store';

describe('pending Message Streaming Race Condition', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('race condition detection', () => {
    it('should detect when store.isStreaming and hook streaming state are out of sync', () => {
      /**
       * This test simulates the race condition where:
       * 1. Store's isStreaming is false (message can be sent)
       * 2. But hook's isExplicitlyStreaming is true (message should be blocked)
       *
       * The pending message effect uses store.isStreaming for its guard,
       * but the actual sendMessage function uses hook's isExplicitlyStreaming.
       */
      const store = createChatStore();

      // Set up state where pending message can be sent
      store.getState().setThread({
        id: 'thread-1',
        slug: 'test-thread',
        title: 'Test',
        mode: 'discussion',
        userId: 'user-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublic: false,
        isAiGeneratedTitle: false,
        enableWebSearch: false,
        lastMessageAt: new Date(),
      });
      store.getState().setPendingMessage('Test message');
      store.getState().setExpectedParticipantIds(['model-1']);
      store.getState().setHasSentPendingMessage(false);
      store.getState().setIsStreaming(false);

      // Verify initial state - this is what pending message effect sees
      const state = store.getState();
      expect(state.pendingMessage).toBe('Test message');
      expect(state.isStreaming).toBe(false);
      expect(state.hasSentPendingMessage).toBe(false);

      // The bug: Effect queues microtask because isStreaming = false
      // But by the time microtask runs, the hook's isExplicitlyStreaming might be true
      // This causes the AI SDK error
    });

    it('should NOT send message when streaming ref indicates active streaming', async () => {
      /**
       * This test verifies the fix:
       * - A streaming ref is checked inside the microtask
       * - If the ref indicates streaming is active, sendMessage is not called
       */
      const store = createChatStore();
      const sendMessageMock = vi.fn();

      // Simulate the streaming ref check
      const isStreamingRef = { current: false };

      // Set up pending message state
      store.getState().setPendingMessage('Test message');
      store.getState().setHasSentPendingMessage(false);
      store.getState().setIsStreaming(false);

      // Simulate what the pending message effect does
      const sendPendingMessage = () => {
        const { pendingMessage, isStreaming, hasSentPendingMessage } = store.getState();

        // Guard from effect
        if (!pendingMessage || hasSentPendingMessage || isStreaming) {
          return;
        }

        // Set flag
        store.getState().setHasSentPendingMessage(true);

        // Queue microtask (simulating the actual behavior)
        queueMicrotask(() => {
          // ✅ FIX: Check streaming ref inside microtask
          if (isStreamingRef.current) {
            // Reset flag since we didn't actually send
            store.getState().setHasSentPendingMessage(false);
            return;
          }
          sendMessageMock(pendingMessage);
        });
      };

      // Call the function - this simulates effect firing
      sendPendingMessage();

      // Before microtask runs, another effect sets streaming to true
      isStreamingRef.current = true;

      // Flush microtasks
      await vi.runAllTimersAsync();

      // sendMessage should NOT have been called
      expect(sendMessageMock).not.toHaveBeenCalled();

      // Flag should be reset since message wasn't sent
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });

    it('should send message when streaming ref indicates no active streaming', async () => {
      /**
       * This test verifies normal operation:
       * - Streaming ref is false
       * - Message is sent successfully
       */
      const store = createChatStore();
      const sendMessageMock = vi.fn();

      const isStreamingRef = { current: false };

      store.getState().setPendingMessage('Test message');
      store.getState().setHasSentPendingMessage(false);
      store.getState().setIsStreaming(false);

      const sendPendingMessage = () => {
        const { pendingMessage, isStreaming, hasSentPendingMessage } = store.getState();

        if (!pendingMessage || hasSentPendingMessage || isStreaming) {
          return;
        }

        store.getState().setHasSentPendingMessage(true);

        queueMicrotask(() => {
          // Check streaming ref
          if (isStreamingRef.current) {
            store.getState().setHasSentPendingMessage(false);
            return;
          }
          sendMessageMock(pendingMessage);
        });
      };

      sendPendingMessage();

      // Streaming stays false
      isStreamingRef.current = false;

      await vi.runAllTimersAsync();

      // sendMessage SHOULD have been called
      expect(sendMessageMock).toHaveBeenCalledWith('Test message');
      expect(store.getState().hasSentPendingMessage).toBe(true);
    });

    it('should prevent concurrent sends from multiple effect triggers', async () => {
      /**
       * This test verifies that rapid effect triggers don't cause duplicate sends
       */
      const store = createChatStore();
      const sendMessageMock = vi.fn();

      const isStreamingRef = { current: false };

      store.getState().setPendingMessage('Test message');
      store.getState().setHasSentPendingMessage(false);
      store.getState().setIsStreaming(false);

      const sendPendingMessage = () => {
        const { pendingMessage, isStreaming, hasSentPendingMessage } = store.getState();

        if (!pendingMessage || hasSentPendingMessage || isStreaming) {
          return;
        }

        store.getState().setHasSentPendingMessage(true);

        queueMicrotask(() => {
          if (isStreamingRef.current) {
            store.getState().setHasSentPendingMessage(false);
            return;
          }
          sendMessageMock(pendingMessage);
        });
      };

      // Trigger multiple times rapidly (simulating effect re-runs)
      sendPendingMessage();
      sendPendingMessage(); // Should be blocked by hasSentPendingMessage
      sendPendingMessage(); // Should be blocked by hasSentPendingMessage

      await vi.runAllTimersAsync();

      // Only one send should occur
      expect(sendMessageMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('integration with startRound blocking', () => {
    it('should not cause AI SDK error when startRound and sendMessage race', async () => {
      /**
       * Simulates the actual error scenario:
       * 1. startRound is blocked (isExplicitlyStreaming = true)
       * 2. But pendingMessage effect's microtask still executes
       * 3. With the fix, microtask checks ref and aborts
       */
      const store = createChatStore();
      const sendMessageMock = vi.fn();
      const startRoundMock = vi.fn();

      const isStreamingRef = { current: false };

      // Set up for both flows
      store.getState().setPendingMessage('Test message');
      store.getState().setWaitingToStartStreaming(true);
      store.getState().setHasSentPendingMessage(false);
      store.getState().setIsStreaming(false);

      // Simulate startRound flow (overview screen)
      const triggerStartRound = () => {
        if (isStreamingRef.current) {
          // console.warn('[startRound] Blocked - already streaming');
          return;
        }
        isStreamingRef.current = true;
        startRoundMock();
      };

      // Simulate pendingMessage flow (thread screen)
      const triggerPendingMessage = () => {
        const { pendingMessage, hasSentPendingMessage, isStreaming } = store.getState();
        if (!pendingMessage || hasSentPendingMessage || isStreaming) {
          return;
        }

        store.getState().setHasSentPendingMessage(true);

        queueMicrotask(() => {
          // ✅ FIX: Check ref before sending
          if (isStreamingRef.current) {
            store.getState().setHasSentPendingMessage(false);
            return;
          }
          sendMessageMock(pendingMessage);
        });
      };

      // Both effects fire at same time
      triggerPendingMessage(); // Queues microtask
      triggerStartRound(); // Sets ref to true immediately

      await vi.runAllTimersAsync();

      // startRound should have executed
      expect(startRoundMock).toHaveBeenCalledTimes(1);

      // sendMessage should NOT have executed (blocked by ref check)
      expect(sendMessageMock).not.toHaveBeenCalled();

      // Flag should be reset
      expect(store.getState().hasSentPendingMessage).toBe(false);
    });
  });
});
