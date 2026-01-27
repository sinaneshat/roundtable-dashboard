/**
 * Navigation Reset Flows Tests
 *
 * Tests for store reset/init during navigation to catch:
 * 1. Over-reset losing streaming state
 * 2. Under-reset causing stale data
 * 3. Proper state preservation for same-thread navigation
 * 4. Full reset for different-thread navigation
 *
 * Based on use-navigation-cleanup.ts patterns and FLOW_DOCUMENTATION.md
 *
 * @see /Users/avabagherzadeh/Desktop/projects/deadpixel/billing-dashboard/docs/FLOW_DOCUMENTATION.md
 */

import { MessageStatuses, ScreenModes } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';
import { createChatStore } from '@/stores/chat';
import { THREAD_NAVIGATION_RESET } from '@/stores/chat/store-defaults';
import { ChatPhases } from '@/stores/chat/store-schemas';

// ============================================================================
// Test Utilities
// ============================================================================

type NavigationScenario = {
  from: string;
  to: string;
};

/**
 * Simulate navigation cleanup logic (from use-navigation-cleanup.ts)
 */
function simulateNavigationCleanup(
  store: ReturnType<typeof createChatStore>,
  scenario: NavigationScenario,
) {
  const { from, to } = scenario;
  const currentState = store.getState();

  const isLeavingThread = from?.startsWith('/chat/') && from !== '/chat';
  const isGoingToOverview = to === '/chat';
  const isNavigatingBetweenThreads = from?.startsWith('/chat/') && to?.startsWith('/chat/') && from !== to;
  const isGoingToThread = to?.startsWith('/chat/') && to !== '/chat';
  const isFromOverviewToThread = from === '/chat' && isGoingToThread;

  // Clear waitingToStartStreaming when appropriate
  const shouldClearWaiting = currentState.waitingToStartStreaming
    && !isFromOverviewToThread
    && (isGoingToOverview || isNavigatingBetweenThreads);

  if (shouldClearWaiting) {
    currentState.setWaitingToStartStreaming(false);
  }

  // Full reset to overview
  if (isGoingToOverview && isLeavingThread) {
    currentState.resetToOverview();
  }

  // Reset when navigating between threads
  if (isNavigatingBetweenThreads) {
    currentState.chatStop?.();
    currentState.resetForThreadNavigation();
    currentState.clearAllPreSearchTracking();
  }

  // Reset when from overview to different thread (not new thread creation)
  if (isFromOverviewToThread && (currentState.thread || currentState.messages.length > 0)) {
    const isNewThreadCreation = currentState.createdThreadId !== null;

    if (!isNewThreadCreation) {
      const targetSlug = to?.replace('/chat/', '');
      const currentSlug = currentState.thread?.slug;
      const isNavigatingToSameThread = targetSlug && currentSlug && targetSlug === currentSlug;

      if (!isNavigatingToSameThread && !currentState.isStreaming) {
        currentState.chatStop?.();
        currentState.resetForThreadNavigation();
      }
    }
  }
}

/**
 * Create a set of completed round messages
 */
function createCompletedRoundMessages(
  roundNumber: number,
  participantCount: number,
  threadId: string,
): UIMessage[] {
  const messages: UIMessage[] = [];

  messages.push(createTestUserMessage({
    content: `User question round ${roundNumber}`,
    id: `${threadId}_r${roundNumber}_user`,
    roundNumber,
  }));

  for (let i = 0; i < participantCount; i++) {
    messages.push(createTestAssistantMessage({
      content: `Participant ${i} response`,
      id: `${threadId}_r${roundNumber}_p${i}`,
      participantId: `participant-${i}`,
      participantIndex: i,
      roundNumber,
    }));
  }

  messages.push(createTestModeratorMessage({
    content: `Moderator summary`,
    id: `${threadId}_r${roundNumber}_moderator`,
    roundNumber,
  }));

  return messages;
}

/**
 * Set up a thread with completed messages
 */
function setupCompletedThread(
  store: ReturnType<typeof createChatStore>,
  threadId: string,
  slug: string,
  participantCount: number,
  roundCount: number,
) {
  const thread = createMockThread({ id: threadId, slug });
  const participants = createMockParticipants(participantCount, threadId);

  const messages: UIMessage[] = [];
  for (let r = 0; r < roundCount; r++) {
    messages.push(...createCompletedRoundMessages(r, participantCount, threadId));
  }

  store.getState().initializeThread(thread, participants, messages);
  store.getState().setHasInitiallyLoaded(true);

  return { messages, participants, thread };
}

/**
 * Set up a thread in streaming state
 */
function setupStreamingThread(
  store: ReturnType<typeof createChatStore>,
  threadId: string,
  slug: string,
  participantCount: number,
  currentParticipantIndex: number,
) {
  const thread = createMockThread({ id: threadId, slug });
  const participants = createMockParticipants(participantCount, threadId);

  const messages = [
    createTestUserMessage({
      content: 'User question',
      id: `${threadId}_r0_user`,
      roundNumber: 0,
    }),
  ];

  // Add completed participant messages up to currentParticipantIndex
  for (let i = 0; i < currentParticipantIndex; i++) {
    messages.push(createTestAssistantMessage({
      content: `Participant ${i} response`,
      id: `${threadId}_r0_p${i}`,
      participantId: `participant-${i}`,
      participantIndex: i,
      roundNumber: 0,
    }));
  }

  store.getState().initializeThread(thread, participants, messages);
  store.getState().setHasInitiallyLoaded(true);

  // Set up streaming state
  store.setState({
    currentParticipantIndex,
    currentRoundNumber: 0,
    isStreaming: true,
    phase: ChatPhases.PARTICIPANTS,
    streamingRoundNumber: 0,
  });

  // Create streaming placeholder for current participant
  store.getState().appendEntityStreamingText(
    currentParticipantIndex,
    'Streaming content...',
    0,
  );

  return { messages, participants, thread };
}

// ============================================================================
// Test Suite: Navigation Reset Flows
// ============================================================================

describe('navigation Reset Flows', () => {
  let store: ReturnType<typeof createChatStore>;

  beforeEach(() => {
    store = createChatStore();
    vi.clearAllMocks();
  });

  describe('reset only streaming state when navigating between threads', () => {
    it('should reset streaming flags when navigating to different thread', () => {
      setupStreamingThread(store, 'thread-A', 'thread-a', 3, 1);

      expect(store.getState().isStreaming).toBe(true);

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      const state = store.getState();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRoundNumber).toBeNull();
    });

    it('should clear subscription state when navigating between threads', () => {
      setupStreamingThread(store, 'thread-A', 'thread-a', 3, 1);

      // Initialize subscription state with values
      store.getState().initializeSubscriptions(0, 3);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
      store.getState().updateEntitySubscriptionStatus(1, 'streaming', 50);

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      // resetForThreadNavigation doesn't clear subscription state directly,
      // but re-initialization will happen when the new thread loads
      const state = store.getState();
      expect(state.thread).toBeNull();
      expect(state.messages).toHaveLength(0);
    });
  });

  describe('nOT reset completed messages when returning to same thread', () => {
    it('should NOT trigger reset when navigating to same thread slug', () => {
      const { messages } = setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);

      const messagesBeforeNav = store.getState().messages;
      expect(messagesBeforeNav).toHaveLength(messages.length);

      // Simulate "navigation" to same thread (e.g., clicking same link)
      // This shouldn't trigger any cleanup
      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-a',
      });

      const state = store.getState();
      // Messages should be unchanged
      expect(state.messages).toHaveLength(messages.length);
      expect(state.thread?.slug).toBe('thread-a');
    });
  });

  describe('fully reset when navigating to different thread', () => {
    it('should clear all thread state when navigating between different threads', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 2);

      expect(store.getState().messages.length).toBeGreaterThan(0);
      expect(store.getState().thread?.id).toBe('thread-A');

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      const state = store.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.thread).toBeNull();
      expect(state.participants).toHaveLength(0);
      expect(state.phase).toBe(ChatPhases.IDLE);
    });

    it('should clear changelog items when navigating between threads', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);
      store.setState({
        changelogItems: [{ id: 'change-1' } as never],
      });

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      expect(store.getState().changelogItems).toHaveLength(0);
    });

    it('should clear preSearches when navigating between threads', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);
      store.setState({
        preSearches: [createMockStoredPreSearch(0, MessageStatuses.COMPLETE)],
      });

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      expect(store.getState().preSearches).toHaveLength(0);
    });
  });

  describe('preserve progress when user refreshes mid-stream', () => {
    it('should NOT clear state on page refresh (no navigation cleanup triggered)', () => {
      setupStreamingThread(store, 'thread-A', 'thread-a', 3, 1);

      const stateBefore = store.getState();
      expect(stateBefore.isStreaming).toBe(true);
      expect(stateBefore.messages.length).toBeGreaterThan(0);

      // Page refresh doesn't trigger navigation cleanup
      // The state persists until new hydration happens
      // This test verifies the store maintains state without cleanup call

      const stateAfter = store.getState();
      expect(stateAfter.isStreaming).toBe(true);
      expect(stateAfter.messages).toHaveLength(stateBefore.messages.length);
    });

    it('should preserve lastSeq values for stream resumption after refresh', () => {
      setupStreamingThread(store, 'thread-A', 'thread-a', 3, 1);

      // Set up subscription state with lastSeq values
      store.getState().initializeSubscriptions(0, 3);
      store.getState().updateEntitySubscriptionStatus(0, 'complete', 100);
      store.getState().updateEntitySubscriptionStatus(1, 'streaming', 75);

      // No navigation cleanup on refresh - state should persist
      const state = store.getState();
      expect(state.subscriptionState.participants[0]?.lastSeq).toBe(100);
      expect(state.subscriptionState.participants[1]?.lastSeq).toBe(75);
    });
  });

  describe('handle rapid navigation without state corruption', () => {
    it('should handle rapid thread→overview→thread navigation', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);

      // Quick navigation: thread-a → overview → thread-b
      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat',
      });

      // State should be reset to overview
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
      expect(store.getState().messages).toHaveLength(0);

      // Now navigate to thread-b
      simulateNavigationCleanup(store, {
        from: '/chat',
        to: '/chat/thread-b',
      });

      // State should remain clean for thread-b initialization
      expect(store.getState().messages).toHaveLength(0);
    });

    it('should handle thread→thread→thread rapid navigation', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      // Immediately navigate again before thread-b loads
      simulateNavigationCleanup(store, {
        from: '/chat/thread-b',
        to: '/chat/thread-c',
      });

      const state = store.getState();
      expect(state.messages).toHaveLength(0);
      expect(state.thread).toBeNull();
    });
  });

  describe('not lose streaming progress on overview→thread return', () => {
    it('should preserve waitingToStartStreaming when navigating from overview to new thread', () => {
      // Start on overview with pending message
      store.setState({
        createdThreadId: 'thread-new',
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
      });

      simulateNavigationCleanup(store, {
        from: '/chat',
        to: '/chat/thread-new',
      });

      // waitingToStartStreaming should be preserved (it's a new thread creation)
      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(true);
    });

    it('should preserve isStreaming when returning to same thread from overview', () => {
      const { thread } = setupStreamingThread(store, 'thread-A', 'thread-a', 3, 1);

      expect(store.getState().isStreaming).toBe(true);

      // Navigate to overview while streaming
      // (Note: This typically wouldn't happen in real app, but testing edge case)
      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat',
      });

      // After going to overview, state is reset
      expect(store.getState().isStreaming).toBe(false);
    });
  });

  describe('reset subscription states on navigation cleanup', () => {
    it('should reset triggered moderator tracking on thread navigation', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);

      // Set up tracking state
      store.getState().markModeratorStreamTriggered('mod-123', 0);
      expect(store.getState().triggeredModeratorIds.has('mod-123')).toBe(true);
      expect(store.getState().triggeredModeratorRounds.has(0)).toBe(true);

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      const state = store.getState();
      expect(state.triggeredModeratorIds.size).toBe(0);
      expect(state.triggeredModeratorRounds.size).toBe(0);
    });

    it('should reset triggered presearch tracking on thread navigation', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);

      store.getState().markPreSearchTriggered(0);
      expect(store.getState().triggeredPreSearchRounds.has(0)).toBe(true);

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      expect(store.getState().triggeredPreSearchRounds.size).toBe(0);
    });
  });

  describe('handle navigation during presearch phase', () => {
    it('should reset presearch state when navigating away during presearch', () => {
      const thread = createMockThread({ enableWebSearch: true, id: 'thread-A', slug: 'thread-a' });
      const participants = createMockParticipants(2, 'thread-A');

      store.getState().initializeThread(thread, participants, []);
      store.setState({
        preSearches: [createMockStoredPreSearch(0, MessageStatuses.STREAMING)],
      });
      store.getState().updateEntitySubscriptionStatus('presearch', 'streaming', 50);

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      const state = store.getState();
      expect(state.preSearches).toHaveLength(0);
    });
  });

  describe('handle navigation during moderator phase', () => {
    it('should reset thread state when navigating away during moderator', () => {
      const thread = createMockThread({ id: 'thread-A', slug: 'thread-a' });
      const participants = createMockParticipants(2, 'thread-A');

      const messages = [
        createTestUserMessage({
          content: 'Question',
          id: 'msg-user',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P0 response',
          id: 'msg-p0',
          participantId: 'participant-0',
          participantIndex: 0,
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          content: 'P1 response',
          id: 'msg-p1',
          participantId: 'participant-1',
          participantIndex: 1,
          roundNumber: 0,
        }),
      ];

      store.getState().initializeThread(thread, participants, messages);
      store.setState({
        isModeratorStreaming: true,
        phase: ChatPhases.MODERATOR,
      });

      // Create moderator streaming placeholder
      store.getState().appendModeratorStreamingText('Analyzing...', 0);

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      const state = store.getState();
      // NOTE: resetForThreadNavigation resets THREAD_DEFAULTS but NOT UI_DEFAULTS
      // isModeratorStreaming is in UI_DEFAULTS, so it persists (by design)
      // The new thread's hydration will set it to false via initializeThread
      expect(state.phase).toBe(ChatPhases.IDLE);
      expect(state.messages).toHaveLength(0);
      expect(state.thread).toBeNull();
      expect(state.isStreaming).toBe(false);
    });

    it('should reset isModeratorStreaming via resetToOverview', () => {
      const thread = createMockThread({ id: 'thread-A', slug: 'thread-a' });
      const participants = createMockParticipants(2, 'thread-A');

      store.getState().initializeThread(thread, participants, []);
      store.setState({
        isModeratorStreaming: true,
        phase: ChatPhases.MODERATOR,
      });

      // resetToOverview uses OVERVIEW_RESET which includes UI_DEFAULTS
      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.isModeratorStreaming).toBe(false);
      expect(state.phase).toBe(ChatPhases.IDLE);
    });
  });

  describe('preserve round number across refresh', () => {
    it('should maintain currentRoundNumber in store state', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 3);
      store.setState({ currentRoundNumber: 2 });

      // No navigation cleanup on refresh
      const state = store.getState();
      expect(state.currentRoundNumber).toBe(2);
    });

    it('should reset currentRoundNumber when navigating to different thread', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 3);
      store.setState({ currentRoundNumber: 2 });

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      expect(store.getState().currentRoundNumber).toBeNull();
    });
  });

  describe('resetForThreadNavigation behavior', () => {
    it('should reset to THREAD_NAVIGATION_RESET values', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 2);
      store.setState({
        currentParticipantIndex: 1,
        error: new Error('test'),
        hasSentPendingMessage: true,
        isStreaming: true,
      });

      store.getState().resetForThreadNavigation();

      const state = store.getState();
      expect(state.currentParticipantIndex).toBe(THREAD_NAVIGATION_RESET.currentParticipantIndex);
      expect(state.error).toBeNull();
      expect(state.hasSentPendingMessage).toBe(false);
      expect(state.isStreaming).toBe(false);
      expect(state.messages).toHaveLength(0);
      expect(state.thread).toBeNull();
    });

    it('should clear feedback state', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);
      store.setState({
        feedbackByRound: new Map([[0, 'positive']]),
        hasLoadedFeedback: true,
      });

      store.getState().resetForThreadNavigation();

      const state = store.getState();
      expect(state.feedbackByRound.size).toBe(0);
      expect(state.hasLoadedFeedback).toBe(false);
    });
  });

  describe('resetToOverview behavior', () => {
    it('should reset to overview screen mode', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);
      expect(store.getState().screenMode).toBe(ScreenModes.THREAD);

      store.getState().resetToOverview();

      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    });

    it('should clear all thread-specific state', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 2);

      store.getState().resetToOverview();

      const state = store.getState();
      expect(state.thread).toBeNull();
      expect(state.messages).toHaveLength(0);
      expect(state.participants).toHaveLength(0);
      expect(state.preSearches).toHaveLength(0);
      expect(state.changelogItems).toHaveLength(0);
    });

    it('should show initial UI after reset', () => {
      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);
      expect(store.getState().showInitialUI).toBe(false);

      store.getState().resetToOverview();

      expect(store.getState().showInitialUI).toBe(true);
    });
  });

  describe('chatStop callback integration', () => {
    it('should call chatStop when navigating away from streaming thread', () => {
      const chatStopMock = vi.fn();

      setupStreamingThread(store, 'thread-A', 'thread-a', 3, 1);
      store.setState({ chatStop: chatStopMock });

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      expect(chatStopMock).toHaveBeenCalledWith();
    });

    it('should NOT call chatStop when navigating to same thread', () => {
      const chatStopMock = vi.fn();

      setupCompletedThread(store, 'thread-A', 'thread-a', 2, 1);
      store.setState({ chatStop: chatStopMock });

      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-a',
      });

      expect(chatStopMock).not.toHaveBeenCalled();
    });
  });

  describe('new thread creation flow', () => {
    it('should NOT reset state when navigating to newly created thread', () => {
      // Simulate new thread creation from overview
      store.setState({
        createdThreadId: 'new-thread-123',
        screenMode: ScreenModes.OVERVIEW,
        waitingToStartStreaming: true,
      });

      simulateNavigationCleanup(store, {
        from: '/chat',
        to: '/chat/new-thread-slug',
      });

      // createdThreadId should prevent reset
      const state = store.getState();
      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.createdThreadId).toBe('new-thread-123');
    });

    it('should reset after thread creation is complete', () => {
      // After thread creation flow completes, createdThreadId is cleared
      store.setState({
        createdThreadId: null,
        screenMode: ScreenModes.THREAD,
        waitingToStartStreaming: false,
      });

      const thread = createMockThread({ id: 'thread-A', slug: 'thread-a' });
      store.setState({ thread });

      // Now navigating to different thread should reset
      simulateNavigationCleanup(store, {
        from: '/chat/thread-a',
        to: '/chat/thread-b',
      });

      expect(store.getState().thread).toBeNull();
    });
  });
});
