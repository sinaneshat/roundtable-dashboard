/**
 * State Coherency After Submission Tests
 *
 * Tests validating that state remains coherent after message submission
 * and throughout the streaming lifecycle. Ensures all related state
 * properties are synchronized correctly.
 *
 * COHERENCY REQUIREMENTS:
 * 1. Messages array contains correct user message with unique IDs
 * 2. Participants match selectedParticipants configuration
 * 3. Thread ID matches createdThreadId
 * 4. Flags are correctly cleared after streaming completes
 * 5. Analysis roundNumber matches message roundNumber
 * 6. Pre-search status progresses correctly: PENDING -> STREAMING -> COMPLETE
 * 7. Error states allow recovery and retry
 *
 * TESTING PHILOSOPHY:
 * These tests ensure state invariants are maintained throughout the
 * submission and streaming lifecycle, preventing inconsistent UI states.
 *
 * Location: /src/stores/chat/__tests__/state-coherency-after-submission.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  PreSearchStatuses,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockMessage,
  createMockParticipant,
  createMockParticipants,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// MESSAGE ARRAY COHERENCY
// ============================================================================

describe('state Coherency: Messages Array', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('user message coherency', () => {
    it('should contain user message after submission', () => {
      /**
       * After submitting, messages array should contain the user message
       * with correct metadata
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);
      const userMessage = createMockUserMessage(0, 'Test question');

      store.getState().initializeThread(thread, participants, [userMessage]);

      const state = store.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].metadata?.roundNumber).toBe(0);
    });

    it('should have unique message IDs', () => {
      /**
       * All messages must have unique IDs to prevent React key issues
       * and message deduplication problems
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(3);
      const userMessage = createMockUserMessage(0);
      const p0Message = createMockMessage(0, 0);
      const p1Message = createMockMessage(1, 0);
      const p2Message = createMockMessage(2, 0);

      store.getState().initializeThread(
        thread,
        participants,
        [userMessage, p0Message, p1Message, p2Message],
      );

      const state = store.getState();
      const messageIds = state.messages.map(m => m.id);
      const uniqueIds = new Set(messageIds);

      expect(uniqueIds.size).toBe(messageIds.length);
      expect(messageIds).toHaveLength(4);
    });

    it('should maintain correct round numbers across messages', () => {
      /**
       * Messages within the same round should have matching roundNumber
       * in their metadata
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);

      // Round 0
      const userMsg0 = createMockUserMessage(0, 'First question');
      const p0r0 = createMockMessage(0, 0);
      const p1r0 = createMockMessage(1, 0);

      // Round 1
      const userMsg1 = createMockUserMessage(1, 'Follow-up question');
      const p0r1 = createMockMessage(0, 1);
      const p1r1 = createMockMessage(1, 1);

      store.getState().initializeThread(thread, participants, [
        userMsg0,
        p0r0,
        p1r0,
        userMsg1,
        p0r1,
        p1r1,
      ]);

      const state = store.getState();

      // Verify round 0 messages
      const round0Messages = state.messages.filter(
        m => m.metadata?.roundNumber === 0,
      );
      expect(round0Messages).toHaveLength(3);

      // Verify round 1 messages
      const round1Messages = state.messages.filter(
        m => m.metadata?.roundNumber === 1,
      );
      expect(round1Messages).toHaveLength(3);
    });
  });

  describe('message ordering', () => {
    it('should maintain message order within rounds', () => {
      /**
       * Within a round: user message first, then participants in order
       */
      const thread = createMockThread({ id: 'thread-123' });
      const participants = createMockParticipants(2);

      const userMessage = createMockUserMessage(0);
      const p0Message = createMockMessage(0, 0);
      const p1Message = createMockMessage(1, 0);

      store.getState().initializeThread(
        thread,
        participants,
        [userMessage, p0Message, p1Message],
      );

      const state = store.getState();

      // First message should be user
      expect(state.messages[0].role).toBe('user');

      // Followed by participants
      expect(state.messages[1].role).toBe('assistant');
      expect(state.messages[1].metadata?.participantIndex).toBe(0);

      expect(state.messages[2].role).toBe('assistant');
      expect(state.messages[2].metadata?.participantIndex).toBe(1);
    });
  });
});

// ============================================================================
// PARTICIPANT STATE COHERENCY
// ============================================================================

describe('state Coherency: Participants', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should have participants array matching thread participants', () => {
    /**
     * Participants in store should match those passed during initialization
     */
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(3);
    const userMessage = createMockUserMessage(0);

    store.getState().initializeThread(thread, participants, [userMessage]);

    const state = store.getState();
    expect(state.participants).toHaveLength(3);

    // Verify participant IDs match
    participants.forEach((p, idx) => {
      expect(state.participants[idx].id).toBe(p.id);
      expect(state.participants[idx].modelId).toBe(p.modelId);
    });
  });

  it('should have valid participant IDs for all participants', () => {
    /**
     * All participant IDs should be non-empty strings
     */
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { id: 'p-0', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { id: 'p-1', modelId: 'anthropic/claude-3' }),
    ];
    const userMessage = createMockUserMessage(0);

    store.getState().initializeThread(thread, participants, [userMessage]);

    const state = store.getState();
    state.participants.forEach((p) => {
      expect(p.id).toBeTruthy();
      expect(typeof p.id).toBe('string');
      expect(p.id.length).toBeGreaterThan(0);
    });
  });

  it('should maintain participant priority order', () => {
    /**
     * Participants should be ordered by priority
     */
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { priority: 0 }),
      createMockParticipant(1, { priority: 1 }),
      createMockParticipant(2, { priority: 2 }),
    ];
    const userMessage = createMockUserMessage(0);

    store.getState().initializeThread(thread, participants, [userMessage]);

    const state = store.getState();
    for (let i = 0; i < state.participants.length - 1; i++) {
      expect(state.participants[i].priority)
        .toBeLessThanOrEqual(state.participants[i + 1].priority);
    }
  });
});

// ============================================================================
// THREAD STATE COHERENCY
// ============================================================================

describe('state Coherency: Thread State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should have thread ID matching createdThreadId', () => {
    /**
     * When thread is created, thread.id should match createdThreadId
     */
    const thread = createMockThread({ id: 'thread-abc-123' });

    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );
    store.getState().setCreatedThreadId(thread.id);

    const state = store.getState();
    expect(state.thread?.id).toBe(state.createdThreadId);
    expect(state.thread?.id).toBe('thread-abc-123');
  });

  it('should have thread mode matching selectedMode', () => {
    /**
     * Thread mode should reflect what user selected
     */
    const mode = ChatModes.BRAINSTORMING;
    const thread = createMockThread({ id: 'thread-123', mode });

    store.getState().setSelectedMode(mode);
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    const state = store.getState();
    expect(state.thread?.mode).toBe(mode);
    expect(state.selectedMode).toBe(mode);
  });

  it('should have enableWebSearch matching thread setting', () => {
    /**
     * Web search enablement should be consistent
     */
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });

    store.getState().setEnableWebSearch(true);
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    const state = store.getState();
    expect(state.thread?.enableWebSearch).toBe(true);
    expect(state.enableWebSearch).toBe(true);
  });
});

// ============================================================================
// FLAG COHERENCY AFTER STREAMING
// ============================================================================

describe('state Coherency: Flags After Streaming Completes', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should have isStreaming false after streaming completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Start streaming
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);

    // Complete streaming
    store.getState().setIsStreaming(false);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should have waitingToStartStreaming false after streaming starts', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Set waiting
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().waitingToStartStreaming).toBe(true);

    // Streaming starts
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);

    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should clear streamingRoundNumber after streaming completes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Set streaming round
    store.getState().setStreamingRoundNumber(0);
    expect(store.getState().streamingRoundNumber).toBe(0);

    // Complete streaming
    store.getState().setIsStreaming(false);
    store.getState().setStreamingRoundNumber(null);

    expect(store.getState().streamingRoundNumber).toBeNull();
  });

  it('should have all streaming flags coherent after complete cycle', () => {
    /**
     * Complete streaming cycle: all flags should be in expected states
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Pre-streaming state
    store.getState().setIsCreatingThread(true);

    // Thread created
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsCreatingThread(false);

    // Streaming started
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setStreamingRoundNumber(0);

    // Streaming complete
    store.getState().setIsStreaming(false);
    store.getState().setStreamingRoundNumber(null);

    // Verify final coherent state
    const state = store.getState();
    expect(state.isCreatingThread).toBe(false);
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.isStreaming).toBe(false);
    expect(state.streamingRoundNumber).toBeNull();
  });
});

// ============================================================================
// ANALYSIS STATE COHERENCY
// ============================================================================

describe('state Coherency: Analysis State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should have analysis roundNumber matching message roundNumber', () => {
    /**
     * Analysis for a round should have same roundNumber as messages
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Add analysis for round 0
    const analysis = createMockAnalysis({
      threadId: thread.id,
      roundNumber: 0,
    });
    store.getState().addAnalysis(analysis);

    const state = store.getState();

    // Message roundNumber
    const messageRound = state.messages[0].metadata?.roundNumber;

    // Analysis roundNumber
    const analysisRound = state.analyses[0].roundNumber;

    expect(analysisRound).toBe(messageRound);
  });

  it('should create analysis after round completes', () => {
    /**
     * Analysis should be created for each completed round
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Simulate round completion
    store.getState().setIsStreaming(false);

    // Add analysis
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    }));

    const state = store.getState();
    expect(state.analyses).toHaveLength(1);
    expect(state.analyses[0].roundNumber).toBe(0);
  });

  it('should update analysis status correctly through lifecycle', () => {
    /**
     * Analysis status should progress: PENDING -> STREAMING -> COMPLETE
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Add pending analysis
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    }));
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.PENDING);

    // Start streaming
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);

    // Complete
    store.getState().updateAnalysisStatus(0, AnalysisStatuses.COMPLETE);
    expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
  });

  it('should match analysis threadId with thread.id', () => {
    /**
     * Analysis should belong to the correct thread
     */
    const thread = createMockThread({ id: 'thread-xyz-789' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    const analysis = createMockAnalysis({
      threadId: thread.id,
      roundNumber: 0,
    });
    store.getState().addAnalysis(analysis);

    const state = store.getState();
    expect(state.analyses[0].threadId).toBe(state.thread?.id);
  });
});

// ============================================================================
// PRE-SEARCH STATE COHERENCY
// ============================================================================

describe('state Coherency: Pre-Search State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should create pre-search when web search enabled', () => {
    /**
     * When thread has enableWebSearch, pre-search should exist
     */
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Add pre-search for round
    const preSearch = createMockPreSearch({
      threadId: thread.id,
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    });
    store.getState().addPreSearch(preSearch);

    const state = store.getState();
    expect(state.thread?.enableWebSearch).toBe(true);
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0].roundNumber).toBe(0);
  });

  it('should have pre-search status progress correctly: PENDING -> STREAMING -> COMPLETE', () => {
    /**
     * Pre-search lifecycle should follow expected status progression
     */
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // PENDING
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
    }));
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.PENDING);

    // STREAMING
    store.getState().updatePreSearchStatus(0, PreSearchStatuses.STREAMING);
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.STREAMING);

    // COMPLETE
    store.getState().updatePreSearchStatus(0, PreSearchStatuses.COMPLETE);
    expect(store.getState().preSearches[0].status).toBe(PreSearchStatuses.COMPLETE);
  });

  it('should have pre-search roundNumber matching message roundNumber', () => {
    /**
     * Pre-search should be for the same round as the user message
     */
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });

    const userMessage = createMockUserMessage(0);
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [userMessage],
    );

    const preSearch = createMockPreSearch({
      roundNumber: 0,
    });
    store.getState().addPreSearch(preSearch);

    const state = store.getState();
    expect(state.preSearches[0].roundNumber).toBe(userMessage.metadata?.roundNumber);
  });

  it('should not have pre-search when web search disabled', () => {
    /**
     * When thread doesn't have web search enabled, no pre-search needed
     */
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: false,
    });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    const state = store.getState();
    expect(state.thread?.enableWebSearch).toBe(false);
    expect(state.preSearches).toHaveLength(0);
  });
});

// ============================================================================
// ERROR STATE RECOVERY
// ============================================================================

describe('state Coherency: Error State Recovery', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should allow recovery after streaming error', () => {
    /**
     * After error during streaming, user should be able to retry
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Start streaming
    store.getState().setIsStreaming(true);

    // Simulate error - streaming stops
    store.getState().setIsStreaming(false);

    // State should allow retry
    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.thread).not.toBeNull();
    expect(state.messages.length).toBeGreaterThan(0);

    // User can start streaming again
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should maintain thread state after analysis error', () => {
    /**
     * Analysis failure shouldn't corrupt thread state
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Add failed analysis
    store.getState().addAnalysis(createMockAnalysis({
      roundNumber: 0,
      status: AnalysisStatuses.FAILED,
    }));

    // Thread state should be intact
    const state = store.getState();
    expect(state.thread).not.toBeNull();
    expect(state.messages).toHaveLength(1);
    expect(state.participants).toHaveLength(2);

    // Analysis shows failed status
    expect(state.analyses[0].status).toBe(AnalysisStatuses.FAILED);
  });

  it('should allow retry after pre-search failure', () => {
    /**
     * Failed pre-search should allow user to continue or retry
     */
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Add failed pre-search
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: PreSearchStatuses.FAILED,
    }));

    const state = store.getState();
    expect(state.preSearches[0].status).toBe(PreSearchStatuses.FAILED);

    // Thread should still be usable
    expect(state.thread).not.toBeNull();
    expect(state.isStreaming).toBe(false);
  });

  it('should clear stuck state with resetToNewChat', () => {
    /**
     * resetToNewChat should clear any stuck state and allow fresh start
     */
    // Create thread first
    store.getState().initializeThread(
      createMockThread({ id: 'thread-123' }),
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Then create stuck state (initializeThread sets isStreaming=false)
    store.getState().setIsStreaming(true);
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setPendingMessage('stuck message');
    store.getState().setIsRegenerating(true);

    // Verify stuck
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().pendingMessage).not.toBeNull();

    // Reset
    store.getState().resetToNewChat();

    // All state cleared
    const state = store.getState();
    expect(state.isStreaming).toBe(false);
    expect(state.waitingToStartStreaming).toBe(false);
    expect(state.pendingMessage).toBeNull();
    expect(state.isRegenerating).toBe(false);
    expect(state.thread).toBeNull();
    expect(state.messages).toHaveLength(0);
    expect(state.participants).toHaveLength(0);
  });

  it('should recover from isCreatingThread stuck state', () => {
    /**
     * If isCreatingThread gets stuck, recovery should be possible
     */
    store.getState().setIsCreatingThread(true);

    // Simulate stuck state
    expect(store.getState().isCreatingThread).toBe(true);

    // Manual recovery
    store.getState().setIsCreatingThread(false);
    expect(store.getState().isCreatingThread).toBe(false);

    // Alternative: Full reset
    store.getState().setIsCreatingThread(true);
    store.getState().resetToNewChat();
    expect(store.getState().isCreatingThread).toBe(false);
  });
});

// ============================================================================
// MULTI-ROUND COHERENCY
// ============================================================================

describe('state Coherency: Multi-Round Conversations', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should maintain coherent state across multiple rounds', () => {
    /**
     * State should remain coherent as conversation progresses
     */
    const thread = createMockThread({ id: 'thread-123' });
    const participants = createMockParticipants(2);

    // Round 0
    const round0Messages = [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);

    // Verify round 0 coherency
    let state = store.getState();
    expect(state.messages).toHaveLength(3);
    expect(state.messages.filter(m => m.metadata?.roundNumber === 0)).toHaveLength(3);

    // Add round 1
    const round1Messages = [
      createMockUserMessage(1, 'Follow-up'),
      createMockMessage(0, 1),
      createMockMessage(1, 1),
    ];

    store.getState().setMessages([...state.messages, ...round1Messages]);

    // Verify round 1 coherency
    state = store.getState();
    expect(state.messages).toHaveLength(6);
    expect(state.messages.filter(m => m.metadata?.roundNumber === 0)).toHaveLength(3);
    expect(state.messages.filter(m => m.metadata?.roundNumber === 1)).toHaveLength(3);
  });

  it('should have correct current round number', () => {
    /**
     * After each round, currentRoundNumber should update
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Set current round
    store.getState().setCurrentRoundNumber(0);
    expect(store.getState().currentRoundNumber).toBe(0);

    // Add second round
    store.getState().setCurrentRoundNumber(1);
    expect(store.getState().currentRoundNumber).toBe(1);
  });

  it('should have analyses for each completed round', () => {
    /**
     * Each completed round should have its own analysis
     */
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(
      thread,
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Add analyses for rounds
    store.getState().addAnalysis(createMockAnalysis({
      id: 'analysis-0',
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));
    store.getState().addAnalysis(createMockAnalysis({
      id: 'analysis-1',
      roundNumber: 1,
      status: AnalysisStatuses.COMPLETE,
    }));

    const state = store.getState();
    expect(state.analyses).toHaveLength(2);
    expect(state.analyses[0].roundNumber).toBe(0);
    expect(state.analyses[1].roundNumber).toBe(1);
  });
});

// ============================================================================
// SCREEN MODE COHERENCY
// ============================================================================

describe('state Coherency: Screen Mode', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
  });

  it('should transition from OVERVIEW to THREAD after thread creation', () => {
    /**
     * Screen mode should reflect current state
     */
    // Initial: overview
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // Create thread
    store.getState().initializeThread(
      createMockThread({ id: 'thread-123' }),
      createMockParticipants(2),
      [createMockUserMessage(0)],
    );

    // Still overview until navigation happens
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // Navigate to thread
    store.getState().setScreenMode(ScreenModes.THREAD);
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
  });

  it('should have isReadOnly false by default', () => {
    /**
     * Default state should allow user interaction
     */
    const state = store.getState();
    expect(state.isReadOnly).toBe(false);

    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    expect(store.getState().isReadOnly).toBe(false);

    store.getState().setScreenMode(ScreenModes.THREAD);
    expect(store.getState().isReadOnly).toBe(false);
  });

  it('should have screenMode and isReadOnly properties defined', () => {
    /**
     * Screen state properties should be properly initialized
     */
    const state = store.getState();

    // screenMode defaults to 'overview' to prevent race conditions
    expect(state.screenMode).toBe(ScreenModes.OVERVIEW);

    // isReadOnly should be false by default
    expect(state.isReadOnly).toBe(false);

    // After setting screen mode
    store.getState().setScreenMode(ScreenModes.PUBLIC);
    expect(store.getState().screenMode).toBe(ScreenModes.PUBLIC);
  });
});
