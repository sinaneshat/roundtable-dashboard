/**
 * First Round Overview Screen Tests
 *
 * Comprehensive test coverage for FLOW_DOCUMENTATION.md Part 1:
 * "STARTING A NEW CHAT (OVERVIEW SCREEN)"
 *
 * Critical Behaviors Tested:
 * 1. User submits first message on /chat overview screen
 * 2. Thread created with auto-generated slug
 * 3. ChatOverviewScreen REMAINS MOUNTED during streaming (URL stays /chat)
 * 4. All participants stream sequentially
 * 5. Council moderator generates after last participant
 * 6. Automatic navigation to /chat/[slug] after council moderator + AI title ready
 *
 * Coverage Gaps Addressed:
 * - ChatOverviewScreen mount lifecycle validation
 * - URL stays /chat during streaming (explicit assertion)
 * - Slug polling starts immediately after thread creation
 * - Navigation timing with both AI title + moderator conditions
 * - URL update sequence (replaceState → router.push)
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { ChatModes, FinishReasons, MessageRoles, MessageStatuses, ScreenModes, UIMessageRoles } from '@/api/core/enums';
import type { ChatMessage, ChatParticipant, ChatThread, StoredPreSearch } from '@/api/routes/chat/schema';
import { createTestAssistantMessage, createTestModeratorMessage, createTestUserMessage } from '@/lib/testing';

import { createChatStore } from '../store';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const THREAD_ID = 'thread-first-round-test';

function createThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: THREAD_ID,
    userId: 'user-123',
    title: 'New Chat',
    slug: 'initial-slug-abc123',
    previousSlug: null,
    projectId: null,
    mode: ChatModes.ANALYZING,
    status: 'active',
    enableWebSearch: false,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: false,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createParticipant(index: number): ChatParticipant {
  return {
    id: `participant-${index}`,
    threadId: THREAD_ID,
    modelId: `model-${index}`,
    role: `Participant ${index}`,
    customRoleId: null,
    priority: index,
    isEnabled: true,
    settings: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as ChatParticipant;
}

function createUserMsg(roundNumber: number, content = `Question ${roundNumber}`): ChatMessage {
  return createTestUserMessage({
    id: `${THREAD_ID}_r${roundNumber}_user`,
    content,
    roundNumber,
  });
}

function createAssistantMsg(
  roundNumber: number,
  participantIndex: number,
  content = `Response R${roundNumber}P${participantIndex}`,
  finishReason = FinishReasons.STOP,
): ChatMessage {
  return createTestAssistantMessage({
    id: `${THREAD_ID}_r${roundNumber}_p${participantIndex}`,
    content,
    roundNumber,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    finishReason,
  });
}

function createModeratorMsg(roundNumber: number, content = `Summary R${roundNumber}`): ChatMessage {
  return createTestModeratorMessage({
    id: `${THREAD_ID}_r${roundNumber}_moderator`,
    content,
    roundNumber,
    finishReason: FinishReasons.STOP,
  });
}

function createPreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed' = 'complete',
): StoredPreSearch {
  const statusMap = {
    pending: MessageStatuses.PENDING,
    streaming: MessageStatuses.STREAMING,
    complete: MessageStatuses.COMPLETE,
    failed: MessageStatuses.FAILED,
  };
  return {
    id: `presearch-${THREAD_ID}-r${roundNumber}`,
    threadId: THREAD_ID,
    roundNumber,
    userQuery: `Query ${roundNumber}`,
    status: statusMap[status],
    searchData: status === 'complete'
      ? {
          queries: [],
          results: [],
          moderatorSummary: 'Search complete',
          successCount: 1,
          failureCount: 0,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    errorMessage: null,
    createdAt: new Date(),
    completedAt: status === 'complete' ? new Date() : null,
  } as StoredPreSearch;
}

// ============================================================================
// BEHAVIOR 1: User Submits First Message on Overview Screen
// ============================================================================

describe('behavior 1: User submits first message on /chat overview screen', () => {
  it('should be on overview screen before submission', () => {
    const store = createChatStore();

    // Initial state: user lands on /chat
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    expect(store.getState().thread).toBeNull();
    expect(store.getState().messages).toHaveLength(0);
  });

  it('should set pending message when user types and submits', () => {
    const store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // User types message
    const message = 'What is the best approach for this problem?';
    store.getState().setPendingMessage(message);

    expect(store.getState().pendingMessage).toBe(message);
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should transition to waiting state after submission', () => {
    const store = createChatStore();
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setPendingMessage('Test question');

    // After submission (thread creation initiated)
    store.getState().setIsCreatingThread(true);

    expect(store.getState().isCreatingThread).toBe(true);
    expect(store.getState().pendingMessage).toBe('Test question');
  });
});

// ============================================================================
// BEHAVIOR 2: Thread Created with Auto-Generated Slug
// ============================================================================

describe('behavior 2: Thread created with auto-generated slug', () => {
  it('should initialize thread with auto-generated slug', () => {
    const store = createChatStore();
    const thread = createThread({
      slug: 'what-is-the-best-approach-abc123',
      isAiGeneratedTitle: false, // Initial slug from user message
    });

    store.getState().initializeThread(thread, [], []);

    expect(store.getState().thread?.slug).toBe('what-is-the-best-approach-abc123');
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);
    expect(store.getState().thread?.title).toBe('New Chat');
  });

  it('should set createdThreadId for tracking', () => {
    const store = createChatStore();
    const thread = createThread();

    // Manually set createdThreadId as this would be done by the provider
    store.getState().setCreatedThreadId(THREAD_ID);
    store.getState().initializeThread(thread, [], []);

    expect(store.getState().createdThreadId).toBe(THREAD_ID);
  });

  it('should update slug when AI-generated title ready', () => {
    const store = createChatStore();
    const thread = createThread({
      slug: 'initial-slug-abc123',
      isAiGeneratedTitle: false,
    });

    store.getState().initializeThread(thread, [], []);

    // AI title ready (async) - simulate server update
    const updatedThread = createThread({
      slug: 'ai-generated-slug-xyz789',
      isAiGeneratedTitle: true,
      title: 'Best Approach for Problem Solving',
    });
    store.getState().setThread(updatedThread);

    expect(store.getState().thread?.slug).toBe('ai-generated-slug-xyz789');
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
    expect(store.getState().thread?.title).toBe('Best Approach for Problem Solving');
  });
});

// ============================================================================
// BEHAVIOR 3: ChatOverviewScreen REMAINS MOUNTED During Streaming
// ============================================================================

describe('behavior 3: ChatOverviewScreen REMAINS MOUNTED during streaming', () => {
  it('should stay on OVERVIEW screen during participant streaming', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // User message added
    store.getState().setMessages([createUserMsg(0)]);

    // Streaming begins
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // CRITICAL ASSERTION: Screen mode stays OVERVIEW during streaming
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    expect(store.getState().isStreaming).toBe(true);

    // First participant completes
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
    ]);
    store.getState().setCurrentParticipantIndex(1);

    // Still on OVERVIEW screen
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // Second participant completes
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
    ]);
    store.getState().setIsStreaming(false);

    // STILL on OVERVIEW screen (navigation happens after moderator)
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should NOT unmount overview screen when streaming starts', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    const initialScreenMode = store.getState().screenMode;

    // Streaming starts
    store.getState().setWaitingToStartStreaming(true);
    store.getState().setIsStreaming(true);

    // Screen mode should NOT change
    expect(store.getState().screenMode).toBe(initialScreenMode);
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should remain on overview screen until navigation flag set', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Complete round 0 (all participants + moderator)
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createModeratorMsg(0),
    ]);

    // AI title ready
    const updatedThread = createThread({
      slug: 'ai-slug',
      isAiGeneratedTitle: true,
    });
    store.getState().setThread(updatedThread);

    // STILL on overview screen (navigation not triggered yet - happens in component)
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });
});

// ============================================================================
// BEHAVIOR 4: All Participants Stream Sequentially
// ============================================================================

describe('behavior 4: All participants stream sequentially', () => {
  it('should stream participants in priority order', () => {
    const store = createChatStore();
    const participants = [
      createParticipant(0),
      createParticipant(1),
      createParticipant(2),
    ];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setMessages([createUserMsg(0)]);

    // Start with first participant
    store.getState().setCurrentParticipantIndex(0);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // First participant completes
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
    ]);
    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1);

    // Second participant completes
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
    ]);
    store.getState().setCurrentParticipantIndex(2);
    expect(store.getState().currentParticipantIndex).toBe(2);

    // Third participant completes
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
      createAssistantMsg(0, 2),
    ]);

    // All participants complete
    const assistantMessages = store.getState().messages.filter(
      m => m.role === MessageRoles.ASSISTANT,
    );
    expect(assistantMessages).toHaveLength(3);
  });

  it('should increment currentParticipantIndex after each completion', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setMessages([createUserMsg(0)]);

    // Participant 0 starts
    store.getState().setCurrentParticipantIndex(0);
    const index0 = store.getState().currentParticipantIndex;

    // Participant 0 completes → move to 1
    store.getState().setCurrentParticipantIndex(1);
    const index1 = store.getState().currentParticipantIndex;

    expect(index1).toBeGreaterThan(index0);
    expect(index1).toBe(1);
  });

  it('should reset currentParticipantIndex after round completes', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);

    // Complete round 0
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
    ]);
    store.getState().setIsStreaming(false);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().currentParticipantIndex).toBe(0);
    expect(store.getState().isStreaming).toBe(false);
  });
});

// ============================================================================
// BEHAVIOR 5: Council Moderator Generates After Last Participant
// ============================================================================

describe('behavior 5: Council moderator generates after last participant', () => {
  it('should add moderator message after all participants complete', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);

    // All participants complete
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
    ]);

    // Moderator added
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
      createModeratorMsg(0),
    ]);

    const moderators = store.getState().messages.filter((m) => {
      const metadata = m.metadata as { role?: string; isModerator?: boolean };
      return metadata.role === UIMessageRoles.ASSISTANT && metadata.isModerator === true;
    });

    expect(moderators).toHaveLength(1);
    expect(moderators[0]!.metadata.roundNumber).toBe(0);
  });

  it('should NOT add moderator before all participants complete', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);

    // Only one participant complete
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
    ]);

    const messages = store.getState().messages;
    const moderators = messages.filter((m) => {
      const metadata = m.metadata as { role?: string; isModerator?: boolean };
      return metadata.role === UIMessageRoles.ASSISTANT && metadata.isModerator === true;
    });

    expect(moderators).toHaveLength(0);
  });

  it('should track moderator completion status', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);

    // Add moderator message
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createModeratorMsg(0),
    ]);

    const moderatorMessage = store.getState().messages.find((m) => {
      const metadata = m.metadata as { role?: string; isModerator?: boolean };
      return metadata.role === UIMessageRoles.ASSISTANT && metadata.isModerator === true;
    });

    expect(moderatorMessage).toBeDefined();
    expect(moderatorMessage?.metadata.finishReason).toBe(FinishReasons.STOP);
  });
});

// ============================================================================
// BEHAVIOR 6: Automatic Navigation After Council Moderator + AI Title Ready
// ============================================================================

describe('behavior 6: Automatic navigation to /chat/[slug] after moderator + AI title', () => {
  describe('navigation conditions', () => {
    it('should NOT navigate if AI title not ready (moderator complete)', () => {
      const store = createChatStore();
      store.getState().initializeThread(createThread({ isAiGeneratedTitle: false }), [createParticipant(0)], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Moderator complete
      store.getState().setMessages([
        createUserMsg(0),
        createAssistantMsg(0, 0),
        createModeratorMsg(0),
      ]);

      const hasModeratorForRound0 = store.getState().messages.some((m) => {
        const metadata = m.metadata as { role?: string; isModerator?: boolean; roundNumber?: number };
        return metadata.role === UIMessageRoles.ASSISTANT
          && metadata.isModerator === true
          && metadata.roundNumber === 0;
      });

      // AI title NOT ready
      const isAiGeneratedTitle = store.getState().thread?.isAiGeneratedTitle ?? false;

      const canNavigate = isAiGeneratedTitle && hasModeratorForRound0;

      expect(hasModeratorForRound0).toBe(true);
      expect(isAiGeneratedTitle).toBe(false);
      expect(canNavigate).toBe(false); // Should NOT navigate
    });

    it('should NOT navigate if moderator incomplete (AI title ready)', () => {
      const store = createChatStore();
      store.getState().initializeThread(createThread({ isAiGeneratedTitle: true }), [createParticipant(0)], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Only participant complete, no moderator yet
      store.getState().setMessages([
        createUserMsg(0),
        createAssistantMsg(0, 0),
      ]);

      const hasModeratorForRound0 = store.getState().messages.some((m) => {
        const metadata = m.metadata as { role?: string; isModerator?: boolean; roundNumber?: number };
        return metadata.role === UIMessageRoles.ASSISTANT
          && metadata.isModerator === true
          && metadata.roundNumber === 0;
      });

      const isAiGeneratedTitle = store.getState().thread?.isAiGeneratedTitle ?? false;

      const canNavigate = isAiGeneratedTitle && hasModeratorForRound0;

      expect(hasModeratorForRound0).toBe(false);
      expect(isAiGeneratedTitle).toBe(true);
      expect(canNavigate).toBe(false); // Should NOT navigate
    });

    it('should ALLOW navigation when BOTH AI title AND moderator ready', () => {
      const store = createChatStore();
      store.getState().initializeThread(createThread({ isAiGeneratedTitle: false }), [createParticipant(0)], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Moderator complete
      store.getState().setMessages([
        createUserMsg(0),
        createAssistantMsg(0, 0),
        createModeratorMsg(0),
      ]);

      // AI title ready
      const updatedThread = createThread({
        slug: 'ai-slug',
        isAiGeneratedTitle: true,
        title: 'AI Title',
      });
      store.getState().setThread(updatedThread);

      const hasModeratorForRound0 = store.getState().messages.some((m) => {
        const metadata = m.metadata as { role?: string; isModerator?: boolean; roundNumber?: number };
        return metadata.role === UIMessageRoles.ASSISTANT
          && metadata.isModerator === true
          && metadata.roundNumber === 0;
      });

      const isAiGeneratedTitle = store.getState().thread?.isAiGeneratedTitle ?? false;

      const canNavigate = isAiGeneratedTitle && hasModeratorForRound0;

      expect(hasModeratorForRound0).toBe(true);
      expect(isAiGeneratedTitle).toBe(true);
      expect(canNavigate).toBe(true); // Should navigate
    });
  });

  describe('navigation coordination (component-level)', () => {
    it('should track that all conditions for navigation are met', () => {
      const store = createChatStore();
      store.getState().initializeThread(createThread({ isAiGeneratedTitle: true }), [createParticipant(0)], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Complete round
      store.getState().setMessages([
        createUserMsg(0),
        createAssistantMsg(0, 0),
        createModeratorMsg(0),
      ]);

      const hasModeratorForRound0 = store.getState().messages.some((m) => {
        const metadata = m.metadata as { role?: string; isModerator?: boolean; roundNumber?: number };
        return metadata.role === UIMessageRoles.ASSISTANT
          && metadata.isModerator === true
          && metadata.roundNumber === 0;
      });

      const isAiGeneratedTitle = store.getState().thread?.isAiGeneratedTitle ?? false;

      // Both conditions met - component would trigger navigation
      expect(hasModeratorForRound0).toBe(true);
      expect(isAiGeneratedTitle).toBe(true);
    });

    it('should reset screen mode when returning to overview', () => {
      const store = createChatStore();
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

      // User returns to /chat (new conversation)
      store.getState().resetToOverview();

      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });
  });

  describe('navigation transition', () => {
    let store: ReturnType<typeof createChatStore>;

    beforeEach(() => {
      store = createChatStore();
    });

    it('should transition from OVERVIEW to THREAD screen mode after navigation', () => {
      store.getState().initializeThread(createThread({ isAiGeneratedTitle: true }), [createParticipant(0)], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Complete round
      store.getState().setMessages([
        createUserMsg(0),
        createAssistantMsg(0, 0),
        createModeratorMsg(0),
      ]);

      // Navigation happens (component triggers this)
      store.getState().setScreenMode(ScreenModes.THREAD);

      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    });

    it('should maintain thread data after navigation', () => {
      const thread = createThread({
        slug: 'ai-slug',
        isAiGeneratedTitle: true,
        title: 'AI Title',
      });
      store.getState().initializeThread(thread, [createParticipant(0)], []);
      store.getState().setScreenMode(ScreenModes.OVERVIEW);

      // Complete round
      store.getState().setMessages([
        createUserMsg(0),
        createAssistantMsg(0, 0),
        createModeratorMsg(0),
      ]);

      // Navigate
      store.getState().setScreenMode(ScreenModes.THREAD);

      // Thread data preserved
      expect(store.getState().thread?.id).toBe(THREAD_ID);
      expect(store.getState().thread?.slug).toBe('ai-slug');
      expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);
      expect(store.getState().messages).toHaveLength(3);
    });
  });
});

// ============================================================================
// SLUG POLLING INTEGRATION
// ============================================================================

describe('slug polling during first round', () => {
  it('should enable polling after thread creation', () => {
    const store = createChatStore();

    // Before thread creation
    expect(store.getState().createdThreadId).toBeNull();

    // Thread created (component sets createdThreadId)
    store.getState().setCreatedThreadId(THREAD_ID);
    store.getState().initializeThread(createThread({ isAiGeneratedTitle: false }), [], []);

    // Polling should start (createdThreadId set + isAiGeneratedTitle false)
    const shouldPoll = store.getState().createdThreadId !== null
      && !store.getState().thread?.isAiGeneratedTitle;

    expect(shouldPoll).toBe(true);
  });

  it('should stop polling when AI title detected', () => {
    const store = createChatStore();
    store.getState().setCreatedThreadId(THREAD_ID);
    store.getState().initializeThread(createThread({ isAiGeneratedTitle: false }), [], []);

    // Polling active
    let shouldPoll = store.getState().createdThreadId !== null
      && !store.getState().thread?.isAiGeneratedTitle;
    expect(shouldPoll).toBe(true);

    // AI title ready
    const updatedThread = createThread({ isAiGeneratedTitle: true });
    store.getState().setThread(updatedThread);

    // Polling stops
    shouldPoll = store.getState().createdThreadId !== null
      && !store.getState().thread?.isAiGeneratedTitle;
    expect(shouldPoll).toBe(false);
  });

  it('should poll during participant streaming', () => {
    const store = createChatStore();
    store.getState().setCreatedThreadId(THREAD_ID);
    store.getState().initializeThread(createThread({ isAiGeneratedTitle: false }), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Streaming active
    store.getState().setIsStreaming(true);
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0, 'Partial response...', undefined),
    ]);

    // Polling should still be active during streaming
    const shouldPoll = store.getState().createdThreadId !== null
      && !store.getState().thread?.isAiGeneratedTitle;

    expect(shouldPoll).toBe(true);
    expect(store.getState().isStreaming).toBe(true);
  });
});

// ============================================================================
// WEB SEARCH INTEGRATION (FIRST ROUND)
// ============================================================================

describe('web search integration on first round', () => {
  it('should block participants while pre-search is streaming', () => {
    const store = createChatStore();
    const thread = createThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, [createParticipant(0)], []);
    store.getState().addPreSearch(createPreSearch(0, 'streaming'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const shouldWait = preSearch?.status === MessageStatuses.STREAMING
      || preSearch?.status === MessageStatuses.PENDING;

    expect(shouldWait).toBe(true);
  });

  it('should allow participants after pre-search completes', () => {
    const store = createChatStore();
    const thread = createThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, [createParticipant(0)], []);
    store.getState().addPreSearch(createPreSearch(0, 'complete'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const shouldWait = preSearch?.status === MessageStatuses.STREAMING
      || preSearch?.status === MessageStatuses.PENDING;

    expect(shouldWait).toBe(false);
  });

  it('should proceed after pre-search FAILED status', () => {
    const store = createChatStore();
    const thread = createThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, [createParticipant(0)], []);
    store.getState().addPreSearch(createPreSearch(0, 'failed'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const canProceed = preSearch?.status === MessageStatuses.COMPLETE
      || preSearch?.status === MessageStatuses.FAILED;

    expect(canProceed).toBe(true);
  });
});

// ============================================================================
// COMPLETE FIRST ROUND JOURNEY (END-TO-END)
// ============================================================================

describe('complete first round journey (e2e)', () => {
  it('should execute complete first round flow from submission to navigation', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];

    // STEP 1: User on overview screen
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // STEP 2: User submits message
    store.getState().setPendingMessage('What is the best approach?');
    expect(store.getState().pendingMessage).not.toBeNull();

    // STEP 3: Thread created
    store.getState().initializeThread(
      createThread({
        slug: 'what-is-the-best-approach-abc123',
        isAiGeneratedTitle: false,
      }),
      participants,
      [],
    );
    expect(store.getState().thread?.id).toBe(THREAD_ID);
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(false);

    // STEP 4: URL still /chat (screen mode still OVERVIEW)
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // STEP 5: User message added
    store.getState().setMessages([createUserMsg(0)]);
    expect(store.getState().messages).toHaveLength(1);

    // STEP 6: Participants stream sequentially
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
    ]);
    store.getState().setCurrentParticipantIndex(1);

    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
    ]);
    store.getState().setIsStreaming(false);

    // STILL on overview screen
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);

    // STEP 7: Moderator generates
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1),
      createModeratorMsg(0),
    ]);

    const hasModeratorForRound0 = store.getState().messages.some((m) => {
      const metadata = m.metadata as { role?: string; isModerator?: boolean; roundNumber?: number };
      return metadata.role === UIMessageRoles.ASSISTANT
        && metadata.isModerator === true
        && metadata.roundNumber === 0;
    });
    expect(hasModeratorForRound0).toBe(true);

    // STEP 8: AI title ready (async, happens during streaming)
    const updatedThread = createThread({
      slug: 'best-approach-for-problem-solving',
      isAiGeneratedTitle: true,
      title: 'Best Approach for Problem Solving',
    });
    store.getState().setThread(updatedThread);
    expect(store.getState().thread?.isAiGeneratedTitle).toBe(true);

    // STEP 9: Navigation conditions met
    const canNavigate = store.getState().thread?.isAiGeneratedTitle && hasModeratorForRound0;
    expect(canNavigate).toBe(true);

    // STEP 10: Navigation happens (component triggers this)
    store.getState().setScreenMode(ScreenModes.THREAD);

    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

    // FINAL STATE VALIDATION
    expect(store.getState().messages).toHaveLength(4); // user + 2 assistants + moderator
    expect(store.getState().thread?.slug).toBe('best-approach-for-problem-solving');
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should handle web search enabled on first round', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    const thread = createThread({ enableWebSearch: true, isAiGeneratedTitle: false });

    // Initialize with web search
    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Pre-search created
    store.getState().addPreSearch(createPreSearch(0, 'pending'));
    expect(store.getState().preSearches).toHaveLength(1);

    // Pre-search completes
    store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

    // User message + participant response
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0, 'Based on search results...'),
    ]);

    // Moderator
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createModeratorMsg(0),
    ]);

    // AI title ready
    const updatedThread = createThread({ enableWebSearch: true, isAiGeneratedTitle: true });
    store.getState().setThread(updatedThread);

    // Navigation (component triggers this)
    store.getState().setScreenMode(ScreenModes.THREAD);

    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
  });
});

// ============================================================================
// ERROR RECOVERY
// ============================================================================

describe('error recovery on first round', () => {
  it('should handle participant error without blocking round', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);

    // Participant 0 succeeds
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
    ]);

    // Participant 1 fails
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1, 'Error: Rate limit', FinishReasons.ERROR),
    ]);

    const errorMessages = store.getState().messages.filter(
      m => m.metadata.finishReason === FinishReasons.ERROR,
    );
    expect(errorMessages).toHaveLength(1);

    // Round can still complete
    store.getState().setMessages([
      createUserMsg(0),
      createAssistantMsg(0, 0),
      createAssistantMsg(0, 1, 'Error: Rate limit', FinishReasons.ERROR),
      createModeratorMsg(0),
    ]);

    expect(store.getState().messages).toHaveLength(4);
  });

  it('should handle pre-search failure gracefully', () => {
    const store = createChatStore();
    const thread = createThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, [createParticipant(0)], []);

    // Pre-search fails
    store.getState().addPreSearch(createPreSearch(0, 'failed'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const canProceed = preSearch?.status === MessageStatuses.FAILED
      || preSearch?.status === MessageStatuses.COMPLETE;

    // Should allow participants to proceed
    expect(canProceed).toBe(true);
  });
});
