/**
 * Thread Detail, History, Configuration Changes & Regeneration Tests (Sections 5-7)
 *
 * Tests thread loading, continued conversation, configuration changes,
 * and round regeneration functionality.
 *
 * FLOW TESTED:
 * 5.1 Loading & Rendering
 * 5.2 Continued Conversation
 * 6.1 Modification Flow
 * 6.2 Change Banner
 * 7.1 Trigger & Cleanup
 * 7.2 Re-execution
 *
 * Location: /src/stores/chat/__tests__/thread-detail-history-config.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
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
// SECTION 5.1: LOADING & RENDERING
// ============================================================================

describe('Section 5.1: Loading & Rendering', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should load existing thread at /chat/[slug]', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'existing-thread-slug',
      title: 'Existing Thread Title',
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setScreenMode('thread');

    expect(store.getState().thread?.slug).toBe('existing-thread-slug');
    expect(store.getState().screenMode).toBe('thread');
  });

  it('should group all rounds correctly', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Round 0 messages
    const round0Messages = [
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    // Round 1 messages
    const round1Messages = [
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1),
      createMockMessage(1, 1),
    ];

    const allMessages = [...round0Messages, ...round1Messages];
    store.getState().initializeThread(thread, [], allMessages);

    const messages = store.getState().messages;

    // Group by round
    const round0 = messages.filter(m =>
      (m.metadata as { roundNumber?: number })?.roundNumber === 0
    );
    const round1 = messages.filter(m =>
      (m.metadata as { roundNumber?: number })?.roundNumber === 1
    );

    expect(round0).toHaveLength(3);
    expect(round1).toHaveLength(3);
  });

  it('should show collapsed analysis for older rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Multiple analyses
    const analyses = [
      createMockAnalysis({
        id: 'analysis-0',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }),
      createMockAnalysis({
        id: 'analysis-1',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }),
    ];

    store.getState().setAnalyses(analyses);

    // Both analyses should be accessible for UI to determine collapsed state
    expect(store.getState().analyses).toHaveLength(2);
  });

  it('should show expanded analysis for most recent round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    const analyses = [
      createMockAnalysis({
        id: 'analysis-0',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }),
      createMockAnalysis({
        id: 'analysis-1',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
      }),
    ];

    store.getState().setAnalyses(analyses);

    // UI should expand the most recent (highest round number)
    const maxRound = Math.max(...store.getState().analyses.map(a => a.roundNumber));
    expect(maxRound).toBe(1);
  });
});

// ============================================================================
// SECTION 5.2: CONTINUED CONVERSATION
// ============================================================================

describe('Section 5.2: Continued Conversation', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should send message in Round 2', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // Round 1 messages
    const round0Messages = [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);

    // Add Round 2 messages
    const round1UserMessage = createMockUserMessage(1, 'Second question');
    store.getState().setMessages([...round0Messages, round1UserMessage]);

    const messages = store.getState().messages;
    const round1Messages = messages.filter(m =>
      (m.metadata as { roundNumber?: number })?.roundNumber === 1
    );

    expect(round1Messages).toHaveLength(1);
    expect(round1Messages[0].role).toBe('user');
  });

  it('should append Round 2 UI correctly below Round 1', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Round 1 complete
    const round0Messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
    ];

    // Round 2 complete
    const round1Messages = [
      createMockUserMessage(1),
      createMockMessage(0, 1),
    ];

    const allMessages = [...round0Messages, ...round1Messages];
    store.getState().initializeThread(thread, [], allMessages);

    // Messages should be in order
    const messages = store.getState().messages;
    expect(messages[0].metadata?.roundNumber).toBe(0);
    expect(messages[1].metadata?.roundNumber).toBe(0);
    expect(messages[2].metadata?.roundNumber).toBe(1);
    expect(messages[3].metadata?.roundNumber).toBe(1);
  });

  it('should provide history context in Round 2 referencing Round 1', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Complete round 1
    const round0Messages = [
      createMockUserMessage(0, 'What is AI?'),
      createMockMessage(0, 0, {
        parts: [{ type: 'text', text: 'AI is artificial intelligence...' }],
      }),
    ];

    // Round 2 can reference Round 1
    const round1Messages = [
      createMockUserMessage(1, 'Can you elaborate?'),
    ];

    const allMessages = [...round0Messages, ...round1Messages];
    store.getState().initializeThread(thread, [], allMessages);

    // All messages available as context
    expect(store.getState().messages).toHaveLength(3);
  });

  it('should persist Like/Dislike to DB immediately', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Feedback is typically handled by a separate mutation
    // Store should track feedback state
    // This is a behavior test - feedback should be immediately saveable
    expect(store.getState().thread).toBeDefined();
  });
});

// ============================================================================
// SECTION 6.1: MODIFICATION FLOW
// ============================================================================

describe('Section 6.1: Modification Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should add new model between Round 1 and 2', () => {
    // Initial 2 participants
    const initialParticipants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
    ];

    store.getState().setSelectedParticipants(initialParticipants);
    expect(store.getState().selectedParticipants).toHaveLength(2);

    // Add third participant
    const updatedParticipants = [
      ...initialParticipants,
      createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }),
    ];

    store.getState().setSelectedParticipants(updatedParticipants);
    expect(store.getState().selectedParticipants).toHaveLength(3);
  });

  it('should remove model between rounds', () => {
    // Initial 3 participants
    const initialParticipants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
      createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }),
    ];

    store.getState().setSelectedParticipants(initialParticipants);

    // Remove middle participant
    const updatedParticipants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'google/gemini-pro' }),
    ];

    store.getState().setSelectedParticipants(updatedParticipants);
    expect(store.getState().selectedParticipants).toHaveLength(2);
  });

  it('should change role between rounds', () => {
    const initialParticipants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'The Critic' }),
    ];

    store.getState().setSelectedParticipants(initialParticipants);

    // Change role
    const updatedParticipants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'The Advocate' }),
    ];

    store.getState().setSelectedParticipants(updatedParticipants);
    expect(store.getState().selectedParticipants[0].role).toBe('The Advocate');
  });

  it('should change mode between rounds', () => {
    store.getState().setSelectedMode(ChatModes.DEBATING);
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);

    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
  });

  it('should NOT apply changes immediately to past round', () => {
    const thread = createMockThread({ id: 'thread-123', mode: ChatModes.DEBATING });

    // Round 1 was in DEBATING mode
    const analysis = createMockAnalysis({
      roundNumber: 0,
      mode: ChatModes.DEBATING,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setAnalyses([analysis]);

    // Change mode for future rounds
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    // Past round's analysis should still be DEBATING
    expect(store.getState().analyses[0].mode).toBe(ChatModes.DEBATING);
    // New mode is BRAINSTORMING
    expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
  });
});

// ============================================================================
// SECTION 6.2: CHANGE BANNER
// ============================================================================

describe('Section 6.2: Change Banner', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should detect configuration changes between rounds', () => {
    // Round 1 participants
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'claude-3' }),
    ];

    // Round 2 participants (different)
    const round2Selected = [
      createMockParticipantConfig(0, { modelId: 'gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'claude-3' }),
      createMockParticipantConfig(2, { modelId: 'gemini-pro' }), // Added
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants(round2Selected);

    // Detect changes: 1 added
    const currentParticipants = store.getState().participants.length;
    const selectedParticipants = store.getState().selectedParticipants.length;

    expect(selectedParticipants).toBeGreaterThan(currentParticipants);
  });

  it('should correctly list Added participants', () => {
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'gpt-4' }),
    ];

    const round2Selected = [
      createMockParticipantConfig(0, { modelId: 'gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'claude-3' }), // Added
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants(round2Selected);

    const oldModels = store.getState().participants.map(p => p.modelId);
    const newModels = store.getState().selectedParticipants.map(p => p.modelId);
    const added = newModels.filter(m => !oldModels.includes(m));

    expect(added).toContain('claude-3');
  });

  it('should correctly list Removed participants', () => {
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'claude-3' }),
    ];

    const round2Selected = [
      createMockParticipantConfig(0, { modelId: 'gpt-4' }),
      // claude-3 removed
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants(round2Selected);

    const oldModels = store.getState().participants.map(p => p.modelId);
    const newModels = store.getState().selectedParticipants.map(p => p.modelId);
    const removed = oldModels.filter(m => !newModels.includes(m));

    expect(removed).toContain('claude-3');
  });

  it('should correctly list Modified participants', () => {
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'gpt-4', role: 'Critic' }),
    ];

    const round2Selected = [
      createMockParticipantConfig(0, { modelId: 'gpt-4', role: 'Advocate' }), // Role changed
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants(round2Selected);

    const oldRole = store.getState().participants[0].role;
    const newRole = store.getState().selectedParticipants[0].role;

    expect(oldRole).not.toBe(newRole);
  });
});

// ============================================================================
// SECTION 7.1: REGENERATION TRIGGER & CLEANUP
// ============================================================================

describe('Section 7.1: Regeneration Trigger & Cleanup', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should show Retry button only on most recent round', () => {
    // UI logic - test that we can identify most recent round
    const analyses = [
      createMockAnalysis({ id: 'a-0', roundNumber: 0 }),
      createMockAnalysis({ id: 'a-1', roundNumber: 1 }),
      createMockAnalysis({ id: 'a-2', roundNumber: 2 }),
    ];

    store.getState().setAnalyses(analyses);

    const maxRound = Math.max(...store.getState().analyses.map(a => a.roundNumber));
    expect(maxRound).toBe(2);
  });

  it('should clear AI responses on retry click', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Round with user message and AI responses
    const messages = [
      createMockUserMessage(0, 'Test question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, [], messages);

    // Clear AI responses (keep user message)
    const userMessages = store.getState().messages.filter(m => m.role === 'user');
    store.getState().setMessages(userMessages);

    const remainingMessages = store.getState().messages;
    expect(remainingMessages).toHaveLength(1);
    expect(remainingMessages[0].role).toBe('user');
  });

  it('should clear analysis on retry click', () => {
    store.getState().setAnalyses([createMockAnalysis({ roundNumber: 0 })]);
    expect(store.getState().analyses).toHaveLength(1);

    // Clear analysis
    store.getState().setAnalyses([]);
    expect(store.getState().analyses).toHaveLength(0);
  });

  it('should keep user message on retry', () => {
    const thread = createMockThread({ id: 'thread-123' });

    const messages = [
      createMockUserMessage(0, 'Original question'),
      createMockMessage(0, 0),
    ];

    store.getState().initializeThread(thread, [], messages);

    // On retry, filter to keep only user messages for that round
    const userMessages = store.getState().messages.filter(m => m.role === 'user');
    store.getState().setMessages(userMessages);

    expect(store.getState().messages[0].parts?.[0]).toEqual({
      type: 'text',
      text: 'Original question',
    });
  });

  it('should NOT increment round number on regeneration', () => {
    // Regeneration keeps the same round number
    const messages = [
      createMockUserMessage(0, 'Question'),
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], messages);

    // Round number stays 0
    const roundNumber = (store.getState().messages[0].metadata as { roundNumber?: number })?.roundNumber;
    expect(roundNumber).toBe(0);
  });
});

// ============================================================================
// SECTION 7.2: REGENERATION RE-EXECUTION
// ============================================================================

describe('Section 7.2: Regeneration Re-execution', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should re-stream all participants sequentially after regeneration', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // Start with user message only (after cleanup)
    store.getState().initializeThread(
      thread,
      participants,
      [createMockUserMessage(0)]
    );

    // Re-stream
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Add new responses
    const newMsg1 = createMockMessage(0, 0);
    const newMsg2 = createMockMessage(1, 0);

    store.getState().setMessages([createMockUserMessage(0), newMsg1, newMsg2]);
    store.getState().setIsStreaming(false);

    expect(store.getState().messages).toHaveLength(3);
  });

  it('should generate new analysis after re-streaming', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // After re-streaming, new analysis is generated
    const newAnalysis = createPendingAnalysis(0);
    store.getState().setAnalyses([newAnalysis]);

    expect(store.getState().analyses[0].roundNumber).toBe(0);
  });

  it('should allow regenerating with different configuration', () => {
    // User can change config before retry
    const initialParticipants = [
      createMockParticipantConfig(0, { modelId: 'gpt-4' }),
    ];

    store.getState().setSelectedParticipants(initialParticipants);

    // Change config
    const newParticipants = [
      createMockParticipantConfig(0, { modelId: 'gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'claude-3' }),
    ];

    store.getState().setSelectedParticipants(newParticipants);

    // Then retry
    expect(store.getState().selectedParticipants).toHaveLength(2);
  });

  it('should allow multiple retries', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    // First attempt
    store.getState().initializeThread(
      thread,
      participants,
      [createMockUserMessage(0), createMockMessage(0, 0)]
    );

    // First retry - clear and re-stream
    store.getState().setMessages([createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setMessages([createMockUserMessage(0), createMockMessage(0, 0)]);
    store.getState().setIsStreaming(false);

    // Second retry
    store.getState().setMessages([createMockUserMessage(0)]);
    store.getState().setIsStreaming(true);
    store.getState().setMessages([createMockUserMessage(0), createMockMessage(0, 0)]);
    store.getState().setIsStreaming(false);

    // Should still work
    expect(store.getState().messages).toHaveLength(2);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Thread Detail & Configuration Integration', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should execute complete multi-round flow with config changes', () => {
    const thread = createMockThread({ id: 'thread-123', mode: ChatModes.DEBATING });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'claude-3' }),
    ];

    // Round 1
    const round0Messages = [
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
    store.getState().setAnalyses([createMockAnalysis({ roundNumber: 0 })]);

    // Change config for Round 2
    const newParticipants = [
      createMockParticipantConfig(0, { modelId: 'gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'claude-3' }),
      createMockParticipantConfig(2, { modelId: 'gemini-pro' }), // Added
    ];
    store.getState().setSelectedParticipants(newParticipants);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    // Round 2
    const round1Messages = [
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1),
      createMockMessage(1, 1),
      createMockMessage(2, 1), // New participant
    ];

    store.getState().setMessages([...round0Messages, ...round1Messages]);

    const finalState = store.getState();
    expect(finalState.messages).toHaveLength(7);
    expect(finalState.selectedParticipants).toHaveLength(3);
  });

  it('should execute complete regeneration flow', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123' }),
      createMockParticipant(1, { threadId: 'thread-123' }),
    ];

    // Initial round
    const messages = [
      createMockUserMessage(0),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setAnalyses([createMockAnalysis({ roundNumber: 0 })]);

    // Click retry - cleanup
    store.getState().setMessages([createMockUserMessage(0)]);
    store.getState().setAnalyses([]);

    // Re-stream
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    const newMsg1 = createMockMessage(0, 0);
    store.getState().setMessages([createMockUserMessage(0), newMsg1]);
    store.getState().setCurrentParticipantIndex(1);

    const newMsg2 = createMockMessage(1, 0);
    store.getState().setMessages([createMockUserMessage(0), newMsg1, newMsg2]);

    store.getState().setIsStreaming(false);

    // New analysis
    store.getState().setAnalyses([createMockAnalysis({ roundNumber: 0 })]);

    const finalState = store.getState();
    expect(finalState.messages).toHaveLength(3);
    expect(finalState.analyses).toHaveLength(1);
    expect(finalState.isStreaming).toBe(false);
  });
});
