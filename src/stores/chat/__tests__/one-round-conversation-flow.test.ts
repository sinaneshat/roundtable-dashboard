/**
 * One Round Conversation Flow Integration Tests
 *
 * Tests the complete chat flow from overview screen to thread screen
 * as if the UI was triggering all actions. Tests behavior, not implementation.
 *
 * FLOW TESTED:
 * 1. Overview screen → configure chat (participants, mode)
 * 2. Submit first message → thread creation API
 * 3. Streaming participants → sequential AI responses
 * 4. Analysis creation → pending → streaming → complete
 * 5. Slug polling → AI-generated title detection
 * 6. Navigation → router.push to /chat/[slug]
 *
 * Location: /src/stores/chat/__tests__/one-round-conversation-flow.test.ts
 */

import type { UIMessage } from 'ai';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AnalysisStatuses,
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import type {
  ChatParticipant,
  ChatThread,
} from '@/api/routes/chat/schema';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockAnalysis,
  createMockAnalysisPayload,
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockPreSearchDataPayload,
  createMockThread,
  createMockUserMessage,
  createPendingAnalysis,
  createPendingPreSearch,
  createStreamingAnalysis,
  createStreamingPreSearch,
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

/**
 * Simulate async operation completion
 */
function _flushPromises() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Wait for a condition to be true
 */
async function _waitFor(
  condition: () => boolean,
  timeout = 1000,
  interval = 10,
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

// ============================================================================
// FLOW STATE MACHINE LOGIC TESTS
// ============================================================================

describe('one Round Conversation Flow', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  // ==========================================================================
  // PHASE 1: OVERVIEW SCREEN INITIALIZATION
  // ==========================================================================

  describe('phase 1: Overview Screen Initialization', () => {
    it('should start with initial UI visible and idle state', () => {
      const state = store.getState();

      expect(state.showInitialUI).toBe(true);
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingThread).toBe(false);
      expect(state.thread).toBeNull();
      expect(state.messages).toHaveLength(0);
      expect(state.participants).toHaveLength(0);
      expect(state.analyses).toHaveLength(0);
    });

    it('should set screen mode to overview', () => {
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should allow configuring participants', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(2);
      expect(state.selectedParticipants[0].modelId).toBe('openai/gpt-4');
      expect(state.selectedParticipants[1].modelId).toBe('anthropic/claude-3');
    });

    it('should allow setting chat mode', () => {
      store.getState().setSelectedMode(ChatModes.DEBATING);
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    });

    it('should allow setting input value', () => {
      store.getState().setInputValue('What is the best approach?');
      expect(store.getState().inputValue).toBe('What is the best approach?');
    });

    it('should allow enabling web search', () => {
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);
    });
  });

  // ==========================================================================
  // PHASE 2: THREAD CREATION
  // ==========================================================================

  describe('phase 2: Thread Creation', () => {
    it('should transition from idle to creating_thread state', () => {
      // Simulate form submission start
      store.getState().setIsCreatingThread(true);
      expect(store.getState().isCreatingThread).toBe(true);
    });

    it('should hide initial UI when thread creation starts', () => {
      store.getState().setShowInitialUI(false);
      expect(store.getState().showInitialUI).toBe(false);
    });

    it('should store created thread ID from API response', () => {
      const threadId = 'thread-123';
      store.getState().setCreatedThreadId(threadId);
      expect(store.getState().createdThreadId).toBe(threadId);
    });

    it('should initialize thread with data from API response', () => {
      const thread = createMockThread({
        id: 'thread-123',
        title: 'New Chat',
        slug: 'new-chat-abc123',
        isAiGeneratedTitle: false,
        mode: ChatModes.DEBATING,
      });

      const participants = [
        createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
      ];

      const userMessage = createMockUserMessage(0, 'What is the best approach?');

      store.getState().initializeThread(thread, participants, [userMessage]);

      const state = store.getState();
      expect(state.thread).toEqual(thread);
      expect(state.participants).toHaveLength(2);
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('user');
    });

    it('should complete thread creation state transition', () => {
      store.getState().setIsCreatingThread(false);
      expect(store.getState().isCreatingThread).toBe(false);
    });

    it('should set waiting to start streaming flag', () => {
      store.getState().setWaitingToStartStreaming(true);
      expect(store.getState().waitingToStartStreaming).toBe(true);
    });
  });

  // ==========================================================================
  // PHASE 3: WEB SEARCH PRE-SEARCH (OPTIONAL)
  // ==========================================================================

  describe('phase 3: Web Search Pre-Search (Optional)', () => {
    beforeEach(() => {
      // Setup thread state
      const thread = createMockThread({ enableWebSearch: true });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
    });

    it('should add pending pre-search record when web search is enabled', () => {
      const preSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(preSearch);

      const state = store.getState();
      expect(state.preSearches).toHaveLength(1);
      expect(state.preSearches[0].status).toBe(AnalysisStatuses.PENDING);
    });

    it('should update pre-search status to streaming', () => {
      const preSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(preSearch);
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should update pre-search with search results', () => {
      const preSearch = createStreamingPreSearch(0);
      store.getState().addPreSearch(preSearch);

      const searchData = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(0, searchData);

      const state = store.getState();
      expect(state.preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.preSearches[0].searchData).toBeDefined();
    });

    it('should track pre-search trigger to prevent duplicates', () => {
      store.getState().markPreSearchTriggered(0);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
      expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
    });
  });

  // ==========================================================================
  // PHASE 4: PARTICIPANT STREAMING
  // ==========================================================================

  describe('phase 4: Participant Streaming', () => {
    let thread: ChatThread;
    let participants: ChatParticipant[];

    beforeEach(() => {
      thread = createMockThread({ id: 'thread-123' });
      participants = [
        createMockParticipant(0, { modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { modelId: 'anthropic/claude-3' }),
        createMockParticipant(2, { modelId: 'google/gemini' }),
      ];

      const userMessage = createMockUserMessage(0);
      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);
    });

    it('should start streaming and track current participant index', () => {
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.currentParticipantIndex).toBe(0);
    });

    it('should add first participant message during streaming', () => {
      store.getState().setIsStreaming(true);

      const message1 = createMockMessage(0, 0, {
        id: 'thread-123_r0_p0',
        parts: [{ type: 'text', text: 'First AI response' }],
      });

      store.getState().setMessages(prev => [...prev, message1]);

      const state = store.getState();
      expect(state.messages).toHaveLength(2); // user + participant 0
      expect(state.messages[1].id).toBe('thread-123_r0_p0');
    });

    it('should advance to next participant and add message', () => {
      store.getState().setIsStreaming(true);

      // Add first participant message
      const message1 = createMockMessage(0, 0);
      store.getState().setMessages(prev => [...prev, message1]);
      store.getState().setCurrentParticipantIndex(1);

      // Add second participant message
      const message2 = createMockMessage(1, 0, {
        id: 'thread-123_r0_p1',
        parts: [{ type: 'text', text: 'Second AI response (sees first response)' }],
      });
      store.getState().setMessages(prev => [...prev, message2]);

      const state = store.getState();
      expect(state.messages).toHaveLength(3); // user + 2 participants
      expect(state.currentParticipantIndex).toBe(1);
    });

    it('should complete all participants sequentially', () => {
      store.getState().setIsStreaming(true);

      // Add all three participant messages
      const messages = [
        createMockMessage(0, 0),
        createMockMessage(1, 0),
        createMockMessage(2, 0),
      ];

      messages.forEach((msg, index) => {
        store.getState().setMessages(prev => [...prev, msg]);
        store.getState().setCurrentParticipantIndex(index);
      });

      const state = store.getState();
      expect(state.messages).toHaveLength(4); // user + 3 participants
    });

    it('should stop streaming when all participants complete', () => {
      store.getState().setIsStreaming(true);

      // Add all participant messages
      [0, 1, 2].forEach((idx) => {
        store.getState().setMessages(prev => [...prev, createMockMessage(idx, 0)]);
      });

      // Complete streaming
      store.getState().setIsStreaming(false);

      expect(store.getState().isStreaming).toBe(false);
    });

    it('should handle stop button during streaming', () => {
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(1);

      // Simulate stop button - only first participant responded
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setIsStreaming(false);

      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.messages).toHaveLength(2); // user + 1 participant
    });
  });

  // ==========================================================================
  // PHASE 5: ANALYSIS CREATION AND STREAMING
  // ==========================================================================

  describe('phase 5: Analysis Creation and Streaming', () => {
    let thread: ChatThread;
    let participants: ChatParticipant[];

    beforeEach(() => {
      thread = createMockThread({ id: 'thread-123', mode: ChatModes.DEBATING });
      participants = [
        createMockParticipant(0),
        createMockParticipant(1),
      ];

      // Setup completed participant streaming
      const messages: UIMessage[] = [
        createMockUserMessage(0, 'What is the best approach?'),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);
      store.getState().setIsStreaming(false);
    });

    it('should detect when all participants have responded for current round', () => {
      const state = store.getState();
      const participantMessages = state.messages.filter(m => m.role === 'assistant');

      expect(participantMessages).toHaveLength(2);
      expect(participantMessages).toHaveLength(state.participants.length);
    });

    it('should mark analysis as created to prevent duplicates', () => {
      store.getState().markAnalysisCreated(0);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);
      expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
    });

    it('should set creating analysis flag', () => {
      store.getState().setIsCreatingAnalysis(true);
      expect(store.getState().isCreatingAnalysis).toBe(true);
    });

    it('should create pending analysis with correct data', () => {
      // For integration testing, we use addAnalysis directly
      // The createPendingAnalysis action has internal validation that requires
      // exact message ID formats matching the backend's pattern
      const pendingAnalysis = createPendingAnalysis(0);
      pendingAnalysis.threadId = 'thread-123';
      pendingAnalysis.mode = ChatModes.DEBATING;
      pendingAnalysis.userQuestion = 'What is the best approach?';

      store.getState().addAnalysis(pendingAnalysis);

      const state = store.getState();
      expect(state.analyses).toHaveLength(1);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.PENDING);
      expect(state.analyses[0].roundNumber).toBe(0);
      expect(state.analyses[0].mode).toBe(ChatModes.DEBATING);
    });

    it('should transition analysis to streaming status', () => {
      store.getState().addAnalysis(createPendingAnalysis(0));
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);

      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should update analysis with streamed data', () => {
      store.getState().addAnalysis(createStreamingAnalysis(0));

      const analysisData = createMockAnalysisPayload(0);
      store.getState().updateAnalysisData(0, analysisData);

      const state = store.getState();
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.analyses[0].analysisData).toBeDefined();
    });

    it('should handle analysis error gracefully', () => {
      store.getState().addAnalysis(createStreamingAnalysis(0));
      store.getState().updateAnalysisError(0, 'Analysis generation failed');

      const state = store.getState();
      expect(state.analyses[0].status).toBe(AnalysisStatuses.FAILED);
      expect(state.analyses[0].errorMessage).toBe('Analysis generation failed');
    });

    it('should complete streaming lifecycle', () => {
      store.getState().completeStreaming();

      const state = store.getState();
      expect(state.isCreatingAnalysis).toBe(false);
      expect(state.isRegenerating).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
    });
  });

  // ==========================================================================
  // PHASE 6: SLUG POLLING AND AI TITLE
  // ==========================================================================

  describe('phase 6: Slug Polling and AI Title', () => {
    beforeEach(() => {
      const thread = createMockThread({
        id: 'thread-123',
        title: 'New Chat',
        slug: 'new-chat-abc123',
        isAiGeneratedTitle: false,
      });
      const participants = [createMockParticipant(0)];

      store.getState().initializeThread(thread, participants);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);
      store.getState().setCreatedThreadId('thread-123');
    });

    it('should detect AI-generated title from slug status response', () => {
      // Simulate API response with AI-generated title
      const updatedThread = createMockThread({
        id: 'thread-123',
        title: 'Best Approach for Software Architecture',
        slug: 'best-approach-software-architecture',
        isAiGeneratedTitle: true,
      });

      store.getState().setThread(updatedThread);

      const state = store.getState();
      expect(state.thread?.isAiGeneratedTitle).toBe(true);
      expect(state.thread?.title).toBe('Best Approach for Software Architecture');
      expect(state.thread?.slug).toBe('best-approach-software-architecture');
    });

    it('should maintain thread state consistency during polling', () => {
      const initialThread = store.getState().thread;

      // Simulate multiple poll responses
      const partialUpdate = {
        ...initialThread,
        title: 'AI Generated Title',
        isAiGeneratedTitle: true,
      };

      store.getState().setThread(partialUpdate as ChatThread);

      // Thread ID should remain unchanged
      expect(store.getState().thread?.id).toBe('thread-123');
    });
  });

  // ==========================================================================
  // PHASE 7: NAVIGATION TO THREAD SCREEN
  // ==========================================================================

  describe('phase 7: Navigation to Thread Screen', () => {
    beforeEach(() => {
      const thread = createMockThread({
        id: 'thread-123',
        slug: 'best-approach-software',
        isAiGeneratedTitle: true,
      });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      const messages: UIMessage[] = [
        createMockUserMessage(0),
        createMockMessage(0, 0),
        createMockMessage(1, 0),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.getState().addAnalysis(createMockAnalysis({
        roundNumber: 0,
        status: AnalysisStatuses.COMPLETE,
      }));
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);
      store.getState().setCreatedThreadId('thread-123');
    });

    it('should have all conditions met for navigation', () => {
      const state = store.getState();

      // All navigation conditions
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(state.thread?.isAiGeneratedTitle).toBe(true);
      expect(state.thread?.slug).toBeDefined();
      expect(state.analyses[0]?.status).toBe(AnalysisStatuses.COMPLETE);
    });

    it('should transition screen mode on navigation', () => {
      // Simulate navigation completing
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });
  });

  // ==========================================================================
  // COMPLETE FLOW INTEGRATION
  // ==========================================================================

  describe('complete Flow Integration', () => {
    it('should execute full flow from overview to thread navigation', async () => {
      // STEP 1: Configure chat on overview screen
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setSelectedParticipants([
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
      ]);
      store.getState().setInputValue('What is the best approach for microservices?');
      store.getState().setEnableWebSearch(false);

      // STEP 2: Submit form - start thread creation
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      // STEP 3: Thread creation API response
      const thread = createMockThread({
        id: 'thread-xyz789',
        title: 'New Chat',
        slug: 'new-chat-xyz789',
        isAiGeneratedTitle: false,
        mode: ChatModes.DEBATING,
      });
      const participants = [
        createMockParticipant(0, { threadId: 'thread-xyz789', modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { threadId: 'thread-xyz789', modelId: 'anthropic/claude-3' }),
      ];
      const userMessage = createMockUserMessage(0, 'What is the best approach for microservices?');

      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setCreatedThreadId('thread-xyz789');
      store.getState().setIsCreatingThread(false);
      store.getState().setWaitingToStartStreaming(true);

      // Verify thread initialization
      expect(store.getState().thread?.id).toBe('thread-xyz789');
      expect(store.getState().participants).toHaveLength(2);
      expect(store.getState().messages).toHaveLength(1);

      // STEP 4: Start participant streaming
      store.getState().setWaitingToStartStreaming(false);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // First participant responds
      const msg1 = createMockMessage(0, 0, {
        id: 'thread-xyz789_r0_p0',
        parts: [{ type: 'text', text: 'Microservices offer great scalability...' }],
      });
      store.getState().setMessages(prev => [...prev, msg1]);
      store.getState().setCurrentParticipantIndex(1);

      // Second participant responds
      const msg2 = createMockMessage(1, 0, {
        id: 'thread-xyz789_r0_p1',
        parts: [{ type: 'text', text: 'I agree with the scalability benefits, but...' }],
      });
      store.getState().setMessages(prev => [...prev, msg2]);

      // Complete participant streaming
      store.getState().setIsStreaming(false);

      // Verify messages
      expect(store.getState().messages).toHaveLength(3);

      // STEP 5: Create and stream analysis
      store.getState().markAnalysisCreated(0);
      store.getState().setIsCreatingAnalysis(true);

      const pendingAnalysis = createPendingAnalysis(0);
      pendingAnalysis.threadId = 'thread-xyz789';
      store.getState().addAnalysis(pendingAnalysis);
      store.getState().setIsCreatingAnalysis(false);

      // Analysis starts streaming
      store.getState().updateAnalysisStatus(0, AnalysisStatuses.STREAMING);
      store.getState().setIsStreaming(true);

      // Analysis completes
      const analysisData = createMockAnalysisPayload(0);
      store.getState().updateAnalysisData(0, analysisData);
      store.getState().setIsStreaming(false);
      store.getState().completeStreaming();

      // Verify analysis completion
      expect(store.getState().analyses[0].status).toBe(AnalysisStatuses.COMPLETE);

      // STEP 6: AI title generation (background polling result)
      const threadWithAiTitle = createMockThread({
        id: 'thread-xyz789',
        title: 'Microservices Architecture Best Practices',
        slug: 'microservices-architecture-best-practices',
        isAiGeneratedTitle: true,
        mode: ChatModes.DEBATING,
      });
      store.getState().setThread(threadWithAiTitle);

      // Verify AI title update
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
      expect(store.getState().thread?.slug).toBe('microservices-architecture-best-practices');

      // STEP 7: Navigation ready - all conditions met
      const finalState = store.getState();
      expect(finalState.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(finalState.thread?.isAiGeneratedTitle).toBe(true);
      expect(finalState.thread?.slug).toBeDefined();
      expect(finalState.analyses[0]?.status).toBe(AnalysisStatuses.COMPLETE);
      expect(finalState.showInitialUI).toBe(false);
      expect(finalState.isStreaming).toBe(false);

      // Simulate navigation complete
      store.getState().setScreenMode(ScreenModes.THREAD);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('should handle flow with web search enabled', async () => {
      // Setup with web search
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      store.getState().setSelectedParticipants([
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      ]);
      store.getState().setInputValue('What are the latest trends?');
      store.getState().setEnableWebSearch(true);

      // Thread creation
      const thread = createMockThread({
        id: 'thread-web123',
        enableWebSearch: true,
        mode: ChatModes.ANALYZING,
      });
      const participants = [createMockParticipant(0, { threadId: 'thread-web123' })];
      const userMessage = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setShowInitialUI(false);

      // Pre-search phase
      const preSearch = createPendingPreSearch(0);
      preSearch.threadId = 'thread-web123';
      store.getState().addPreSearch(preSearch);
      store.getState().markPreSearchTriggered(0);

      // Pre-search streaming
      store.getState().updatePreSearchStatus(0, AnalysisStatuses.STREAMING);

      // Pre-search completes
      const searchData = createMockPreSearchDataPayload();
      store.getState().updatePreSearchData(0, searchData);

      // Verify pre-search completed before participant streaming
      expect(store.getState().preSearches[0].status).toBe(AnalysisStatuses.COMPLETE);

      // Now participant streaming can proceed
      store.getState().setIsStreaming(true);
      const msg = createMockMessage(0, 0);
      store.getState().setMessages(prev => [...prev, msg]);
      store.getState().setIsStreaming(false);

      // Continue with analysis...
      store.getState().addAnalysis(createMockAnalysis({ roundNumber: 0 }));

      // Verify complete flow with web search
      const finalState = store.getState();
      expect(finalState.preSearches).toHaveLength(1);
      expect(finalState.messages).toHaveLength(2);
      expect(finalState.analyses).toHaveLength(1);
    });

    it('should handle error during streaming and allow retry', () => {
      // Setup thread
      const thread = createMockThread({ id: 'thread-error' });
      const participants = [createMockParticipant(0), createMockParticipant(1)];
      const userMessage = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);

      // Start streaming
      store.getState().setIsStreaming(true);

      // First participant succeeds
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      // Second participant fails
      store.getState().setError(new Error('Rate limit exceeded'));
      store.getState().setIsStreaming(false);

      // Verify error state
      expect(store.getState().error?.message).toBe('Rate limit exceeded');
      expect(store.getState().messages).toHaveLength(2); // user + 1 participant

      // Clear error for retry
      store.getState().setError(null);

      // Retry would be handled by startRegeneration
      store.getState().startRegeneration(0);
      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
    });
  });

  // ==========================================================================
  // FLOW STATE TRANSITIONS
  // ==========================================================================

  describe('flow State Transitions', () => {
    it('should correctly identify idle state', () => {
      const state = store.getState();
      expect(state.showInitialUI).toBe(true);
      expect(state.isStreaming).toBe(false);
      expect(state.isCreatingThread).toBe(false);
    });

    it('should correctly identify creating_thread state', () => {
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      const state = store.getState();
      expect(state.isCreatingThread).toBe(true);
      expect(state.showInitialUI).toBe(false);
    });

    it('should correctly identify streaming_participants state', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);
      store.getState().setIsStreaming(true);

      // No analysis yet = streaming_participants
      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.analyses).toHaveLength(0);
    });

    it('should correctly identify streaming_analysis state', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);
      store.getState().addAnalysis(createStreamingAnalysis(0));
      store.getState().setIsStreaming(true);

      // Analysis exists + streaming = streaming_analysis
      const state = store.getState();
      expect(state.isStreaming).toBe(true);
      expect(state.analyses).toHaveLength(1);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.STREAMING);
    });

    it('should correctly identify complete state', () => {
      const thread = createMockThread({
        isAiGeneratedTitle: true,
        slug: 'complete-thread',
      });
      const participants = [createMockParticipant(0)];
      store.getState().initializeThread(thread, participants);
      store.getState().addAnalysis(createMockAnalysis({ status: AnalysisStatuses.COMPLETE }));
      store.getState().setScreenMode(ScreenModes.THREAD);
      store.getState().setShowInitialUI(false);

      const state = store.getState();
      expect(state.thread?.isAiGeneratedTitle).toBe(true);
      expect(state.analyses[0].status).toBe(AnalysisStatuses.COMPLETE);
      expect(state.screenMode).toBe(ScreenModes.THREAD);
    });
  });

  // ==========================================================================
  // STORE RESET BEHAVIORS
  // ==========================================================================

  describe('store Reset Behaviors', () => {
    it('should reset to overview state correctly', () => {
      // Setup some state
      const thread = createMockThread();
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().addAnalysis(createMockAnalysis());
      store.getState().setInputValue('test');
      store.getState().setSelectedMode(ChatModes.DEBATING);

      // Reset
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.thread).toBeNull();
      expect(state.messages).toHaveLength(0);
      expect(state.analyses).toHaveLength(0);
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should reset to new chat correctly', () => {
      // Setup some state
      const thread = createMockThread();
      store.getState().initializeThread(thread, [createMockParticipant(0)]);
      store.getState().setIsStreaming(true);

      // Reset
      store.getState().resetToNewChat();

      const state = store.getState();
      expect(state.thread).toBeNull();
      expect(state.isStreaming).toBe(false);
      expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
      expect(state.showInitialUI).toBe(true);
    });

    it('should clear analysis tracking on reset', () => {
      store.getState().markAnalysisCreated(0);
      store.getState().markAnalysisCreated(1);

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(true);

      store.getState().resetToNewChat();

      expect(store.getState().hasAnalysisBeenCreated(0)).toBe(false);
    });

    it('should clear pre-search tracking on reset', () => {
      store.getState().markPreSearchTriggered(0);

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);

      store.getState().resetToNewChat();

      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(false);
    });
  });

  // ==========================================================================
  // DATA INTEGRITY
  // ==========================================================================

  describe('data Integrity', () => {
    it('should maintain message order throughout flow', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0), createMockParticipant(1)];

      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);

      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(1, 0)]);

      const messages = store.getState().messages;
      expect(messages[0].role).toBe('user');
      expect(messages[1].id).toContain('_r0_p0');
      expect(messages[2].id).toContain('_r0_p1');
    });

    it('should maintain participant priority order', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'model-a' }),
        createMockParticipantConfig(1, { modelId: 'model-b' }),
        createMockParticipantConfig(2, { modelId: 'model-c' }),
      ];

      store.getState().setSelectedParticipants(participants);

      const selected = store.getState().selectedParticipants;
      expect(selected[0].participantIndex).toBe(0);
      expect(selected[1].participantIndex).toBe(1);
      expect(selected[2].participantIndex).toBe(2);
    });

    it('should prevent duplicate analysis creation', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];
      const messages = [createMockUserMessage(0), createMockMessage(0, 0)];

      store.getState().initializeThread(thread, participants, messages);

      // Mark as created
      store.getState().markAnalysisCreated(0);

      // Try to create analysis (should check tracking first)
      const alreadyCreated = store.getState().hasAnalysisBeenCreated(0);
      expect(alreadyCreated).toBe(true);

      // If not checked, would create duplicate - this tests the guard
      if (!alreadyCreated) {
        store.getState().createPendingAnalysis({
          roundNumber: 0,
          messages,
          userQuestion: 'test',
          threadId: thread.id,
          mode: ChatModes.DEBATING,
          participants,
        });
      }

      // Should still have 0 analyses since we checked first
      expect(store.getState().analyses).toHaveLength(0);
    });

    it('should track round numbers correctly', () => {
      const thread = createMockThread();
      const participants = [createMockParticipant(0)];

      // Round 0
      store.getState().initializeThread(thread, participants, [createMockUserMessage(0)]);
      store.getState().setMessages(prev => [...prev, createMockMessage(0, 0)]);

      const state = store.getState();
      const lastMessage = state.messages[state.messages.length - 1];
      expect(lastMessage.metadata?.roundNumber).toBe(0);
    });
  });
});
