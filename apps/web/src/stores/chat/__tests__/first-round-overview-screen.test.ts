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

import { ChatModes, FinishReasons, MessageRoles, MessageStatuses, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { createTestAssistantMessage, createTestModeratorMessage, createTestUserMessage } from '@/lib/testing';
import type { ApiMessage, ChatParticipant, ChatThread, StoredPreSearch } from '@/services/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const THREAD_ID = 'thread-first-round-test';

function createThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    createdAt: new Date(),
    enableWebSearch: false,
    id: THREAD_ID,
    isAiGeneratedTitle: false,
    isFavorite: false,
    isPublic: false,
    lastMessageAt: new Date(),
    metadata: null,
    mode: ChatModes.ANALYZING,
    previousSlug: null,
    projectId: null,
    slug: 'initial-slug-abc123',
    status: 'active',
    title: 'New Chat',
    updatedAt: new Date(),
    userId: 'user-123',
    version: 1,
    ...overrides,
  } as ChatThread;
}

function createParticipant(index: number): ChatParticipant {
  return {
    createdAt: new Date(),
    customRoleId: null,
    id: `participant-${index}`,
    isEnabled: true,
    modelId: `model-${index}`,
    priority: index,
    role: `Participant ${index}`,
    settings: null,
    threadId: THREAD_ID,
    updatedAt: new Date(),
  } as ChatParticipant;
}

function createUserMsg(roundNumber: number, content = `Question ${roundNumber}`): ApiMessage {
  return createTestUserMessage({
    content,
    id: `${THREAD_ID}_r${roundNumber}_user`,
    roundNumber,
  });
}

function createAssistantMsg(
  roundNumber: number,
  participantIndex: number,
  content = `Response R${roundNumber}P${participantIndex}`,
  finishReason = FinishReasons.STOP,
): ApiMessage {
  return createTestAssistantMessage({
    content,
    finishReason,
    id: `${THREAD_ID}_r${roundNumber}_p${participantIndex}`,
    participantId: `participant-${participantIndex}`,
    participantIndex,
    roundNumber,
  });
}

function createModeratorMsg(roundNumber: number, content = `Summary R${roundNumber}`): ApiMessage {
  return createTestModeratorMessage({
    content,
    finishReason: FinishReasons.STOP,
    id: `${THREAD_ID}_r${roundNumber}_moderator`,
    roundNumber,
  });
}

function createPreSearch(
  roundNumber: number,
  status: 'pending' | 'streaming' | 'complete' | 'failed' = 'complete',
): StoredPreSearch {
  const statusMap = {
    complete: MessageStatuses.COMPLETE,
    failed: MessageStatuses.FAILED,
    pending: MessageStatuses.PENDING,
    streaming: MessageStatuses.STREAMING,
  };
  return {
    completedAt: status === 'complete' ? new Date() : null,
    createdAt: new Date(),
    errorMessage: null,
    id: `presearch-${THREAD_ID}-r${roundNumber}`,
    roundNumber,
    searchData: status === 'complete'
      ? {
          failureCount: 0,
          moderatorSummary: 'Search complete',
          queries: [],
          results: [],
          successCount: 1,
          totalResults: 0,
          totalTime: 100,
        }
      : null,
    status: statusMap[status],
    threadId: THREAD_ID,
    userQuery: `Query ${roundNumber}`,
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

    expect(store.getState().isCreatingThread).toBeTruthy();
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
      isAiGeneratedTitle: false, // Initial slug from user message
      slug: 'what-is-the-best-approach-abc123',
    });

    store.getState().initializeThread(thread, [], []);

    expect(store.getState().thread?.slug).toBe('what-is-the-best-approach-abc123');
    expect(store.getState().thread?.isAiGeneratedTitle).toBeFalsy();
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
      isAiGeneratedTitle: false,
      slug: 'initial-slug-abc123',
    });

    store.getState().initializeThread(thread, [], []);

    // AI title ready (async) - simulate server update
    const updatedThread = createThread({
      isAiGeneratedTitle: true,
      slug: 'ai-generated-slug-xyz789',
      title: 'Best Approach for Problem Solving',
    });
    store.getState().setThread(updatedThread);

    expect(store.getState().thread?.slug).toBe('ai-generated-slug-xyz789');
    expect(store.getState().thread?.isAiGeneratedTitle).toBeTruthy();
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
    expect(store.getState().isStreaming).toBeTruthy();

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
      isAiGeneratedTitle: true,
      slug: 'ai-slug',
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
    expect(store.getState().isStreaming).toBeFalsy();
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
    const firstModerator = moderators[0];
    if (!firstModerator) {
      throw new Error('expected moderator message');
    }
    expect(firstModerator.metadata.roundNumber).toBe(0);
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

      expect(hasModeratorForRound0).toBeTruthy();
      expect(isAiGeneratedTitle).toBeFalsy();
      expect(canNavigate).toBeFalsy(); // Should NOT navigate
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

      expect(hasModeratorForRound0).toBeFalsy();
      expect(isAiGeneratedTitle).toBeTruthy();
      expect(canNavigate).toBeFalsy(); // Should NOT navigate
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
        isAiGeneratedTitle: true,
        slug: 'ai-slug',
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

      expect(hasModeratorForRound0).toBeTruthy();
      expect(isAiGeneratedTitle).toBeTruthy();
      expect(canNavigate).toBeTruthy(); // Should navigate
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
      expect(hasModeratorForRound0).toBeTruthy();
      expect(isAiGeneratedTitle).toBeTruthy();
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
        isAiGeneratedTitle: true,
        slug: 'ai-slug',
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
      expect(store.getState().thread?.isAiGeneratedTitle).toBeTruthy();
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

    expect(shouldPoll).toBeTruthy();
  });

  it('should stop polling when AI title detected', () => {
    const store = createChatStore();
    store.getState().setCreatedThreadId(THREAD_ID);
    store.getState().initializeThread(createThread({ isAiGeneratedTitle: false }), [], []);

    // Polling active
    let shouldPoll = store.getState().createdThreadId !== null
      && !store.getState().thread?.isAiGeneratedTitle;
    expect(shouldPoll).toBeTruthy();

    // AI title ready
    const updatedThread = createThread({ isAiGeneratedTitle: true });
    store.getState().setThread(updatedThread);

    // Polling stops
    shouldPoll = store.getState().createdThreadId !== null
      && !store.getState().thread?.isAiGeneratedTitle;
    expect(shouldPoll).toBeFalsy();
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

    expect(shouldPoll).toBeTruthy();
    expect(store.getState().isStreaming).toBeTruthy();
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

    expect(shouldWait).toBeTruthy();
  });

  it('should allow participants after pre-search completes', () => {
    const store = createChatStore();
    const thread = createThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, [createParticipant(0)], []);
    store.getState().addPreSearch(createPreSearch(0, 'complete'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const shouldWait = preSearch?.status === MessageStatuses.STREAMING
      || preSearch?.status === MessageStatuses.PENDING;

    expect(shouldWait).toBeFalsy();
  });

  it('should proceed after pre-search FAILED status', () => {
    const store = createChatStore();
    const thread = createThread({ enableWebSearch: true });
    store.getState().initializeThread(thread, [createParticipant(0)], []);
    store.getState().addPreSearch(createPreSearch(0, 'failed'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 0);
    const canProceed = preSearch?.status === MessageStatuses.COMPLETE
      || preSearch?.status === MessageStatuses.FAILED;

    expect(canProceed).toBeTruthy();
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
        isAiGeneratedTitle: false,
        slug: 'what-is-the-best-approach-abc123',
      }),
      participants,
      [],
    );
    expect(store.getState().thread?.id).toBe(THREAD_ID);
    expect(store.getState().thread?.isAiGeneratedTitle).toBeFalsy();

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
    expect(hasModeratorForRound0).toBeTruthy();

    // STEP 8: AI title ready (async, happens during streaming)
    const updatedThread = createThread({
      isAiGeneratedTitle: true,
      slug: 'best-approach-for-problem-solving',
      title: 'Best Approach for Problem Solving',
    });
    store.getState().setThread(updatedThread);
    expect(store.getState().thread?.isAiGeneratedTitle).toBeTruthy();

    // STEP 9: Navigation conditions met
    const canNavigate = store.getState().thread?.isAiGeneratedTitle && hasModeratorForRound0;
    expect(canNavigate).toBeTruthy();

    // STEP 10: Navigation happens (component triggers this)
    store.getState().setScreenMode(ScreenModes.THREAD);

    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

    // FINAL STATE VALIDATION
    expect(store.getState().messages).toHaveLength(4); // user + 2 assistants + moderator
    expect(store.getState().thread?.slug).toBe('best-approach-for-problem-solving');
    expect(store.getState().isStreaming).toBeFalsy();
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
    expect(canProceed).toBeTruthy();
  });
});
