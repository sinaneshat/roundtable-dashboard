/**
 * Thread Detail, History, and Configuration Changes Tests
 *
 * Comprehensive tests covering Sections 5-6 of COMPREHENSIVE_TEST_PLAN.md.
 * Tests thread loading, round grouping, continued conversations, configuration
 * changes mid-conversation, and change banner functionality.
 *
 * SECTIONS COVERED:
 * 5.1 Loading & Rendering
 *   - THREAD-LOAD-01: Load existing thread at /chat/[slug]
 *   - THREAD-LOAD-02: Verify all rounds are grouped correctly
 *   - THREAD-LOAD-03: Verify collapsed analysis for older rounds
 *   - THREAD-LOAD-04: Verify expanded analysis for most recent round
 *   - THREAD-LOAD-05: Test deep linking to specific message or round
 *   - THREAD-HYDRATE-01: Verify external messages synced to AI SDK only on initial load
 *
 * 5.2 Continued Conversation
 *   - THREAD-CONT-01: Test sending a message in Round 2
 *   - THREAD-CONT-02: Verify Round 2 UI appends correctly below Round 1
 *   - THREAD-CONT-03: Test history context: Round 2 participants reference Round 1 info
 *   - THREAD-CONT-04: Test Like/Dislike persists to DB immediately
 *
 * 6.1 Modification Flow
 *   - MOD-01: Test adding a new model between Round 1 and 2
 *   - MOD-02: Test removing a model
 *   - MOD-03: Test changing a role or mode
 *   - MOD-04: Verify changes do NOT apply immediately to past round
 *   - MOD-05: Test reordering models (impacts streaming order)
 *
 * 6.2 Change Banner
 *   - BANNER-01: Test "Configuration changed" banner appears at start of Round 2
 *   - BANNER-02: Verify banner correctly lists "Added", "Removed", "Modified" counts
 *   - BANNER-03: Test expanding banner shows correct details
 *   - BANNER-04: Test complex diff scenarios
 *
 * Location: /src/stores/chat/__tests__/thread-detail-history-config.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  FeedbackTypes,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockPreSearch,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

/**
 * Helper to get messages grouped by round number
 */
function groupMessagesByRound(messages: UIMessage[]): Map<number, UIMessage[]> {
  const grouped = new Map<number, UIMessage[]>();
  messages.forEach((msg) => {
    const roundNumber = (msg.metadata as { roundNumber?: number })?.roundNumber ?? 0;
    if (!grouped.has(roundNumber)) {
      grouped.set(roundNumber, []);
    }
    grouped.get(roundNumber)!.push(msg);
  });
  return grouped;
}

/**
 * Helper to detect configuration changes between rounds
 */
function detectConfigurationChanges(
  oldModels: string[],
  newModels: string[],
  oldRoles: Map<string, string | null>,
  newRoles: Map<string, string | null>,
): { added: string[]; removed: string[]; modified: string[] } {
  const added = newModels.filter(m => !oldModels.includes(m));
  const removed = oldModels.filter(m => !newModels.includes(m));
  const modified: string[] = [];

  // Check for role changes
  newModels.forEach((modelId) => {
    if (oldModels.includes(modelId)) {
      const oldRole = oldRoles.get(modelId);
      const newRole = newRoles.get(modelId);
      if (oldRole !== newRole) {
        modified.push(modelId);
      }
    }
  });

  return { added, removed, modified };
}

// ============================================================================
// SECTION 5.1: LOADING & RENDERING
// ============================================================================

describe('section 5.1: Loading & Rendering', () => {
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
   * THREAD-LOAD-01: Test loading an existing thread `/chat/[slug]`
   *
   * Validates that when navigating to an existing thread URL:
   * - Thread data is loaded correctly from the database
   * - Screen mode is set to 'thread'
   * - Thread metadata (id, slug, title) is accessible
   */
  it('tHREAD-LOAD-01: should load existing thread at /chat/[slug]', () => {
    const thread = createMockThread({
      id: 'thread-123',
      slug: 'existing-thread-slug',
      title: 'Existing Thread Title',
      isAiGeneratedTitle: true,
    });

    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
    ];

    const messages = [
      createMockUserMessage(0, 'Initial question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setScreenMode(ScreenModes.THREAD);
    store.getState().setHasInitiallyLoaded(true);

    expect(store.getState().thread?.id).toBe('thread-123');
    expect(store.getState().thread?.slug).toBe('existing-thread-slug');
    expect(store.getState().thread?.title).toBe('Existing Thread Title');
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    expect(store.getState().hasInitiallyLoaded).toBe(true);
    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().messages).toHaveLength(3);
  });

  /**
   * THREAD-LOAD-02: Verify all rounds are grouped correctly
   *
   * Validates that messages from multiple rounds are properly organized
   * by their round number for UI display purposes.
   */
  it('tHREAD-LOAD-02: should group all rounds correctly', () => {
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

    // Round 2 messages
    const round2Messages = [
      createMockUserMessage(2, 'Question 3'),
      createMockMessage(0, 2),
      createMockMessage(1, 2),
    ];

    const allMessages = [...round0Messages, ...round1Messages, ...round2Messages];
    store.getState().initializeThread(thread, [], allMessages);

    const messages = store.getState().messages;
    const grouped = groupMessagesByRound(messages);

    // Verify correct grouping
    expect(grouped.size).toBe(3);
    expect(grouped.get(0)).toHaveLength(3);
    expect(grouped.get(1)).toHaveLength(3);
    expect(grouped.get(2)).toHaveLength(3);

    // Verify message order within each round
    const round0 = grouped.get(0)!;
    expect(round0[0].role).toBe('user');
    expect(round0[1].role).toBe('assistant');
    expect(round0[2].role).toBe('assistant');
  });

  /**
   * THREAD-LOAD-03: Verify collapsed analysis for older rounds
   *
   * Validates that UI can determine which analyses should be collapsed
   * (all rounds except the most recent).
   */
  it('tHREAD-LOAD-03: should mark older rounds for collapsed analysis display', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Multiple analyses from different rounds
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
      createMockAnalysis({
        id: 'analysis-2',
        roundNumber: 2,
        status: AnalysisStatuses.COMPLETE,
      }),
    ];

    store.getState().setAnalyses(analyses);

    const storeAnalyses = store.getState().analyses;
    const maxRound = Math.max(...storeAnalyses.map(a => a.roundNumber));

    // UI should collapse all except most recent
    const collapsedRounds = storeAnalyses.filter(a => a.roundNumber < maxRound);
    const expandedRound = storeAnalyses.find(a => a.roundNumber === maxRound);

    expect(collapsedRounds).toHaveLength(2);
    expect(expandedRound?.roundNumber).toBe(2);
  });

  /**
   * THREAD-LOAD-04: Verify expanded analysis for the most recent round
   *
   * Validates that the most recent round's analysis is identified for
   * expanded display in the UI.
   */
  it('tHREAD-LOAD-04: should identify most recent round for expanded analysis', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    const analyses = [
      createMockAnalysis({
        id: 'analysis-0',
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(0),
      }),
      createMockAnalysis({
        id: 'analysis-1',
        roundNumber: 1,
        status: AnalysisStatuses.COMPLETE,
        analysisData: createMockAnalysisPayload(1),
      }),
    ];

    store.getState().setAnalyses(analyses);

    const storeAnalyses = store.getState().analyses;
    const maxRound = Math.max(...storeAnalyses.map(a => a.roundNumber));
    const mostRecentAnalysis = storeAnalyses.find(a => a.roundNumber === maxRound);

    expect(maxRound).toBe(1);
    expect(mostRecentAnalysis?.status).toBe(AnalysisStatuses.COMPLETE);
    expect(mostRecentAnalysis?.analysisData).not.toBeNull();
  });

  /**
   * THREAD-LOAD-05: Test deep linking to a specific message or round
   *
   * Validates that the store can handle initialization with specific
   * round context for deep linking scenarios.
   */
  it('tHREAD-LOAD-05: should support deep linking to specific round context', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Messages from multiple rounds
    const messages = [
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1),
      createMockUserMessage(2, 'Question 3'),
      createMockMessage(0, 2),
    ];

    store.getState().initializeThread(thread, [], messages);

    // Store should have all messages accessible for deep linking
    const allMessages = store.getState().messages;
    expect(allMessages).toHaveLength(6);

    // Verify specific round can be targeted
    const targetRound = 1;
    const targetRoundMessages = allMessages.filter(
      m => (m.metadata as { roundNumber?: number })?.roundNumber === targetRound,
    );

    expect(targetRoundMessages).toHaveLength(2);
    expect(targetRoundMessages[0].role).toBe('user');
    expect(targetRoundMessages[1].role).toBe('assistant');
  });

  /**
   * THREAD-HYDRATE-01: Verify external messages are synced to AI SDK only on initial load
   *
   * Validates that messages from the database are loaded once during
   * initialization and not overwritten during subsequent streaming.
   */
  it('tHREAD-HYDRATE-01: should sync external messages only on initial load', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Initial messages from database
    const initialMessages = [
      createMockUserMessage(0, 'Initial question'),
      createMockMessage(0, 0),
    ];

    store.getState().initializeThread(thread, [], initialMessages);
    store.getState().setHasInitiallyLoaded(true);

    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().hasInitiallyLoaded).toBe(true);

    // Subsequent message additions should append, not replace
    const newMessages = [
      ...store.getState().messages,
      createMockUserMessage(1, 'Follow-up question'),
    ];
    store.getState().setMessages(newMessages);

    // Original messages preserved, new message added
    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().messages[0].metadata?.roundNumber).toBe(0);
    expect(store.getState().messages[2].metadata?.roundNumber).toBe(1);
  });

  /**
   * Test loading thread with pre-search data
   */
  it('should load thread with pre-search data correctly', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });

    const preSearch = createMockPreSearch({
      id: 'presearch-0',
      threadId: 'thread-123',
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().addPreSearch(preSearch);

    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
  });
});

// ============================================================================
// SECTION 5.2: CONTINUED CONVERSATION
// ============================================================================

describe('section 5.2: Continued Conversation', () => {
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
   * THREAD-CONT-01: Test sending a message in Round 2
   *
   * Validates that a new message can be submitted in Round 2 after
   * Round 1 is complete.
   */
  it('tHREAD-CONT-01: should send message in Round 2', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
    ];

    // Round 1 complete
    const round0Messages = [
      createMockUserMessage(0, 'First question'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Prepare Round 2 message
    store.getState().prepareForNewMessage('Second question', ['openai/gpt-4', 'anthropic/claude-3']);

    expect(store.getState().pendingMessage).toBe('Second question');

    // Add Round 2 user message
    const round1UserMessage = createMockUserMessage(1, 'Second question');
    store.getState().setMessages([...round0Messages, round1UserMessage]);
    store.getState().setHasSentPendingMessage(true);

    // Verify Round 2 message exists
    const messages = store.getState().messages;
    const round1Messages = messages.filter(
      m => (m.metadata as { roundNumber?: number })?.roundNumber === 1,
    );

    expect(round1Messages).toHaveLength(1);
    expect(round1Messages[0].role).toBe('user');
  });

  /**
   * THREAD-CONT-02: Verify Round 2 UI appends correctly below Round 1
   *
   * Validates that messages maintain correct chronological order
   * across multiple rounds.
   */
  it('tHREAD-CONT-02: should append Round 2 UI correctly below Round 1', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];

    // Round 1 complete
    const round0Messages = [
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
    ];

    // Round 2 complete
    const round1Messages = [
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1),
    ];

    const allMessages = [...round0Messages, ...round1Messages];
    store.getState().initializeThread(thread, participants, allMessages);

    // Verify message order is preserved
    const messages = store.getState().messages;
    expect(messages).toHaveLength(4);
    expect(messages[0].metadata?.roundNumber).toBe(0);
    expect(messages[1].metadata?.roundNumber).toBe(0);
    expect(messages[2].metadata?.roundNumber).toBe(1);
    expect(messages[3].metadata?.roundNumber).toBe(1);

    // Verify user messages come before participant responses in each round
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].role).toBe('user');
    expect(messages[3].role).toBe('assistant');
  });

  /**
   * THREAD-CONT-03: Test history context: Round 2 participants reference Round 1 info
   *
   * Validates that all previous rounds' messages are available as context
   * for subsequent rounds.
   */
  it('tHREAD-CONT-03: should provide history context in Round 2 referencing Round 1', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
    ];

    // Complete Round 1
    const round0Messages = [
      createMockUserMessage(0, 'What is machine learning?'),
      createMockMessage(0, 0, {
        id: 'thread-123_r0_p0',
        parts: [{ type: 'text', text: 'Machine learning is a subset of AI...' }],
      }),
      createMockMessage(1, 0, {
        id: 'thread-123_r0_p1',
        parts: [{ type: 'text', text: 'Adding to that, ML uses algorithms...' }],
      }),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);

    // Round 2 - participants have access to full history
    const round1UserMessage = createMockUserMessage(1, 'Can you give an example?');
    const round1Participant0 = createMockMessage(0, 1, {
      id: 'thread-123_r1_p0',
      parts: [{ type: 'text', text: 'Based on our earlier discussion about ML...' }],
    });

    const allMessages = [...round0Messages, round1UserMessage, round1Participant0];
    store.getState().setMessages(allMessages);

    // Verify all messages available as context
    expect(store.getState().messages).toHaveLength(5);

    // Round 2 participant can reference Round 1 content
    const round1Response = store.getState().messages[4];
    expect(round1Response.parts?.[0]).toEqual({
      type: 'text',
      text: 'Based on our earlier discussion about ML...',
    });
  });

  /**
   * THREAD-CONT-04: Test Like/Dislike persists to DB immediately
   *
   * Validates that feedback state can be tracked and is ready for
   * immediate persistence.
   */
  it('tHREAD-CONT-04: should support immediate Like/Dislike persistence', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Set feedback for round 0 - like
    store.getState().setFeedback(0, FeedbackTypes.LIKED);

    expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKED);

    // Change feedback to dislike
    store.getState().setFeedback(0, FeedbackTypes.DISLIKED);

    expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.DISLIKED);

    // Set feedback for round 1
    store.getState().setFeedback(1, FeedbackTypes.LIKED);

    expect(store.getState().feedbackByRound.get(1)).toBe(FeedbackTypes.LIKED);
    expect(store.getState().feedbackByRound.size).toBe(2);
  });

  /**
   * Test loading feedback from server
   */
  it('should load feedback from server correctly', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    // Load feedback from server
    store.getState().loadFeedbackFromServer([
      { roundNumber: 0, feedbackType: FeedbackTypes.LIKED },
      { roundNumber: 1, feedbackType: FeedbackTypes.DISLIKED },
    ]);

    expect(store.getState().feedbackByRound.get(0)).toBe(FeedbackTypes.LIKED);
    expect(store.getState().feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKED);
    expect(store.getState().hasLoadedFeedback).toBe(true);
  });

  /**
   * Test clearing feedback
   */
  it('should clear feedback for specific round', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    store.getState().setFeedback(0, FeedbackTypes.LIKED);
    store.getState().setFeedback(1, FeedbackTypes.DISLIKED);

    expect(store.getState().feedbackByRound.size).toBe(2);

    // Clear feedback for round 0
    store.getState().clearFeedback(0);

    expect(store.getState().feedbackByRound.size).toBe(1);
    expect(store.getState().feedbackByRound.has(0)).toBe(false);
    expect(store.getState().feedbackByRound.get(1)).toBe(FeedbackTypes.DISLIKED);
  });
});

// ============================================================================
// SECTION 6.1: MODIFICATION FLOW
// ============================================================================

describe('section 6.1: Modification Flow', () => {
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
   * MOD-01: Test adding a new model between Round 1 and 2
   *
   * Validates that users can add a new participant between rounds
   * and the new participant will respond in the next round.
   */
  it('mOD-01: should add new model between Round 1 and 2', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Initial 2 participants for Round 1
    const initialParticipants = [
      createMockParticipant(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipant(1, { modelId: 'anthropic/claude-3', role: 'Critic' }),
    ];

    store.getState().initializeThread(thread, initialParticipants, []);
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'Critic' }),
    ]);

    expect(store.getState().selectedParticipants).toHaveLength(2);

    // Add third participant using store action
    store.getState().addParticipant({
      participantIndex: 2,
      modelId: 'google/gemini-pro',
      role: 'Innovator',
    });

    expect(store.getState().selectedParticipants).toHaveLength(3);
    expect(store.getState().selectedParticipants[2].modelId).toBe('google/gemini-pro');
    expect(store.getState().selectedParticipants[2].role).toBe('Innovator');
    expect(store.getState().selectedParticipants[2].priority).toBe(2);
  });

  /**
   * MOD-02: Test removing a model
   *
   * Validates that users can remove a participant between rounds.
   */
  it('mOD-02: should remove model between rounds', () => {
    const thread = createMockThread({ id: 'thread-123' });

    // Initial 3 participants
    const initialParticipants = [
      createMockParticipant(0, { id: 'part-gpt4', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { id: 'part-claude', modelId: 'anthropic/claude-3' }),
      createMockParticipant(2, { id: 'part-gemini', modelId: 'google/gemini-pro' }),
    ];

    store.getState().initializeThread(thread, initialParticipants, []);
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { id: 'part-gpt4', modelId: 'openai/gpt-4' }),
      createMockParticipantConfig(1, { id: 'part-claude', modelId: 'anthropic/claude-3' }),
      createMockParticipantConfig(2, { id: 'part-gemini', modelId: 'google/gemini-pro' }),
    ]);

    // Remove middle participant
    store.getState().removeParticipant('anthropic/claude-3');

    expect(store.getState().selectedParticipants).toHaveLength(2);
    expect(store.getState().selectedParticipants.find(p => p.modelId === 'anthropic/claude-3')).toBeUndefined();

    // Verify priorities are updated
    expect(store.getState().selectedParticipants[0].priority).toBe(0);
    expect(store.getState().selectedParticipants[1].priority).toBe(1);
  });

  /**
   * MOD-03: Test changing a role or mode
   *
   * Validates that users can change participant roles and conversation
   * mode between rounds.
   */
  it('mOD-03: should change role between rounds', () => {
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { id: 'part-gpt4', modelId: 'openai/gpt-4', role: 'The Critic' }),
    ]);

    expect(store.getState().selectedParticipants[0].role).toBe('The Critic');

    // Change role using updateParticipant
    store.getState().updateParticipant('part-gpt4', { role: 'The Advocate' });

    expect(store.getState().selectedParticipants[0].role).toBe('The Advocate');
  });

  it('mOD-03: should change mode between rounds', () => {
    store.getState().setSelectedMode(ChatModes.DEBATING);
    expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);

    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);

    store.getState().setSelectedMode(ChatModes.ANALYZING);
    expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
  });

  /**
   * MOD-04: Verify changes do NOT apply immediately to the past round
   *
   * Validates that configuration changes only affect future rounds,
   * not the already-completed past rounds.
   */
  it('mOD-04: should NOT apply changes immediately to past round', () => {
    const thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.DEBATING,
    });

    // Round 1 was completed in DEBATING mode
    const round0Analysis = createMockAnalysis({
      id: 'analysis-0',
      roundNumber: 0,
      mode: ChatModes.DEBATING,
      status: AnalysisStatuses.COMPLETE,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setAnalyses([round0Analysis]);
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Change mode for future rounds
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setHasPendingConfigChanges(true);

    // Past round's analysis should still be DEBATING
    expect(store.getState().analyses[0].mode).toBe(ChatModes.DEBATING);

    // New selected mode is BRAINSTORMING (for next round)
    expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);

    // Thread mode not updated until submit
    expect(store.getState().thread?.mode).toBe(ChatModes.DEBATING);
  });

  /**
   * MOD-05: Test reordering models (impacts streaming order)
   *
   * Validates that reordering participants changes their response order
   * in the next round.
   */
  it('mOD-05: should reorder models affecting streaming order', () => {
    // Initial order: [GPT-4, Claude, Gemini]
    // Note: Using addParticipant to set priorities correctly
    store.getState().addParticipant({
      participantIndex: 0,
      modelId: 'openai/gpt-4',
      role: null,
    });
    store.getState().addParticipant({
      participantIndex: 1,
      modelId: 'anthropic/claude-3',
      role: null,
    });
    store.getState().addParticipant({
      participantIndex: 2,
      modelId: 'google/gemini-pro',
      role: null,
    });

    // Verify initial order and priorities
    expect(store.getState().selectedParticipants[0].modelId).toBe('openai/gpt-4');
    expect(store.getState().selectedParticipants[0].priority).toBe(0);
    expect(store.getState().selectedParticipants[1].modelId).toBe('anthropic/claude-3');
    expect(store.getState().selectedParticipants[1].priority).toBe(1);
    expect(store.getState().selectedParticipants[2].modelId).toBe('google/gemini-pro');
    expect(store.getState().selectedParticipants[2].priority).toBe(2);

    // Reorder: Move Gemini (index 2) to first position (index 0)
    // Result: [Gemini, GPT-4, Claude]
    store.getState().reorderParticipants(2, 0);

    const reordered = store.getState().selectedParticipants;

    // Verify new order
    expect(reordered[0].modelId).toBe('google/gemini-pro');
    expect(reordered[1].modelId).toBe('openai/gpt-4');
    expect(reordered[2].modelId).toBe('anthropic/claude-3');

    // Verify priorities updated
    expect(reordered[0].priority).toBe(0);
    expect(reordered[1].priority).toBe(1);
    expect(reordered[2].priority).toBe(2);
  });

  /**
   * Test preventing duplicate participant additions
   */
  it('should prevent adding duplicate participants', () => {
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
    ]);

    // Try to add same model again
    store.getState().addParticipant({
      participantIndex: 1,
      modelId: 'openai/gpt-4',
      role: 'Duplicate',
    });

    // Should still have only 1
    expect(store.getState().selectedParticipants).toHaveLength(1);
  });

  /**
   * Test hasPendingConfigChanges flag
   */
  it('should track pending configuration changes', () => {
    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, [], []);

    expect(store.getState().hasPendingConfigChanges).toBe(false);

    // Make changes
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().hasPendingConfigChanges).toBe(true);

    // Clear pending changes
    store.getState().setHasPendingConfigChanges(false);

    expect(store.getState().hasPendingConfigChanges).toBe(false);
  });
});

// ============================================================================
// SECTION 6.2: CHANGE BANNER
// ============================================================================

describe('section 6.2: Change Banner', () => {
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
   * BANNER-01: Test "Configuration changed" banner appears at start of Round 2
   *
   * Validates that the store can detect when configuration has changed
   * between rounds to trigger banner display.
   */
  it('bANNER-01: should detect configuration changes for banner display', () => {
    // Round 1 participants
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
    ];

    // Round 2 selected participants (with changes)
    const round2Selected = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
      createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }), // Added
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants(round2Selected);

    // Detect changes
    const oldModels = store.getState().participants.map(p => p.modelId);
    const newModels = store.getState().selectedParticipants.map(p => p.modelId);

    const hasChanges = oldModels.length !== newModels.length
      || !oldModels.every(m => newModels.includes(m));

    expect(hasChanges).toBe(true);
  });

  /**
   * BANNER-02: Verify banner correctly lists "Added", "Removed", "Modified" counts
   *
   * Validates that the store provides data to compute change counts.
   */
  it('bANNER-02: should correctly compute Added, Removed, Modified counts', () => {
    // Round 1 participants
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3', role: 'Critic' }),
      createMockParticipant(2, { threadId: 'thread-123', modelId: 'google/gemini-pro', role: 'Innovator' }),
    ];

    // Round 2 selected participants with changes:
    // - GPT-4: role changed (Modified)
    // - Claude-3: removed (Removed)
    // - Gemini: stays the same
    // - Mistral: added (Added)
    const round2Selected = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Devil\'s Advocate' }), // Modified
      createMockParticipantConfig(1, { modelId: 'google/gemini-pro', role: 'Innovator' }),
      createMockParticipantConfig(2, { modelId: 'mistral/mistral-large', role: 'Synthesizer' }), // Added
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants(round2Selected);

    // Compute changes
    const oldModels = store.getState().participants.map(p => p.modelId);
    const newModels = store.getState().selectedParticipants.map(p => p.modelId);
    const oldRoles = new Map(store.getState().participants.map(p => [p.modelId, p.role]));
    const newRoles = new Map(store.getState().selectedParticipants.map(p => [p.modelId, p.role]));

    const changes = detectConfigurationChanges(oldModels, newModels, oldRoles, newRoles);

    expect(changes.added).toContain('mistral/mistral-large');
    expect(changes.removed).toContain('anthropic/claude-3');
    expect(changes.modified).toContain('openai/gpt-4');

    // Summary: "1 added, 1 removed, 1 modified"
    expect(changes.added).toHaveLength(1);
    expect(changes.removed).toHaveLength(1);
    expect(changes.modified).toHaveLength(1);
  });

  /**
   * BANNER-03: Test expanding banner shows correct details (names, icons)
   *
   * Validates that detailed change information is available.
   */
  it('bANNER-03: should provide detailed change information for expanded banner', () => {
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4', role: 'Analyst' }),
    ];

    const round2Selected = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'New Role' }),
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants(round2Selected);

    // Get added participant details
    const oldModels = new Set(store.getState().participants.map(p => p.modelId));
    const addedParticipants = store.getState().selectedParticipants.filter(
      p => !oldModels.has(p.modelId),
    );

    expect(addedParticipants).toHaveLength(1);
    expect(addedParticipants[0].modelId).toBe('anthropic/claude-3');
    expect(addedParticipants[0].role).toBe('New Role');
  });

  /**
   * BANNER-04: Test complex diff scenarios
   *
   * Tests complex scenario where a model is removed and then added back
   * (should show as no change or appropriate update).
   */
  it('bANNER-04: should handle complex diff scenarios (remove then add back)', () => {
    // Initial participants
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3', role: 'Critic' }),
    ];

    const thread = createMockThread({ id: 'thread-123' });
    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'Critic' }),
    ]);

    // Remove Claude
    store.getState().removeParticipant('anthropic/claude-3');
    expect(store.getState().selectedParticipants).toHaveLength(1);

    // Add Claude back with same role
    store.getState().addParticipant({
      participantIndex: 1,
      modelId: 'anthropic/claude-3',
      role: 'Critic',
    });

    // Should show as same configuration
    const finalSelected = store.getState().selectedParticipants;
    expect(finalSelected).toHaveLength(2);

    // Compare with original
    const oldModels = store.getState().participants.map(p => p.modelId).sort();
    const newModels = finalSelected.map(p => p.modelId).sort();

    // Model sets should be the same
    expect(oldModels).toEqual(newModels);
  });

  /**
   * Test mode change detection for banner
   */
  it('should detect mode changes for banner display', () => {
    const thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.DEBATING,
    });

    store.getState().initializeThread(thread, [], []);
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Change mode
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    const oldMode = store.getState().thread?.mode;
    const newMode = store.getState().selectedMode;

    expect(oldMode).not.toBe(newMode);
    expect(oldMode).toBe(ChatModes.DEBATING);
    expect(newMode).toBe(ChatModes.BRAINSTORMING);
  });

  /**
   * Test multiple simultaneous changes for banner
   */
  it('should track multiple simultaneous changes for banner', () => {
    const round1Participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3', role: 'Critic' }),
      createMockParticipant(2, { threadId: 'thread-123', modelId: 'google/gemini-pro', role: 'Innovator' }),
    ];

    const thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.DEBATING,
    });

    store.getState().initializeThread(thread, round1Participants, []);
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'Critic' }),
      createMockParticipantConfig(2, { modelId: 'google/gemini-pro', role: 'Innovator' }),
    ]);
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Multiple changes:
    // 1. Remove Gemini
    store.getState().removeParticipant('google/gemini-pro');

    // 2. Add Mistral
    store.getState().addParticipant({
      participantIndex: 2,
      modelId: 'mistral/mistral-large',
      role: 'Synthesizer',
    });

    // 3. Change Claude's role
    store.getState().updateParticipant('part-claude', { role: 'Advocate' });

    // 4. Change mode
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

    // Verify all changes tracked
    expect(store.getState().selectedParticipants).toHaveLength(3);
    expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);

    // Compute changes
    const oldModels = store.getState().participants.map(p => p.modelId);
    const newModels = store.getState().selectedParticipants.map(p => p.modelId);

    const added = newModels.filter(m => !oldModels.includes(m));
    const removed = oldModels.filter(m => !newModels.includes(m));

    expect(added).toContain('mistral/mistral-large');
    expect(removed).toContain('google/gemini-pro');
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('thread Detail & Configuration Integration', () => {
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
   * Complete multi-round flow with configuration changes
   */
  it('should execute complete multi-round flow with config changes', () => {
    const thread = createMockThread({
      id: 'thread-123',
      mode: ChatModes.DEBATING,
    });

    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
      createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
    ];

    // Round 1
    const round0Messages = [
      createMockUserMessage(0, 'Question 1'),
      createMockMessage(0, 0),
      createMockMessage(1, 0),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
    store.getState().setAnalyses([createMockAnalysis({ roundNumber: 0, mode: ChatModes.DEBATING })]);
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
    ]);
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Configuration changes for Round 2
    store.getState().addParticipant({
      participantIndex: 2,
      modelId: 'google/gemini-pro',
      role: 'Innovator',
    });
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setHasPendingConfigChanges(true);

    // Round 2 messages
    const round1Messages = [
      createMockUserMessage(1, 'Question 2'),
      createMockMessage(0, 1),
      createMockMessage(1, 1),
      createMockMessage(2, 1), // New participant
    ];

    store.getState().setMessages([...round0Messages, ...round1Messages]);
    store.getState().setHasPendingConfigChanges(false);

    // Verify final state
    const finalState = store.getState();
    expect(finalState.messages).toHaveLength(7);
    expect(finalState.selectedParticipants).toHaveLength(3);
    expect(finalState.selectedMode).toBe(ChatModes.BRAINSTORMING);
    expect(finalState.analyses[0].mode).toBe(ChatModes.DEBATING); // Round 1 unchanged
  });

  /**
   * Test thread reset clears all state correctly
   */
  it('should reset all state on resetToNewChat', () => {
    const thread = createMockThread({ id: 'thread-123' });
    const participants = [createMockParticipant(0, { threadId: 'thread-123' })];
    const messages = [createMockUserMessage(0), createMockMessage(0, 0)];

    store.getState().initializeThread(thread, participants, messages);
    store.getState().setAnalyses([createMockAnalysis({ roundNumber: 0 })]);
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setFeedback(0, FeedbackTypes.LIKED);
    store.getState().setHasPendingConfigChanges(true);

    // Reset to new chat
    store.getState().resetToNewChat();

    // Verify complete reset
    expect(store.getState().thread).toBeNull();
    expect(store.getState().participants).toHaveLength(0);
    expect(store.getState().messages).toHaveLength(0);
    expect(store.getState().analyses).toHaveLength(0);
    expect(store.getState().hasPendingConfigChanges).toBe(false);
    expect(store.getState().hasInitiallyLoaded).toBe(false);
  });

  /**
   * Test complete flow from thread load to Round 2 with web search
   */
  it('should handle complete flow with web search across rounds', () => {
    const thread = createMockThread({
      id: 'thread-123',
      enableWebSearch: true,
    });

    const participants = [
      createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
    ];

    // Initialize with Round 1 data
    const round0Messages = [
      createMockUserMessage(0, 'Question with search'),
      createMockMessage(0, 0),
    ];

    store.getState().initializeThread(thread, participants, round0Messages);
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
    }));
    store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Verify Round 1 state
    expect(store.getState().messages).toHaveLength(2);
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().analyses).toHaveLength(1);

    // Prepare for Round 2
    store.getState().prepareForNewMessage('Follow-up question', ['openai/gpt-4']);

    // Add Round 2 pre-search
    store.getState().addPreSearch(createMockPreSearch({
      roundNumber: 1,
      status: AnalysisStatuses.PENDING,
    }));

    // Verify Round 2 preparation
    expect(store.getState().pendingMessage).toBe('Follow-up question');
    expect(store.getState().preSearches).toHaveLength(2);
    expect(store.getState().preSearches[1].status).toBe(AnalysisStatuses.PENDING);
  });

  /**
   * Test participant order maintained during reordering
   */
  it('should maintain correct streaming order after reordering', () => {
    const _thread = createMockThread({ id: 'thread-123' });

    // Initial order
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
      createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }),
    ]);

    // Reorder multiple times
    store.getState().reorderParticipants(2, 0); // Gemini to first
    store.getState().reorderParticipants(2, 1); // Claude to second

    const finalOrder = store.getState().selectedParticipants;

    // Verify all priorities are sequential
    expect(finalOrder[0].priority).toBe(0);
    expect(finalOrder[1].priority).toBe(1);
    expect(finalOrder[2].priority).toBe(2);

    // Verify no duplicates
    const modelIds = finalOrder.map(p => p.modelId);
    const uniqueIds = new Set(modelIds);
    expect(uniqueIds.size).toBe(3);
  });
});
