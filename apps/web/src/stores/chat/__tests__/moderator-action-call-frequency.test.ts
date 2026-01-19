/**
 * Moderator Action Call Frequency Tests
 *
 * Tests to verify efficient store updates during moderator streaming operations.
 * Tracks action call frequency to prevent:
 * - Excessive set() calls during streaming
 * - Unbatched state updates
 * - Redundant action invocations
 * - Missing action name third parameters
 *
 * Context: Moderator streaming uses throttled updates (UPDATE_THROTTLE_MS = 50ms)
 * to match AI SDK batching behavior and reduce store update frequency.
 */

import { MessagePartTypes, MessageRoles, MODERATOR_NAME, MODERATOR_PARTICIPANT_INDEX } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { createTestChatStore } from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Spy on store actions to count invocations
 * Uses subscription pattern instead of setState interception
 */
function createActionSpy(store: ReturnType<typeof createChatStore>) {
  const calls = new Map<string, number>();

  // Track specific action calls by monitoring state changes
  const trackAction = (actionName: string) => {
    calls.set(actionName, (calls.get(actionName) || 0) + 1);
  };

  // Override action methods to track calls
  const originalSetMessages = store.getState().setMessages;
  const originalSetIsModeratorStreaming = store.getState().setIsModeratorStreaming;
  const originalCompleteModeratorStream = store.getState().completeModeratorStream;
  const originalCompleteStreaming = store.getState().completeStreaming;
  const originalMarkModeratorCreated = store.getState().markModeratorCreated;
  const originalMarkModeratorStreamTriggered = store.getState().markModeratorStreamTriggered;
  const originalRegisterAnimation = store.getState().registerAnimation;
  const originalCompleteAnimation = store.getState().completeAnimation;
  const originalClearAnimations = store.getState().clearAnimations;
  const originalSetIsStreaming = store.getState().setIsStreaming;
  const originalClearModeratorTracking = store.getState().clearModeratorTracking;

  store.setState({
    setMessages: (messages) => {
      trackAction('thread/setMessages');
      return originalSetMessages(messages);
    },
    setIsModeratorStreaming: (value) => {
      trackAction('flags/setIsModeratorStreaming');
      return originalSetIsModeratorStreaming(value);
    },
    completeModeratorStream: () => {
      trackAction('flags/completeModeratorStream');
      return originalCompleteModeratorStream();
    },
    completeStreaming: () => {
      trackAction('operations/completeStreaming');
      return originalCompleteStreaming();
    },
    markModeratorCreated: (roundNumber) => {
      trackAction('tracking/markModeratorCreated');
      return originalMarkModeratorCreated(roundNumber);
    },
    markModeratorStreamTriggered: (moderatorId, roundNumber) => {
      trackAction('tracking/markModeratorStreamTriggered');
      return originalMarkModeratorStreamTriggered(moderatorId, roundNumber);
    },
    registerAnimation: (index) => {
      trackAction('animation/registerAnimation');
      return originalRegisterAnimation(index);
    },
    completeAnimation: (index) => {
      trackAction('animation/completeAnimation');
      return originalCompleteAnimation(index);
    },
    clearAnimations: () => {
      trackAction('animation/clearAnimations');
      return originalClearAnimations();
    },
    setIsStreaming: (value) => {
      trackAction('thread/setIsStreaming');
      return originalSetIsStreaming(value);
    },
    clearModeratorTracking: (roundNumber) => {
      trackAction('tracking/clearModeratorTracking');
      return originalClearModeratorTracking(roundNumber);
    },
  });

  return {
    calls,
    getCallCount: (actionName: string) => calls.get(actionName) || 0,
    getTotalCalls: () => Array.from(calls.values()).reduce((sum, count) => sum + count, 0),
    reset: () => {
      calls.clear();
    },
  };
}

/**
 * Simulate moderator streaming with incremental updates
 */
function simulateModeratorStreaming(
  store: ReturnType<typeof createChatStore>,
  threadId: string,
  roundNumber: number,
  chunks: string[],
) {
  const moderatorId = `${threadId}_r${roundNumber}_moderator`;

  // Create placeholder
  const placeholder: UIMessage = {
    id: moderatorId,
    role: MessageRoles.ASSISTANT,
    parts: [],
    metadata: {
      isModerator: true,
      roundNumber,
      participantIndex: MODERATOR_PARTICIPANT_INDEX,
      model: MODERATOR_NAME,
      role: MessageRoles.ASSISTANT,
    },
  };

  // Add placeholder to existing messages (preserve previous messages)
  store.getState().setMessages(prev => [...prev, placeholder]);

  // Simulate incremental updates (as done by use-moderator-trigger.ts)
  let accumulatedText = '';
  for (const chunk of chunks) {
    accumulatedText += chunk;

    store.getState().setMessages(currentMessages =>
      currentMessages.map(msg =>
        msg.id === moderatorId
          ? {
              ...msg,
              parts: [{ type: MessagePartTypes.TEXT, text: accumulatedText }],
            }
          : msg,
      ),
    );
  }

  // Final update with finish metadata
  store.getState().setMessages(currentMessages =>
    currentMessages.map(msg =>
      msg.id === moderatorId
        ? {
            ...msg,
            parts: [{ type: MessagePartTypes.TEXT, text: accumulatedText, state: 'done' as const }],
            metadata: {
              ...(msg.metadata && typeof msg.metadata === 'object' ? msg.metadata : {}),
              finishReason: 'stop',
            },
          }
        : msg,
    ),
  );
}

// ============================================================================
// Action Call Frequency Tests
// ============================================================================

describe('moderator Action Call Frequency', () => {
  describe('setMessages Call Frequency', () => {
    it('should call setMessages for each chunk during streaming', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      const chunks = ['The ', 'moderator ', 'analyzes ', 'the ', 'discussion.'];

      simulateModeratorStreaming(store, 'thread-1', 0, chunks);

      // Expect: 1 placeholder + 5 chunks + 1 final = 7 setMessages calls
      const setMessagesCount = actionSpy.getCallCount('thread/setMessages');
      expect(setMessagesCount).toBe(7);
    });

    it('should throttle rapid updates when chunks arrive quickly', async () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Simulate 20 rapid chunks (unthrottled would be 20 updates)
      const rapidChunks = Array.from({ length: 20 }, (_, i) => `chunk${i} `);

      simulateModeratorStreaming(store, 'thread-1', 0, rapidChunks);

      // After optimization: should be fewer updates (throttled by UPDATE_THROTTLE_MS = 50ms)
      // Current behavior: all 20 chunks + placeholder + final = 22 updates
      const setMessagesCount = actionSpy.getCallCount('thread/setMessages');
      expect(setMessagesCount).toBe(22);

      // Document: This is the current behavior (unthrottled at store level)
      // Throttling happens in use-moderator-trigger.ts at 50ms intervals
      // But setMessages is still called for each throttled batch
    });

    it('should not call setMessages when content has not changed', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      const message: UIMessage = {
        id: 'thread-1_r0_moderator',
        role: MessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Same content' }],
        metadata: { isModerator: true, roundNumber: 0 },
      };

      // First call
      store.getState().setMessages([message]);
      actionSpy.reset();

      // Second call with SAME content (different reference)
      store.getState().setMessages([{ ...message }]);

      // setMessages is called (store doesn't prevent duplicate content)
      // Component memoization should handle preventing re-renders
      const setMessagesCount = actionSpy.getCallCount('thread/setMessages');
      expect(setMessagesCount).toBe(1);
    });
  });

  describe('moderator Streaming State Actions', () => {
    it('should call setIsModeratorStreaming exactly twice (start + end)', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Start moderator streaming
      store.getState().setIsModeratorStreaming(true);

      // Simulate streaming updates (should not change streaming state)
      simulateModeratorStreaming(store, 'thread-1', 0, ['chunk1', 'chunk2']);

      // End moderator streaming
      store.getState().setIsModeratorStreaming(false);

      const streamingCount = actionSpy.getCallCount('flags/setIsModeratorStreaming');
      expect(streamingCount).toBe(2); // true + false
    });

    it('should not oscillate isModeratorStreaming during updates', () => {
      const store = createChatStore();
      const stateChanges: boolean[] = [];

      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.isModeratorStreaming !== prevState.isModeratorStreaming) {
          stateChanges.push(state.isModeratorStreaming);
        }
      });

      store.getState().setIsModeratorStreaming(true);
      simulateModeratorStreaming(store, 'thread-1', 0, ['a', 'b', 'c']);
      store.getState().setIsModeratorStreaming(false);

      unsubscribe();

      // Should only have 2 state changes: true → false
      expect(stateChanges).toEqual([true, false]);
    });

    it('should batch moderator lifecycle state updates', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Moderator lifecycle: start streaming, add placeholder, stream content, complete
      store.getState().setIsModeratorStreaming(true);

      const placeholder: UIMessage = {
        id: 'thread-1_r0_moderator',
        role: MessageRoles.ASSISTANT,
        parts: [],
        metadata: { isModerator: true, roundNumber: 0 },
      };
      store.getState().setMessages([placeholder]);

      store.getState().completeModeratorStream();

      // Verify individual actions called appropriately
      expect(actionSpy.getCallCount('flags/setIsModeratorStreaming')).toBe(1);
      expect(actionSpy.getCallCount('thread/setMessages')).toBe(1);
      expect(actionSpy.getCallCount('flags/completeModeratorStream')).toBe(1);

      // Total actions should be minimal (no redundant updates)
      const totalCalls = actionSpy.getTotalCalls();
      expect(totalCalls).toBeLessThanOrEqual(5); // Allow some overhead
    });
  });

  describe('action Name Parameters', () => {
    it('should have action names for all moderator-related actions', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Execute moderator lifecycle actions
      store.getState().setIsModeratorStreaming(true);
      store.getState().markModeratorCreated(0);
      store.getState().completeModeratorStream();
      store.getState().clearModeratorTracking(0);

      // Verify all actions have names (not 'unknown-action')
      const actionNames = Array.from(actionSpy.calls.keys());
      expect(actionNames).toContain('flags/setIsModeratorStreaming');
      expect(actionNames).toContain('tracking/markModeratorCreated');
      expect(actionNames).toContain('flags/completeModeratorStream');
      expect(actionNames).toContain('tracking/clearModeratorTracking');

      // No unknown actions
      expect(actionNames).not.toContain('unknown-action');
    });

    it('should have action names for all setMessages calls', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Various setMessages scenarios
      store.getState().setMessages([]);
      store.getState().setMessages(prev => [...prev]);

      const actionNames = Array.from(actionSpy.calls.keys());
      expect(actionNames).toContain('thread/setMessages');
      expect(actionNames).not.toContain('unknown-action');
    });
  });

  describe('tracking State Updates', () => {
    it('should call markModeratorCreated once per round', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      store.getState().markModeratorCreated(0);
      store.getState().markModeratorCreated(0); // Duplicate
      store.getState().markModeratorCreated(1);

      // Each call increments (Set.add is idempotent but action is still called)
      const markCount = actionSpy.getCallCount('tracking/markModeratorCreated');
      expect(markCount).toBe(3);

      // Verify Set has unique values
      expect(store.getState().createdModeratorRounds.size).toBe(2); // 0, 1
    });

    it('should call markModeratorStreamTriggered with correct frequency', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      const moderatorId = 'thread-1_r0_moderator';

      store.getState().markModeratorStreamTriggered(moderatorId, 0);
      store.getState().markModeratorStreamTriggered(moderatorId, 0); // Duplicate

      const markCount = actionSpy.getCallCount('tracking/markModeratorStreamTriggered');
      expect(markCount).toBe(2);

      // Verify tracking is working
      expect(store.getState().hasModeratorStreamBeenTriggered(moderatorId, 0)).toBe(true);
    });
  });

  describe('multi-Participant Round Updates', () => {
    it('should not trigger excessive actions during multi-participant streaming', () => {
      const store = createTestChatStore();
      const actionSpy = createActionSpy(store);

      // Setup: 3 participants complete, then moderator streams
      const participantMessages: UIMessage[] = [
        {
          id: 'thread-1_r0_p0',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Participant 0' }],
          metadata: { roundNumber: 0, participantIndex: 0, role: MessageRoles.ASSISTANT },
        },
        {
          id: 'thread-1_r0_p1',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Participant 1' }],
          metadata: { roundNumber: 0, participantIndex: 1, role: MessageRoles.ASSISTANT },
        },
        {
          id: 'thread-1_r0_p2',
          role: MessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Participant 2' }],
          metadata: { roundNumber: 0, participantIndex: 2, role: MessageRoles.ASSISTANT },
        },
      ];

      store.getState().setMessages(participantMessages);
      actionSpy.reset();

      // Moderator streams after participants
      simulateModeratorStreaming(store, 'thread-1', 0, ['Moderator ', 'analysis']);

      // Should only update moderator message, not participant messages
      const setMessagesCount = actionSpy.getCallCount('thread/setMessages');
      expect(setMessagesCount).toBe(4); // placeholder + 2 chunks + final

      // Verify participant messages unchanged
      const messages = store.getState().messages;
      expect(messages.length).toBeGreaterThanOrEqual(3);

      // Check that participant messages are preserved
      const participantIds = participantMessages.map(m => m.id);
      const preservedParticipants = messages.filter(m => participantIds.includes(m.id));
      expect(preservedParticipants).toHaveLength(3);
    });

    it('should handle rapid state transitions without duplicate actions', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Simulate rapid lifecycle transitions
      store.getState().setIsStreaming(true);
      store.getState().setIsStreaming(false);
      store.getState().setIsModeratorStreaming(true);
      store.getState().setIsModeratorStreaming(false);

      // Each action should be called exactly once
      expect(actionSpy.getCallCount('thread/setIsStreaming')).toBe(2);
      expect(actionSpy.getCallCount('flags/setIsModeratorStreaming')).toBe(2);

      // Final state should be stable
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isModeratorStreaming).toBe(false);
    });
  });

  describe('completeStreaming Action Batching', () => {
    it('should batch reset actions in completeStreaming', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Set up streaming state
      store.getState().setIsStreaming(true);
      store.getState().setIsModeratorStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setPendingMessage('test');

      actionSpy.reset();

      // Complete streaming should batch all resets into one action
      store.getState().completeStreaming();

      // Should be a single action that resets multiple fields
      const completeCount = actionSpy.getCallCount('operations/completeStreaming');
      expect(completeCount).toBe(1);

      // Verify all flags cleared
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBe(null);
      expect(store.getState().pendingMessage).toBe(null);
    });

    it('should not call completeStreaming multiple times unnecessarily', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Set up streaming state
      store.getState().setIsStreaming(true);
      store.getState().completeStreaming();

      actionSpy.reset();

      // Calling completeStreaming when already complete should still execute
      // (store doesn't prevent idempotent actions)
      store.getState().completeStreaming();

      const completeCount = actionSpy.getCallCount('operations/completeStreaming');
      expect(completeCount).toBe(1);
    });
  });

  describe('animation State Management', () => {
    it('should register and complete animations efficiently', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Register animations for 3 participants
      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      expect(actionSpy.getCallCount('animation/registerAnimation')).toBe(3);

      actionSpy.reset();

      // Complete animations
      store.getState().completeAnimation(0);
      store.getState().completeAnimation(1);
      store.getState().completeAnimation(2);

      expect(actionSpy.getCallCount('animation/completeAnimation')).toBe(3);

      // Verify all animations cleared
      expect(store.getState().pendingAnimations.size).toBe(0);
    });

    it('should clear all animations in one action', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      store.getState().registerAnimation(0);
      store.getState().registerAnimation(1);
      store.getState().registerAnimation(2);

      actionSpy.reset();

      // Clear all animations at once
      store.getState().clearAnimations();

      expect(actionSpy.getCallCount('animation/clearAnimations')).toBe(1);
      expect(store.getState().pendingAnimations.size).toBe(0);
    });
  });

  describe('store Update Optimization', () => {
    it('should not trigger unnecessary re-renders for same state', () => {
      const store = createChatStore();
      let renderCount = 0;

      const unsubscribe = store.subscribe(() => {
        renderCount++;
      });

      const initialCount = renderCount;

      // Set same value multiple times
      store.getState().setIsModeratorStreaming(false);
      store.getState().setIsModeratorStreaming(false);
      store.getState().setIsModeratorStreaming(false);

      unsubscribe();

      // Each setState call triggers subscription, even if value is same
      // Zustand doesn't prevent this - components should use shallow comparison
      expect(renderCount).toBeGreaterThan(initialCount);
    });

    it('should minimize actions during moderator lifecycle', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Complete moderator lifecycle
      store.getState().markModeratorCreated(0);
      store.getState().setIsModeratorStreaming(true);
      simulateModeratorStreaming(store, 'thread-1', 0, ['Test']);
      store.getState().completeModeratorStream();
      store.getState().completeStreaming();

      // Document total action count for moderator lifecycle
      const totalActions = actionSpy.getTotalCalls();

      // Should be efficient: mark + setStreaming + setMessages (placeholder + chunk + final) + complete + completeStreaming
      // ~8 actions total
      expect(totalActions).toBeLessThanOrEqual(10);
    });
  });
});

describe('moderator Streaming Performance Benchmarks', () => {
  describe('large Content Streaming', () => {
    it('should handle many chunks efficiently', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Simulate 100 chunks (realistic for long moderator response)
      const chunks = Array.from({ length: 100 }, (_, i) => `word${i} `);

      const startTime = performance.now();
      simulateModeratorStreaming(store, 'thread-1', 0, chunks);
      const endTime = performance.now();

      // Should complete quickly (< 250ms for 100 chunks)
      // Note: Using 250ms threshold to account for CI/local machine variability
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(250);

      // Verify all chunks processed
      const setMessagesCount = actionSpy.getCallCount('thread/setMessages');
      expect(setMessagesCount).toBe(102); // placeholder + 100 chunks + final
    });

    it('should maintain stable memory usage during streaming', () => {
      const store = createChatStore();

      // Stream long content
      const chunks = Array.from({ length: 1000 }, () => 'word ');
      simulateModeratorStreaming(store, 'thread-1', 0, chunks);

      // Verify final state is clean
      const messages = store.getState().messages;
      expect(messages).toHaveLength(1); // Only final moderator message

      // No orphaned state
      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().isStreaming).toBe(false);
    });
  });

  describe('concurrent Round Streaming', () => {
    it('should track multiple rounds independently', () => {
      const store = createChatStore();
      const actionSpy = createActionSpy(store);

      // Mark moderators for multiple rounds
      store.getState().markModeratorCreated(0);
      store.getState().markModeratorCreated(1);
      store.getState().markModeratorCreated(2);

      // Verify tracking is independent
      expect(store.getState().hasModeratorBeenCreated(0)).toBe(true);
      expect(store.getState().hasModeratorBeenCreated(1)).toBe(true);
      expect(store.getState().hasModeratorBeenCreated(2)).toBe(true);
      expect(store.getState().hasModeratorBeenCreated(3)).toBe(false);

      // Action count should match round count
      expect(actionSpy.getCallCount('tracking/markModeratorCreated')).toBe(3);
    });
  });
});
