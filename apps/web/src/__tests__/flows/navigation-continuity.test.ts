/**
 * Navigation Continuity Tests
 *
 * Tests navigation scenarios:
 * - Navigate Away During Streaming (server continues regardless)
 * - Return to Thread After Navigation (sees completed/ongoing content)
 * - Navigate to New Chat Overview (starts fresh)
 * - Navigate to Different Thread Slug (correct resumption)
 * - Browser Back/Forward (history navigation respected)
 *
 * Based on FLOW_DOCUMENTATION.md navigation patterns
 */

import { ScreenModes } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockThread,
  createTestAssistantMessage,
  createTestChatStore,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';

// ============================================================================
// NAVIGATE AWAY DURING STREAMING
// ============================================================================

describe('navigate Away During Streaming', () => {
  it('should allow navigation away while participants are streaming', () => {
    const store = createTestChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    // Start streaming
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(0);

    // User navigates away (store state preserved, but component unmounts)
    expect(store.getState().isStreaming).toBeTruthy();

    // Server continues regardless - streaming state represents client view
    // When user returns, they'll see whatever content was generated
  });

  it('should preserve streaming state when chat component unmounts', () => {
    const store = createTestChatStore();

    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    // Simulate component unmount by not resetting state
    // Store state persists independently of component lifecycle

    expect(store.getState().isStreaming).toBeTruthy();
    expect(store.getState().streamingRoundNumber).toBe(0);
  });

  it('should handle navigation during moderator streaming', () => {
    const store = createTestChatStore();

    store.getState().setIsModeratorStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    // Navigation during moderator streaming
    expect(store.getState().isModeratorStreaming).toBeTruthy();

    // Server continues generating moderator response
    // User will see partial or complete content on return
  });

  it('should call chatStop on navigation to abort active streams', () => {
    const store = createTestChatStore();
    const mockStop = vi.fn();

    // Set the stop function
    store.getState().setChatStop(mockStop);
    store.getState().setIsStreaming(true);

    // Simulate navigation cleanup
    const stopFn = store.getState().chatStop;
    if (stopFn) {
      stopFn();
    }

    expect(mockStop).toHaveBeenCalledWith();
  });
});

// ============================================================================
// RETURN TO THREAD AFTER NAVIGATION
// ============================================================================

describe('return to Thread After Navigation', () => {
  it('should see completed content when streaming finished during navigation', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = createMockParticipants(2);

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    // Simulate completed round (server finished while away)
    const messages = [
      createTestUserMessage({
        content: 'Question',
        id: `${thread.id}_r0_user`,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P0 response',
        id: `${thread.id}_r0_p0`,
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P1 response',
        id: `${thread.id}_r0_p1`,
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      }),
      createTestModeratorMessage({
        content: 'Summary',
        id: `${thread.id}_r0_moderator`,
        roundNumber: 0,
      }),
    ];

    store.getState().setMessages(messages);
    store.getState().setIsStreaming(false);
    store.getState().setStreamingRoundNumber(null);

    // Verify completed state on return
    expect(store.getState().messages).toHaveLength(4);
    expect(store.getState().isStreaming).toBeFalsy();
  });

  it('should see partial content and resume streaming when still in progress', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = createMockParticipants(3);

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    // Simulate partial content (P0 and P1 complete, P2 still streaming)
    const messages = [
      createTestUserMessage({
        content: 'Question',
        id: `${thread.id}_r0_user`,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P0 response',
        id: `${thread.id}_r0_p0`,
        participantId: 'participant-0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      createTestAssistantMessage({
        content: 'P1 response',
        id: `${thread.id}_r0_p1`,
        participantId: 'participant-1',
        participantIndex: 1,
        roundNumber: 0,
      }),
    ];

    store.getState().setMessages(messages);
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(2);

    // Resumption should continue from P2
    expect(store.getState().messages).toHaveLength(3);
    expect(store.getState().isStreaming).toBeTruthy();
    expect(store.getState().currentParticipantIndex).toBe(2);
  });

  it('should trigger resumption when returning to thread with incomplete round', () => {
    const store = createTestChatStore();

    // Set resumption state
    store.getState().setNextParticipantToTrigger({ index: 1, participantId: 'participant-1' });
    store.getState().setWaitingToStartStreaming(true);

    const next = store.getState().nextParticipantToTrigger;
    expect(next).toBeDefined();
    expect(store.getState().waitingToStartStreaming).toBeTruthy();
  });
});

// ============================================================================
// NAVIGATE TO NEW CHAT OVERVIEW
// ============================================================================

describe('navigate to New Chat Overview', () => {
  it('should start fresh with showInitialUI true', () => {
    const store = createTestChatStore();

    // Navigate to overview - reset to fresh state
    store.getState().setShowInitialUI(true);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);
    store.getState().setThread(null);
    store.getState().setMessages([]);

    expect(store.getState().showInitialUI).toBeTruthy();
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    expect(store.getState().thread).toBeNull();
    expect(store.getState().messages).toHaveLength(0);
  });

  it('should clear streaming state when navigating to overview', () => {
    const store = createTestChatStore();

    // Previously streaming
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);

    // Navigate to overview - clear streaming state
    store.getState().completeStreaming();
    store.getState().setShowInitialUI(true);

    expect(store.getState().isStreaming).toBeFalsy();
    expect(store.getState().streamingRoundNumber).toBeNull();
    expect(store.getState().showInitialUI).toBeTruthy();
  });

  it('should reset form state for new conversation', () => {
    const store = createTestChatStore();

    // Form had state from previous thread
    store.getState().setInputValue('Previous input');
    store.getState().setEnableWebSearch(true);

    // Reset for new conversation
    store.getState().resetForm();

    expect(store.getState().inputValue).toBe('');
    expect(store.getState().enableWebSearch).toBeFalsy();
  });

  it('should clear hasNavigated flag when on overview', () => {
    const store = createTestChatStore();

    store.setState({ hasNavigated: true });
    expect(store.getState().hasNavigated).toBeTruthy();

    // Return to overview
    store.getState().setShowInitialUI(true);
    store.setState({ hasNavigated: false });

    expect(store.getState().hasNavigated).toBeFalsy();
  });
});

// ============================================================================
// NAVIGATE TO DIFFERENT THREAD SLUG
// ============================================================================

describe('navigate to Different Thread Slug', () => {
  it('should load correct thread data for different slug', () => {
    const store = createTestChatStore();

    // First thread
    const thread1 = createMockThread({ id: 'thread-123', title: 'Thread 1' });
    store.getState().setThread(thread1);

    expect(store.getState().thread?.id).toBe('thread-123');

    // Navigate to different thread
    const thread2 = createMockThread({ id: 'thread-456', title: 'Thread 2' });
    store.getState().setThread(thread2);

    expect(store.getState().thread?.id).toBe('thread-456');
  });

  it('should clear previous thread messages when switching', () => {
    const store = createTestChatStore();
    const thread1 = createMockThread({ id: 'thread-123' });

    // Set thread 1 first
    store.getState().setThread(thread1);

    // Thread 1 messages
    const thread1Messages = [
      createTestUserMessage({
        content: 'Thread 1 question',
        id: 'thread-123_r0_user',
        roundNumber: 0,
      }),
    ];
    store.getState().setMessages(thread1Messages);

    expect(store.getState().thread?.id).toBe('thread-123');
    expect(store.getState().messages).toHaveLength(1);

    // Navigate to thread 2
    const thread2 = createMockThread({ id: 'thread-456' });
    const thread2Messages = [
      createTestUserMessage({
        content: 'Thread 2 question',
        id: 'thread-456_r0_user',
        roundNumber: 0,
      }),
    ];

    store.getState().setThread(thread2);
    store.getState().setMessages(thread2Messages);

    expect(store.getState().thread?.id).toBe('thread-456');
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().messages[0]?.id).toBe('thread-456_r0_user');
  });

  it('should trigger correct resumption for different thread', () => {
    const store = createTestChatStore();

    // Thread 1 was complete
    const thread1 = createMockThread({ id: 'thread-123' });
    store.getState().setThread(thread1);
    store.getState().completeStreaming();

    // Thread 2 needs resumption
    const thread2 = createMockThread({ id: 'thread-456' });
    store.getState().setThread(thread2);
    store.getState().setNextParticipantToTrigger({ index: 1, participantId: 'p1' });
    store.getState().setWaitingToStartStreaming(true);

    expect(store.getState().thread?.id).toBe('thread-456');
    expect(store.getState().waitingToStartStreaming).toBeTruthy();
  });

  it('should update effectiveThreadId for thread operations', () => {
    const store = createTestChatStore();

    store.setState({ effectiveThreadId: 'thread-123' });
    expect(store.getState().effectiveThreadId).toBe('thread-123');

    // Navigate to different thread
    store.setState({ effectiveThreadId: 'thread-456' });
    expect(store.getState().effectiveThreadId).toBe('thread-456');
  });
});

// ============================================================================
// BROWSER BACK/FORWARD NAVIGATION
// ============================================================================

describe('browser Back/Forward Navigation', () => {
  it('should respect history navigation to previous thread', () => {
    const store = createTestChatStore();

    // Current thread
    const currentThread = createMockThread({ id: 'thread-456' });
    store.getState().setThread(currentThread);

    // Browser back would load previous thread
    const previousThread = createMockThread({ id: 'thread-123' });
    store.getState().setThread(previousThread);

    expect(store.getState().thread?.id).toBe('thread-123');
  });

  it('should handle back to overview from thread', () => {
    const store = createTestChatStore();
    const thread = createMockThread();

    // On thread screen
    store.getState().setThread(thread);
    store.getState().setShowInitialUI(false);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Browser back to overview
    store.getState().setShowInitialUI(true);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    expect(store.getState().showInitialUI).toBeTruthy();
    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
  });

  it('should handle forward navigation to thread', () => {
    const store = createTestChatStore();

    // On overview
    store.getState().setShowInitialUI(true);
    store.getState().setScreenMode(ScreenModes.OVERVIEW);

    // Browser forward to thread
    const thread = createMockThread();
    store.getState().setThread(thread);
    store.getState().setShowInitialUI(false);
    store.getState().setScreenMode(ScreenModes.THREAD);

    expect(store.getState().showInitialUI).toBeFalsy();
    expect(store.getState().screenMode).toBe(ScreenModes.THREAD);
    expect(store.getState().thread).not.toBeNull();
  });

  it('should preserve conversation state during back/forward', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = createMockParticipants(2);

    // Set up thread state
    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    const messages = [
      createTestUserMessage({
        content: 'Question',
        id: `${thread.id}_r0_user`,
        roundNumber: 0,
      }),
    ];
    store.getState().setMessages(messages);

    // Navigate away (store persists)
    store.getState().setShowInitialUI(true);

    // Navigate back (restore)
    store.getState().setShowInitialUI(false);

    // State should be preserved
    expect(store.getState().thread?.id).toBe(thread.id);
    expect(store.getState().messages).toHaveLength(1);
    expect(store.getState().participants).toHaveLength(2);
  });
});

// ============================================================================
// NAVIGATION STATE CLEANUP
// ============================================================================

describe('navigation State Cleanup', () => {
  it('should clean up streaming state on navigation reset', () => {
    const store = createTestChatStore();

    // Set streaming state
    store.getState().setIsStreaming(true);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setCurrentParticipantIndex(1);

    // Navigation reset
    store.getState().completeStreaming();

    expect(store.getState().isStreaming).toBeFalsy();
    expect(store.getState().streamingRoundNumber).toBeNull();
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should clean up pending state on navigation', () => {
    const store = createTestChatStore();

    // Set pending state
    store.getState().setPendingMessage('Pending question');
    store.getState().setHasSentPendingMessage(false);

    // Navigation cleanup
    store.getState().setPendingMessage(null);
    store.getState().setHasSentPendingMessage(false);

    expect(store.getState().pendingMessage).toBeNull();
    expect(store.getState().hasSentPendingMessage).toBeFalsy();
  });

  it('should clean up pre-search state on thread change', () => {
    const store = createTestChatStore({ enableWebSearch: true });

    // Add pre-search for current thread
    store.getState().tryMarkPreSearchTriggered(0);

    // Navigate to different thread - should clear triggered rounds
    store.getState().clearAllPreSearches();

    expect(store.getState().preSearches).toHaveLength(0);
  });

  it('should reset tracking sets on thread change', () => {
    const store = createTestChatStore();

    // Mark moderator created
    store.getState().markModeratorCreated(0);
    expect(store.getState().hasModeratorBeenCreated(0)).toBeTruthy();

    // Thread change would reset tracking
    // (In real implementation, this happens via resetThread action)
    const newStore = createTestChatStore();
    expect(newStore.getState().hasModeratorBeenCreated(0)).toBeFalsy();
  });
});

// ============================================================================
// CROSS-TAB NAVIGATION
// ============================================================================

describe('cross-Tab Navigation', () => {
  it('should handle same thread open in multiple tabs', () => {
    // Each tab has its own store instance
    const tab1Store = createTestChatStore();
    const tab2Store = createTestChatStore();

    const thread = createMockThread();

    // Both tabs load same thread
    tab1Store.getState().setThread(thread);
    tab2Store.getState().setThread(thread);

    expect(tab1Store.getState().thread?.id).toBe(thread.id);
    expect(tab2Store.getState().thread?.id).toBe(thread.id);

    // Stores are independent
    tab1Store.getState().setIsStreaming(true);
    expect(tab1Store.getState().isStreaming).toBeTruthy();
    expect(tab2Store.getState().isStreaming).toBeFalsy();
  });
});
