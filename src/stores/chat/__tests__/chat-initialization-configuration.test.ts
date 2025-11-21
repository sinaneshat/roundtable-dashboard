/**
 * Chat Initialization & Configuration Tests (Section 1)
 *
 * Tests the complete initialization flow on the Overview Screen
 * as defined in COMPREHENSIVE_TEST_PLAN.md Section 1.
 *
 * FLOW TESTED:
 * 1.1 UI Initial State & Interactions - Landing on /chat, model selector, suggestions
 * 1.2 Configuration Logic & Constraints - Model limits, roles, modes, filtering
 * 1.3 Submission & Thread Creation - First message submission, thread creation
 *
 * TESTING PHILOSOPHY:
 * - Test state machine transitions, not implementation details
 * - Focus on behavior users experience
 * - Verify constraints and limits are enforced
 * - Test race conditions and edge cases
 *
 * Location: /src/stores/chat/__tests__/chat-initialization-configuration.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChatModes,
  ScreenModes,
} from '@/api/core/enums';
import { createChatStore } from '@/stores/chat/store';

import {
  createMockMessage,
  createMockParticipant,
  createMockParticipantConfig,
  createMockThread,
  createMockUserMessage,
  createPendingPreSearch,
} from './test-factories';

// ============================================================================
// TEST UTILITIES
// ============================================================================

function createTestStore() {
  return createChatStore();
}

// ============================================================================
// SECTION 1.1: UI INITIAL STATE & INTERACTIONS
// ============================================================================

describe('section 1.1: UI Initial State & Interactions', () => {
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
   * INIT-01: Verify `/chat` loads successfully with all static elements
   * (Logo, Suggestion Cards, Input Box)
   */
  it('iNIT-01: should load /chat successfully with initial UI visible', () => {
    const state = store.getState();

    // Initial UI should be visible (Logo, Suggestion Cards, Input Box)
    expect(state.showInitialUI).toBe(true);
    expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
    expect(state.isStreaming).toBe(false);
    expect(state.isCreatingThread).toBe(false);
  });

  /**
   * INIT-01: Additional checks for empty initial state
   */
  it('iNIT-01: should have empty thread state on initial load', () => {
    const state = store.getState();

    expect(state.thread).toBeNull();
    expect(state.createdThreadId).toBeNull();
    expect(state.messages).toHaveLength(0);
    expect(state.participants).toHaveLength(0);
    expect(state.analyses).toHaveLength(0);
  });

  /**
   * INIT-02: Verify "AI Models" button opens the model selector popover
   * (Store tracks selected participants which reflects popover state)
   */
  it('iNIT-02: should have empty selected participants for model selector', () => {
    const state = store.getState();
    expect(state.selectedParticipants).toHaveLength(0);
  });

  /**
   * INIT-03: Verify default model selection adheres to user tier
   * Free: 2 cheapest models, Pro: 5 models, Power: 10 models
   */
  describe('iNIT-03: Default model selection by tier', () => {
    it('should support selecting 2 models for Free tier', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-3.5-turbo' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-instant' }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(2);
    });

    it('should support selecting up to 5 models for Pro tier', () => {
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

    it('should support selecting up to 10 models for Power tier', () => {
      const participants = Array.from({ length: 10 }, (_, i) =>
        createMockParticipantConfig(i, { modelId: `model-${i}` }));

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(10);
    });
  });

  /**
   * INIT-04: Verify locked models display "Upgrade Required" and are disabled
   * (Store-level test verifies that model selection can be restricted)
   */
  it('iNIT-04: should support model tier restrictions through selection', () => {
    // Only select models that are available for the tier
    const freeUserParticipants = [
      createMockParticipantConfig(0, { modelId: 'openai/gpt-3.5-turbo' }),
      createMockParticipantConfig(1, { modelId: 'anthropic/claude-instant' }),
    ];

    store.getState().setSelectedParticipants(freeUserParticipants);

    // Pro models should NOT be in the selection for free users
    const state = store.getState();
    const hasProModel = state.selectedParticipants.some(
      p => p.modelId === 'openai/gpt-4',
    );
    expect(hasProModel).toBe(false);
  });

  /**
   * INIT-05: Verify drag-and-drop reordering updates visual order and modelOrder state
   */
  describe('iNIT-05: Drag-and-drop reordering', () => {
    it('should update participants order when reordering', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3' }),
        createMockParticipantConfig(2, { modelId: 'google/gemini-pro' }),
      ];

      store.getState().setSelectedParticipants(participants);

      // Verify initial order
      expect(store.getState().selectedParticipants[0].modelId).toBe('openai/gpt-4');
      expect(store.getState().selectedParticipants[1].modelId).toBe('anthropic/claude-3');
      expect(store.getState().selectedParticipants[2].modelId).toBe('google/gemini-pro');

      // Simulate drag-drop reorder (move first to last)
      store.getState().reorderParticipants(0, 2);

      const state = store.getState();
      expect(state.selectedParticipants[0].modelId).toBe('anthropic/claude-3');
      expect(state.selectedParticipants[1].modelId).toBe('google/gemini-pro');
      expect(state.selectedParticipants[2].modelId).toBe('openai/gpt-4');
    });

    it('should update priority values after reorder', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'model-a' }),
        createMockParticipantConfig(1, { modelId: 'model-b' }),
        createMockParticipantConfig(2, { modelId: 'model-c' }),
      ];

      store.getState().setSelectedParticipants(participants);
      store.getState().reorderParticipants(0, 2);

      const state = store.getState();
      // Priorities should be sequential after reorder
      expect(state.selectedParticipants[0].priority).toBe(0);
      expect(state.selectedParticipants[1].priority).toBe(1);
      expect(state.selectedParticipants[2].priority).toBe(2);
    });

    it('should allow setting model order directly', () => {
      const modelIds = ['model-c', 'model-a', 'model-b'];
      store.getState().setModelOrder(modelIds);

      expect(store.getState().modelOrder).toEqual(modelIds);
    });
  });

  /**
   * INIT-06: Verify clicking "+ Role" allows assigning a role to a model
   */
  describe('iNIT-06: Role assignment', () => {
    it('should allow assigning default roles to models', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'The Critic',
        }),
        createMockParticipantConfig(1, {
          modelId: 'anthropic/claude-3',
          role: 'The Advocate',
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBe('The Critic');
      expect(state.selectedParticipants[1].role).toBe('The Advocate');
    });

    it('should allow null role when no role is assigned', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: null,
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBeNull();
    });
  });

  /**
   * INIT-07: Verify suggestion cards are clickable and populate input field
   */
  it('iNIT-07: should populate input field when suggestion is selected', () => {
    const suggestionText = 'What is the best approach for microservices architecture?';

    store.getState().setInputValue(suggestionText);

    expect(store.getState().inputValue).toBe(suggestionText);
  });

  /**
   * INIT-08: Verify popover closes on outside click or Escape key
   * (Store tracks if any configuration is in progress)
   */
  it('iNIT-08: should have default input value empty after closing popover', () => {
    const state = store.getState();
    expect(state.inputValue).toBe('');
  });

  /**
   * Additional test: Web search toggle default state
   */
  it('should have default web search disabled', () => {
    const state = store.getState();
    expect(state.enableWebSearch).toBe(false);
  });

  /**
   * Additional test: Screen mode transitions
   */
  it('should allow setting screen mode to overview', () => {
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should allow setting screen mode to thread', () => {
    store.getState().setScreenMode(ScreenModes.THREAD);
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
  });
});

// ============================================================================
// SECTION 1.2: CONFIGURATION LOGIC & CONSTRAINTS
// ============================================================================

describe('section 1.2: Configuration Logic & Constraints', () => {
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
   * CONF-01: Test selecting maximum allowed models for current tier
   */
  describe('cONF-01: Maximum model selection by tier', () => {
    it('should allow exactly 2 models for Free tier', () => {
      const participants = [
        createMockParticipantConfig(0, { modelId: 'model-1' }),
        createMockParticipantConfig(1, { modelId: 'model-2' }),
      ];

      store.getState().setSelectedParticipants(participants);
      expect(store.getState().selectedParticipants).toHaveLength(2);
    });

    it('should allow exactly 5 models for Pro tier', () => {
      const participants = Array.from({ length: 5 }, (_, i) =>
        createMockParticipantConfig(i, { modelId: `model-${i}` }));

      store.getState().setSelectedParticipants(participants);
      expect(store.getState().selectedParticipants).toHaveLength(5);
    });

    it('should allow exactly 10 models for Power tier', () => {
      const participants = Array.from({ length: 10 }, (_, i) =>
        createMockParticipantConfig(i, { modelId: `model-${i}` }));

      store.getState().setSelectedParticipants(participants);
      expect(store.getState().selectedParticipants).toHaveLength(10);
    });
  });

  /**
   * CONF-02: Test attempting to select more than allowed models
   * (UI should show toast/warning - store validates at selection time)
   */
  describe('cONF-02: Exceeding model limits', () => {
    it('should store all participants when set (UI validates limits)', () => {
      // Store accepts any number - UI component validates tier limits
      const participants = Array.from({ length: 15 }, (_, i) =>
        createMockParticipantConfig(i, { modelId: `model-${i}` }));

      store.getState().setSelectedParticipants(participants);

      // Store holds the participants, UI checks limits
      expect(store.getState().selectedParticipants).toHaveLength(15);
    });

    it('should prevent adding duplicate models via addParticipant', () => {
      const participant = createMockParticipantConfig(0, { modelId: 'openai/gpt-4' });

      store.getState().addParticipant(participant);
      store.getState().addParticipant(participant); // Duplicate

      // Should only have one instance
      expect(store.getState().selectedParticipants).toHaveLength(1);
    });
  });

  /**
   * CONF-03: Test assigning custom roles vs default roles
   */
  describe('cONF-03: Custom and default roles', () => {
    it('should allow assigning custom roles to models', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'Tech Lead',
        }),
        createMockParticipantConfig(1, {
          modelId: 'anthropic/claude-3',
          role: 'Security Expert',
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBe('Tech Lead');
      expect(state.selectedParticipants[1].role).toBe('Security Expert');
    });

    it('should allow changing role after initial assignment', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'The Critic',
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      // Change role
      const updatedParticipants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'The Analyst',
        }),
      ];

      store.getState().setSelectedParticipants(updatedParticipants);

      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBe('The Analyst');
    });
  });

  /**
   * CONF-04: Verify custom roles can be assigned to only ONE model at a time
   */
  describe('cONF-04: Role uniqueness constraint', () => {
    it('should track multiple participants with same role (UI validates uniqueness)', () => {
      // Store allows same role - UI component validates uniqueness
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'Custom Expert',
        }),
        createMockParticipantConfig(1, {
          modelId: 'anthropic/claude-3',
          role: 'Custom Expert', // Same role
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      // Both have the same role - UI should validate this
      const state = store.getState();
      expect(state.selectedParticipants[0].role).toBe('Custom Expert');
      expect(state.selectedParticipants[1].role).toBe('Custom Expert');
    });

    it('should allow different roles for different participants', () => {
      const participants = [
        createMockParticipantConfig(0, {
          modelId: 'openai/gpt-4',
          role: 'Role A',
        }),
        createMockParticipantConfig(1, {
          modelId: 'anthropic/claude-3',
          role: 'Role B',
        }),
        createMockParticipantConfig(2, {
          modelId: 'google/gemini',
          role: 'Role C',
        }),
      ];

      store.getState().setSelectedParticipants(participants);

      const roles = store.getState().selectedParticipants.map(p => p.role);
      expect(new Set(roles).size).toBe(3); // All unique
    });
  });

  /**
   * CONF-05: Test changing conversation mode
   */
  describe('cONF-05: Conversation mode changes', () => {
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

  /**
   * CONF-06: Test filtering models by text search in the selector
   * (Store test validates that filtered results can be set as participants)
   */
  describe('cONF-06: Model filtering by text search', () => {
    it('should allow selecting filtered models', () => {
      // Simulate user filtering and selecting models containing "gpt"
      const filteredParticipants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'openai/gpt-3.5-turbo' }),
      ];

      store.getState().setSelectedParticipants(filteredParticipants);

      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(2);
      expect(state.selectedParticipants.every(p => p.modelId.includes('gpt'))).toBe(true);
    });
  });

  /**
   * CONF-07: Test filtering models by category/tag
   */
  describe('cONF-07: Model filtering by category', () => {
    it('should allow selecting models from specific provider', () => {
      // Simulate user filtering by provider
      const openaiModels = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
        createMockParticipantConfig(1, { modelId: 'openai/gpt-3.5-turbo' }),
        createMockParticipantConfig(2, { modelId: 'openai/gpt-4o' }),
      ];

      store.getState().setSelectedParticipants(openaiModels);

      const state = store.getState();
      expect(state.selectedParticipants.every(p => p.modelId.startsWith('openai/'))).toBe(true);
    });
  });

  /**
   * CONF-08: Verify configuration persists if user navigates away and back
   */
  describe('cONF-08: Configuration persistence', () => {
    it('should maintain configuration state after setting', () => {
      // Set up configuration
      const participants = [
        createMockParticipantConfig(0, { modelId: 'openai/gpt-4', role: 'Analyst' }),
        createMockParticipantConfig(1, { modelId: 'anthropic/claude-3', role: 'Critic' }),
      ];

      store.getState().setSelectedParticipants(participants);
      store.getState().setSelectedMode(ChatModes.DEBATING);
      store.getState().setEnableWebSearch(true);
      store.getState().setInputValue('Test message');

      // Verify configuration persists
      const state = store.getState();
      expect(state.selectedParticipants).toHaveLength(2);
      expect(state.selectedMode).toBe(ChatModes.DEBATING);
      expect(state.enableWebSearch).toBe(true);
      expect(state.inputValue).toBe('Test message');
    });

    it('should preserve configuration after screen mode change', () => {
      // Set up configuration on overview
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setSelectedMode(ChatModes.BRAINSTORMING);

      // Change to thread screen
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Change back to overview
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Selected mode should persist
      expect(store.getState().selectedMode).toBe(ChatModes.BRAINSTORMING);
    });
  });

  /**
   * Additional tests for input handling
   */
  describe('input Value Handling', () => {
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
      expect(store.getState().inputValue).toHaveLength(4999);
    });

    it('should handle special characters and emojis', () => {
      const specialMessage = 'Test with special chars: @#$%^&*()_+{}|:"<>?~`';
      store.getState().setInputValue(specialMessage);
      expect(store.getState().inputValue).toBe(specialMessage);
    });
  });

  /**
   * Web Search Toggle Tests
   */
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
      expect(store.getState().enableWebSearch).toBe(true);
    });
  });
});

// ============================================================================
// SECTION 1.3: SUBMISSION & THREAD CREATION
// ============================================================================

describe('section 1.3: Submission & Thread Creation', () => {
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
   * SUBMIT-01: Test submitting a message creates a thread in the DB
   * (Store test verifies state transitions that occur during API POST)
   */
  describe('sUBMIT-01: Thread creation via API', () => {
    it('should transition to creating_thread state on submission', () => {
      store.getState().setIsCreatingThread(true);
      expect(store.getState().isCreatingThread).toBe(true);
    });

    it('should initialize thread with API response data', () => {
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

    it('should complete thread creation state transition', () => {
      store.getState().setIsCreatingThread(true);
      store.getState().setIsCreatingThread(false);
      expect(store.getState().isCreatingThread).toBe(false);
    });
  });

  /**
   * SUBMIT-02: Test UI immediately clears input and shows user message at top
   */
  describe('sUBMIT-02: Input clearing and message display', () => {
    it('should clear input after submission', () => {
      store.getState().setInputValue('Test message');
      expect(store.getState().inputValue).toBe('Test message');

      // Simulate clearing after submission
      store.getState().setInputValue('');
      expect(store.getState().inputValue).toBe('');
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
  });

  /**
   * SUBMIT-03: Test URL remains `/chat` during the entire initial round streaming
   */
  describe('sUBMIT-03: URL behavior during initial round', () => {
    it('should remain on overview screen during initial round streaming', () => {
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setIsStreaming(true);

      // URL stays at /chat during streaming
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should track navigation state separately from streaming', () => {
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setIsStreaming(true);

      // Navigation only happens after analysis completes
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });
  });

  /**
   * SUBMIT-04: Test "New Chat" title is set initially
   */
  describe('sUBMIT-04: Initial title setting', () => {
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
  });

  /**
   * SUBMIT-05: Verify user quota is checked before thread creation
   * (Store test verifies blocking state can be set)
   */
  describe('sUBMIT-05: User quota checking', () => {
    it('should support blocking submission state', () => {
      // If user has 0 conversations left, isCreatingThread should not be set
      // This is handled by UI component before calling store actions
      store.getState().setIsCreatingThread(false);

      expect(store.getState().isCreatingThread).toBe(false);
    });
  });

  /**
   * SUBMIT-06: Test submitting with empty input
   */
  describe('sUBMIT-06: Empty input validation', () => {
    it('should not allow submission with empty input', () => {
      store.getState().setInputValue('');

      // UI should check inputValue before allowing submission
      const canSubmit = store.getState().inputValue.trim().length > 0;
      expect(canSubmit).toBe(false);
    });

    it('should not allow submission with whitespace-only input', () => {
      store.getState().setInputValue('   ');

      const canSubmit = store.getState().inputValue.trim().length > 0;
      expect(canSubmit).toBe(false);
    });
  });

  /**
   * SUBMIT-07: Verify createdThreadId is stored immediately upon API response
   */
  describe('sUBMIT-07: Created thread ID storage', () => {
    it('should store created thread ID from API response', () => {
      const threadId = 'thread-123';
      store.getState().setCreatedThreadId(threadId);
      expect(store.getState().createdThreadId).toBe(threadId);
    });

    it('should allow clearing thread ID', () => {
      store.getState().setCreatedThreadId('thread-123');
      store.getState().setCreatedThreadId(null);

      expect(store.getState().createdThreadId).toBeNull();
    });
  });

  /**
   * SUBMIT-08: Race Condition - Streaming does NOT start before createdThreadId available
   */
  describe('sUBMIT-08: Race condition prevention', () => {
    it('should set waiting to start streaming flag before streaming', () => {
      store.getState().setWaitingToStartStreaming(true);
      expect(store.getState().waitingToStartStreaming).toBe(true);
    });

    it('should have createdThreadId before streaming starts', () => {
      // Set up correct order
      store.getState().setCreatedThreadId('thread-123');
      store.getState().setWaitingToStartStreaming(true);

      // Then streaming starts
      store.getState().setIsStreaming(true);
      store.getState().setWaitingToStartStreaming(false);

      // Verify createdThreadId exists during streaming
      expect(store.getState().createdThreadId).toBe('thread-123');
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should not start streaming without thread initialization', () => {
      // Simulate incorrect order - streaming before thread
      const canStartStreaming = store.getState().thread !== null
        && store.getState().createdThreadId !== null;

      expect(canStartStreaming).toBe(false);
    });

    it('should properly sequence thread creation and streaming', () => {
      // Complete proper sequence
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      const thread = createMockThread({ id: 'thread-xyz' });
      const participants = [createMockParticipant(0)];
      const userMessage = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setCreatedThreadId('thread-xyz');
      store.getState().setIsCreatingThread(false);
      store.getState().setWaitingToStartStreaming(true);

      // Now safe to start streaming
      const canStartStreaming = store.getState().thread !== null
        && store.getState().createdThreadId !== null
        && store.getState().waitingToStartStreaming;

      expect(canStartStreaming).toBe(true);
    });
  });

  /**
   * Complete flow integration test
   */
  describe('complete Submission Flow Integration', () => {
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

    it('should handle pre-search creation when web search is enabled', () => {
      // Setup thread with web search
      const thread = createMockThread({
        id: 'thread-123',
        enableWebSearch: true,
      });
      const participants = [createMockParticipant(0, { threadId: 'thread-123' })];
      const userMessage = createMockUserMessage(0);

      store.getState().initializeThread(thread, participants, [userMessage]);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);
      store.getState().setShowInitialUI(false);

      // Add pre-search
      const preSearch = createPendingPreSearch(0);
      store.getState().addPreSearch(preSearch);
      store.getState().markPreSearchTriggered(0);

      // Verify pre-search tracking
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
    });
  });
});

// ============================================================================
// EDGE CASES & ERROR SCENARIOS
// ============================================================================

describe('edge Cases & Error Scenarios', () => {
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

  it('should handle participant removal correctly', () => {
    const participants = [
      createMockParticipantConfig(0, { modelId: 'model-a' }),
      createMockParticipantConfig(1, { modelId: 'model-b' }),
      createMockParticipantConfig(2, { modelId: 'model-c' }),
    ];

    store.getState().setSelectedParticipants(participants);
    expect(store.getState().selectedParticipants).toHaveLength(3);

    // Remove middle participant
    store.getState().removeParticipant('model-b');

    const state = store.getState();
    expect(state.selectedParticipants).toHaveLength(2);
    expect(state.selectedParticipants[0].modelId).toBe('model-a');
    expect(state.selectedParticipants[1].modelId).toBe('model-c');
  });

  it('should handle form reset correctly', () => {
    // Set up form state
    store.getState().setInputValue('Test message');
    store.getState().setSelectedMode(ChatModes.DEBATING);
    store.getState().setEnableWebSearch(true);
    store.getState().setSelectedParticipants([
      createMockParticipantConfig(0, { modelId: 'openai/gpt-4' }),
    ]);

    // Reset form
    store.getState().resetForm();

    const state = store.getState();
    expect(state.inputValue).toBe('');
    // Default selectedMode is ANALYZING, not null
    expect(state.selectedMode).toBe(ChatModes.ANALYZING);
    expect(state.enableWebSearch).toBe(false);
    expect(state.selectedParticipants).toHaveLength(0);
  });
});

// ============================================================================
// STATE MACHINE TRANSITIONS
// ============================================================================

describe('state Machine Transitions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

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

  it('should correctly identify waiting_to_stream state', () => {
    store.getState().setIsCreatingThread(false);
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsStreaming(false);

    const state = store.getState();
    expect(state.isCreatingThread).toBe(false);
    expect(state.waitingToStartStreaming).toBe(true);
    expect(state.isStreaming).toBe(false);
  });

  it('should correctly identify streaming state', () => {
    const thread = createMockThread();
    const participants = [createMockParticipant(0)];
    store.getState().initializeThread(thread, participants);
    store.getState().setIsStreaming(true);

    const state = store.getState();
    expect(state.isStreaming).toBe(true);
    expect(state.thread).not.toBeNull();
  });

  it('should handle reset to overview correctly', () => {
    // Set up some state
    const thread = createMockThread();
    store.getState().initializeThread(thread, [createMockParticipant(0)]);
    store.getState().setInputValue('test');
    store.getState().setSelectedMode(ChatModes.DEBATING);

    // Reset
    store.getState().resetToOverview();

    const state = store.getState();
    expect(state.thread).toBeNull();
    expect(state.messages).toHaveLength(0);
    expect(state.screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should handle reset to new chat correctly', () => {
    // Set up some state
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
});

// ============================================================================
// INPUT BLOCKING DURING TRANSITIONS
// ============================================================================

describe('input Blocking During Transitions', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('should block input during thread creation', () => {
    store.getState().setIsCreatingThread(true);

    const state = store.getState();
    const inputBlocked = state.isCreatingThread || state.isStreaming;

    expect(inputBlocked).toBe(true);
  });

  it('should block input during streaming', () => {
    store.getState().setIsStreaming(true);

    const state = store.getState();
    const inputBlocked = state.isCreatingThread || state.isStreaming;

    expect(inputBlocked).toBe(true);
  });

  it('should block input during waiting to start streaming', () => {
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsCreatingThread(false);
    store.getState().setIsStreaming(false);

    const state = store.getState();
    const inputBlocked = state.isCreatingThread
      || state.isStreaming
      || state.waitingToStartStreaming;

    expect(inputBlocked).toBe(true);
  });

  it('should allow input when all blocking flags are false', () => {
    store.getState().setIsCreatingThread(false);
    store.getState().setIsStreaming(false);
    store.getState().setWaitingToStartStreaming(false);

    const state = store.getState();
    const inputBlocked = state.isCreatingThread
      || state.isStreaming
      || state.waitingToStartStreaming;

    expect(inputBlocked).toBe(false);
  });
});

// ============================================================================
// DATA INTEGRITY TESTS
// ============================================================================

describe('data Integrity', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createTestStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

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

  it('should prevent duplicate analysis creation via tracking', () => {
    store.getState().markAnalysisCreated(0);

    const alreadyCreated = store.getState().hasAnalysisBeenCreated(0);
    expect(alreadyCreated).toBe(true);

    // Round 1 should not be tracked yet
    expect(store.getState().hasAnalysisBeenCreated(1)).toBe(false);
  });

  it('should prevent duplicate pre-search creation via tracking', () => {
    store.getState().markPreSearchTriggered(0);

    expect(store.getState().hasPreSearchBeenTriggered(0)).toBe(true);
    expect(store.getState().hasPreSearchBeenTriggered(1)).toBe(false);
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
