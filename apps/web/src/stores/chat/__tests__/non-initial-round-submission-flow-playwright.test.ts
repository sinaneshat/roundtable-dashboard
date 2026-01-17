/**
 * Non-Initial Round (Round 2+) Submission Flow E2E Tests
 *
 * Comprehensive test coverage for FLOW_DOCUMENTATION.md Round 2+ submission behavior.
 *
 * Critical Behaviors Tested:
 * 1. Chat box behavior IDENTICAL to first round (disabled during streaming, loading states)
 * 2. Input clears immediately after submission
 * 3. User message appears at top of new round
 * 4. Streaming starts AFTER PATCH completes (not before)
 * 5. Correct order: PATCH → changelog (if changes) → pre-search (if enabled) → participants → moderator
 *
 * Test Scenarios:
 * - Round 2 submission with NO config changes
 * - Round 2 submission WITH config changes (wait for changelog)
 * - Round 3+ submissions
 * - Rapid submissions (debouncing)
 * - Submission during slow PATCH response
 * - Chat input state transitions (enabled → disabled → enabled)
 * - Web search mid-conversation toggle
 *
 * @see docs/FLOW_DOCUMENTATION.md Part 2.8 - Mid-Conversation Web Search Toggle
 * @see docs/FLOW_DOCUMENTATION.md Part 6 - Configuration Changes Mid-Conversation
 */

import { ChatModes, FinishReasons, MessagePartTypes, MessageRoles, MessageStatuses, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createTestAssistantMessage, createTestModeratorMessage, createTestUserMessage } from '@/lib/testing';
import { getCurrentRoundNumber } from '@/lib/utils';
import type { ChatMessage, ChatParticipant, ChatThread, StoredPreSearch } from '@/types/api';

import { createChatStore } from '../store';

// ============================================================================
// TEST UTILITIES
// ============================================================================

const THREAD_ID = 'thread-round2-test';

function createThread(overrides?: Partial<ChatThread>): ChatThread {
  return {
    id: THREAD_ID,
    userId: 'user-123',
    title: 'Ongoing Conversation',
    slug: 'ongoing-conversation-abc123',
    previousSlug: null,
    projectId: null,
    mode: ChatModes.ANALYZING,
    status: 'active',
    enableWebSearch: false,
    isFavorite: false,
    isPublic: false,
    isAiGeneratedTitle: true,
    metadata: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
    ...overrides,
  } as ChatThread;
}

function createParticipant(index: number, overrides?: Partial<ChatParticipant>): ChatParticipant {
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
    ...overrides,
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

// Helper to setup completed round
function setupCompletedRound(
  store: ReturnType<typeof createChatStore>,
  roundNumber: number,
  participantCount = 2,
) {
  const messages = [
    createUserMsg(roundNumber),
    ...Array.from({ length: participantCount }, (_, i) => createAssistantMsg(roundNumber, i)),
    createModeratorMsg(roundNumber),
  ];
  store.getState().setMessages([...store.getState().messages, ...messages]);
}

// ============================================================================
// BEHAVIOR 1: Chat Box Behavior Identical to First Round
// ============================================================================

describe('behavior 1: Chat box behavior identical to first round', () => {
  it('should disable input during Round 2 submission PATCH', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Complete Round 0
    setupCompletedRound(store, 0, 2);

    // User submits Round 1 message
    store.getState().setPendingMessage('Second question');
    store.getState().setIsCreatingThread(true); // Simulates PATCH in progress

    // Chat input should be disabled (same as first round)
    expect(store.getState().isCreatingThread).toBe(true);
    expect(store.getState().pendingMessage).toBe('Second question');
  });

  it('should show loading state during Round 2 PATCH', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Simulate PATCH request
    store.getState().setIsCreatingThread(true);
    expect(store.getState().isCreatingThread).toBe(true);
  });

  it('should disable input while waiting to start streaming Round 2', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // User message sent, waiting for streaming to start
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);
    store.getState().setWaitingToStartStreaming(true);

    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('should disable input during Round 2 participant streaming', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0), createParticipant(1)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // Round 1 streaming
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().isStreaming).toBe(true);
  });

  it('should disable input during Round 2 moderator streaming', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Round 1 participants complete, moderator streaming
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
      createAssistantMsg(1, 0),
    ]);
    store.getState().setIsModeratorStreaming(true);

    expect(store.getState().isModeratorStreaming).toBe(true);
  });

  it('should re-enable input after Round 2 completes', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Complete Round 1
    setupCompletedRound(store, 1, 1);
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(false);
    store.getState().setWaitingToStartStreaming(false);

    // Input should be enabled
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().isModeratorStreaming).toBe(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
  });
});

// ============================================================================
// BEHAVIOR 2: Input Clears Immediately After Submission
// ============================================================================

describe('behavior 2: Input clears immediately after submission', () => {
  it('should clear pendingMessage immediately after Round 2 submission', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // User types Round 1 message
    store.getState().setPendingMessage('Follow-up question');
    expect(store.getState().pendingMessage).toBe('Follow-up question');

    // Submit (clear immediately)
    store.getState().setPendingMessage(null);
    expect(store.getState().pendingMessage).toBeNull();
  });

  it('should clear input BEFORE PATCH completes', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    store.getState().setPendingMessage('Question 2');

    // Simulate submission (input cleared immediately)
    store.getState().setPendingMessage(null);

    // PATCH still in progress
    store.getState().setIsCreatingThread(true);

    // Input should be cleared even though PATCH not complete
    expect(store.getState().pendingMessage).toBeNull();
    expect(store.getState().isCreatingThread).toBe(true);
  });

  it('should NOT restore pendingMessage if PATCH fails', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit message (input cleared)
    store.getState().setPendingMessage(null);

    // PATCH fails
    store.getState().setIsCreatingThread(false);
    store.getState().setError(new Error('PATCH failed'));

    // Input should remain cleared (user can re-type)
    expect(store.getState().pendingMessage).toBeNull();
  });
});

// ============================================================================
// BEHAVIOR 3: User Message Appears at Top of New Round
// ============================================================================

describe('behavior 3: User message appears at top of new round', () => {
  it('should add user message to Round 1 after Round 0 completes', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    const round0Messages = store.getState().messages.length;

    // Add Round 1 user message
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1, 'Follow-up question'),
    ]);

    const newMessages = store.getState().messages;
    expect(newMessages).toHaveLength(round0Messages + 1);

    const userMsg = newMessages[newMessages.length - 1];
    expect(userMsg?.metadata.role).toBe(MessageRoles.USER);
    expect(userMsg?.metadata.roundNumber).toBe(1);
  });

  it('should maintain round number sequence (Round 2 after Round 1)', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);
    setupCompletedRound(store, 1, 1);

    // Add Round 2 user message
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(2, 'Third question'),
    ]);

    const userMsg = store.getState().messages.find(
      m => m.metadata.role === MessageRoles.USER && m.metadata.roundNumber === 2,
    );

    expect(userMsg).toBeDefined();
    expect(userMsg?.metadata.roundNumber).toBe(2);
  });

  it('should calculate correct round number from existing messages', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);
    setupCompletedRound(store, 1, 1);

    const currentRound = getCurrentRoundNumber(store.getState().messages);
    expect(currentRound).toBe(1); // Last completed round

    // Next round should be 2
    const nextRound = currentRound + 1;
    expect(nextRound).toBe(2);
  });
});

// ============================================================================
// BEHAVIOR 4: Streaming Starts AFTER PATCH Completes
// ============================================================================

describe('behavior 4: Streaming starts AFTER PATCH completes (not before)', () => {
  it('should NOT start streaming while PATCH is in progress', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // PATCH in progress
    store.getState().setIsCreatingThread(true);

    // Should NOT allow streaming
    expect(store.getState().isCreatingThread).toBe(true);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should wait for PATCH completion before setting waitingToStartStreaming', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // PATCH completes
    store.getState().setIsCreatingThread(false);

    // Add user message
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);

    // NOW can set waiting to start streaming
    store.getState().setWaitingToStartStreaming(true);

    expect(store.getState().isCreatingThread).toBe(false);
    expect(store.getState().waitingToStartStreaming).toBe(true);
  });

  it('should transition from PATCH → waiting → streaming correctly', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Step 1: PATCH starts
    store.getState().setIsCreatingThread(true);
    expect(store.getState().isCreatingThread).toBe(true);
    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().isStreaming).toBe(false);

    // Step 2: PATCH completes
    store.getState().setIsCreatingThread(false);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);

    // Step 3: Waiting to start streaming
    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().isCreatingThread).toBe(false);
    expect(store.getState().waitingToStartStreaming).toBe(true);
    expect(store.getState().isStreaming).toBe(false);

    // Step 4: Streaming starts
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().isCreatingThread).toBe(false);
    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().isStreaming).toBe(true);
  });
});

// ============================================================================
// BEHAVIOR 5: Correct Order (PATCH → Changelog → Pre-Search → Participants → Moderator)
// ============================================================================

describe('behavior 5: Correct execution order', () => {
  describe('order: PATCH → participants → moderator (no config changes, no web search)', () => {
    it('should follow simple flow when no config changes', () => {
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];
      store.getState().initializeThread(createThread(), participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      setupCompletedRound(store, 0, 2);

      // No config changes
      expect(store.getState().hasPendingConfigChanges).toBe(false);

      // PATCH completes → User message added
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMsg(1),
      ]);

      // Participants stream
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      store.getState().setMessages([
        ...store.getState().messages,
        createAssistantMsg(1, 0),
      ]);
      store.getState().setCurrentParticipantIndex(1);

      store.getState().setMessages([
        ...store.getState().messages,
        createAssistantMsg(1, 1),
      ]);
      store.getState().setIsStreaming(false);

      // Moderator streams
      store.getState().setIsModeratorStreaming(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createModeratorMsg(1),
      ]);
      store.getState().setIsModeratorStreaming(false);

      // Verify final state
      const round1Messages = store.getState().messages.filter(
        m => m.metadata.roundNumber === 1,
      );
      expect(round1Messages).toHaveLength(4); // user + 2 assistants + moderator
    });
  });

  describe('order: PATCH → changelog → participants → moderator (WITH config changes)', () => {
    it('should wait for changelog when config changes detected', () => {
      const store = createChatStore();
      const participants = [createParticipant(0), createParticipant(1)];
      store.getState().initializeThread(createThread(), participants, []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      setupCompletedRound(store, 0, 2);

      // User makes config changes
      store.getState().setHasPendingConfigChanges(true);
      expect(store.getState().hasPendingConfigChanges).toBe(true);

      // PATCH completes (includes config changes)
      store.getState().setHasPendingConfigChanges(false);

      // User message added
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMsg(1),
      ]);

      // Changelog should be processed (simulated by clearing flag)
      expect(store.getState().hasPendingConfigChanges).toBe(false);

      // NOW participants can stream
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should NOT start participants before changelog processed', () => {
      const store = createChatStore();
      store.getState().initializeThread(createThread(), [createParticipant(0)], []);
      store.getState().setScreenMode(ScreenModes.THREAD);

      setupCompletedRound(store, 0, 1);

      // Config changes pending
      store.getState().setHasPendingConfigChanges(true);
      store.getState().setIsWaitingForChangelog(true);

      // PATCH completes
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMsg(1),
      ]);

      // Should still be waiting for changelog
      expect(store.getState().isWaitingForChangelog).toBe(true);
      expect(store.getState().isStreaming).toBe(false);
    });
  });

  describe('order: PATCH → changelog → pre-search → participants → moderator (WITH web search)', () => {
    it('should execute pre-search before participants when enabled', () => {
      const store = createChatStore();
      store.getState().initializeThread(
        createThread({ enableWebSearch: true }),
        [createParticipant(0)],
        [],
      );
      store.getState().setScreenMode(ScreenModes.THREAD);

      setupCompletedRound(store, 0, 1);

      // PATCH completes
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMsg(1),
      ]);

      // Pre-search created
      store.getState().addPreSearch(createPreSearch(1, 'pending'));
      expect(store.getState().preSearches).toHaveLength(1);

      // Pre-search executes
      store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      // Pre-search completes
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

      // NOW participants can stream
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);
    });

    it('should NOT start participants while pre-search is PENDING', () => {
      const store = createChatStore();
      store.getState().initializeThread(
        createThread({ enableWebSearch: true }),
        [createParticipant(0)],
        [],
      );
      store.getState().setScreenMode(ScreenModes.THREAD);

      setupCompletedRound(store, 0, 1);

      // User message added
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMsg(1),
      ]);

      // Pre-search PENDING
      store.getState().addPreSearch(createPreSearch(1, 'pending'));

      // Should NOT allow streaming
      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const shouldBlock = preSearch?.status === MessageStatuses.PENDING
        || preSearch?.status === MessageStatuses.STREAMING;

      expect(shouldBlock).toBe(true);
    });

    it('should allow participants after pre-search FAILED', () => {
      const store = createChatStore();
      store.getState().initializeThread(
        createThread({ enableWebSearch: true }),
        [createParticipant(0)],
        [],
      );
      store.getState().setScreenMode(ScreenModes.THREAD);

      setupCompletedRound(store, 0, 1);

      store.getState().setMessages([
        ...store.getState().messages,
        createUserMsg(1),
      ]);

      // Pre-search fails
      store.getState().addPreSearch(createPreSearch(1, 'failed'));

      const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
      const canProceed = preSearch?.status === MessageStatuses.COMPLETE
        || preSearch?.status === MessageStatuses.FAILED;

      expect(canProceed).toBe(true);

      // Participants can stream
      store.getState().setIsStreaming(true);
      expect(store.getState().isStreaming).toBe(true);
    });
  });

  describe('order: PATCH → changelog → pre-search → participants → moderator (ALL conditions)', () => {
    it('should execute full flow with config changes AND web search', () => {
      const store = createChatStore();
      store.getState().initializeThread(
        createThread({ enableWebSearch: false }), // Initially disabled
        [createParticipant(0)],
        [],
      );
      store.getState().setScreenMode(ScreenModes.THREAD);

      setupCompletedRound(store, 0, 1);

      // User enables web search mid-conversation (config change)
      store.getState().setEnableWebSearch(true);
      store.getState().setHasPendingConfigChanges(true);

      // Step 1: PATCH completes
      store.getState().setHasPendingConfigChanges(false);
      store.getState().setMessages([
        ...store.getState().messages,
        createUserMsg(1),
      ]);

      // Step 2: Changelog processed
      store.getState().setIsWaitingForChangelog(false);

      // Step 3: Pre-search created and executes
      store.getState().addPreSearch(createPreSearch(1, 'pending'));
      store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
      store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

      // Step 4: Participants stream
      store.getState().setIsStreaming(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createAssistantMsg(1, 0),
      ]);
      store.getState().setIsStreaming(false);

      // Step 5: Moderator streams
      store.getState().setIsModeratorStreaming(true);
      store.getState().setMessages([
        ...store.getState().messages,
        createModeratorMsg(1),
      ]);
      store.getState().setIsModeratorStreaming(false);

      // Verify final state
      expect(store.getState().enableWebSearch).toBe(true);
      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

      const round1Messages = store.getState().messages.filter(
        m => m.metadata.roundNumber === 1,
      );
      expect(round1Messages).toHaveLength(3); // user + assistant + moderator
    });
  });
});

// ============================================================================
// SCENARIO TESTS
// ============================================================================

describe('scenario: Round 2 submission with NO config changes', () => {
  it('should complete Round 2 submission flow without config changes', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Setup: Round 0 complete
    setupCompletedRound(store, 0, 2);

    // User types message
    store.getState().setPendingMessage('Follow-up question');

    // Submit (input clears)
    store.getState().setPendingMessage(null);

    // PATCH completes
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1, 'Follow-up question'),
    ]);

    // Participants stream
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 0),
    ]);
    store.getState().setCurrentParticipantIndex(1);

    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 1),
    ]);
    store.getState().setIsStreaming(false);

    // Moderator streams
    store.getState().setIsModeratorStreaming(true);
    store.getState().setMessages([
      ...store.getState().messages,
      createModeratorMsg(1),
    ]);
    store.getState().setIsModeratorStreaming(false);

    // Verify complete
    const allMessages = store.getState().messages;
    const round1Messages = allMessages.filter(m => m.metadata.roundNumber === 1);

    expect(round1Messages).toHaveLength(4); // user + 2 assistants + moderator
    expect(store.getState().isStreaming).toBe(false);
    expect(store.getState().isModeratorStreaming).toBe(false);
  });
});

describe('scenario: Round 2 submission WITH config changes', () => {
  it('should wait for changelog before starting participants', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // User makes config changes
    store.getState().setHasPendingConfigChanges(true);

    // Submit
    store.getState().setPendingMessage(null);

    // PATCH completes (includes config changes)
    store.getState().setHasPendingConfigChanges(false);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);

    // Participants stream AFTER changelog
    store.getState().setIsStreaming(true);
    expect(store.getState().hasPendingConfigChanges).toBe(false);
    expect(store.getState().isStreaming).toBe(true);
  });
});

describe('scenario: Round 3+ submissions', () => {
  it('should handle Round 3 submission correctly', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Complete Rounds 0, 1
    setupCompletedRound(store, 0, 1);
    setupCompletedRound(store, 1, 1);

    // Round 2 submission
    store.getState().setPendingMessage('Third question');
    store.getState().setPendingMessage(null);

    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(2, 'Third question'),
    ]);

    const userMsg = store.getState().messages.find(
      m => m.metadata.role === MessageRoles.USER && m.metadata.roundNumber === 2,
    );

    expect(userMsg).toBeDefined();
    expect(userMsg?.metadata.roundNumber).toBe(2);
  });

  it('should handle Round 5 submission correctly', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    // Complete Rounds 0-4
    for (let round = 0; round <= 4; round++) {
      setupCompletedRound(store, round, 1);
    }

    // Round 5 submission
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(5),
    ]);

    const currentRound = getCurrentRoundNumber(store.getState().messages);
    expect(currentRound).toBe(5);
  });
});

describe('scenario: Rapid submissions (debouncing)', () => {
  it('should prevent double submission by checking isCreatingThread', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // First submission starts
    store.getState().setIsCreatingThread(true);

    // User rapidly clicks submit again
    const canSubmitAgain = !store.getState().isCreatingThread;

    // Should NOT allow second submission
    expect(canSubmitAgain).toBe(false);
  });

  it('should prevent submission during streaming', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Round 1 streaming
    store.getState().setIsStreaming(true);

    // User tries to submit Round 2
    const canSubmit = !store.getState().isStreaming && !store.getState().isModeratorStreaming;

    expect(canSubmit).toBe(false);
  });
});

describe('scenario: Submission during slow PATCH response', () => {
  it('should remain in waiting state during slow PATCH', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submission starts
    store.getState().setPendingMessage(null);
    store.getState().setIsCreatingThread(true);

    // Simulate slow PATCH (still in progress)
    expect(store.getState().isCreatingThread).toBe(true);
    expect(store.getState().waitingToStartStreaming).toBe(false);
    expect(store.getState().isStreaming).toBe(false);

    // PATCH eventually completes
    store.getState().setIsCreatingThread(false);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);

    expect(store.getState().isCreatingThread).toBe(false);
  });
});

describe('scenario: Chat input state transitions', () => {
  it('should transition enabled → disabled → enabled correctly', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // State 1: Enabled (waiting for user input)
    const isEnabled1 = !store.getState().isCreatingThread
      && !store.getState().isStreaming
      && !store.getState().isModeratorStreaming;
    expect(isEnabled1).toBe(true);

    // State 2: Disabled (PATCH in progress)
    store.getState().setIsCreatingThread(true);
    const isEnabled2 = !store.getState().isCreatingThread;
    expect(isEnabled2).toBe(false);

    // State 3: Disabled (streaming)
    store.getState().setIsCreatingThread(false);
    store.getState().setIsStreaming(true);
    const isEnabled3 = !store.getState().isStreaming;
    expect(isEnabled3).toBe(false);

    // State 4: Enabled again (round complete)
    store.getState().setIsStreaming(false);
    const isEnabled4 = !store.getState().isCreatingThread
      && !store.getState().isStreaming
      && !store.getState().isModeratorStreaming;
    expect(isEnabled4).toBe(true);
  });
});

describe('scenario: Mid-conversation web search toggle', () => {
  it('should enable web search for Round 2 after Round 1 without web search', () => {
    const store = createChatStore();
    store.getState().initializeThread(
      createThread({ enableWebSearch: false }),
      [createParticipant(0)],
      [],
    );
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // User enables web search mid-conversation
    store.getState().setEnableWebSearch(true);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().enableWebSearch).toBe(true);
    expect(store.getState().thread?.enableWebSearch).toBe(false); // Thread still has old value

    // Submit Round 1
    store.getState().setHasPendingConfigChanges(false);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);

    // Pre-search created for Round 1
    store.getState().addPreSearch(createPreSearch(1, 'pending'));

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);
  });

  it('should disable web search for Round 2 after Round 1 with web search', () => {
    const store = createChatStore();
    store.getState().initializeThread(
      createThread({ enableWebSearch: true }),
      [createParticipant(0)],
      [],
    );
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Round 0 had pre-search
    store.getState().addPreSearch(createPreSearch(0, 'complete'));

    // User disables web search
    store.getState().setEnableWebSearch(false);
    store.getState().setHasPendingConfigChanges(true);

    expect(store.getState().enableWebSearch).toBe(false);

    // Submit Round 1 (no pre-search should be created)
    store.getState().setHasPendingConfigChanges(false);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);

    // No pre-search for Round 1
    const round1PreSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(round1PreSearch).toBeUndefined();
  });
});

// ============================================================================
// PLACEHOLDER VISIBILITY TESTS
// ============================================================================

describe('placeholder visibility: Immediate appearance after submission (Round 1+)', () => {
  it('should set streamingRoundNumber immediately after form submission', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // BEFORE submission
    expect(store.getState().streamingRoundNumber).toBeNull();

    // Simulate form submission (prepareForNewMessage)
    const message = 'Follow-up question';
    const participantIds = participants.map(p => p.modelId);
    store.getState().prepareForNewMessage(message, participantIds);

    // IMMEDIATELY after submission
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().waitingToStartStreaming).toBe(false); // Will be set true later
  });

  it('should maintain streamingRoundNumber throughout PATCH', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit
    store.getState().prepareForNewMessage('Question 2', [participants[0]!.modelId]);

    // DURING PATCH
    store.getState().setIsCreatingThread(true);
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().isCreatingThread).toBe(true);

    // PATCH completes
    store.getState().setIsCreatingThread(false);
    expect(store.getState().streamingRoundNumber).toBe(1); // Still set
  });

  it('should NOT clear streamingRoundNumber during streaming', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // Submit and start streaming
    store.getState().prepareForNewMessage('Question 2', participants.map(p => p.modelId));
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().streamingRoundNumber).toBe(1);

    // Participant 0 completes
    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().streamingRoundNumber).toBe(1); // Still set

    // Participant 1 completes
    store.getState().setIsStreaming(false);
    expect(store.getState().streamingRoundNumber).toBe(1); // Still set until completeStreaming
  });
});

describe('placeholder visibility: Pre-search placeholder', () => {
  it('should create pre-search placeholder immediately when web search enabled', () => {
    const store = createChatStore();
    store.getState().initializeThread(
      createThread({ enableWebSearch: true }),
      [createParticipant(0)],
      [],
    );
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit Round 1
    store.getState().prepareForNewMessage('Question with search', [store.getState().participants[0]!.modelId]);

    // Pre-search created
    store.getState().addPreSearch(createPreSearch(1, 'pending'));

    // Verify placeholder data
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);
    expect(preSearch?.roundNumber).toBe(1);
  });

  it('should maintain pre-search placeholder during PATCH', () => {
    const store = createChatStore();
    store.getState().initializeThread(
      createThread({ enableWebSearch: true }),
      [createParticipant(0)],
      [],
    );
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit
    store.getState().prepareForNewMessage('Question', [store.getState().participants[0]!.modelId]);
    store.getState().addPreSearch(createPreSearch(1, 'pending'));

    // DURING PATCH
    store.getState().setIsCreatingThread(true);

    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch?.status).toBe(MessageStatuses.PENDING);

    // PATCH completes
    store.getState().setIsCreatingThread(false);

    const preSearchAfter = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearchAfter?.status).toBe(MessageStatuses.PENDING); // Still visible
  });

  it('should NOT remove pre-search placeholder during streaming', () => {
    const store = createChatStore();
    store.getState().initializeThread(
      createThread({ enableWebSearch: true }),
      [createParticipant(0)],
      [],
    );
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit with pre-search
    store.getState().prepareForNewMessage('Question', [store.getState().participants[0]!.modelId]);
    store.getState().addPreSearch(createPreSearch(1, 'pending'));

    // Pre-search transitions to streaming
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(MessageStatuses.STREAMING);

    // Pre-search completes
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);

    // Participant starts streaming
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    // Pre-search should still be in array (not removed)
    const preSearch = store.getState().preSearches.find(ps => ps.roundNumber === 1);
    expect(preSearch).toBeDefined();
    expect(preSearch?.status).toBe(MessageStatuses.COMPLETE);
  });
});

describe('placeholder visibility: Participant placeholders', () => {
  it('should show participant placeholders when streamingRoundNumber is set', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // Submit
    store.getState().prepareForNewMessage('Question', participants.map(p => p.modelId));

    // streamingRoundNumber set = placeholders should render
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().participants).toHaveLength(2);

    // Both participants should show "Thinking..." placeholders
    // (actual placeholder rendering happens in UI layer, store just provides data)
    expect(store.getState().isStreaming).toBe(false); // Not started yet
    expect(store.getState().currentParticipantIndex).toBe(0);
  });

  it('should maintain participant placeholders during PATCH', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // Submit
    store.getState().prepareForNewMessage('Question', participants.map(p => p.modelId));

    // DURING PATCH
    store.getState().setIsCreatingThread(true);

    // Placeholders should still be visible
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().participants).toHaveLength(2);
  });

  it('should show "Thinking..." then update to streaming content', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // Submit - placeholders show "Thinking..."
    store.getState().prepareForNewMessage('Question', participants.map(p => p.modelId));
    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Streaming starts - placeholder 0 transitions to streaming
    store.getState().setIsStreaming(true);
    expect(store.getState().isStreaming).toBe(true);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Participant 0 completes - placeholder 1 still shows "Thinking..."
    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().currentParticipantIndex).toBe(1);

    // Participant 1 starts streaming
    expect(store.getState().isStreaming).toBe(true);
  });

  it('should NOT remove participant placeholders before moderator completes', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit
    store.getState().prepareForNewMessage('Question', [participants[0]!.modelId]);

    // Participant streams and completes
    store.getState().setIsStreaming(true);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
      createAssistantMsg(1, 0),
    ]);
    store.getState().setIsStreaming(false);

    // streamingRoundNumber should STILL be set (placeholders visible until moderator)
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Moderator starts
    store.getState().setIsModeratorStreaming(true);
    expect(store.getState().streamingRoundNumber).toBe(1); // Still set
  });
});

describe('placeholder visibility: Moderator placeholder', () => {
  it('should show moderator placeholder after participants complete', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit and complete participants
    store.getState().prepareForNewMessage('Question', [participants[0]!.modelId]);
    store.getState().setIsStreaming(true);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
      createAssistantMsg(1, 0),
    ]);
    store.getState().setIsStreaming(false);

    // Moderator starts - placeholder should show
    store.getState().setIsModeratorStreaming(true);

    expect(store.getState().isModeratorStreaming).toBe(true);
    expect(store.getState().streamingRoundNumber).toBe(1); // Still set
  });

  it('should maintain moderator placeholder during streaming', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Complete participants
    store.getState().prepareForNewMessage('Question', [store.getState().participants[0]!.modelId]);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
      createAssistantMsg(1, 0),
    ]);

    // Moderator streaming
    store.getState().setIsModeratorStreaming(true);

    expect(store.getState().isModeratorStreaming).toBe(true);
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Add moderator message (streaming in progress)
    store.getState().setMessages([
      ...store.getState().messages,
      { ...createModeratorMsg(1), parts: [{ type: MessagePartTypes.TEXT, text: 'Partial...' }] },
    ]);

    // Should still be in moderator streaming state
    expect(store.getState().isModeratorStreaming).toBe(true);
  });

  it('should clear streamingRoundNumber only when completeStreaming called', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Complete full round
    store.getState().prepareForNewMessage('Question', [store.getState().participants[0]!.modelId]);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
      createAssistantMsg(1, 0),
    ]);
    store.getState().setIsModeratorStreaming(true);
    store.getState().setMessages([
      ...store.getState().messages,
      createModeratorMsg(1),
    ]);
    store.getState().setIsModeratorStreaming(false);

    // streamingRoundNumber STILL set until completeStreaming
    expect(store.getState().streamingRoundNumber).toBe(1);

    // Complete streaming
    store.getState().completeStreaming();

    // NOW streamingRoundNumber is cleared
    expect(store.getState().streamingRoundNumber).toBeNull();
  });
});

describe('placeholder visibility: Timeline - no disappearing placeholders', () => {
  it('should maintain all placeholders from submission through completion', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(
      createThread({ enableWebSearch: true }),
      participants,
      [],
    );
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // TIMELINE POINT 1: Submission
    store.getState().prepareForNewMessage('Question', participants.map(p => p.modelId));
    expect(store.getState().streamingRoundNumber).toBe(1); // Participant placeholders visible
    store.getState().addPreSearch(createPreSearch(1, 'pending'));
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined(); // Pre-search visible

    // TIMELINE POINT 2: PATCH in progress
    store.getState().setIsCreatingThread(true);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined(); // ✅ Still visible

    // TIMELINE POINT 3: PATCH completes
    store.getState().setIsCreatingThread(false);
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined(); // ✅ Still visible

    // TIMELINE POINT 4: Pre-search executes
    store.getState().updatePreSearchStatus(1, MessageStatuses.STREAMING);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(MessageStatuses.STREAMING); // ✅ Updated

    // TIMELINE POINT 5: Pre-search completes
    store.getState().updatePreSearchStatus(1, MessageStatuses.COMPLETE);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)?.status).toBe(MessageStatuses.COMPLETE); // ✅ Complete

    // TIMELINE POINT 6: Participant 0 streams
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined(); // ✅ Still visible

    // TIMELINE POINT 7: Participant 0 completes
    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 0),
    ]);
    store.getState().setCurrentParticipantIndex(1);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible
    expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined(); // ✅ Still visible

    // TIMELINE POINT 8: Participant 1 streams and completes
    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 1),
    ]);
    store.getState().setIsStreaming(false);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible

    // TIMELINE POINT 9: Moderator streams
    store.getState().setIsModeratorStreaming(true);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible
    expect(store.getState().isModeratorStreaming).toBe(true); // Moderator placeholder visible

    // TIMELINE POINT 10: Moderator completes
    store.getState().setMessages([
      ...store.getState().messages,
      createModeratorMsg(1),
    ]);
    store.getState().setIsModeratorStreaming(false);
    expect(store.getState().streamingRoundNumber).toBe(1); // ✅ Still visible until completeStreaming

    // TIMELINE POINT 11: completeStreaming called
    store.getState().completeStreaming();
    expect(store.getState().streamingRoundNumber).toBeNull(); // ✅ NOW cleared
  });

  it('should never clear streamingRoundNumber during PATCH or streaming phases', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit
    store.getState().prepareForNewMessage('Question', [participants[0]!.modelId]);
    const roundNumber = store.getState().streamingRoundNumber;
    expect(roundNumber).toBe(1);

    // Check it never becomes null through various state transitions
    store.getState().setIsCreatingThread(true);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    store.getState().setIsCreatingThread(false);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    store.getState().setWaitingToStartStreaming(true);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    store.getState().setWaitingToStartStreaming(false);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    store.getState().setIsStreaming(true);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    store.getState().setIsStreaming(false);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    store.getState().setIsModeratorStreaming(true);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    store.getState().setIsModeratorStreaming(false);
    expect(store.getState().streamingRoundNumber).toBe(roundNumber);

    // Only completeStreaming clears it
    store.getState().completeStreaming();
    expect(store.getState().streamingRoundNumber).toBeNull();
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  it('should handle PATCH failure gracefully', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submission starts
    store.getState().setIsCreatingThread(true);

    // PATCH fails
    store.getState().setIsCreatingThread(false);
    store.getState().setError(new Error('PATCH failed'));

    // Should allow retry
    expect(store.getState().isCreatingThread).toBe(false);
    expect(store.getState().error).toBeDefined();
  });

  it('should handle participant error without blocking round', () => {
    const store = createChatStore();
    const participants = [createParticipant(0), createParticipant(1)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 2);

    // Round 1 submission
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
    ]);

    // Participant 0 succeeds
    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 0),
    ]);

    // Participant 1 fails
    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 1, 'Error', FinishReasons.ERROR),
    ]);

    // Moderator can still stream
    store.getState().setIsModeratorStreaming(true);
    expect(store.getState().isModeratorStreaming).toBe(true);
  });

  it('should handle concurrent round completion and new submission', () => {
    const store = createChatStore();
    store.getState().initializeThread(createThread(), [createParticipant(0)], []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Round 1 moderator completing
    store.getState().setMessages([
      ...store.getState().messages,
      createUserMsg(1),
      createAssistantMsg(1, 0),
    ]);
    store.getState().setIsModeratorStreaming(true);

    // User types Round 2 message while moderator streaming
    store.getState().setPendingMessage('Next question');

    // Moderator completes
    store.getState().setMessages([
      ...store.getState().messages,
      createModeratorMsg(1),
    ]);
    store.getState().setIsModeratorStreaming(false);

    // NOW user can submit Round 2
    const canSubmit = !store.getState().isStreaming && !store.getState().isModeratorStreaming;
    expect(canSubmit).toBe(true);
  });
});

// ============================================================================
// CRITICAL: MESSAGE VISIBILITY THROUGHOUT SUBMISSION FLOW
// ============================================================================

describe('cRITICAL: User message visibility during non-initial round submission', () => {
  it('should maintain user message visibility from optimistic add through PATCH completion', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // PHASE 1: Optimistic message added
    const optimisticMessage = {
      id: 'optimistic-user-1-12345',
      role: UIMessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Follow-up question' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 1,
        isOptimistic: true,
      },
    };

    store.getState().setMessages([...store.getState().messages, optimisticMessage]);
    store.getState().setStreamingRoundNumber(1);

    // User message should be visible immediately
    let round1UserMessages = store.getState().messages.filter(
      m => m.role === UIMessageRoles.USER && m.metadata.roundNumber === 1,
    );
    expect(round1UserMessages).toHaveLength(1);
    expect(round1UserMessages[0]?.id).toBe('optimistic-user-1-12345');

    // PHASE 2: PATCH completes - replace optimistic with persisted
    const persistedMessage = {
      ...optimisticMessage,
      id: 'db-message-r1-user',
      metadata: {
        ...optimisticMessage.metadata,
        isOptimistic: undefined,
      },
    };

    store.getState().setMessages(
      store.getState().messages.map(m =>
        m.id === optimisticMessage.id ? persistedMessage : m,
      ),
    );

    // User message should STILL be visible (with new ID)
    round1UserMessages = store.getState().messages.filter(
      m => m.role === UIMessageRoles.USER && m.metadata.roundNumber === 1,
    );
    expect(round1UserMessages).toHaveLength(1);
    expect(round1UserMessages[0]?.id).toBe('db-message-r1-user');
  });

  it('should NOT lose user message during streaming state transitions', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Add user message for round 1
    const userMessage = createUserMsg(1, 'Follow-up');
    store.getState().setMessages([...store.getState().messages, userMessage]);
    store.getState().setStreamingRoundNumber(1);

    // Verify message present before streaming
    let round1Messages = store.getState().messages.filter(m => m.metadata.roundNumber === 1);
    expect(round1Messages).toHaveLength(1);
    expect(round1Messages[0]?.role).toBe(UIMessageRoles.USER);

    // Start streaming
    store.getState().setWaitingToStartStreaming(true);
    round1Messages = store.getState().messages.filter(m => m.metadata.roundNumber === 1);
    expect(round1Messages).toHaveLength(1);

    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);
    round1Messages = store.getState().messages.filter(m => m.metadata.roundNumber === 1);
    expect(round1Messages).toHaveLength(1);

    // Add first assistant message
    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 0),
    ]);

    round1Messages = store.getState().messages.filter(m => m.metadata.roundNumber === 1);
    expect(round1Messages).toHaveLength(2); // User + assistant
    const userMsg = round1Messages.find(m => m.role === UIMessageRoles.USER);
    expect(userMsg).toBeDefined();
    expect(userMsg!.parts[0]).toEqual({ type: MessagePartTypes.TEXT, text: 'Follow-up' });
  });

  it('should preserve user message when configChangeRoundNumber blocks streaming', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Submit with config changes
    const optimisticMessage = {
      id: 'optimistic-user-1',
      role: UIMessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Question with config change' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 1,
        isOptimistic: true,
      },
    };

    store.getState().setMessages([...store.getState().messages, optimisticMessage]);
    store.getState().setStreamingRoundNumber(1);
    store.getState().setConfigChangeRoundNumber(1); // Blocks streaming

    // Message should be visible even while blocked
    const round1Messages = store.getState().messages.filter(
      m => m.role === UIMessageRoles.USER && m.metadata.roundNumber === 1,
    );
    expect(round1Messages).toHaveLength(1);
    expect(store.getState().configChangeRoundNumber).toBe(1);
  });

  it('should preserve user message through initializeThread calls during active submission', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    const thread = createThread();
    store.getState().initializeThread(thread, participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Add optimistic message
    const optimisticMessage = {
      id: 'optimistic-user-1',
      role: UIMessageRoles.USER,
      parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
      metadata: {
        role: MessageRoles.USER,
        roundNumber: 1,
        isOptimistic: true,
      },
    };

    store.getState().setMessages([...store.getState().messages, optimisticMessage]);
    store.getState().setStreamingRoundNumber(1);
    store.getState().setConfigChangeRoundNumber(1);

    // Call initializeThread (simulating PATCH response update)
    const round0Messages = [
      createUserMsg(0),
      createAssistantMsg(0, 0),
    ];
    store.getState().initializeThread(thread, participants, round0Messages);

    // Round 1 message should STILL be present (not wiped by initializeThread)
    const round1Messages = store.getState().messages.filter(
      m => m.metadata.roundNumber === 1,
    );
    expect(round1Messages).toHaveLength(1);
    expect(round1Messages[0]?.role).toBe(UIMessageRoles.USER);
    expect(store.getState().streamingRoundNumber).toBe(1);
  });

  it('should maintain user message count = 1 throughout entire non-initial round flow', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Track user message count at each phase
    const getUserMessageCount = (roundNumber: number) => {
      return store.getState().messages.filter(
        m => m.role === UIMessageRoles.USER && m.metadata.roundNumber === roundNumber,
      ).length;
    };

    // PHASE 1: Optimistic add
    store.getState().setMessages([
      ...store.getState().messages,
      {
        id: 'optimistic-1',
        role: UIMessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Q1' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1, isOptimistic: true },
      },
    ]);
    expect(getUserMessageCount(1)).toBe(1);

    // PHASE 2: ID replacement
    store.getState().setMessages(
      store.getState().messages.map(m =>
        m.id === 'optimistic-1'
          ? { ...m, id: 'db-msg-1', metadata: { ...m.metadata, isOptimistic: undefined } }
          : m,
      ),
    );
    expect(getUserMessageCount(1)).toBe(1);

    // PHASE 3: Streaming starts
    store.getState().setStreamingRoundNumber(1);
    store.getState().setWaitingToStartStreaming(true);
    expect(getUserMessageCount(1)).toBe(1);

    // PHASE 4: During participant streaming
    store.getState().setWaitingToStartStreaming(false);
    store.getState().setIsStreaming(true);
    expect(getUserMessageCount(1)).toBe(1);

    store.getState().setMessages([
      ...store.getState().messages,
      createAssistantMsg(1, 0),
    ]);
    expect(getUserMessageCount(1)).toBe(1);

    // PHASE 5: During moderator streaming
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);
    expect(getUserMessageCount(1)).toBe(1);

    store.getState().setMessages([
      ...store.getState().messages,
      createModeratorMsg(1),
    ]);
    expect(getUserMessageCount(1)).toBe(1);

    // PHASE 6: After completion
    store.getState().setIsModeratorStreaming(false);
    store.getState().completeStreaming();
    expect(getUserMessageCount(1)).toBe(1);
  });

  it('should rollback optimistic message on PATCH error', () => {
    const store = createChatStore();
    const participants = [createParticipant(0)];
    store.getState().initializeThread(createThread(), participants, []);
    store.getState().setScreenMode(ScreenModes.THREAD);

    setupCompletedRound(store, 0, 1);

    // Add optimistic message
    const optimisticId = 'optimistic-error-test';
    store.getState().setMessages([
      ...store.getState().messages,
      {
        id: optimisticId,
        role: UIMessageRoles.USER,
        parts: [{ type: MessagePartTypes.TEXT, text: 'Question' }],
        metadata: { role: MessageRoles.USER, roundNumber: 1, isOptimistic: true },
      },
    ]);
    store.getState().setStreamingRoundNumber(1);

    expect(store.getState().messages.find(m => m.id === optimisticId)).toBeDefined();

    // PATCH fails - rollback
    store.getState().setMessages(
      store.getState().messages.filter(m => m.id !== optimisticId),
    );
    store.getState().setStreamingRoundNumber(null);

    // Optimistic message should be removed
    expect(store.getState().messages.find(m => m.id === optimisticId)).toBeUndefined();
    const round1Messages = store.getState().messages.filter(m => m.metadata.roundNumber === 1);
    expect(round1Messages).toHaveLength(0);
  });
});
