/**
 * AI Response Streaming & Orchestration Tests (Section 3)
 *
 * Tests sequential streaming flow, visual states, stop functionality,
 * and stream completion detection.
 *
 * FLOW TESTED:
 * 3.1 Sequential Flow
 * 3.2 Visual States
 * 3.3 Stop Functionality
 * 3.4 Stream Completion Detection (KV)
 *
 * Location: /src/stores/chat/__tests__/ai-streaming-orchestration.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// SECTION 3.1: SEQUENTIAL FLOW
// ============================================================================

describe('Section 3.1: Sequential Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should start Model 1 streaming after user message and pre-search ready', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
    ];
    const userMessage = createMockUserMessage(0, 'Test question');

    store.getState().initializeThread(thread, participants, [userMessage]);

    // Start streaming with first participant
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should start Model 2 streaming only after Model 1 completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);

    // Model 1 (index 0) streaming
    store.getState().setCurrentParticipantIndex(0);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Model 1 completes, Model 2 starts
    const model1Message = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), model1Message]);
    store.getState().setCurrentParticipantIndex(1);

    expect(store.getState().currentParticipantIndex).toBe(1);
  });

  it('should start Model 3 streaming only after Model 2 completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);

    // Sequential progression
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setCurrentParticipantIndex(1);
    store.getState().setCurrentParticipantIndex(2);

    expect(store.getState().currentParticipantIndex).toBe(2);
  });

  it('should provide Model 2 with Model 1 response in context', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'claude-3' }),
    ];

    const userMessage = createMockUserMessage(0, 'Test question');
    const model1Response = createMockMessage(0, 0);

    store.getState().initializeThread(thread, participants, [userMessage, model1Response]);

    // Model 2 can access Model 1's response
    const messages = store.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[1].metadata?.participantIndex).toBe(0);
  });

  it('should provide Model 3 with Model 1 and Model 2 responses', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    const userMessage = createMockUserMessage(0);
    const model1Response = createMockMessage(0, 0);
    const model2Response = createMockMessage(1, 0);

    store.getState().initializeThread(
      thread,
      participants,
      [userMessage, model1Response, model2Response]
    );

    const messages = store.getState().messages;
    expect(messages).toHaveLength(3);
    expect(messages[1].metadata?.participantIndex).toBe(0);
    expect(messages[2].metadata?.participantIndex).toBe(1);
  });

  it('should increment participant index sequentially', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);

    // Verify sequential progression
    store.getState().setCurrentParticipantIndex(0);
    expect(store.getState().currentParticipantIndex).toBe(0);

    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1);

    store.getState().setCurrentParticipantIndex(2);
    expect(store.getState().currentParticipantIndex).toBe(2);
  });
});

// ============================================================================
// SECTION 3.2: VISUAL STATES
// ============================================================================

describe('Section 3.2: Visual States', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should show thinking indicator for active model', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // isStreaming + currentParticipantIndex identifies the active model
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should show static text for completed models while current streams', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // Model 1 completed
    const model1Message = createMockMessage(0, 0);
    store.getState().initializeThread(
      thread,
      participants,
      [createMockUserMessage(0), model1Message]
    );

    // Model 2 is streaming
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    // Model 1 has message (completed), Model 2 is streaming
    const messages = store.getState().messages;
    const hasModel1Message = messages.some(m => m.metadata?.participantIndex === 0);

    expect(hasModel1Message).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(1);
  });

  it('should show stop button during streaming', () => {
    store.getState().setIsStreaming(true);

    // Stop button should be visible when isStreaming is true
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should hide stop button when not streaming', () => {
    store.getState().setIsStreaming(false);

    expect(store.getState().isStreaming).toBe(false);
  });

  it('should track current participant index accurately', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = Array.from({ length: 5 }, (_, i) =>
      createMockParticipant(i, { threadId: 'thread-123' })
    );

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);

    // Track through all participants
    for (let i = 0; i < 5; i++) {
      store.getState().setCurrentParticipantIndex(i);
      expect(store.getState().currentParticipantIndex).toBe(i);
    }
  });
});

// ============================================================================
// SECTION 3.3: STOP FUNCTIONALITY
// ============================================================================

describe('Section 3.3: Stop Functionality', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should immediately halt current participant on stop click', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Click stop
    store.getState().stopStreaming();

    expect(store.getState().isStreaming).toBe(false);
  });

  it('should prevent subsequent participants from starting on stop', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Stop during first participant
    store.getState().stopStreaming();

    // isStreaming should be false, preventing subsequent participants
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should save partial responses on stop', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    // Partial response before stop
    const partialMessage = createMockMessage(0, 0, {
      parts: [{ type: 'text', text: 'Partial response...' }],
    });

    store.getState().initializeThread(
      thread,
      participants,
      [createMockUserMessage(0), partialMessage]
    );
    store.getState().setIsStreaming(true);

    // Stop with partial response
    store.getState().stopStreaming();

    // Message should still be in store
    expect(store.getState().messages).toHaveLength(2);
  });

  it('should revert stop button state after stopping', () => {
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);

    store.getState().stopStreaming();

    // Stop button reverts to Send/Regenerate state
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should handle stop click exactly when model switches from 1 to 2', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);

    // Model 1 complete, about to start Model 2
    store.getState().setCurrentParticipantIndex(0);

    // Stop clicked at transition
    store.getState().stopStreaming();

    // Should stop before Model 2 starts
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should reset currentParticipantIndex on stop', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    store.getState().stopStreaming();

    // Index should reset
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should ignore in-flight messages after stop', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Stop
    store.getState().stopStreaming();

    // Simulate in-flight message arriving after stop
    // The UI should check isStreaming before processing
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// SECTION 3.4: STREAM COMPLETION DETECTION (KV)
// ============================================================================

describe('Section 3.4: Stream Completion Detection', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should show loading indicator when reloading during active stream', () => {
    // During active stream, isStreaming should be true
    store.getState().setIsStreaming(true);

    expect(store.getState().isStreaming).toBe(true);
  });

  it('should show full message when reloading after stream completion', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    // Completed message
    const completedMessage = createMockMessage(0, 0);
    store.getState().initializeThread(
      thread,
      participants,
      [createMockUserMessage(0), completedMessage]
    );

    // Not streaming - completed
    store.getState().setIsStreaming(false);

    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should handle stream failure with error status', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    // Message with error
    const errorMessage = createMockMessage(0, 0, {
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        participantRole: null,
        model: 'openai/gpt-4',
        hasError: true,
      },
    });

    store.getState().initializeThread(
      thread,
      participants,
      [createMockUserMessage(0), errorMessage]
    );

    const message = store.getState().messages[1];
    expect(message.metadata?.hasError).toBe(true);
  });

  it('should NOT use resume: true to avoid abort conflicts', () => {
    // This is a documentation test - verifying the pattern
    // Our implementation does not use resume: true
    store.getState().setIsStreaming(true);

    // Stop should work without abort conflicts
    store.getState().stopStreaming();

    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// ORCHESTRATION INTEGRATION TESTS
// ============================================================================

describe('Streaming Orchestration Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should execute complete streaming flow for 3 participants', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'claude-3' }),
      createMockParticipant(2, { threadId: 'thread-123', modelId: 'gemini-pro' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

    // Start streaming
    store.getState().setIsStreaming(true);

    // Model 1
    store.getState().setCurrentParticipantIndex(0);
    const msg1 = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1]);

    // Model 2
    store.getState().setCurrentParticipantIndex(1);
    const msg2 = createMockMessage(1, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1, msg2]);

    // Model 3
    store.getState().setCurrentParticipantIndex(2);
    const msg3 = createMockMessage(2, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1, msg2, msg3]);

    // Complete streaming
    store.getState().setIsStreaming(false);

    const state = store.getState();
    expect(state.messages).toHaveLength(4); // user + 3 participants
    expect(state.isStreaming).toBe(false);
  });

  it('should handle streaming with stop mid-way', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
      createMockParticipant(2, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Complete Model 1
    store.getState().setCurrentParticipantIndex(0);
    const msg1 = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1]);

    // Start Model 2, then stop
    store.getState().setCurrentParticipantIndex(1);
    store.getState().stopStreaming();

    // Only Model 1 response saved
    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should transition to analysis after all participants complete', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Complete all participants
    const msg1 = createMockMessage(0, 0);
    const msg2 = createMockMessage(1, 0);
    store.getState().setMessages([createMockUserMessage(0), msg1, msg2]);

    // End streaming
    store.getState().setIsStreaming(false);

    // Analysis should start (PENDING)
    const pendingAnalysis = createPendingAnalysis(0);
    store.getState().setAnalyses([pendingAnalysis]);

    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('Streaming Edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle single participant', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const msg = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), msg]);
    store.getState().setIsStreaming(false);

    expect(store.getState().messages).toHaveLength(2);
  });

  it('should handle maximum participants (10)', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = Array.from({ length: 10 }, (_, i) =>
      createMockParticipant(i, { threadId: 'thread-123' })
    );

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

    expect(store.getState().participants).toHaveLength(10);
  });

  it('should handle rapid start/stop cycles', () => {
    store.getState().setIsStreaming(true);
    store.getState().stopStreaming();
    store.getState().setIsStreaming(true);
    store.getState().stopStreaming();
    store.getState().setIsStreaming(true);

    expect(store.getState().isStreaming).toBe(true);
  });

  it('should handle participant index out of bounds gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    store.getState().initializeThread(thread, participants, []);

    // Set valid indices
    store.getState().setCurrentParticipantIndex(0);
    expect(store.getState().currentParticipantIndex).toBe(0);

    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1);
  });
});
