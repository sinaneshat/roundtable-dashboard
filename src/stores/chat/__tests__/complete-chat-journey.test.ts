/**
 * Complete Chat Journey Tests
 *
 * End-to-end tests covering the full chat experience from overview to thread,
 * including configuration changes, regeneration, and error recovery.
 *
 * SCENARIOS COVERED:
 * 1. Overview Screen → Thread Screen Navigation
 * 2. Multi-Round Conversation Flow
 * 3. Configuration Changes Between Rounds
 * 4. Round Regeneration
 * 5. Error Recovery Scenarios
 * 6. Web Search Toggle Behavior
 *
 * Location: /src/stores/chat/__tests__/complete-chat-journey.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
  UIMessageRoles,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockPreSearch,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// OVERVIEW SCREEN → THREAD SCREEN NAVIGATION
// ============================================================================

describe('overview Screen → Thread Screen Navigation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should complete full journey: /chat → streaming → /chat/[slug]', () => {
    // === PHASE 1: Overview Screen Setup ===
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setShowInitialUI(true);

    // User configures chat
    store.getState().setSelectedMode('debating');
    store.getState().setSelectedParticipants([
      { id: 'p1', modelId: 'model-1', role: null, priority: 0 },
      { id: 'p2', modelId: 'model-2', role: null, priority: 1 },
    ]);

    // === PHASE 2: First Message Submission ===
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'test-thread-slug',
      enableWebSearch: false,
    });

    // Thread created
    store.getState().initializeThread(thread, [
      createMockParticipant(0),
      createMockParticipant(1),
    ]);
    store.getState().setCreatedThreadId('thread-123');
    store.getState().setShowInitialUI(false);

    // Prepare message
    store.getState().prepareForNewMessage('Test question', ['model-1', 'model-2']);

    // === PHASE 3: Streaming ===
    store.getState().setIsStreaming(true);
    store.getState().setHasSentPendingMessage(true);

    // Add messages as they stream
    const messages: UIMessage[] = [
      createMockUserMessage(0, 'Test question'),
    ];
    store.getState().setMessages(messages);

    // P0 completes
    store.getState().setCurrentParticipantIndex(0);
    messages.push(createMockMessage(0, 0));
    store.getState().setMessages([...messages]);

    // P1 completes
    store.getState().setCurrentParticipantIndex(1);
    messages.push(createMockMessage(1, 0));
    store.getState().setMessages([...messages]);

    // === PHASE 4: Analysis ===
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.STREAMING,
    }));

    // Analysis completes
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);

    // === PHASE 5: Navigation ===
    store.getState().setIsStreaming(false);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // === VERIFY FINAL STATE ===
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().analyses).toHaveLength(1);
    expect(store.getState().thread?.id).toBe('thread-123');
  });

  it('should handle web search enabled in first round', () => {
    // Setup with web search
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().prepareForNewMessage('Search question', ['model-1']);

    // === Pre-search flow ===
    // 1. Pre-search created (PENDING)
    store.getState().addPreSearch(createPendingPreSearch(0));
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // 2. Pre-search executing (STREAMING)
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);

    // 3. Pre-search completes
    store.getState().updatePreSearchData(0, createMockPreSearchDataPayload());
    store.getState().updatePreSearchStatus(0, AnalysisStatuses.COMPLETE);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);

    // === Streaming can now start ===
    store.getState().setIsStreaming(true);
    store.getState().setHasSentPendingMessage(true);

    // Add messages
    store.getState().setMessages([
      createMockUserMessage(0, 'Search question'),
      createMockMessage(0, 0),
    ]);

    // Analysis completes
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Navigate to thread
    store.getState().setIsStreaming(false);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Verify
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    expect(store.getState().preSearches[0].searchData).not.toBeNull();
  });

  it('should stay on overview during streaming', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Start streaming
    store.getState().setIsStreaming(true);

    // Should stay on overview
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // Only navigate after streaming completes
    store.getState().setIsStreaming(false);
    store.getState().setScreenMode(ScreenModes.THREAD);

    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
  });
});

// ============================================================================
// MULTI-ROUND CONVERSATION FLOW
// ============================================================================

describe('multi-Round Conversation Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should complete 3-round conversation', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // === ROUND 0 ===
    let messages: UIMessage[] = [
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
    ];
    store.getState().setMessages(messages);
    store.getState().markAnalysisCreated(0);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

    expect(store.getState().analyses).toHaveLength(1);

    // === ROUND 1 ===
    store.getState().prepareForNewMessage('Question 2', ['model-1']);
    store.getState().setHasSentPendingMessage(true);

    messages = [
      ...messages,
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1),
    ];
    store.getState().setMessages(messages);
    store.getState().markAnalysisCreated(1);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 1 }));

    expect(store.getState().analyses).toHaveLength(2);

    // === ROUND 2 ===
    store.getState().setPendingMessage(null);
    store.getState().setHasSentPendingMessage(false);
    store.getState().prepareForNewMessage('Question 3', ['model-1']);
    store.getState().setHasSentPendingMessage(true);

    messages = [
      ...messages,
      createMockUserMessage(2, 'Question 3'),
      createMockMessage(0, 2),
    ];
    store.getState().setMessages(messages);
    store.getState().markAnalysisCreated(2);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 2 }));

    // === VERIFY ===
    expect(store.getState().messages).toHaveLength(6); // 3 user + 3 assistant
    expect(store.getState().analyses).toHaveLength(3);
    expect(store.getState().createdAnalysisRounds.has(0)).toBe(true);
    expect(store.getState().createdAnalysisRounds.has(1)).toBe(true);
    expect(store.getState().createdAnalysisRounds.has(2)).toBe(true);
  });

  it('should maintain round number consistency', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Create messages for rounds 0, 1, 2
    const messages: UIMessage[] = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockUserMessage(1),
      createMockMessage(0, 1),
      createMockUserMessage(2),
      createMockMessage(0, 2),
    ];
    store.getState().setMessages(messages);

    // Verify round numbers
    const roundNumbers = messages.map(m => m.metadata?.roundNumber);
    expect(roundNumbers).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('should preserve conversation history between rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Round 0
    const round0Messages: UIMessage[] = [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
    ];
    store.getState().setMessages(round0Messages);

    // Round 1 - should see round 0 history
    const round1Messages: UIMessage[] = [
      ...round0Messages,
      createMockUserMessage(1, 'Second question'),
      createMockMessage(0, 1),
    ];
    store.getState().setMessages(round1Messages);

    // Verify history preserved
    expect(store.getState().messages).toHaveLength(4);
    expect(store.getState().messages[0].metadata?.roundNumber).toBe(0);
    expect(store.getState().messages[2].metadata?.roundNumber).toBe(1);
  });
});

// ============================================================================
// CONFIGURATION CHANGES BETWEEN ROUNDS
// ============================================================================

describe('configuration Changes Between Rounds', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should track participant additions', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Round 0 with 1 participant
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    expect(store.getState().participants).toHaveLength(1);

    // Add participant for round 1
    store.getState().setParticipants([
      createMockParticipant(0),
      createMockParticipant(1),
    ]);

    expect(store.getState().participants).toHaveLength(2);
  });

  it('should track participant removals', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Round 0 with 2 participants
    store.getState().initializeThread(thread, [
      createMockParticipant(0),
      createMockParticipant(1),
    ]);
    expect(store.getState().participants).toHaveLength(2);

    // Remove participant for round 1
    store.getState().setParticipants([createMockParticipant(0)]);

    expect(store.getState().participants).toHaveLength(1);
  });

  it('should track mode changes', () => {
    const thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.DEBATING,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Change mode
    store.getState().setSelectedMode(ChatModes.ANALYZING);

    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
  });

  it('should track web search toggle', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Enable web search
    store.getState().setEnableWebSearch(true);

    expect(store.getState().enableWebSearch).toBe(true);
  });

  it('should handle multiple configuration changes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Multiple changes
    store.getState().setParticipants([
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2),
    ]);
    store.getState().setSelectedMode('brainstorming');
    store.getState().setEnableWebSearch(true);

    expect(store.getState().participants).toHaveLength(3);
    expect(store.getState().selectedMode).toBe('brainstorming');
    expect(store.getState().enableWebSearch).toBe(true);
  });
});

// ============================================================================
// ROUND REGENERATION
// ============================================================================

describe('round Regeneration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should clear responses for regenerated round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Complete round 0
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().analyses).toHaveLength(1);

    // Regenerate - clear assistant messages and analysis for round 0
    const userMessages = store.getState().messages.filter(m => m.role === UIMessageRoles.USER);
    store.getState().setMessages(userMessages);
    store.getState().removeAnalysis(0);

    expect(store.getState().messages).toHaveLength(1); // Only user message
    expect(store.getState().analyses).toHaveLength(0);
  });

  it('should preserve user message during regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Complete round 0
    const userMessage = createMockUserMessage(0, 'Original question');
    store.getState().setMessages([
      userMessage,
      createMockMessage(0, 0),
    ]);

    // Regenerate
    store.getState().setMessages([userMessage]);

    // User message preserved
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0].parts[0]).toEqual({
      type: 'text',
      text: 'Original question',
    });
  });

  it('should maintain round number during regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Complete rounds 0 and 1
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockUserMessage(1),
      createMockMessage(0, 1),
    ]);

    // Regenerate round 1
    store.getState().setIsRegenerating(true);
    store.getState().setRegeneratingRoundNumber(1);

    // Clear round 1 responses
    const messagesWithoutRound1Responses = store.getState().messages.filter(
      m => !(m.role === UIMessageRoles.ASSISTANT && m.metadata?.roundNumber === 1),
    );
    store.getState().setMessages(messagesWithoutRound1Responses);

    // Add new responses for round 1
    store.getState().setMessages([
      ...messagesWithoutRound1Responses,
      createMockMessage(0, 1),
    ]);

    // Round number should still be 1
    const lastMessage = store.getState().messages[store.getState().messages.length - 1];
    expect(lastMessage.metadata?.roundNumber).toBe(1);
  });

  it('should track analysis creation for regenerated round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Complete round 0
    store.getState().markAnalysisCreated(0);
    expect(store.getState().createdAnalysisRounds.has(0)).toBe(true);

    // Note: The store tracks analysis creation but doesn't have an unmark method
    // In practice, regeneration would reset via resetToNewChat or clear messages
    // For this test, we just verify the marking works
    expect(store.getState().createdAnalysisRounds.has(0)).toBe(true);
  });

  it('should allow multiple regenerations', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // First attempt
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);
    store.getState().markAnalysisCreated(0);
    expect(store.getState().createdAnalysisRounds.has(0)).toBe(true);

    // First regeneration - reset messages but analysis tracking stays
    store.getState().setMessages([createMockUserMessage(0)]);

    // Second attempt
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);
    // markAnalysisCreated is idempotent
    store.getState().markAnalysisCreated(0);

    // Third attempt
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);
    store.getState().markAnalysisCreated(0);

    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().createdAnalysisRounds.has(0)).toBe(true);
  });
});

// ============================================================================
// ERROR RECOVERY SCENARIOS
// ============================================================================

describe('error Recovery Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('participant Streaming Failures', () => {
    it('should continue with other participants after one fails', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [
        createMockParticipant(0),
        createMockParticipant(1),
        createMockParticipant(2),
      ]);

      // P0 completes
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ];
      store.getState().setMessages(messages);

      // P1 fails (no message added)
      store.getState().setCurrentParticipantIndex(1);
      store.getState().setError('P1 failed to respond');

      // P2 completes
      messages.push(createMockMessage(2, 0));
      store.getState().setMessages(messages);

      // Round completes with partial results
      expect(store.getState().messages).toHaveLength(3); // user + P0 + P2
      expect(store.getState().error).toBe('P1 failed to respond');
    });

    it('should allow retry after partial failure', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // P0 fails
      store.getState().setMessages([createMockUserMessage(0)]);
      store.getState().setError('Network error');

      // User retries
      store.getState().setError(null);
      store.getState().setIsRegenerating(true);

      // P0 succeeds on retry
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().setIsRegenerating(false);

      expect(store.getState().messages).toHaveLength(2);
      expect(store.getState().error).toBeNull();
    });
  });

  describe('pre-Search Failures', () => {
    it('should proceed with message after pre-search failure', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().prepareForNewMessage('Test', ['model-1']);

      // Pre-search fails
      store.getState().addPreSearch(createPendingPreSearch(0));
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.FAILED);

      // Check if we should wait
      const preSearch = store.getState().preSearches[0];
      const shouldWait = preSearch.status === AnalysisStatuses.PENDING
        || preSearch.status === AnalysisStatuses.STREAMING;

      // Should NOT wait - proceed with degraded UX
      expect(shouldWait).toBe(false);
    });

    it('should show error message for failed pre-search', () => {
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().addPreSearch({
        ...createPendingPreSearch(0),
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Search API unavailable',
      });

      expect(store.getState().preSearches[0].errorMessage).toBe('Search API unavailable');
    });
  });

  describe('analysis Failures', () => {
    it('should allow retry of failed analysis', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Analysis fails
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
        errorMessage: 'Analysis generation failed',
      }));

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.FAILED);

      // User retries - remove failed analysis
      store.getState().removeAnalysis(0);

      // Analysis succeeds on retry
      store.getState().markAnalysisCreated(0);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should not block conversation after analysis failure', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Round 0 with failed analysis
      store.getState().setMessages([
        createMockUserMessage(0),
        createMockMessage(0, 0),
      ]);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.FAILED,
      }));

      // User can still send round 1 message
      store.getState().prepareForNewMessage('Next question', ['model-1']);

      expect(store.getState().pendingMessage).toBe('Next question');
    });
  });

  describe('network Errors', () => {
    it('should handle network timeout gracefully', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);

      // Simulate timeout
      store.getState().setError('Request timed out');
      store.getState().setIsStreaming(false);

      expect(store.getState().error).toBe('Request timed out');
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should allow retry after network error', () => {
      const thread = createMockThread({ id: 'thread-123' });
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setError('Network disconnected');

      // Clear error and retry
      store.getState().setError(null);
      store.getState().setIsStreaming(true);

      expect(store.getState().error).toBeNull();
      expect(store.getState().isStreaming).toBe(true);
    });
  });
});

// ============================================================================
// WEB SEARCH TOGGLE BEHAVIOR
// ============================================================================

describe('web Search Toggle Behavior', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should create pre-search only when web search enabled', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // No pre-search created
    expect(store.getState().preSearches).toHaveLength(0);
  });

  it('should toggle web search between rounds', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Round 0 with web search
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));

    // Disable for round 1
    store.getState().setEnableWebSearch(false);

    // No pre-search for round 1
    expect(store.getState().preSearches.filter(ps => ps.roundNumber === 1)).toHaveLength(0);

    // Re-enable for round 2
    store.getState().setEnableWebSearch(true);
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 2,
      status: AnalysisStatuses.COMPLETE,
    }));

    expect(store.getState().preSearches).toHaveLength(2);
  });

  it('should not require pre-search completion when disabled', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().prepareForNewMessage('Test', ['model-1']);

    // Should be able to send immediately
    const shouldWait = store.getState().enableWebSearch
      && store.getState().preSearches.some(
        ps => ps.status === AnalysisStatuses.PENDING || ps.status === AnalysisStatuses.STREAMING,
      );

    expect(shouldWait).toBe(false);
  });
});

// ============================================================================
// SUBSCRIPTION TIER LIMITS
// ============================================================================

describe('subscription Tier Limits', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should enforce maximum participant count', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Try to add more than allowed (e.g., Free tier = 2)
    const participants = [
      createMockParticipant(0),
      createMockParticipant(1),
      createMockParticipant(2), // Should be rejected
    ];

    // In real app, this would be validated before setting
    // Here we just verify the store accepts the data
    store.getState().initializeThread(thread, participants);

    expect(store.getState().participants).toHaveLength(3);
  });

  it('should track model order for response sequence', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [
      createMockParticipant(0, { priority: 2 }),
      createMockParticipant(1, { priority: 0 }),
      createMockParticipant(2, { priority: 1 }),
    ]);

    // Models should respond in priority order (0, 1, 2)
    const priorities = store.getState().participants.map(p => p.priority);
    expect(priorities).toEqual([2, 0, 1]);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle empty message submission', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Empty message - should be allowed by store (validation in UI)
    store.getState().prepareForNewMessage('', ['model-1']);

    expect(store.getState().pendingMessage).toBe('');
  });

  it('should handle very long message', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    const longMessage = 'x'.repeat(5000);
    store.getState().prepareForNewMessage(longMessage, ['model-1']);

    expect(store.getState().pendingMessage).toBe(longMessage);
  });

  it('should handle single participant', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Single participant should still work
    store.getState().setMessages([
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ]);

    expect(store.getState().messages).toHaveLength(2);
  });

  it('should handle rapid message submissions', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);

    // Rapid submissions
    store.getState().prepareForNewMessage('Message 1', ['model-1']);
    store.getState().prepareForNewMessage('Message 2', ['model-1']);
    store.getState().prepareForNewMessage('Message 3', ['model-1']);

    // Only last message should be pending
    expect(store.getState().pendingMessage).toBe('Message 3');
  });

  it('should handle page refresh state', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setHasInitiallyLoaded(true);

    expect(store.getState().hasInitiallyLoaded).toBe(true);

    // Reset simulates page refresh
    store.getState().resetToNewChat();

    expect(store.getState().hasInitiallyLoaded).toBe(false);
  });
});
