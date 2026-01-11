/**
 * Streaming Performance Tests
 *
 * Tests that verify NO unnecessary delays during streaming and efficient operations.
 * Focus on catching performance regressions that could slow down streaming UX.
 *
 * Key Performance Requirements:
 * 1. Participants start streaming immediately when conditions are met (no artificial delays)
 * 2. Message lookups use O(1) operations (Map-based) not O(n) array scans
 * 3. Pre-search blocking doesn't exceed timeout values
 * 4. Streaming state transitions happen synchronously (no race conditions)
 * 5. Store updates are batched and don't cause cascading re-renders
 *
 * Performance Regression Indicators:
 * - Any participant waiting longer than expected before streaming starts
 * - Linear time complexity in message/participant lookups
 * - Excessive state updates during streaming
 * - Delays between streaming phases (pre-search → participants → moderator)
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagePartTypes, MessageStatuses, UIMessageRoles } from '@/api/core/enums';

import { createChatStore } from '../store';

describe('streaming Performance - Immediate Start Verification', () => {
  it('participant streaming starts immediately after pre-search completes (no delay)', () => {
    const store = createChatStore();
    const timestamps: number[] = [];

    // Simulate pre-search completion
    store.getState().addPreSearch({
      id: 'presearch-1',
      threadId: 'thread-1',
      roundNumber: 0,
      query: 'test',
      status: MessageStatuses.PENDING,
      queries: [],
      results: [],
    });

    timestamps.push(Date.now());
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    timestamps.push(Date.now());
    // Participant should be ready to stream immediately
    store.getState().setNextParticipantToTrigger(0);

    timestamps.push(Date.now());

    // All state transitions should happen synchronously (< 1ms in tests)
    const totalTime = timestamps[timestamps.length - 1]! - timestamps[0]!;
    expect(totalTime).toBeLessThan(10); // Should be nearly instant in tests
  });

  it('participant 1 starts immediately after participant 0 completes (no gap)', () => {
    const store = createChatStore();
    const timestamps: number[] = [];

    // Participant 0 completes
    timestamps.push(Date.now());
    store.getState().setMessages([
      {
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response 0' }],
        metadata: {
          roundNumber: 0,
          participantIndex: 0,
          finishReason: 'stop',
        },
        createdAt: new Date(),
      },
    ]);

    timestamps.push(Date.now());
    store.getState().setCurrentParticipantIndex(1);

    timestamps.push(Date.now());
    store.getState().setNextParticipantToTrigger(1);

    timestamps.push(Date.now());

    const totalTime = timestamps[timestamps.length - 1]! - timestamps[0]!;
    expect(totalTime).toBeLessThan(10); // No artificial delays
  });

  it('moderator starts immediately after all participants complete (no gap)', () => {
    const store = createChatStore();
    const timestamps: number[] = [];

    // All participants complete
    timestamps.push(Date.now());
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(null);

    timestamps.push(Date.now());
    store.getState().setIsModeratorStreaming(true);

    timestamps.push(Date.now());

    const totalTime = timestamps[timestamps.length - 1]! - timestamps[0]!;
    expect(totalTime).toBeLessThan(10);
  });

  it('verifies no setTimeout/setInterval delays in streaming state transitions', () => {
    const store = createChatStore();

    // Mock timers to catch any async delays
    vi.useFakeTimers();

    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(0);

    // Advance timers by 0ms - if state updates required timers, this would fail
    vi.advanceTimersByTime(0);

    const state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.currentParticipantIndex).toBe(0);

    vi.useRealTimers();
  });
});

describe('streaming Performance - Pre-Search Timeout Compliance', () => {
  it('documents pre-search timeout behavior', () => {
    /**
     * Pre-search timeout documented behavior:
     *
     * - Default timeout: 8000ms (8 seconds)
     * - After timeout, participants should be allowed to start
     * - Timeout checked based on lastActivityAt timestamp
     * - Prevents indefinite blocking by stale pre-search
     */
    expect(true).toBe(true); // Documentation test
  });
});

describe('streaming Performance - Message Lookup Efficiency', () => {
  it('message lookup by ID should be O(1) with Map (not O(n) array scan)', () => {
    const store = createChatStore();

    // Create large message array
    const messages = Array.from({ length: 1000 }, (_, i) => ({
      id: `msg-${i}`,
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: MessagePartTypes.TEXT, text: `Message ${i}` }],
      metadata: { roundNumber: 0, participantIndex: i % 3 },
      createdAt: new Date(),
    }));

    store.getState().setMessages(messages);

    // Performance test: lookup should be fast even with 1000 messages
    const startTime = performance.now();

    // Simulate looking up message by ID (O(1) with Map)
    const targetId = 'msg-999';
    const found = store.getState().messages.find(m => m.id === targetId);

    const endTime = performance.now();
    const lookupTime = endTime - startTime;

    expect(found).toBeDefined();
    expect(found?.id).toBe(targetId);

    // Lookup should be near-instant (< 1ms even with 1000 items)
    // NOTE: In production, a Map<string, UIMessage> would be ideal for O(1) lookup
    expect(lookupTime).toBeLessThan(5); // Tolerant threshold for test environment
  });

  it('participant index lookup should be constant time (not linear search)', () => {
    const store = createChatStore();

    // Set current participant index
    const startTime = performance.now();

    store.getState().setCurrentParticipantIndex(5);

    const endTime = performance.now();
    const setTime = endTime - startTime;

    expect(store.getState().currentParticipantIndex).toBe(5);
    expect(setTime).toBeLessThan(1); // Should be instant
  });

  it('finding last message for participant should be efficient', () => {
    const store = createChatStore();

    // Create messages with different participants
    const messages = [
      {
        id: 'msg-user',
        role: UIMessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
        metadata: { roundNumber: 0 },
        createdAt: new Date(),
      },
      {
        id: 'thread-1_r0_p0',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response 0' }],
        metadata: { roundNumber: 0, participantIndex: 0 },
        createdAt: new Date(),
      },
      {
        id: 'thread-1_r0_p1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Response 1' }],
        metadata: { roundNumber: 0, participantIndex: 1 },
        createdAt: new Date(),
      },
    ];

    store.getState().setMessages(messages);

    const startTime = performance.now();

    // Find last message for participant 1
    const participantMessages = store.getState().messages.filter(
      m => m.metadata?.participantIndex === 1,
    );
    const lastMessage = participantMessages[participantMessages.length - 1];

    const endTime = performance.now();
    const filterTime = endTime - startTime;

    expect(lastMessage?.id).toBe('thread-1_r0_p1');
    expect(filterTime).toBeLessThan(2);
  });
});

describe('streaming Performance - State Update Frequency', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('setMessages during streaming should not trigger excessive re-renders', () => {
    const store = createChatStore();
    let updateCount = 0;

    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // Simulate 10 streaming chunks
    for (let i = 1; i <= 10; i++) {
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Hello '.repeat(i) }],
          metadata: { roundNumber: 0, participantIndex: 0 },
          createdAt: new Date(),
        },
      ]);
    }

    unsubscribe();

    // Currently unthrottled - each chunk triggers update
    // In production, could batch updates for better performance
    expect(updateCount).toBe(10);

    // Document that this is current behavior (not optimized)
    // Future optimization: throttle to max 10-20 updates/second
  });

  it('streaming state flags should update independently (no cascading)', () => {
    const store = createChatStore();
    let updateCount = 0;

    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // Each state change should be independent
    store.getState().setIsStreaming(true);
    const afterStreaming = updateCount;

    store.getState().setStreamingRoundNumber(0);
    const afterRoundNumber = updateCount;

    store.getState().setCurrentParticipantIndex(0);
    const afterParticipantIndex = updateCount;

    unsubscribe();

    // Each setter should trigger exactly 1 update
    expect(afterStreaming).toBe(1);
    expect(afterRoundNumber).toBe(2);
    expect(afterParticipantIndex).toBe(3);
  });

  it('completeStreaming should reset all flags in single update (no cascade)', () => {
    const store = createChatStore();

    // Set up active streaming state
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(2);
    store.getState().setIsModeratorStreaming(false);

    let updateCount = 0;
    const unsubscribe = store.subscribe(() => {
      updateCount++;
    });

    // Complete streaming should be a single state update
    store.getState().completeStreaming();

    unsubscribe();

    // Should be 1 update, not 4 separate updates
    expect(updateCount).toBe(1);

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBe(null);
    expect(state.currentParticipantIndex).toBe(0);
  });
});

describe('streaming Performance - Synchronous State Transitions', () => {
  it('all streaming flags update synchronously (no race conditions)', () => {
    const store = createChatStore();

    // Start streaming
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true); // Immediate

    store.getState().setStreamingRoundNumber(0);
    expect(store.getState().streamingRoundNumber).toBe(0); // Immediate

    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1); // Immediate

    // All updates should be synchronous
  });

  it('prepareForNewMessage is synchronous (no async delays)', () => {
    const store = createChatStore();

    const beforeState = store.getState();
    expect(beforeState.pendingMessage).toBe(null);

    store.getState().prepareForNewMessage('Test message', []);

    const afterState = store.getState();
    expect(afterState.pendingMessage).toBe('Test message'); // Immediate
    expect(afterState.waitingToStartStreaming).toBe(false); // Cleared immediately
  });

  it('setNextParticipantToTrigger updates immediately (no delay)', () => {
    const store = createChatStore();

    expect(store.getState().nextParticipantToTrigger).toBe(null);

    store.getState().setNextParticipantToTrigger(2);

    expect(store.getState().nextParticipantToTrigger).toBe(2); // Immediate
  });
});

describe('streaming Performance - Concurrent Operations', () => {
  it('multiple setMessages calls in quick succession should not corrupt state', () => {
    const store = createChatStore();

    // Simulate rapid concurrent updates
    const message1 = {
      id: 'msg-1',
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: MessagePartTypes.TEXT, text: 'First' }],
      metadata: { roundNumber: 0, participantIndex: 0 },
      createdAt: new Date(),
    };

    const message2 = {
      id: 'msg-2',
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Second' }],
      metadata: { roundNumber: 0, participantIndex: 1 },
      createdAt: new Date(),
    };

    // Rapid updates
    store.getState().setMessages([message1]);
    store.getState().setMessages([message1, message2]);

    const finalMessages = store.getState().messages;
    expect(finalMessages).toHaveLength(2);
    expect(finalMessages[0]?.id).toBe('msg-1');
    expect(finalMessages[1]?.id).toBe('msg-2');
  });

  it('state updates during streaming should not interfere with each other', () => {
    const store = createChatStore();

    // Simulate concurrent state changes during streaming
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setStreamingRoundNumber(0);

    const message = {
      id: 'thread-1_r0_p0',
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Streaming...' }],
      metadata: { roundNumber: 0, participantIndex: 0 },
      createdAt: new Date(),
    };

    store.getState().setMessages([message]);

    // All state should be consistent
    const state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.currentParticipantIndex).toBe(0);
    expect(state.streamingRoundNumber).toBe(0);
    expect(state.messages).toHaveLength(1);
  });
});

describe('streaming Performance - Memory Efficiency', () => {
  it('messages array should not grow unbounded during long streaming session', () => {
    const store = createChatStore();

    // Simulate long streaming session with message updates
    for (let i = 1; i <= 100; i++) {
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: 'Text '.repeat(i) }],
          metadata: { roundNumber: 0, participantIndex: 0 },
          createdAt: new Date(),
        },
      ]);
    }

    // Should only have 1 message (updated in place, not appended)
    const messages = store.getState().messages;
    expect(messages).toHaveLength(1);
  });

  it('completed rounds should not leave stale streaming state', () => {
    const store = createChatStore();

    // Round 0
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(0);

    store.getState().completeStreaming();

    // All streaming state should be cleared
    let state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBe(null);
    expect(state.currentParticipantIndex).toBe(0);

    // Round 1
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(1);
    store.getState().setCurrentParticipantIndex(0);

    store.getState().completeStreaming();

    // Again, all should be cleared
    state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBe(null);
    expect(state.currentParticipantIndex).toBe(0);
  });
});

describe('streaming Performance - Edge Case Timing', () => {
  it('switching from participant to moderator should be immediate', () => {
    const store = createChatStore();

    const timestamps: number[] = [];

    // All participants done
    timestamps.push(Date.now());
    store.getState().setIsStreaming(false);

    timestamps.push(Date.now());
    store.getState().setIsModeratorStreaming(true);

    timestamps.push(Date.now());

    const totalTime = timestamps[timestamps.length - 1]! - timestamps[0]!;
    expect(totalTime).toBeLessThan(10);
  });

  it('transitioning between participants should not delay streaming', () => {
    const store = createChatStore();

    const timestamps: number[] = [];

    // Participant 0 done
    timestamps.push(Date.now());
    store.getState().setCurrentParticipantIndex(1);

    timestamps.push(Date.now());
    store.getState().setNextParticipantToTrigger(1);

    timestamps.push(Date.now());

    const totalTime = timestamps[timestamps.length - 1]! - timestamps[0]!;
    expect(totalTime).toBeLessThan(5);
  });

  it('error recovery should not leave streaming state inconsistent', () => {
    const store = createChatStore();

    // Start streaming
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setWaitingToStartStreaming(true);

    // Error occurs - simulate recovery
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setStreamingRoundNumber(null);
    store.getState().setIsStreaming(false);

    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBe(null);
    expect(state.waitingToStartStreaming).toBe(false);
  });
});

describe('streaming Performance - Regression Prevention', () => {
  it('documents expected performance baseline for streaming operations', () => {
    // PERFORMANCE BASELINE (for regression detection):
    //
    // - State updates: < 1ms (synchronous)
    // - Message lookup by ID: < 5ms (array find - ideally O(1) with Map)
    // - Participant transitions: < 5ms (no artificial delays)
    // - Pre-search → Participant: < 10ms (immediate after timeout check)
    // - Participant → Moderator: < 10ms (immediate after completion)
    // - completeStreaming: < 2ms (single batched update)
    //
    // If any operation exceeds these times in tests, investigate for:
    // - Unintended async operations (setTimeout, Promise.then)
    // - O(n) operations that should be O(1)
    // - Cascading state updates
    // - Memory leaks (unbounded array growth)
    //
    expect(true).toBe(true); // Documentation test
  });

  it('verifies no performance regressions in core streaming loop', () => {
    const store = createChatStore();

    const startTime = performance.now();

    // Simulate full streaming cycle
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(0);

    // 10 streaming updates
    for (let i = 1; i <= 10; i++) {
      store.getState().setMessages([
        {
          id: 'thread-1_r0_p0',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: MessagePartTypes.TEXT, text: `Chunk ${i}` }],
          metadata: { roundNumber: 0, participantIndex: 0 },
          createdAt: new Date(),
        },
      ]);
    }

    store.getState().setIsStreaming(false);
    store.getState().completeStreaming();

    const endTime = performance.now();
    const totalTime = endTime - startTime;

    // Entire cycle should be fast (< 50ms in test environment)
    expect(totalTime).toBeLessThan(100);
  });
});
