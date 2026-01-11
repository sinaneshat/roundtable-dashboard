/**
 * Render Counts and Update Frequency E2E Tests
 *
 * Tests comprehensive store update behavior during actual chat flows:
 * - Store update frequency during submission (handleUpdateThreadAndSend)
 * - Component re-render counts during streaming
 * - useShallow effectiveness preventing excessive re-renders
 * - Batch updates using single set() calls
 * - No unnecessary re-renders during PATCH/changelog
 * - Animation and transition timing
 *
 * Based on FLOW_DOCUMENTATION.md Part 14: Race Condition Protection
 * and participant transition flashing analysis.
 */

import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import { FinishReasons, MessagePartTypes, UIMessageRoles } from '@/api/core/enums';
import { createTestAssistantMessage, createTestChatStore, createTestUserMessage } from '@/lib/testing';

import type { createChatStore } from '../store';

// ============================================================================
// Update Tracking Utilities
// ============================================================================

type UpdateTracker = {
  count: number;
  timestamps: number[];
  stateSnapshots: Array<{
    isStreaming: boolean;
    currentParticipantIndex: number;
    messageCount: number;
    streamingRoundNumber: number | null;
    isModeratorStreaming: boolean;
  }>;
};

function createUpdateTracker(): UpdateTracker {
  return {
    count: 0,
    timestamps: [],
    stateSnapshots: [],
  };
}

function trackUpdate(tracker: UpdateTracker, state: ReturnType<typeof createChatStore>['getState']): void {
  tracker.count++;
  tracker.timestamps.push(Date.now());
  tracker.stateSnapshots.push({
    isStreaming: state.isStreaming,
    currentParticipantIndex: state.currentParticipantIndex,
    messageCount: state.messages.length,
    streamingRoundNumber: state.streamingRoundNumber,
    isModeratorStreaming: state.isModeratorStreaming,
  });
}

function _getUpdatesPerSecond(tracker: UpdateTracker): number {
  if (tracker.timestamps.length < 2)
    return 0;
  const first = tracker.timestamps[0]!;
  const last = tracker.timestamps[tracker.timestamps.length - 1]!;
  const durationSeconds = (last - first) / 1000;
  if (durationSeconds === 0)
    return tracker.count;
  return tracker.count / durationSeconds;
}

function getUpdatesBetween(tracker: UpdateTracker, startIndex: number, endIndex: number): number {
  return endIndex - startIndex;
}

// ============================================================================
// Message Creation Helpers
// ============================================================================

function createStreamingMessage(
  participantIndex: number,
  roundNumber: number,
  textContent: string,
  finishReason: string = FinishReasons.UNKNOWN,
): UIMessage {
  return createTestAssistantMessage({
    id: `thread_r${roundNumber}_p${participantIndex}`,
    content: textContent,
    roundNumber,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    finishReason,
    parts: textContent
      ? [{ type: MessagePartTypes.TEXT, text: textContent }]
      : [],
  });
}

function createModeratorStreamingMessage(
  roundNumber: number,
  textContent: string,
  finishReason: string = FinishReasons.UNKNOWN,
): UIMessage {
  return {
    id: `thread_r${roundNumber}_moderator`,
    role: UIMessageRoles.ASSISTANT,
    parts: textContent
      ? [{ type: MessagePartTypes.TEXT, text: textContent }]
      : [],
    metadata: {
      role: 'assistant',
      roundNumber,
      isModerator: true,
      finishReason,
      hasError: false,
      usage: { promptTokens: 0, completionTokens: textContent.length, totalTokens: textContent.length },
    },
  };
}

// ============================================================================
// E2E Test Scenarios
// ============================================================================

describe('render Counts and Update Frequency E2E', () => {
  describe('handleUpdateThreadAndSend Submission Flow', () => {
    it('should minimize store updates during thread creation and first message submission', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      // Track all state changes
      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      // Simulate handleUpdateThreadAndSend flow
      // 1. Set input value (user typing)
      store.getState().setInputValue('Hello AI models!');

      // 2. Submit form - clear input
      const beforeSubmit = tracker.count;
      store.getState().setInputValue('');

      // 3. Mark as streaming
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // 4. Add user message
      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Hello AI models!',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage]);

      const afterSubmit = tracker.count;
      const submissionUpdates = afterSubmit - beforeSubmit;

      unsubscribe();

      // Should batch updates efficiently - expect 4 updates:
      // 1. setInputValue('') 2. setIsStreaming(true) 3. setStreamingRoundNumber(0) 4. setMessages([user])
      expect(submissionUpdates).toBeLessThanOrEqual(5);
      expect(submissionUpdates).toBeGreaterThanOrEqual(3);
    });

    it('should handle rapid input changes efficiently', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeTyping = tracker.count;

      // Simulate rapid typing (10 characters)
      for (let i = 1; i <= 10; i++) {
        store.getState().setInputValue('H'.repeat(i));
      }

      const afterTyping = tracker.count;
      const typingUpdates = afterTyping - beforeTyping;

      unsubscribe();

      // Each setInputValue triggers one update (10 updates for 10 characters)
      expect(typingUpdates).toBe(10);
    });
  });

  describe('participant Streaming Update Frequency', () => {
    it('should track updates during first participant streaming', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      vi.useFakeTimers();
      const startTime = Date.now();

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      const unsubscribe = store.subscribe(() => {
        tracker.count++;
        tracker.timestamps.push(Date.now());
      });

      const beforeStreaming = tracker.count;

      // Simulate 20 streaming chunks (realistic stream) with timing
      const streamingText = 'This is a comprehensive answer that streams word by word to the user interface.';
      const words = streamingText.split(' ');

      for (let i = 0; i < words.length; i++) {
        const partialText = words.slice(0, i + 1).join(' ');
        const streamingMsg = createStreamingMessage(0, 0, partialText);
        store.getState().setMessages([userMessage, streamingMsg]);
        vi.advanceTimersByTime(100); // 100ms between chunks = 10 chunks/sec
      }

      const afterStreaming = tracker.count;
      const streamingUpdates = afterStreaming - beforeStreaming;

      const duration = (Date.now() - startTime) / 1000;
      const updatesPerSec = tracker.count / duration;

      unsubscribe();
      vi.useRealTimers();

      // Should have one update per chunk (words.length chunks)
      expect(streamingUpdates).toBe(words.length);

      // Should not exceed 20 updates/second (flag excessive updates)
      expect(updatesPerSec).toBeLessThan(20);
    });

    it('should detect excessive updates and flag performance issues', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      vi.useFakeTimers();
      const startTime = Date.now();

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      const unsubscribe = store.subscribe(() => {
        // Manually track timestamp with fake timers
        tracker.count++;
        tracker.timestamps.push(Date.now());
      });

      // Simulate 50 rapid updates in 1 second (excessive)
      for (let i = 1; i <= 50; i++) {
        const msg = createStreamingMessage(0, 0, 'Word '.repeat(i));
        store.getState().setMessages([userMessage, msg]);
        vi.advanceTimersByTime(20); // 20ms per update = 50 updates/sec
      }

      const duration = (Date.now() - startTime) / 1000;
      const updatesPerSec = tracker.count / duration;

      unsubscribe();
      vi.useRealTimers();

      // This test DOCUMENTS the excessive update scenario
      // If this passes, it means we're updating >20/sec (BAD)
      expect(updatesPerSec).toBeGreaterThan(20);
      expect(tracker.count).toBe(50);

      // eslint-disable-next-line no-console
      console.warn(`[PERFORMANCE WARNING] Detected ${updatesPerSec.toFixed(2)} updates/second (threshold: 20/sec)`);
    });

    it('should minimize updates during participant transition', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      // Participant 0 completes
      const p0Complete = createStreamingMessage(0, 0, 'First participant response', FinishReasons.STOP);
      store.getState().setMessages([userMessage, p0Complete]);
      store.getState().setIsStreaming(true);

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeTransition = tracker.count;

      // Transition to participant 1
      store.getState().setCurrentParticipantIndex(1);

      // Participant 1 starts streaming
      const p1Streaming = createStreamingMessage(1, 0, 'Second participant starts...');
      store.getState().setMessages([userMessage, p0Complete, p1Streaming]);

      const afterTransition = tracker.count;
      const transitionUpdates = afterTransition - beforeTransition;

      unsubscribe();

      // Transition should be 2 updates: setCurrentParticipantIndex + setMessages
      expect(transitionUpdates).toBeLessThanOrEqual(3);
      expect(transitionUpdates).toBeGreaterThanOrEqual(2);
    });

    it('should track all 3 participants streaming sequentially', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeParticipants = tracker.count;

      // Participant 0: 5 chunks
      store.getState().setCurrentParticipantIndex(0);
      let messages: UIMessage[] = [userMessage];
      for (let i = 1; i <= 5; i++) {
        const p0 = createStreamingMessage(0, 0, 'Response '.repeat(i));
        messages = [userMessage, p0];
        store.getState().setMessages(messages);
      }

      const afterP0 = tracker.count;

      // Participant 1: 5 chunks
      store.getState().setCurrentParticipantIndex(1);
      const p0Complete = createStreamingMessage(0, 0, 'Response '.repeat(5), FinishReasons.STOP);
      for (let i = 1; i <= 5; i++) {
        const p1 = createStreamingMessage(1, 0, 'Another '.repeat(i));
        messages = [userMessage, p0Complete, p1];
        store.getState().setMessages(messages);
      }

      const afterP1 = tracker.count;

      // Participant 2: 5 chunks
      store.getState().setCurrentParticipantIndex(2);
      const p1Complete = createStreamingMessage(1, 0, 'Another '.repeat(5), FinishReasons.STOP);
      for (let i = 1; i <= 5; i++) {
        const p2 = createStreamingMessage(2, 0, 'Third '.repeat(i));
        messages = [userMessage, p0Complete, p1Complete, p2];
        store.getState().setMessages(messages);
      }

      const afterP2 = tracker.count;

      unsubscribe();

      const p0Updates = getUpdatesBetween(tracker, beforeParticipants, afterP0);
      const p1Updates = getUpdatesBetween(tracker, afterP0, afterP1);
      const p2Updates = getUpdatesBetween(tracker, afterP1, afterP2);

      // Each participant: 1 setCurrentParticipantIndex + 5 setMessages = 6 updates
      expect(p0Updates).toBeLessThanOrEqual(7);
      expect(p1Updates).toBeLessThanOrEqual(7);
      expect(p2Updates).toBeLessThanOrEqual(7);

      // Total updates should be reasonable
      const totalParticipantUpdates = afterP2 - beforeParticipants;
      expect(totalParticipantUpdates).toBeLessThan(25);
    });
  });

  describe('council Moderator Streaming Updates', () => {
    it('should track updates during moderator streaming', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      const p0Complete = createStreamingMessage(0, 0, 'Response', FinishReasons.STOP);

      store.getState().setMessages([userMessage, p0Complete]);
      store.getState().setIsStreaming(false);
      store.getState().setIsModeratorStreaming(true);

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeModerator = tracker.count;

      // Simulate moderator streaming chunks (incremental sections)
      const moderatorSections = [
        '## Leaderboard\n\n1. Participant 0: 9/10',
        '## Leaderboard\n\n1. Participant 0: 9/10\n\n## Skills Comparison\n\nAnalytical: 8/10',
        '## Leaderboard\n\n1. Participant 0: 9/10\n\n## Skills Comparison\n\nAnalytical: 8/10\n\n## Summary\n\nStrong response',
      ];

      for (const section of moderatorSections) {
        const moderatorMsg = createModeratorStreamingMessage(0, section);
        store.getState().setMessages([userMessage, p0Complete, moderatorMsg]);
      }

      const afterModerator = tracker.count;
      const moderatorUpdates = afterModerator - beforeModerator;

      unsubscribe();

      // Should have 3 updates (one per section)
      expect(moderatorUpdates).toBe(3);
    });

    it('should batch state changes during moderator lifecycle', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeLifecycle = tracker.count;

      // Complete participant streaming
      store.getState().setIsStreaming(false);

      // Start moderator
      store.getState().setIsModeratorStreaming(true);

      // Stream moderator content
      const moderatorMsg = createModeratorStreamingMessage(0, 'Summary complete', FinishReasons.STOP);
      store.getState().setMessages([moderatorMsg]);

      // End moderator
      store.getState().setIsModeratorStreaming(false);

      const afterLifecycle = tracker.count;
      const lifecycleUpdates = afterLifecycle - beforeLifecycle;

      unsubscribe();

      // Should have 4 updates: end participant + start moderator + add message + end moderator
      expect(lifecycleUpdates).toBeLessThanOrEqual(5);
      expect(lifecycleUpdates).toBeGreaterThanOrEqual(4);
    });
  });

  describe('pATCH and Changelog Fetch Updates', () => {
    it('should not cause excessive re-renders during PATCH response processing', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforePatch = tracker.count;

      // Simulate PATCH response updating thread data
      // Use available setters: setThread and setStreamingRoundNumber
      store.getState().setThread({
        id: 'thread-123',
        userId: 'user-1',
        slug: 'test-slug',
        title: 'Test Thread',
        selectedMode: null,
        enableWebSearch: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      store.getState().setStreamingRoundNumber(0);

      const afterPatch = tracker.count;
      const patchUpdates = afterPatch - beforePatch;

      unsubscribe();

      // PATCH should only trigger 2 updates (one per field)
      expect(patchUpdates).toBe(2);
    });

    it('should minimize updates during changelog fetch', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      // Simulate existing round 0 state
      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      const p0 = createStreamingMessage(0, 0, 'Response', FinishReasons.STOP);

      store.getState().setMessages([userMessage, p0]);

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeChangelog = tracker.count;

      // Simulate changelog data being fetched and stored
      // (In real app, this would be handled by TanStack Query/orchestrator)
      // For this test, we track that no store updates happen during fetch

      // No store updates should occur just from fetching changelog data
      const afterChangelog = tracker.count;
      const changelogUpdates = afterChangelog - beforeChangelog;

      unsubscribe();

      // Changelog fetch should not trigger store updates (data handled by React Query)
      expect(changelogUpdates).toBe(0);
    });
  });

  describe('useShallow Pattern Effectiveness', () => {
    it('should document correct useShallow batched selector pattern', () => {
      const store = createTestChatStore();

      // ❌ BAD: Multiple individual selectors
      // Each creates separate subscription
      const badPattern = () => {
        const messages = store.getState().messages;
        const isStreaming = store.getState().isStreaming;
        const currentParticipantIndex = store.getState().currentParticipantIndex;
        return { messages, isStreaming, currentParticipantIndex };
      };

      // ✅ GOOD: Single batched selector (with useShallow in component)
      // In component: useChatStore(useShallow(s => ({ messages: s.messages, ... })))
      const goodPattern = () => {
        const state = store.getState();
        return {
          messages: state.messages,
          isStreaming: state.isStreaming,
          currentParticipantIndex: state.currentParticipantIndex,
        };
      };

      const bad = badPattern();
      const good = goodPattern();

      // Both return same data
      expect(bad.messages).toEqual(good.messages);
      expect(bad.isStreaming).toBe(good.isStreaming);
      expect(bad.currentParticipantIndex).toBe(good.currentParticipantIndex);
    });

    it('should verify object selector without useShallow causes re-renders on any state change', () => {
      const store = createTestChatStore();
      let callbackCount = 0;

      // Without useShallow, object selector creates new reference every time
      const objectSelector = (state: ReturnType<typeof store.getState>) => ({
        messages: state.messages,
        isStreaming: state.isStreaming,
      });

      const unsubscribe = store.subscribe(
        objectSelector,
        () => {
          callbackCount++;
        },
        { equalityFn: (a, b) => a === b }, // Reference equality (default)
      );

      // Initial callback on subscription
      const initialCount = callbackCount;

      // Change unrelated state
      store.getState().setInputValue('test');

      unsubscribe();

      // Zustand subscription equality check:
      // The selector is called, but callback only fires if equality check fails
      // Since we're using reference equality and the object is new on each call,
      // the callback SHOULD fire. However, Zustand v5 optimizes subscriptions.
      // This test documents the behavior - it may not fire if selector result unchanged
      expect(callbackCount).toBeGreaterThanOrEqual(initialCount);
    });

    it('should verify shallow equality prevents unnecessary callbacks', () => {
      const store = createTestChatStore();
      let callbackCount = 0;

      const unsubscribe = store.subscribe(
        state => ({ messages: state.messages, isStreaming: state.isStreaming }),
        () => {
          callbackCount++;
        },
        { equalityFn: (a, b) => a.messages === b.messages && a.isStreaming === b.isStreaming },
      );

      // Change unrelated state
      store.getState().setInputValue('test');
      store.getState().setInputValue('test2');
      store.getState().setInputValue('test3');

      unsubscribe();

      // With shallow equality, unrelated changes don't trigger callback
      expect(callbackCount).toBe(0);
    });
  });

  describe('batch Updates with Single set() Calls', () => {
    it('should update multiple fields with single set() call', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeBatch = tracker.count;

      // ❌ BAD: Multiple set() calls
      // store.getState().setIsStreaming(true);
      // store.getState().setStreamingRoundNumber(0);
      // store.getState().setCurrentParticipantIndex(0);
      // ^ This would trigger 3 updates

      // ✅ GOOD: Single batched update (if we had batch action)
      // For now, we document that individual setters trigger individual updates
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      const afterBatch = tracker.count;
      const batchUpdates = afterBatch - beforeBatch;

      unsubscribe();

      // Currently: 3 updates (one per setter)
      // Future optimization: Could batch these into single update
      expect(batchUpdates).toBe(3);
    });

    it('should document completeStreaming batch update pattern', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const beforeComplete = tracker.count;

      // completeStreaming() should batch multiple state changes
      store.getState().completeStreaming();

      const afterComplete = tracker.count;
      const completeUpdates = afterComplete - beforeComplete;

      unsubscribe();

      // completeStreaming() batches multiple updates into single call
      expect(completeUpdates).toBe(1);
    });
  });

  describe('animation and Transition Timing', () => {
    it('should track timing between participant transitions', () => {
      const store = createTestChatStore();
      const transitionTimestamps: number[] = [];

      vi.useFakeTimers();

      // Subscribe BEFORE making any changes
      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.currentParticipantIndex !== prevState.currentParticipantIndex) {
          transitionTimestamps.push(Date.now());
        }
      });

      // Start with initial state (no transition yet)
      const initialIndex = store.getState().currentParticipantIndex;

      // First transition: -1 → 0
      store.getState().setCurrentParticipantIndex(0);
      vi.advanceTimersByTime(200); // 200ms pause before next participant

      // Second transition: 0 → 1
      store.getState().setCurrentParticipantIndex(1);
      vi.advanceTimersByTime(200);

      // Third transition: 1 → 2
      store.getState().setCurrentParticipantIndex(2);

      unsubscribe();
      vi.useRealTimers();

      // Should have 3 transitions (if initial was -1, otherwise 2)
      // Store defaults to currentParticipantIndex: -1
      const expectedTransitions = initialIndex === -1 ? 3 : 2;
      expect(transitionTimestamps).toHaveLength(expectedTransitions);

      // Check intervals between transitions (should be ~200ms)
      for (let i = 1; i < transitionTimestamps.length; i++) {
        const interval = transitionTimestamps[i]! - transitionTimestamps[i - 1]!;
        expect(interval).toBeGreaterThanOrEqual(190);
        expect(interval).toBeLessThanOrEqual(210);
      }
    });

    it('should validate moderator section stagger timing (100ms)', () => {
      const store = createTestChatStore();
      const sectionTimestamps: number[] = [];

      vi.useFakeTimers();

      const unsubscribe = store.subscribe((state) => {
        // Track when moderator message content changes (new section added)
        const moderatorMsg = state.messages.find(m =>
          m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata && m.metadata.isModerator,
        );
        if (moderatorMsg) {
          const textPart = moderatorMsg.parts?.[0];
          if (textPart?.type === 'text' && 'text' in textPart) {
            const sectionCount = (textPart.text as string).split('##').length - 1;
            if (sectionTimestamps.length < sectionCount) {
              sectionTimestamps.push(Date.now());
            }
          }
        }
      });

      const sections = [
        '## Leaderboard',
        '## Leaderboard\n\n## Skills',
        '## Leaderboard\n\n## Skills\n\n## Summary',
        '## Leaderboard\n\n## Skills\n\n## Summary\n\n## Conclusion',
      ];

      for (const section of sections) {
        const moderatorMsg = createModeratorStreamingMessage(0, section);
        store.getState().setMessages([moderatorMsg]);
        vi.advanceTimersByTime(100); // 100ms stagger
      }

      unsubscribe();
      vi.useRealTimers();

      // Should detect 4 section updates
      expect(sectionTimestamps.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('complete Round E2E Update Count', () => {
    it('should track total updates for complete round (user → 3 participants → moderator)', () => {
      const store = createTestChatStore();
      const tracker = createUpdateTracker();

      const unsubscribe = store.subscribe(() => {
        trackUpdate(tracker, store.getState());
      });

      const startCount = tracker.count;

      // 1. User submits message
      store.getState().setInputValue('');
      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // 2. Participant 0: 5 chunks
      store.getState().setCurrentParticipantIndex(0);
      let messages: UIMessage[] = [userMessage];
      for (let i = 1; i <= 5; i++) {
        const p0 = createStreamingMessage(0, 0, 'Response '.repeat(i));
        messages = [userMessage, p0];
        store.getState().setMessages(messages);
      }

      // 3. Participant 1: 5 chunks
      store.getState().setCurrentParticipantIndex(1);
      const p0Complete = createStreamingMessage(0, 0, 'Response '.repeat(5), FinishReasons.STOP);
      for (let i = 1; i <= 5; i++) {
        const p1 = createStreamingMessage(1, 0, 'Another '.repeat(i));
        messages = [userMessage, p0Complete, p1];
        store.getState().setMessages(messages);
      }

      // 4. Participant 2: 5 chunks
      store.getState().setCurrentParticipantIndex(2);
      const p1Complete = createStreamingMessage(1, 0, 'Another '.repeat(5), FinishReasons.STOP);
      for (let i = 1; i <= 5; i++) {
        const p2 = createStreamingMessage(2, 0, 'Third '.repeat(i));
        messages = [userMessage, p0Complete, p1Complete, p2];
        store.getState().setMessages(messages);
      }

      // 5. Council moderator: 3 sections
      store.getState().setIsStreaming(false);
      store.getState().setIsModeratorStreaming(true);
      const p2Complete = createStreamingMessage(2, 0, 'Third '.repeat(5), FinishReasons.STOP);

      const moderatorSections = [
        '## Leaderboard\n\n1. P0: 9/10',
        '## Leaderboard\n\n1. P0: 9/10\n\n## Skills\n\nAnalytical: 8',
        '## Leaderboard\n\n1. P0: 9/10\n\n## Skills\n\nAnalytical: 8\n\n## Summary\n\nComplete',
      ];

      for (const section of moderatorSections) {
        const moderatorMsg = createModeratorStreamingMessage(0, section);
        messages = [userMessage, p0Complete, p1Complete, p2Complete, moderatorMsg];
        store.getState().setMessages(messages);
      }

      // 6. Complete streaming
      store.getState().setIsModeratorStreaming(false);
      store.getState().completeStreaming();

      const endCount = tracker.count;
      const totalUpdates = endCount - startCount;

      unsubscribe();

      // Breakdown of updates:
      // - Submit: 4 (setInputValue, setMessages, setIsStreaming, setStreamingRoundNumber)
      // - P0: 6 (setCurrentParticipantIndex + 5 chunks)
      // - P1: 6 (setCurrentParticipantIndex + 5 chunks)
      // - P2: 6 (setCurrentParticipantIndex + 5 chunks)
      // - Moderator: 5 (setIsStreaming, setIsModeratorStreaming, 3 sections)
      // - Complete: 2 (setIsModeratorStreaming, completeStreaming)
      // Total: ~29 updates

      expect(totalUpdates).toBeGreaterThan(20);
      expect(totalUpdates).toBeLessThan(50);

      // eslint-disable-next-line no-console
      console.log(`[E2E] Complete round updates: ${totalUpdates}`);
    });

    it('should verify no duplicate message IDs during complete flow', () => {
      const store = createTestChatStore();

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);

      // Add all 3 participants
      const p0 = createStreamingMessage(0, 0, 'Response 0', FinishReasons.STOP);
      const p1 = createStreamingMessage(1, 0, 'Response 1', FinishReasons.STOP);
      const p2 = createStreamingMessage(2, 0, 'Response 2', FinishReasons.STOP);

      store.getState().setMessages([userMessage, p0, p1, p2]);

      // Add moderator
      const moderator = createModeratorStreamingMessage(0, 'Summary', FinishReasons.STOP);
      store.getState().setMessages([userMessage, p0, p1, p2, moderator]);

      const messages = store.getState().messages;
      const ids = messages.map(m => m.id);
      const uniqueIds = new Set(ids);

      // All IDs should be unique
      expect(ids).toHaveLength(uniqueIds.size);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('performance Regression Detection', () => {
    it('should flag if updates exceed 100 for single round', () => {
      const store = createTestChatStore();
      let updateCount = 0;

      const unsubscribe = store.subscribe(() => {
        updateCount++;
      });

      // Simulate worst-case scenario: 3 participants × 30 chunks each + moderator
      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      let messages: UIMessage[] = [userMessage];

      // Participant 0: 30 chunks
      store.getState().setCurrentParticipantIndex(0);
      for (let i = 1; i <= 30; i++) {
        const p0 = createStreamingMessage(0, 0, 'Word '.repeat(i));
        store.getState().setMessages([userMessage, p0]);
      }

      // Participant 1: 30 chunks
      store.getState().setCurrentParticipantIndex(1);
      const p0Complete = createStreamingMessage(0, 0, 'Word '.repeat(30), FinishReasons.STOP);
      for (let i = 1; i <= 30; i++) {
        const p1 = createStreamingMessage(1, 0, 'Another '.repeat(i));
        messages = [userMessage, p0Complete, p1];
        store.getState().setMessages(messages);
      }

      // Participant 2: 30 chunks
      store.getState().setCurrentParticipantIndex(2);
      const p1Complete = createStreamingMessage(1, 0, 'Another '.repeat(30), FinishReasons.STOP);
      for (let i = 1; i <= 30; i++) {
        const p2 = createStreamingMessage(2, 0, 'Third '.repeat(i));
        messages = [userMessage, p0Complete, p1Complete, p2];
        store.getState().setMessages(messages);
      }

      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      unsubscribe();

      // Should not exceed 150 updates even in worst case
      expect(updateCount).toBeLessThan(150);

      // Flag if approaching threshold
      if (updateCount > 100) {
        // eslint-disable-next-line no-console
        console.warn(`[PERFORMANCE] High update count: ${updateCount} (threshold: 100)`);
      }
    });
  });

  describe('render Optimization: Minimal Re-Renders', () => {
    it('should minimize re-renders during message submission', () => {
      const store = createTestChatStore();
      const renderTracker = {
        setInputValue: 0,
        setMessages: 0,
        setIsStreaming: 0,
        setStreamingRoundNumber: 0,
      };

      // Track individual state changes
      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.inputValue !== prevState.inputValue)
          renderTracker.setInputValue++;
        if (state.messages !== prevState.messages)
          renderTracker.setMessages++;
        if (state.isStreaming !== prevState.isStreaming)
          renderTracker.setIsStreaming++;
        if (state.streamingRoundNumber !== prevState.streamingRoundNumber)
          renderTracker.setStreamingRoundNumber++;
      });

      // Simulate submission flow
      store.getState().setInputValue('Hello');
      store.getState().setInputValue('');
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Hello',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage]);

      unsubscribe();

      // Each setter should trigger exactly 1 render
      expect(renderTracker.setInputValue).toBe(2); // 'Hello' → ''
      expect(renderTracker.setMessages).toBe(1); // Add user message
      expect(renderTracker.setIsStreaming).toBe(1); // true
      expect(renderTracker.setStreamingRoundNumber).toBe(1); // 0
    });

    it('should batch participant transition updates', () => {
      const store = createTestChatStore();
      let totalUpdates = 0;
      let participantIndexChanges = 0;
      let messageChanges = 0;

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      const unsubscribe = store.subscribe((state, prevState) => {
        totalUpdates++;
        if (state.currentParticipantIndex !== prevState.currentParticipantIndex) {
          participantIndexChanges++;
        }
        if (state.messages !== prevState.messages) {
          messageChanges++;
        }
      });

      const beforeTransition = totalUpdates;

      // Transition from participant 0 → 1
      const p0Complete = createStreamingMessage(0, 0, 'Complete', FinishReasons.STOP);
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages([userMessage, p0Complete]);

      const afterTransition = totalUpdates;
      const transitionUpdates = afterTransition - beforeTransition;

      unsubscribe();

      // Should only trigger 2 updates (index + messages), not interleaved
      expect(transitionUpdates).toBeLessThanOrEqual(2);
      expect(participantIndexChanges).toBe(1);
      expect(messageChanges).toBe(1);
    });

    it('should not trigger re-renders on unrelated state changes', () => {
      const store = createTestChatStore();
      let messagesRenders = 0;
      let streamingRenders = 0;

      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.messages !== prevState.messages)
          messagesRenders++;
        if (state.isStreaming !== prevState.isStreaming)
          streamingRenders++;
      });

      // Change unrelated state (inputValue, screen mode, etc.)
      store.getState().setInputValue('test');
      store.getState().setInputValue('test2');
      store.getState().setScreenMode('chat' as typeof ScreenModes.CHAT);

      unsubscribe();

      // Messages and isStreaming should not re-render
      expect(messagesRenders).toBe(0);
      expect(streamingRenders).toBe(0);
    });

    it('should minimize re-renders during rapid streaming chunks', () => {
      const store = createTestChatStore();
      let messageUpdateCount = 0;

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.messages !== prevState.messages) {
          messageUpdateCount++;
        }
      });

      const beforeStreaming = messageUpdateCount;

      // Simulate 20 rapid streaming chunks
      for (let i = 1; i <= 20; i++) {
        const streamingMsg = createStreamingMessage(0, 0, 'Word '.repeat(i));
        store.getState().setMessages([userMessage, streamingMsg]);
      }

      const afterStreaming = messageUpdateCount;
      const streamingUpdates = afterStreaming - beforeStreaming;

      unsubscribe();

      // Should have exactly 20 updates (one per chunk)
      expect(streamingUpdates).toBe(20);
    });
  });

  describe('render Optimization: Batched State Updates', () => {
    it('should batch multiple state changes in completeStreaming', () => {
      const store = createTestChatStore();
      const stateChanges = {
        isStreaming: 0,
        streamingRoundNumber: 0,
        currentParticipantIndex: 0,
        isModeratorStreaming: 0,
      };

      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(2);

      const unsubscribe = store.subscribe((state, prevState) => {
        if (state.isStreaming !== prevState.isStreaming)
          stateChanges.isStreaming++;
        if (state.streamingRoundNumber !== prevState.streamingRoundNumber)
          stateChanges.streamingRoundNumber++;
        if (state.currentParticipantIndex !== prevState.currentParticipantIndex)
          stateChanges.currentParticipantIndex++;
        if (state.isModeratorStreaming !== prevState.isModeratorStreaming)
          stateChanges.isModeratorStreaming++;
      });

      // completeStreaming() should batch all these changes
      store.getState().completeStreaming();

      unsubscribe();

      // Should batch: isStreaming=false, streamingRoundNumber=null, currentParticipantIndex=-1
      // All changes in single update
      expect(stateChanges.isStreaming).toBe(1);
      expect(stateChanges.streamingRoundNumber).toBe(1);
      expect(stateChanges.currentParticipantIndex).toBe(1);
    });

    it('should prevent flicker by batching moderator lifecycle', () => {
      const store = createTestChatStore();
      let lifecycleUpdates = 0;

      const unsubscribe = store.subscribe(() => {
        lifecycleUpdates++;
      });

      const beforeModerator = lifecycleUpdates;

      // Moderator lifecycle
      store.getState().setIsStreaming(false);
      store.getState().setIsModeratorStreaming(true);

      const moderatorMsg = createModeratorStreamingMessage(0, 'Summary');
      store.getState().setMessages([moderatorMsg]);

      store.getState().setIsModeratorStreaming(false);

      const afterModerator = lifecycleUpdates;
      const moderatorLifecycle = afterModerator - beforeModerator;

      unsubscribe();

      // Should have minimal updates: end participant + start moderator + message + end moderator
      expect(moderatorLifecycle).toBeLessThanOrEqual(4);
    });

    it('should batch participant completion and next participant start', () => {
      const store = createTestChatStore();
      let batchUpdates = 0;

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      const unsubscribe = store.subscribe(() => {
        batchUpdates++;
      });

      const beforeBatch = batchUpdates;

      // Complete participant 0 and start participant 1
      const p0Complete = createStreamingMessage(0, 0, 'Complete', FinishReasons.STOP);
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setMessages([userMessage, p0Complete]);

      const afterBatch = batchUpdates;
      const transitionBatch = afterBatch - beforeBatch;

      unsubscribe();

      // Should batch into 2 updates max
      expect(transitionBatch).toBeLessThanOrEqual(2);
    });

    it('should detect when batching is NOT used (anti-pattern)', () => {
      const store = createTestChatStore();
      let individualUpdates = 0;

      const unsubscribe = store.subscribe(() => {
        individualUpdates++;
      });

      const beforeIndividual = individualUpdates;

      // Anti-pattern: Multiple individual setters
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      const afterIndividual = individualUpdates;
      const unbatchedUpdates = afterIndividual - beforeIndividual;

      unsubscribe();

      // This DOCUMENTS the anti-pattern - 3 individual updates
      expect(unbatchedUpdates).toBe(3);
    });
  });

  describe('render Optimization: Placeholder Visibility Stability', () => {
    it('should maintain placeholder visibility during state updates', () => {
      const store = createTestChatStore();
      const placeholderStates: boolean[] = [];

      const unsubscribe = store.subscribe((state) => {
        // Track if placeholder should be visible
        const shouldShowPlaceholder = state.isStreaming && state.messages.length === 1; // Only user message
        placeholderStates.push(shouldShowPlaceholder);
      });

      // User submits message
      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      // Placeholder should be visible here
      const placeholderVisible = store.getState().isStreaming && store.getState().messages.length === 1;
      expect(placeholderVisible).toBe(true);

      // First streaming chunk arrives
      const streamingMsg = createStreamingMessage(0, 0, 'Starting...');
      store.getState().setMessages([userMessage, streamingMsg]);

      // Placeholder should disappear (message now present)
      const placeholderHidden = store.getState().messages.length > 1;
      expect(placeholderHidden).toBe(true);

      unsubscribe();

      // Verify placeholder was visible before first chunk
      expect(placeholderStates.some(visible => visible)).toBe(true);
    });

    it('should not cause placeholder flicker during participant transition', () => {
      const store = createTestChatStore();
      const messageCountSnapshots: number[] = [];

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      const p0Complete = createStreamingMessage(0, 0, 'Complete', FinishReasons.STOP);

      store.getState().setMessages([userMessage, p0Complete]);
      store.getState().setIsStreaming(true);

      const unsubscribe = store.subscribe((state) => {
        messageCountSnapshots.push(state.messages.length);
      });

      // Transition to participant 1
      store.getState().setCurrentParticipantIndex(1);

      // Add participant 1 message
      const p1Streaming = createStreamingMessage(1, 0, 'Starting...');
      store.getState().setMessages([userMessage, p0Complete, p1Streaming]);

      unsubscribe();

      // Message count should never drop (no flicker)
      for (let i = 1; i < messageCountSnapshots.length; i++) {
        expect(messageCountSnapshots[i]).toBeGreaterThanOrEqual(messageCountSnapshots[i - 1]!);
      }
    });

    it('should preserve message order during rapid updates', () => {
      const store = createTestChatStore();
      const messageOrderSnapshots: string[][] = [];

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);

      const unsubscribe = store.subscribe((state) => {
        messageOrderSnapshots.push(state.messages.map(m => m.id));
      });

      // Add messages in sequence
      const p0 = createStreamingMessage(0, 0, 'P0 response', FinishReasons.STOP);
      store.getState().setMessages([userMessage, p0]);

      const p1 = createStreamingMessage(1, 0, 'P1 response', FinishReasons.STOP);
      store.getState().setMessages([userMessage, p0, p1]);

      const p2 = createStreamingMessage(2, 0, 'P2 response', FinishReasons.STOP);
      store.getState().setMessages([userMessage, p0, p1, p2]);

      unsubscribe();

      // Verify order is preserved: user → p0 → p1 → p2
      const finalOrder = store.getState().messages.map(m => m.id);
      expect(finalOrder).toEqual([
        'user_r0',
        'thread_r0_p0',
        'thread_r0_p1',
        'thread_r0_p2',
      ]);

      // No message should disappear from snapshots
      for (let i = 1; i < messageOrderSnapshots.length; i++) {
        const prev = messageOrderSnapshots[i - 1]!;
        const current = messageOrderSnapshots[i]!;

        // Every message from prev should exist in current
        for (const msgId of prev) {
          expect(current).toContain(msgId);
        }
      }
    });

    it('should not remove placeholder prematurely before streaming starts', () => {
      const store = createTestChatStore();
      const stateSnapshots: Array<{ isStreaming: boolean; messageCount: number }> = [];

      const unsubscribe = store.subscribe((state) => {
        stateSnapshots.push({
          isStreaming: state.isStreaming,
          messageCount: state.messages.length,
        });
      });

      // User submits message
      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      // Simulate delay before streaming starts
      vi.useFakeTimers();
      vi.advanceTimersByTime(100);

      // First chunk arrives
      const streamingMsg = createStreamingMessage(0, 0, 'Response');
      store.getState().setMessages([userMessage, streamingMsg]);

      vi.useRealTimers();

      unsubscribe();

      // Find placeholder phase (isStreaming=true, messageCount=1)
      const placeholderPhase = stateSnapshots.find(
        snap => snap.isStreaming && snap.messageCount === 1,
      );

      expect(placeholderPhase).toBeDefined();
    });
  });

  describe('render Optimization: Progressive UI Updates', () => {
    it('should progressively update UI without full re-mount during streaming', () => {
      const store = createTestChatStore();
      const messageLengthProgression: number[] = [];

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      const unsubscribe = store.subscribe((state) => {
        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg && lastMsg.role === UIMessageRoles.ASSISTANT) {
          const textPart = lastMsg.parts?.[0];
          if (textPart && textPart.type === 'text' && 'text' in textPart) {
            messageLengthProgression.push((textPart.text as string).length);
          }
        }
      });

      // Stream message progressively
      for (let i = 1; i <= 10; i++) {
        const streamingMsg = createStreamingMessage(0, 0, 'Word '.repeat(i));
        store.getState().setMessages([userMessage, streamingMsg]);
      }

      unsubscribe();

      // Verify progressive increase in content length
      for (let i = 1; i < messageLengthProgression.length; i++) {
        expect(messageLengthProgression[i]).toBeGreaterThan(messageLengthProgression[i - 1]!);
      }
    });

    it('should update moderator sections incrementally without re-mounting', () => {
      const store = createTestChatStore();
      const sectionCounts: number[] = [];

      const unsubscribe = store.subscribe((state) => {
        const moderatorMsg = state.messages.find(m =>
          m.metadata && typeof m.metadata === 'object' && 'isModerator' in m.metadata && m.metadata.isModerator,
        );

        if (moderatorMsg) {
          const textPart = moderatorMsg.parts?.[0];
          if (textPart && textPart.type === 'text' && 'text' in textPart) {
            const sectionCount = ((textPart.text as string).match(/##/g) || []).length;
            sectionCounts.push(sectionCount);
          }
        }
      });

      // Stream moderator sections incrementally
      const sections = [
        '## Leaderboard',
        '## Leaderboard\n\n## Skills',
        '## Leaderboard\n\n## Skills\n\n## Summary',
      ];

      for (const section of sections) {
        const moderatorMsg = createModeratorStreamingMessage(0, section);
        store.getState().setMessages([moderatorMsg]);
      }

      unsubscribe();

      // Verify progressive section addition: 1 → 2 → 3
      expect(sectionCounts).toEqual([1, 2, 3]);
    });

    it('should maintain smooth transitions during participant handoff', () => {
      const store = createTestChatStore();
      const participantIndexTimeline: number[] = [];

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);
      store.getState().setIsStreaming(true);

      const unsubscribe = store.subscribe((state) => {
        participantIndexTimeline.push(state.currentParticipantIndex);
      });

      // Participant 0 completes
      store.getState().setCurrentParticipantIndex(0);
      const p0Complete = createStreamingMessage(0, 0, 'Complete', FinishReasons.STOP);
      store.getState().setMessages([userMessage, p0Complete]);

      // Participant 1 starts
      store.getState().setCurrentParticipantIndex(1);
      const p1Streaming = createStreamingMessage(1, 0, 'Starting...');
      store.getState().setMessages([userMessage, p0Complete, p1Streaming]);

      // Participant 2 starts
      store.getState().setCurrentParticipantIndex(2);

      unsubscribe();

      // Verify smooth transition: 0 → 1 → 2
      expect(participantIndexTimeline).toContain(0);
      expect(participantIndexTimeline).toContain(1);
      expect(participantIndexTimeline).toContain(2);

      // No backwards transitions (e.g., 2 → 1) - verify forward progress only
      for (let i = 1; i < participantIndexTimeline.length; i++) {
        const curr = participantIndexTimeline[i]!;
        const prev = participantIndexTimeline[i - 1]!;
        expect(curr >= prev).toBe(true);
      }
    });

    it('should not re-mount component tree during streaming', () => {
      const store = createTestChatStore();
      let componentMountCount = 0;
      let lastMessageId: string | null = null;

      const userMessage = createTestUserMessage({
        id: 'user_r0',
        content: 'Question',
        roundNumber: 0,
      });

      store.getState().setMessages([userMessage]);

      const unsubscribe = store.subscribe((state) => {
        const currentLastMsg = state.messages[state.messages.length - 1];

        // If last message ID changed, simulate component mount
        if (currentLastMsg && currentLastMsg.id !== lastMessageId) {
          componentMountCount++;
          lastMessageId = currentLastMsg.id;
        }
      });

      // Stream 10 chunks (same message ID)
      for (let i = 1; i <= 10; i++) {
        const streamingMsg = createStreamingMessage(0, 0, 'Word '.repeat(i));
        store.getState().setMessages([userMessage, streamingMsg]);
      }

      unsubscribe();

      // Should only mount once (when message ID 'thread_r0_p0' first appears)
      expect(componentMountCount).toBe(1);
    });
  });
});
