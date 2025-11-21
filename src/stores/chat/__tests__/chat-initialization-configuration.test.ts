/**
 * Chat Initialization & Configuration Tests (Section 1)
 *
 * Tests the complete initialization flow on the Overview Screen
 * as defined in COMPREHENSIVE_TEST_PLAN.md Section 1.
 *
 * FLOW TESTED:
 * 1.1 UI Initial State - Landing on /chat
 * 1.2 Configuration Logic - Model selection, roles, modes
 * 1.3 Submission & Thread Creation - First message submission
 *
 * Location: /src/stores/chat/__tests__/chat-initialization-configuration.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChatModes,
  SubscriptionTiers,
  ThreadStatuses,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockParticipant,
  createMockParticipantConfig,
  createMockThread,
  createMockUserMessage,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// SECTION 1.1: UI INITIAL STATE
// ============================================================================

describe('Section 1.1: UI Initial State', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should load /chat successfully with initial UI visible', () => {
    const state = store.getState();

    // Initial UI should be visible (Logo, Suggestion Cards, Input Box)
    expect(state.showInitialUI).toBe(true);
    expect(state.screenMode).toBe('overview');
    expect(state.isStreaming).toBe(false);
    expect(state.isCreatingThread).toBe(false);
  });

  it('should have empty thread state on initial load', () => {
    const state = store.getState();

    expect(state.thread).toBeNull();
    expect(state.createdThreadId).toBeNull();
    expect(state.messages).toHaveLength(0);
    expect(state.participants).toHaveLength(0);
    expect(state.analyses).toHaveLength(0);
  });

  it('should have default input value empty', () => {
    const state = store.getState();
    expect(state.inputValue).toBe('');
  });

  it('should have default web search disabled', () => {
    const state = store.getState();
    expect(state.enableWebSearch).toBe(false);
  });

  it('should have empty selected participants initially', () => {
    const state = store.getState();
    expect(state.selectedParticipants).toHaveLength(0);
  });

  it('should allow setting screen mode to overview', () => {
    store.getState().setScreenMode('overview');
    expect(store.getState().screenMode).toBe('overview');
  });

  it('should allow setting screen mode to thread', () => {
    store.getState().setScreenMode('thread');
    expect(store.getState().screenMode).toBe('thread');
  });
});

// ============================================================================
// SECTION 1.2: CONFIGURATION LOGIC
// ============================================================================

describe('Section 1.2: Configuration Logic', () => {
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
  // Model Selection Tests
  // ==========================================================================

  describe('model Selection', () => {
    it('should allow selecting 2 models for Free tier', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-3.5-turbo' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-instant' }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(2);
    });

    it('should allow selecting up to 5 models for Pro tier', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
        createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }),
        createMockParticipantConfig(3, { modelId: 'meta/llama-2' }),
        createMockParticipantConfig(4, { modelId: 'mistral/mixtral' }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(5);
    });

    it('should allow selecting up to 10 models for Power tier', () => {
      const participants = Array.from({ length: 10 }, (_, i) =>
        createMockParticipantConfig(i, { modelId: `model-${i}` })
      );

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(10);
    });

    it('should preserve model order when selecting participants', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
        createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants[0].modelId).toBe('openai/gpt-4');
      expect(state.selectedParticipants[1].modelId).toBe('anthropic/claude-3');
      expect(state.selectedParticipants[2].modelId).toBe('google/gemini-pro');
    });

    it('should update participants when reordering', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
      ];

      store.getState().setSelectedParticipants(participants);

      // Simulate drag-drop reorder
      const reordered = [
        createMockParticipantConfig(0, { modelId: 'anthropic/claude-3' }),
        createMockParticipantConfig(1, { modelId: 'openai/gpt-4' }),
      ];

      store.getState().setSelectedParticipants(reordered);

      const state = store.getState();
      expect(state.selectedParticipants[0].modelId).toBe('anthropic/claude-3');
      expect(state.selectedParticipants[1].modelId).toBe('openai/gpt-4');
    });
  });

  // ==========================================================================
  // Role Assignment Tests
  // ==========================================================================

  describe('role Assignment', () => {
    it('should allow assigning default roles to models', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'The Critic'
        }),
        createMockParticipantConfig(1, {
          modelId: 'anthropic/claude-3',
          role: 'The Advocate'
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBe('The Critic');
      expect(state.selectedParticipants[1].role).toBe('The Advocate');
    });

    it('should allow assigning custom roles to models', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'Tech Lead'
        }),
        createMockParticipantConfig(1, {
          modelId: 'anthropic/claude-3',
          role: 'Security Expert'
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBe('Tech Lead');
      expect(state.selectedParticipants[1].role).toBe('Security Expert');
    });

    it('should allow null role (no role assigned)', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: null
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBeNull();
    });

    it('should allow changing role after initial assignment', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'The Critic'
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      // Change role
      const updatedParticipants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'The Analyst'
        }),
      ];

      store.getState().setSelectedParticipants(updatedParticipants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBe('The Analyst');
    });
  });

  // ==========================================================================
  // Conversation Mode Tests
  // ==========================================================================

  describe('conversation Mode', () => {
    it('should allow setting Brainstorm mode', () => {
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
      expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
    });

    it('should allow setting Analyze mode', () => {
      store.getState().setSelectedMode(ChatModes.ANALYZING);
      expect(store.getState().selectedMode).toBe(ChatModes.ANALYZING);
    });

    it('should allow setting Debate mode', () => {
      store.getState().setSelectedMode(ChatModes.DEBATING);
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
    });

    it('should allow setting Problem Solve mode', () => {
      store.getState().setSelectedMode(ChatModes.PROBLEM_SOLVING);
      expect(store.getState().selectedMode).toBe(ChatModes.PROBLEM_SOLVING);
    });

    it('should allow changing mode after initial selection', () => {
      store.getState().setSelectedMode(ChatModes.DEBATING);
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);

      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
      expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
    });
  });

  // ==========================================================================
  // Input Value Tests
  // ==========================================================================

  describe('input Value', () => {
    it('should allow setting input value', () => {
      store.getState().setInputValue('What is the best approach?');
      expect(store.getState().inputValue).toBe('What is the best approach?');
    });

    it('should allow clearing input value', () => {
      store.getState().setInputValue('Test message');
      store.getState().setInputValue('');
      expect(store.getState().inputValue).toBe('');
    });

    it('should handle long messages near 5000 char limit', () => {
      const longMessage = 'a'.repeat(4999);
      store.getState().setInputValue(longMessage);
      expect(store.getState().inputValue.length).toBe(4999);
    });

    it('should handle special characters and emojis', () => {
      const specialMessage = '🚀 Test with émojis & spëcial chars!';
      store.getState().setInputValue(specialMessage);
      expect(store.getState().inputValue).toBe(specialMessage);
    });
  });

  // ==========================================================================
  // Web Search Toggle Tests
  // ==========================================================================

  describe('web Search Toggle', () => {
    it('should allow enabling web search', () => {
      store.getState().setEnableWebSearch(true);
      expect(store.getState().enableWebSearch).toBe(true);
    });

    it('should allow disabling web search', () => {
      store.getState().setEnableWebSearch(true);
      store.getState().setEnableWebSearch(false);
      expect(store.getState().enableWebSearch).toBe(false);
    });

    it('should persist web search state', () => {
      store.getState().setEnableWebSearch(true);
      // State should persist for the message
      expect(store.getState().enableWebSearch).toBe(true);
    });
  });
});

// ============================================================================
// SECTION 1.3: SUBMISSION & THREAD CREATION
// ============================================================================

describe('Section 1.3: Submission & Thread Creation', () => {
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
  // Thread Creation State Transitions
  // ==========================================================================

  describe('thread Creation State Transitions', () => {
    it('should transition to creating_thread state on submission', () => {
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

    it('should complete thread creation state transition', () => {
      store.getState().setIsCreatingThread(true);
      store.getState().setIsCreatingThread(false);
      expect(store.getState().isCreatingThread).toBe(false);
    });
  });

  // ==========================================================================
  // Thread Initialization
  // ==========================================================================

  describe('thread Initialization', () => {
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
    });

    it('should set New Chat as initial title', () => {
      const thread = createMockThread({
        id: 'thread-123',
        title: 'New Chat',
        isAiGeneratedTitle: false,
      });

      store.getState().initializeThread(thread, [], []);

      expect(store.getState().thread?.title).toBe('New Chat');
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);
    });

    it('should store user message at top of messages', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const userMessage = createMockUserMessage(0, 'Test question');

      store.getState().initializeThread(thread, [], [userMessage]);

      const state = store.getState();
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].parts?.[0]).toEqual({
        type: 'text',
        text: 'Test question',
      });
    });

    it('should maintain participant order from API', () => {
      const thread = createMockThread({ id: 'thread-123' });
      const participants = [
        createMockParticipant(0, { threadId: 'thread-123', modelId: 'model-a', priority: 0 }),
        createMockParticipant(1, { threadId: 'thread-123', modelId: 'model-b', priority: 1 }),
        createMockParticipant(2, { threadId: 'thread-123', modelId: 'model-c', priority: 2 }),
      ];

      store.getState().initializeThread(thread, participants, []);

      const state = store.getState();
      expect(state.participants[0].priority).toBe(0);
      expect(state.participants[1].priority).toBe(1);
      expect(state.participants[2].priority).toBe(2);
    });
  });

  // ==========================================================================
  // URL Behavior During Initial Round
  // ==========================================================================

  describe('URL Behavior During Initial Round', () => {
    it('should remain on overview screen during initial round streaming', () => {
      // URL should stay at /chat during the initial round streaming
      store.getState().setScreenMode('overview');
      store.getState().setIsStreaming(true);

      expect(store.getState().screenMode).toBe('overview');
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should track navigation state separately from streaming', () => {
      store.getState().setScreenMode('overview');
      store.getState().setIsStreaming(true);

      // Navigation should only happen after analysis completes
      // Streaming state is separate from navigation state
      expect(store.getState().screenMode).toBe('overview');
    });
  });

  // ==========================================================================
  // Input Clearing After Submission
  // ==========================================================================

  describe('input Clearing After Submission', () => {
    it('should clear input after submission', () => {
      store.getState().setInputValue('Test message');
      expect(store.getState().inputValue).toBe('Test message');

      // Simulate clearing after submission
      store.getState().setInputValue('');
      expect(store.getState().inputValue).toBe('');
    });
  });

  // ==========================================================================
  // Complete Flow Integration
  // ==========================================================================

  describe('complete Flow Integration', () => {
    it('should execute full overview to thread creation flow', () => {
      // Step 1: Configure chat
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'The Critic' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'The Advocate' }),
      ];

      store.getState().setSelectedParticipants(participants);
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setInputValue('What is the best approach to API design?');
      store.getState().setEnableWebSearch(false);

      // Verify configuration
      expect(store.getState().selectedParticipants).toHaveLength(2);
      expect(store.getState().selectedMode).toBe(ChatModes.DEBATING);
      expect(store.getState().inputValue).toBe('What is the best approach to API design?');

      // Step 2: Start thread creation
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      expect(store.getState().isCreatingThread).toBe(true);
      expect(store.getState().showInitialUI).toBe(false);

      // Step 3: Receive API response
      const thread = createMockThread({
        id: 'thread-123',
        title: 'New Chat',
        slug: 'api-design-best-practices-abc123',
        mode: ChatModes.DEBATING,
      });

      const dbParticipants = [
        createMockParticipant(0, { threadId: 'thread-123', modelId: 'openai/gpt-4' }),
        createMockParticipant(1, { threadId: 'thread-123', modelId: 'anthropic/claude-3' }),
      ];

      const userMessage = createMockUserMessage(0, 'What is the best approach to API design?');

      store.getState().setCreatedThreadId('thread-123');
      store.getState().initializeThread(thread, dbParticipants, [userMessage]);
      store.getState().setIsCreatingThread(false);

      // Verify final state
      const finalState = store.getState();
      expect(finalState.thread?.id).toBe('thread-123');
      expect(finalState.participants).toHaveLength(2);
      expect(finalState.messages).toHaveLength(1);
      expect(finalState.isCreatingThread).toBe(false);
      expect(finalState.createdThreadId).toBe('thread-123');
    });

    it('should handle thread creation with web search enabled', () => {
      // Configure with web search
      store.getState().setEnableWebSearch(true);
      store.getState().setInputValue('What is the latest in AI?');

      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
      ];
      store.getState().setSelectedParticipants(participants);

      // Start thread creation
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      // Receive API response with web search enabled
      const thread = createMockThread({
        id: 'thread-456',
        enableWebSearch: true,
      });

      store.getState().initializeThread(thread, [], []);

      expect(store.getState().thread?.enableWebSearch).toBe(true);
    });
  });
});

// ============================================================================
// EDGE CASES & ERROR SCENARIOS
// ============================================================================

describe('Edge Cases & Error Scenarios', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should handle empty participant list', () => {
    store.getState().setSelectedParticipants([]);
    expect(store.getState().selectedParticipants).toHaveLength(0);
  });

  it('should handle rapid state changes', () => {
    // Simulate rapid mode changes
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setSelectedMode(ChatModes.BRAINSTORMING);
    store.getState().setSelectedMode(ChatModes.ANALYZING);
    store.getState().setSelectedMode(ChatModes.PROBLEM_SOLVING);

    expect(store.getState().selectedMode).toBe(ChatModes.PROBLEM_SOLVING);
  });

  it('should handle duplicate setCreatedThreadId calls', () => {
    store.getState().setCreatedThreadId('thread-123');
    store.getState().setCreatedThreadId('thread-123');

    expect(store.getState().createdThreadId).toBe('thread-123');
  });

  it('should handle clearing thread ID', () => {
    store.getState().setCreatedThreadId('thread-123');
    store.getState().setCreatedThreadId(null);

    expect(store.getState().createdThreadId).toBeNull();
  });

  it('should maintain state consistency during rapid updates', () => {
    const participants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
    ];

    // Rapid updates
    store.getState().setSelectedParticipants(participants);
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setInputValue('Test');
    store.getState().setEnableWebSearch(true);
    store.getState().setShowInitialUI(false);
    store.getState().setIsCreatingThread(true);

    const state = store.getState();
    expect(state.selectedParticipants).toHaveLength(1);
    expect(state.selectedMode).toBe(ChatModes.DEBATING);
    expect(state.inputValue).toBe('Test');
    expect(state.enableWebSearch).toBe(true);
    expect(state.showInitialUI).toBe(false);
    expect(state.isCreatingThread).toBe(true);
  });
});
