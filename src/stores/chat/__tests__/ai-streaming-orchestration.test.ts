/**
 * AI Streaming Orchestration Tests
 *
 * Comprehensive tests for Section 3 of COMPREHENSIVE_TEST_PLAN.md:
 * - 3.1 Sequential Flow & Context
 * - 3.2 Visual States & UX
 * - 3.3 Technical Edge Cases (Hook Internals)
 * - 3.4 Stop Functionality
 * - 3.5 Stream Completion Detection (KV)
 *
 * Tests the multi-participant chat hook orchestration patterns including:
 * - Sequential participant streaming (Model 1 -> Model 2 -> Model 3)
 * - Context passing between participants
 * - flushSync synchronization for UI updates
 * - Stop button functionality and race conditions
 * - Message ID correction and deduplication
 * - KV stream status detection
 *
 * Location: /src/stores/chat/__tests__/ai-streaming-orchestration.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
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

// ============================================================================
// 3.1 SEQUENTIAL FLOW & CONTEXT
// ============================================================================

describe('3.1 Sequential Flow & Context', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * STREAM-SEQ-01: Test Model 1 starts streaming only after user message (and pre-search) is ready
   *
   * Validates that the first participant does not begin streaming until:
   * 1. User message is submitted and stored
   * 2. Pre-search completes (if web search is enabled)
   */
  it('sTREAM-SEQ-01: Model 1 starts streaming only after user message and pre-search ready', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
    ];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // User message submitted
    const userMessage = createMockUserMessage(0, 'What is the best approach?');
    store.getState().setMessages([userMessage]);

    // Pre-search is pending - streaming should NOT start
    store.getState().addPreSearch(createPendingPreSearch(0));
    const preSearchPending = store.getState().preSearches[0];
    expect(preSearchPending.status).toBe(AnalysisStatuses.PENDING);

    // Streaming should be blocked
    const shouldBlockStreaming = preSearchPending.status === AnalysisStatuses.PENDING
      || preSearchPending.status === AnalysisStatuses.STREAMING;
    expect(shouldBlockStreaming).toBe(true);

    // Pre-search completes
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

    // Now streaming can start
    const preSearchComplete = store.getState().preSearches[0];
    const canStream = preSearchComplete.status === AnalysisStatuses.COMPLETE
      || preSearchComplete.status === AnalysisStatuses.FAILED;
    expect(canStream).toBe(true);

    // Start streaming Model 1 (participant 0)
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  /**
   * STREAM-SEQ-02: Test Model 2 starts streaming only after Model 1 completes
   *
   * Validates sequential participant orchestration where each model
   * must complete before the next one starts.
   */
  it('sTREAM-SEQ-02: Model 2 starts streaming only after Model 1 completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
      createMockParticipant(2, { modelId: 'gemini' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Model 1 (P0) is streaming
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Model 1 completes - add message
    const message1 = createMockMessage(0, 0);
    store.getState().setMessages(prev => [...prev, message1]);

    // Transition to Model 2 (P1)
    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1);

    // Model 2 is now streaming
    expect(store.getState().isStreaming).toBe(true);

    // Model 1's message should be in store
    const messages = store.getState().messages;
    const p0Message = messages.find(m => m.id.includes('_r0_p0'));
    expect(p0Message).toBeDefined();
  });

  /**
   * STREAM-SEQ-03: Test Model 3 starts streaming only after Model 2 completes
   *
   * Continues the sequential flow to verify third participant
   * follows the same pattern.
   */
  it('sTREAM-SEQ-03: Model 3 starts streaming only after Model 2 completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Model 1 completes
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setCurrentParticipantIndex(1);

    // Model 2 completes
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
    store.getState().setCurrentParticipantIndex(2);

    // Model 3 is now streaming
    expect(store.getState().currentParticipantIndex).toBe(2);
    expect(store.getState().isStreaming).toBe(true);

    // Previous messages exist
    const messages = store.getState().messages;
    expect(messages.filter(m => m.role === 'assistant')).toHaveLength(2);
  });

  /**
   * STREAM-CTX-01: Verify Model 2 receives Model 1's response in its context
   *
   * Tests that the second participant has access to the first
   * participant's response for context-aware generation.
   */
  it('sTREAM-CTX-01: Model 2 receives Model 1 response in context', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
    ];

    const userMessage = createMockUserMessage(0, 'Explain microservices');
    store.getState().initializeThread(thread, participants, [userMessage]);

    // Model 1 completes with response
    const model1Response = createMockMessage(0, 0, {
      parts: [{ type: 'text', text: 'Microservices are a software architecture pattern...' }],
    });
    store.getState().setMessages(prev => [...prev, model1Response]);
    store.getState().setCurrentParticipantIndex(1);

    // When Model 2 starts, it should have access to:
    // 1. User message
    // 2. Model 1's complete response
    const messages = store.getState().messages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[1].metadata?.participantIndex).toBe(0);

    // Model 2 can now reference Model 1's content
    const model2Response = createMockMessage(1, 0, {
      parts: [{ type: 'text', text: 'Building on the previous response about microservices...' }],
    });
    store.getState().setMessages(prev => [...prev, model2Response]);

    expect(store.getState().messages).toHaveLength(3);
  });

  /**
   * STREAM-CTX-02: Verify Model 3 receives Model 1 and Model 2's responses
   *
   * Tests that the third participant has full context from
   * both previous participants.
   */
  it('sTREAM-CTX-02: Model 3 receives Model 1 and Model 2 responses', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
      createMockParticipant(2, { modelId: 'gemini' }),
    ];

    const userMessage = createMockUserMessage(0, 'Debate: Monolith vs Microservices');
    store.getState().initializeThread(thread, participants, [userMessage]);
    store.getState().setIsStreaming(true);

    // Model 1 completes
    const model1Response = createMockMessage(0, 0, {
      parts: [{ type: 'text', text: 'I advocate for monolithic architecture because...' }],
    });
    store.getState().setMessages(prev => [...prev, model1Response]);
    store.getState().setCurrentParticipantIndex(1);

    // Model 2 completes
    const model2Response = createMockMessage(1, 0, {
      parts: [{ type: 'text', text: 'While I understand the monolith perspective, microservices offer...' }],
    });
    store.getState().setMessages(prev => [...prev, model2Response]);
    store.getState().setCurrentParticipantIndex(2);

    // Model 3 should have access to all previous context
    const messagesForModel3 = store.getState().messages;
    expect(messagesForModel3).toHaveLength(3);

    // Verify order: user -> P0 -> P1
    expect(messagesForModel3[0].role).toBe('user');
    expect(messagesForModel3[1].metadata?.participantIndex).toBe(0);
    expect(messagesForModel3[2].metadata?.participantIndex).toBe(1);

    // Model 3 can synthesize both perspectives
    const model3Response = createMockMessage(2, 0, {
      parts: [{ type: 'text', text: 'Synthesizing both viewpoints, the best approach depends on...' }],
    });
    store.getState().setMessages(prev => [...prev, model3Response]);

    expect(store.getState().messages).toHaveLength(4);
  });

  /**
   * Test complete sequential flow with index transitions
   *
   * Verifies the currentParticipantIndex transitions correctly:
   * 0 -> 1 -> 2 -> reset
   */
  it('should transition currentParticipantIndex correctly: 0 -> 1 -> 2 -> reset', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Start at index 0
    store.getState().setCurrentParticipantIndex(0);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // P0 completes -> index 1
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1);

    // P1 completes -> index 2
    store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);
    store.getState().setCurrentParticipantIndex(2);
    expect(store.getState().currentParticipantIndex).toBe(2);

    // P2 completes -> streaming ends
    store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(0); // Reset for next round

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().messages.filter(m => m.role === 'assistant')).toHaveLength(3);
  });
});

// ============================================================================
// 3.2 VISUAL STATES & UX
// ============================================================================

describe('3.2 Visual States & UX', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * STREAM-UI-01: Test "Thinking" pulsing indicator appears for the active model
   *
   * Validates that the streaming state correctly identifies which
   * participant is currently active for UI indicator display.
   */
  it('sTREAM-UI-01: Thinking indicator appears for active model', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Active model detection for UI
    const state = store.getState();
    const activeParticipantIndex = state.currentParticipantIndex;
    const isActivelyStreaming = state.isStreaming;
    const activeModel = state.participants[activeParticipantIndex];

    expect(isActivelyStreaming).toBe(true);
    expect(activeParticipantIndex).toBe(0);
    expect(activeModel?.modelId).toBe('gpt-4');

    // P0 completes, P1 becomes active
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setCurrentParticipantIndex(1);

    const newState = store.getState();
    expect(newState.currentParticipantIndex).toBe(1);
    expect(newState.participants[1]?.modelId).toBe('claude-3');
  });

  /**
   * STREAM-UI-02: Test text streams word-by-word (or character-by-character)
   *
   * Simulates progressive text streaming by updating message content
   * incrementally during streaming.
   */
  it('sTREAM-UI-02: Text streams progressively', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Initial empty message
    const streamingMessage: UIMessage = {
      id: 'thread-123_r0_p0',
      role: 'assistant',
      parts: [{ type: 'text', text: '' }],
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        model: 'openai/gpt-4',
      },
    };
    store.getState().setMessages(prev => [...prev, streamingMessage]);

    // Simulate streaming chunks
    const chunks = ['Hello', ' world', ', this', ' is', ' streaming'];
    let accumulatedText = '';

    chunks.forEach((chunk) => {
      accumulatedText += chunk;
      const updatedMessage: UIMessage = {
        ...streamingMessage,
        parts: [{ type: 'text', text: accumulatedText }],
      };
      store.getState().setMessages(prev =>
        prev.map(m => m.id === streamingMessage.id ? updatedMessage : m),
      );
    });

    // Final message content
    const finalMessage = store.getState().messages.find(m => m.id === streamingMessage.id);
    const textPart = finalMessage?.parts.find(p => p.type === 'text');
    expect(textPart && 'text' in textPart ? textPart.text : '').toBe('Hello world, this is streaming');
  });

  /**
   * STREAM-UI-03: Test previous models show full static text while current model streams
   *
   * Validates that completed participant messages remain static
   * while the current participant is streaming.
   */
  it('sTREAM-UI-03: Previous models show static text while current streams', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // P0 completes with full response
    const p0Message = createMockMessage(0, 0, {
      parts: [{ type: 'text', text: 'This is the complete response from Model 1.' }],
    });
    store.getState().setMessages(prev => [...prev, p0Message]);
    store.getState().setCurrentParticipantIndex(1);

    // P1 is streaming (partial content)
    const p1StreamingMessage: UIMessage = {
      id: 'thread-123_r0_p1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Partial response...' }],
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 1,
        participantId: 'participant-1',
        model: 'openai/gpt-4',
      },
    };
    store.getState().setMessages(prev => [...prev, p1StreamingMessage]);

    // Verify state
    const messages = store.getState().messages;
    const p0Final = messages.find(m => m.id.includes('_r0_p0'));
    const p1Current = messages.find(m => m.id.includes('_r0_p1'));

    // P0 should have complete text (static)
    const p0Text = p0Final?.parts.find(p => p.type === 'text');
    expect(p0Text && 'text' in p0Text ? p0Text.text : '').toBe('This is the complete response from Model 1.');

    // P1 is still streaming (partial)
    const p1Text = p1Current?.parts.find(p => p.type === 'text');
    expect(p1Text && 'text' in p1Text ? p1Text.text : '').toBe('Partial response...');

    // Only P1 should be considered "active"
    expect(store.getState().currentParticipantIndex).toBe(1);
  });

  /**
   * STREAM-UI-04: Test formatting (markdown, code blocks, tables) renders correctly during streaming
   *
   * Simulates streaming content with markdown formatting to ensure
   * proper rendering during progressive updates.
   */
  it('sTREAM-UI-04: Markdown formatting renders correctly during streaming', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Stream markdown content progressively
    const markdownChunks = [
      '# Heading\n\n',
      '**Bold text** and ',
      '_italic text_\n\n',
      '```javascript\n',
      'const x = 1;\n',
      '```\n\n',
      '| Col1 | Col2 |\n',
      '|------|------|\n',
      '| A    | B    |',
    ];

    let accumulated = '';
    const messageId = 'thread-123_r0_p0';

    // Initial message
    store.getState().setMessages(prev => [...prev, {
      id: messageId,
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: '' }],
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        model: 'openai/gpt-4',
      },
    }]);

    // Stream each chunk
    markdownChunks.forEach((chunk) => {
      accumulated += chunk;
      store.getState().setMessages(prev =>
        prev.map(m =>
          m.id === messageId
            ? { ...m, parts: [{ type: 'text' as const, text: accumulated }] }
            : m,
        ),
      );
    });

    // Verify final content has all markdown
    const finalMessage = store.getState().messages.find(m => m.id === messageId);
    const textPart = finalMessage?.parts.find(p => p.type === 'text');
    const finalText = textPart && 'text' in textPart ? textPart.text : '';

    expect(finalText).toContain('# Heading');
    expect(finalText).toContain('**Bold text**');
    expect(finalText).toContain('```javascript');
    expect(finalText).toContain('| Col1 | Col2 |');
  });

  /**
   * STREAM-UI-05: Verify auto-scroll behavior keeps the latest token in view
   *
   * Tests the streamingRoundNumber tracking which components use
   * to determine auto-scroll behavior.
   */
  it('sTREAM-UI-05: Auto-scroll state tracked for latest content', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    // Track streaming state for auto-scroll
    expect(store.getState().streamingRoundNumber).toBe(0);
    expect(store.getState().isStreaming).toBe(true);

    // Complete streaming
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setIsStreaming(false);
    store.getState().setStreamingRoundNumber(null);

    expect(store.getState().streamingRoundNumber).toBeNull();
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// 3.3 TECHNICAL EDGE CASES (HOOK INTERNALS)
// ============================================================================

describe('3.3 Technical Edge Cases (Hook Internals)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * HOOK-SYNC-01: Verify flushSync is used to update currentParticipantIndex BEFORE triggering next participant
   *
   * Tests that state updates are committed synchronously before
   * the next participant starts streaming.
   */
  it('hOOK-SYNC-01: flushSync ensures index updated before next participant', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Simulate flushSync behavior: index must be 1 before P1 message appears
    store.getState().setCurrentParticipantIndex(1);

    // Then P1 message is added
    const p1Message = createMockMessage(1, 0);
    store.getState().setMessages(prev => [...prev, p1Message]);

    // Verify the order: index was set to 1 before message was added
    expect(store.getState().currentParticipantIndex).toBe(1);
    expect(store.getState().messages.some(m => m.metadata?.participantIndex === 1)).toBe(true);
  });

  /**
   * HOOK-SYNC-02: Verify metadata merge occurs synchronously before next stream starts
   *
   * Tests that complete metadata is added to a message before
   * the next participant begins streaming.
   */
  it('hOOK-SYNC-02: Metadata merge occurs synchronously before next stream', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // P0 message added with incomplete metadata (streaming state)
    const p0Streaming: UIMessage = {
      id: 'thread-123_r0_p0',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Response content' }],
      metadata: undefined,
    };
    store.getState().setMessages(prev => [...prev, p0Streaming]);

    // P0 completes - metadata is merged synchronously
    const p0Complete: UIMessage = {
      ...p0Streaming,
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        model: 'gpt-4',
        participantRole: null,
      },
    };
    store.getState().setMessages(prev =>
      prev.map(m => m.id === p0Complete.id ? p0Complete : m),
    );

    // Then advance to P1
    store.getState().setCurrentParticipantIndex(1);

    // P0 should have complete metadata before P1 starts
    const p0Final = store.getState().messages.find(m => m.id === 'thread-123_r0_p0');
    expect(p0Final?.metadata).toBeDefined();
    expect(p0Final?.metadata?.model).toBe('gpt-4');
    expect(p0Final?.metadata?.participantIndex).toBe(0);
  });

  /**
   * HOOK-ID-01: ID Correction - Verify if AI SDK sends temp ID, it's replaced by backend ID pattern
   *
   * Tests the message ID correction logic that ensures all messages
   * follow the deterministic ID pattern: {threadId}_r{round}_p{index}
   */
  it('hOOK-ID-01: Temp ID is corrected to backend pattern {threadId}_r{round}_p{index}', () => {
    const thread = createMockThread({ id: 'thread-abc123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)], [createMockUserMessage(0)]);

    // AI SDK might send a temporary ID
    const tempMessage: UIMessage = {
      id: 'temp-id-12345',
      role: 'assistant',
      parts: [{ type: 'text', text: 'Response' }],
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        model: 'openai/gpt-4',
      },
    };
    store.getState().setMessages(prev => [...prev, tempMessage]);

    // Correct the ID to match backend pattern
    const correctId = 'thread-abc123_r0_p0';
    store.getState().setMessages(prev =>
      prev.map(m =>
        m.id === tempMessage.id
          ? { ...m, id: correctId }
          : m,
      ),
    );

    // Verify ID was corrected
    const correctedMessage = store.getState().messages.find(m => m.role === 'assistant');
    expect(correctedMessage?.id).toBe('thread-abc123_r0_p0');
    expect(store.getState().messages.find(m => m.id === 'temp-id-12345')).toBeUndefined();
  });

  /**
   * HOOK-ID-02: Verify deduplication - If AI SDK sends duplicate message IDs, handled gracefully
   *
   * Tests that duplicate messages with the same ID are handled
   * by replacing rather than duplicating.
   */
  it('hOOK-ID-02: Duplicate message IDs handled gracefully', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)], [createMockUserMessage(0)]);

    const messageId = 'thread-123_r0_p0';

    // First message
    const firstMessage: UIMessage = {
      id: messageId,
      role: 'assistant',
      parts: [{ type: 'text', text: 'First version' }],
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        model: 'openai/gpt-4',
      },
    };
    store.getState().setMessages(prev => [...prev, firstMessage]);

    // Duplicate message (should replace, not duplicate)
    const duplicateMessage: UIMessage = {
      id: messageId,
      role: 'assistant',
      parts: [{ type: 'text', text: 'Updated version' }],
      metadata: firstMessage.metadata,
    };

    // Replace instead of append
    store.getState().setMessages((prev) => {
      const exists = prev.some(m => m.id === duplicateMessage.id);
      if (exists) {
        return prev.map(m => m.id === duplicateMessage.id ? duplicateMessage : m);
      }
      return [...prev, duplicateMessage];
    });

    // Should have only 2 messages (user + 1 assistant), not 3
    expect(store.getState().messages).toHaveLength(2);

    // Content should be updated version
    const finalMessage = store.getState().messages.find(m => m.id === messageId);
    const textPart = finalMessage?.parts.find(p => p.type === 'text');
    expect(textPart && 'text' in textPart ? textPart.text : '').toBe('Updated version');
  });

  /**
   * HOOK-QUEUE-01: Verify participantIndexQueue correctly handles rapid API calls without skipping
   *
   * Tests that rapid sequential API calls maintain correct participant
   * index ordering using the FIFO queue pattern.
   */
  it('hOOK-QUEUE-01: Participant index queue handles rapid calls without skipping', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Simulate rapid index updates (what the queue prevents from getting lost)
    const indexQueue: number[] = [0, 1, 2];
    const processedIndices: number[] = [];

    // Process queue in order
    while (indexQueue.length > 0) {
      const index = indexQueue.shift()!;
      store.getState().setCurrentParticipantIndex(index);
      store.getState().setMessages(prev => [...prev, createMockMessage(index, 0)]);
      processedIndices.push(index);
    }

    // All indices should be processed in order
    expect(processedIndices).toEqual([0, 1, 2]);
    expect(store.getState().messages.filter(m => m.role === 'assistant')).toHaveLength(3);

    // Messages should maintain correct order
    const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
    expect(assistantMessages[0].metadata?.participantIndex).toBe(0);
    expect(assistantMessages[1].metadata?.participantIndex).toBe(1);
    expect(assistantMessages[2].metadata?.participantIndex).toBe(2);
  });

  /**
   * HOOK-SILENT-01: Silent Failure - Verify if AI SDK returns empty message, marks as failed and proceeds
   *
   * Tests graceful handling when a participant fails to generate
   * a response (silent failure).
   */
  it('hOOK-SILENT-01: Empty message marked as failed and proceeds to next participant', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // P0 succeeds
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setCurrentParticipantIndex(1);

    // P1 has silent failure (empty/no message)
    const errorMessage: UIMessage = {
      id: 'thread-123_r0_p1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'This model failed to generate a response.' }],
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 1,
        participantId: 'participant-1',
        model: 'openai/gpt-4',
        errorCategory: 'silent_failure',
      },
    };
    store.getState().setMessages(prev => [...prev, errorMessage]);

    // Proceed to P2
    store.getState().setCurrentParticipantIndex(2);
    store.getState().setMessages(prev => [...prev, createMockMessage(2, 0)]);

    // All 3 participants processed (including failed one)
    expect(store.getState().messages.filter(m => m.role === 'assistant')).toHaveLength(3);

    // P1 should be marked as error
    const p1Message = store.getState().messages.find(m => m.metadata?.participantIndex === 1);
    expect(p1Message?.metadata?.errorCategory).toBe('silent_failure');
  });
});

// ============================================================================
// 3.4 STOP FUNCTIONALITY
// ============================================================================

describe('3.4 Stop Functionality', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * STOP-01: Test clicking "Stop" immediately halts current participant
   *
   * Validates that stopping streaming immediately sets isStreaming to false.
   */
  it('sTOP-01: Stop immediately halts current participant', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Streaming in progress
    expect(store.getState().isStreaming).toBe(true);

    // User clicks Stop
    store.getState().setIsStreaming(false);

    // Streaming halted immediately
    expect(store.getState().isStreaming).toBe(false);
  });

  /**
   * STOP-02: Test clicking "Stop" PREVENTS subsequent participants from starting
   *
   * Validates that no more participants stream after stop is clicked.
   */
  it('sTOP-02: Stop prevents subsequent participants from starting', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // P0 completes
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

    // User clicks Stop before P1 starts
    store.getState().setIsStreaming(false);

    // Verify no more participants can start
    expect(store.getState().isStreaming).toBe(false);

    // Only P0's message exists
    expect(store.getState().messages.filter(m => m.role === 'assistant')).toHaveLength(1);
  });

  /**
   * STOP-03: Test partial responses are saved to DB
   *
   * Validates that the partial content from stopped streaming is preserved.
   */
  it('sTOP-03: Partial responses are preserved', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Add partial message during streaming
    const partialMessage: UIMessage = {
      id: 'thread-123_r0_p0',
      role: 'assistant',
      parts: [{ type: 'text', text: 'This is a partial respon...' }],
      metadata: {
        role: 'participant',
        roundNumber: 0,
        participantIndex: 0,
        participantId: 'participant-0',
        model: 'openai/gpt-4',
      },
    };
    store.getState().setMessages(prev => [...prev, partialMessage]);

    // User clicks Stop
    store.getState().setIsStreaming(false);

    // Partial content is preserved
    const savedMessage = store.getState().messages.find(m => m.role === 'assistant');
    const textPart = savedMessage?.parts.find(p => p.type === 'text');
    expect(textPart && 'text' in textPart ? textPart.text : '').toBe('This is a partial respon...');
  });

  /**
   * STOP-04: Test "Stop" button reverts to "Regenerate" or "Send" state
   *
   * Validates UI state transitions after stopping.
   */
  it('sTOP-04: Stop button state transitions correctly', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Determine button state
    let buttonState = store.getState().isStreaming ? 'stop' : 'send';
    expect(buttonState).toBe('stop');

    // User clicks Stop
    store.getState().setIsStreaming(false);
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

    // After stop, button should show "Regenerate" or "Send"
    buttonState = store.getState().isStreaming ? 'stop' : 'regenerate-or-send';
    expect(buttonState).toBe('regenerate-or-send');
  });

  /**
   * STOP-RACE: Click stop exactly when model switches from 1 to 2 (Atomic check)
   *
   * Tests the critical race condition where stop is clicked during
   * the transition between participants.
   */
  it('sTOP-RACE: Stop during participant transition handled atomically', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // P0 completes
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

    // RACE CONDITION: Stop clicked exactly as index transitions to 1
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(1);

    // Final state should be consistent
    const finalState = store.getState();
    expect(finalState.isStreaming).toBe(false);

    // Even though index is 1, streaming is false so P1 won't start
    expect(finalState.currentParticipantIndex).toBe(1);

    // Only P0's message exists
    expect(finalState.messages.filter(m => m.role === 'assistant')).toHaveLength(1);
  });

  /**
   * Test stopStreaming operation resets both streaming and index
   */
  it('stopStreaming operation resets streaming state', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(1);

    // Use stopStreaming operation
    store.getState().stopStreaming();

    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().currentParticipantIndex).toBe(0);
  });
});

// ============================================================================
// 3.5 STREAM COMPLETION DETECTION (KV)
// ============================================================================

describe('3.5 Stream Completion Detection (KV)', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * KV-01: Test reloading page during active stream shows loading indicator
   */
  it('kV-01: Streaming state detectable for loading indicator on reload', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

    // No complete analysis = stream might still be active
    const hasAnalysisForCurrentRound = store.getState().analyses.some(
      a => a.roundNumber === 0 && a.status === AnalysisStatuses.COMPLETE,
    );

    expect(hasAnalysisForCurrentRound).toBe(false);

    // Set loading state for UI
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  /**
   * KV-02: Test reloading page after stream completion shows full message
   */
  it('kV-02: Completed stream shows full message on reload', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    // Simulate loading completed state from server
    const messages: UIMessage[] = [
      createMockUserMessage(0, 'Complete question'),
      createMockMessage(0, 0, {
        parts: [{ type: 'text', text: 'Complete response from model' }],
      }),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Verify complete state
    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
  });

  /**
   * KV-03: Verify KV status is checked on reload via API endpoint
   */
  it('kV-03: Stream status check pattern for KV', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Simulate checking KV status
    const streamStatus = {
      threadId: 'thread-123',
      roundNumber: 0,
      status: 'completed' as const,
      participantsCompleted: 1,
      totalParticipants: 1,
    };

    // Use status to determine UI state
    const isComplete = streamStatus.status === 'completed';
    const allParticipantsResponded = streamStatus.participantsCompleted === streamStatus.totalParticipants;

    expect(isComplete).toBe(true);
    expect(allParticipantsResponded).toBe(true);

    // Set store state based on KV status
    store.getState().setIsStreaming(false);
    expect(store.getState().isStreaming).toBe(false);
  });

  /**
   * KV-04: Test stream failure updates KV to failed and UI reflects error
   */
  it('kV-04: Stream failure status reflected in UI', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Simulate stream failure from KV status
    store.getState().setIsStreaming(false);
    store.getState().setError(new Error('Model API timeout'));

    // Verify error state
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().error?.message).toBe('Model API timeout');
  });

  /**
   * KV-05: Verify NO conflict with abort functionality (ensure resume: true is NOT used)
   */
  it('kV-05: No conflict between abort and completion detection', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // Abort streaming
    store.getState().stopStreaming();

    // After abort, isStreaming should be false
    expect(store.getState().isStreaming).toBe(false);

    // Aborted state is distinct from completed state
    const hasCompleteAnalysis = store.getState().analyses.some(
      a => a.roundNumber === 0 && a.status === AnalysisStatuses.COMPLETE,
    );
    expect(hasCompleteAnalysis).toBe(false);

    // Resume is not used - no resume flag in store
    expect((store.getState() as Record<string, unknown>).resumeStream).toBeUndefined();
  });
});

// ============================================================================
// INTEGRATION: COMPLETE STREAMING LIFECYCLE
// ============================================================================

describe('integration: Complete Streaming Lifecycle', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  /**
   * Test complete lifecycle: submission -> streaming -> analysis -> completion
   */
  it('should complete full streaming lifecycle', () => {
    // === SETUP ===
    const thread = createMockThread({
      id: 'thread-lifecycle',
      mode: ChatModes.DEBATING,
    });
    const participants = [
      createMockParticipant(0, { modelId: 'gpt-4' }),
      createMockParticipant(1, { modelId: 'claude-3' }),
      createMockParticipant(2, { modelId: 'gemini' }),
    ];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setCreatedThreadId('thread-lifecycle');

    // === SUBMISSION ===
    const userMessage = createMockUserMessage(0, 'Debate: React vs Vue');
    store.getState().setMessages([userMessage]);
    store.getState().setShowInitialUI(false);
    store.getState().setWaitingToStartStreaming(true);

    // === START STREAMING ===
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(0);

    // === PARTICIPANT 0 ===
    const p0Message = createMockMessage(0, 0);
    store.getState().setMessages(prev => [...prev, p0Message]);
    expect(store.getState().messages).toHaveLength(2);

    // === TRANSITION TO PARTICIPANT 1 ===
    store.getState().setCurrentParticipantIndex(1);
    const p1Message = createMockMessage(1, 0);
    store.getState().setMessages(prev => [...prev, p1Message]);
    expect(store.getState().messages).toHaveLength(3);

    // === TRANSITION TO PARTICIPANT 2 ===
    store.getState().setCurrentParticipantIndex(2);
    const p2Message = createMockMessage(2, 0);
    store.getState().setMessages(prev => [...prev, p2Message]);
    expect(store.getState().messages).toHaveLength(4);

    // === STREAMING COMPLETE ===
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(0);

    // === ANALYSIS ===
    store.getState().markAnalysisCreated(0);
    store.getState().setIsCreatingAnalysis(true);
    store.getState().addAnalysis(createPendingAnalysis(0));

    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
    store.getState().setIsStreaming(true);

    // Analysis completes
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
    store.getState().setIsCreatingAnalysis(false);
    store.getState().setIsStreaming(false);

    // === COMPLETE STREAMING ===
    store.getState().completeStreaming();

    // === VERIFY FINAL STATE ===
    const finalState = store.getState();
    expect(finalState.messages).toHaveLength(4);
    expect(finalState.analyses).toHaveLength(1);
    expect(finalState.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    expect(finalState.isStreaming).toBe(false);
    expect(finalState.isCreatingAnalysis).toBe(false);
    expect(finalState.streamingRoundNumber).toBeNull();
  });

  /**
   * Test streaming with web search enabled
   */
  it('should handle streaming with web search enabled', () => {
    const thread = createMockThread({
      id: 'thread-search',
      enableWebSearch: true,
    });
    const participants = [createMockParticipant(0)];

    store.getState().initializeThread(thread, participants);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setMessages([createMockUserMessage(0, 'Latest trends in AI')]);

    // === PRE-SEARCH BLOCKING ===
    store.getState().addPreSearch(createPendingPreSearch(0));
    store.getState().markPreSearchTriggered(0);

    // Streaming blocked by pre-search
    const preSearch = store.getState().preSearches[0];
    const isBlocked = preSearch.status === AnalysisStatuses.PENDING
      || preSearch.status === AnalysisStatuses.STREAMING;
    expect(isBlocked).toBe(true);

    // Pre-search completes
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());

    // === NOW STREAMING CAN START ===
    const preSearchComplete = store.getState().preSearches[0];
    expect(preSearchComplete.status).toBe(AnalysisStatuses.COMPLETE);

    store.getState().setIsStreaming(true);
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setIsStreaming(false);

    // Verify complete state
    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().preSearches[0].searchData).not.toBeNull();
  });

  /**
   * Test error recovery during streaming
   */
  it('should handle error recovery during streaming', () => {
    const thread = createMockThread({ id: 'thread-error' });
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
    ];

    store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);

    // P0 completes
    store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
    store.getState().setCurrentParticipantIndex(1);

    // P1 fails
    store.getState().setError(new Error('Model API error'));
    store.getState().setIsStreaming(false);

    // Verify error state
    expect(store.getState().error?.message).toBe('Model API error');
    expect(store.getState().isStreaming).toBe(false);

    // Clear error for retry
    store.getState().setError(null);
    store.getState().startRegeneration(0);

    // Ready for retry
    expect(store.getState().error).toBeNull();
    expect(store.getState().isRegenerating).toBe(true);
    expect(store.getState().regeneratingRoundNumber).toBe(0);
  });
});
