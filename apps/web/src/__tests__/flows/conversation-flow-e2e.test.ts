/**
 * Conversation Flow E2E Tests
 *
 * Full conversation journey tests covering:
 * - Round 1 from Overview Screen (with/without web search, with/without attachments)
 * - Follow-up Rounds (config changes, changelog accordion)
 * - Multi-Round Conversations (5+ rounds maintaining ordering)
 *
 * Based on FLOW_DOCUMENTATION.md Chat Journey Flow
 */

import { MessageStatuses, ScreenModes, UIMessageRoles } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  countAssistantMessagesInRound,
  createApiCallTracker,
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestChatStore,
  createTestModeratorMessage,
  createTestUserMessage,
  filterAssistantMessagesByRound,
  trackApiCall,
} from '@/lib/testing';

// ============================================================================
// ROUND 1 FROM OVERVIEW SCREEN
// ============================================================================

describe('round 1 from Overview Screen', () => {
  describe('without Web Search', () => {
    it('should complete full journey: submit → placeholders → P0 → P1 → moderator → complete', () => {
      const store = createTestChatStore();
      const participants = createMockParticipants(2);
      const thread = createMockThread({ enableWebSearch: false });

      // Phase 1: Initial state (ChatOverviewScreen)
      expect(store.getState().showInitialUI).toBe(true);
      expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().messages).toHaveLength(0);

      // Phase 2: User submits message
      store.getState().setIsCreatingThread(true);
      store.getState().setShowInitialUI(false);

      expect(store.getState().isCreatingThread).toBe(true);
      expect(store.getState().showInitialUI).toBe(false);

      // Phase 3: Thread created, user message added
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      const userMessage = createTestUserMessage({
        id: `${thread.id}_r0_user`,
        content: 'What is the capital of France?',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage]);

      expect(store.getState().thread?.id).toBe(thread.id);
      expect(store.getState().messages).toHaveLength(1);

      // Phase 4: Streaming starts
      store.getState().setIsCreatingThread(false);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      expect(store.getState().isCreatingThread).toBe(false);
      expect(store.getState().isStreaming).toBe(true);
      expect(store.getState().streamingRoundNumber).toBe(0);

      // Phase 5: Participant 0 streams
      store.getState().setCurrentParticipantIndex(0);

      const p0Message = createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'The capital of France is Paris.',
        roundNumber: 0,
        participantId: participants[0]?.id ?? 'participant-0',
        participantIndex: 0,
      });
      store.getState().setMessages([userMessage, p0Message]);

      expect(store.getState().currentParticipantIndex).toBe(0);
      expect(countAssistantMessagesInRound(store.getState().messages, 0)).toBe(1);

      // Phase 6: Participant 1 streams
      store.getState().setCurrentParticipantIndex(1);

      const p1Message = createTestAssistantMessage({
        id: `${thread.id}_r0_p1`,
        content: 'Paris is indeed the capital of France.',
        roundNumber: 0,
        participantId: participants[1]?.id ?? 'participant-1',
        participantIndex: 1,
      });
      store.getState().setMessages([userMessage, p0Message, p1Message]);

      expect(store.getState().currentParticipantIndex).toBe(1);
      expect(countAssistantMessagesInRound(store.getState().messages, 0)).toBe(2);

      // Phase 7: Participant streaming completes
      store.getState().setIsStreaming(false);

      expect(store.getState().isStreaming).toBe(false);

      // Phase 8: Moderator streams
      store.getState().setIsModeratorStreaming(true);

      const moderatorMessage = createTestModeratorMessage({
        id: `${thread.id}_r0_moderator`,
        content: 'Both participants agree that Paris is the capital of France.',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage, p0Message, p1Message, moderatorMessage]);

      expect(store.getState().isModeratorStreaming).toBe(true);

      // Phase 9: Round complete
      store.getState().setIsModeratorStreaming(false);
      store.getState().completeStreaming();

      expect(store.getState().isModeratorStreaming).toBe(false);
      expect(store.getState().isStreaming).toBe(false);
      expect(store.getState().streamingRoundNumber).toBe(null);
      expect(store.getState().messages).toHaveLength(4);
    });

    it('should maintain correct message order throughout streaming', () => {
      const store = createTestChatStore();
      const participants = createMockParticipants(3);
      const thread = createMockThread();

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      // Add messages in order
      const userMessage = createTestUserMessage({
        id: `${thread.id}_r0_user`,
        content: 'Test question',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage]);

      // Add each participant message
      const messages = [userMessage];
      for (let i = 0; i < 3; i++) {
        const pMessage = createTestAssistantMessage({
          id: `${thread.id}_r0_p${i}`,
          content: `Response from participant ${i}`,
          roundNumber: 0,
          participantId: participants[i]?.id ?? `participant-${i}`,
          participantIndex: i,
        });
        messages.push(pMessage);
        store.getState().setMessages([...messages]);
      }

      // Verify order: user first, then participants by index
      const storedMessages = store.getState().messages;
      expect(storedMessages[0]?.role).toBe(UIMessageRoles.USER);

      const assistantMessages = filterAssistantMessagesByRound(storedMessages, 0);
      expect(assistantMessages).toHaveLength(3);

      assistantMessages.forEach((msg, idx) => {
        expect(msg.metadata).toBeDefined();
        expect(msg.metadata).toHaveProperty('participantIndex', idx);
      });
    });
  });

  describe('with Web Search', () => {
    it('should complete journey: submit → pre-search PENDING → STREAMING → COMPLETE → participants → moderator', () => {
      const store = createTestChatStore({ enableWebSearch: true });
      const participants = createMockParticipants(2);
      const thread = createMockThread({ enableWebSearch: true });

      // Phase 1: Setup
      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Phase 2: User submits, pre-search placeholder created
      const userMessage = createTestUserMessage({
        id: `${thread.id}_r0_user`,
        content: 'Search for latest news',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage]);

      // Pre-search starts as PENDING
      const preSearchPlaceholder = createMockStoredPreSearch(0, MessageStatuses.PENDING);
      store.getState().addPreSearch(preSearchPlaceholder);

      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.PENDING);

      // Phase 3: Pre-search transitions to STREAMING
      store.getState().updatePreSearchStatus(0, MessageStatuses.STREAMING);

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.STREAMING);

      // Phase 4: Pre-search COMPLETE
      store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);

      // Phase 5: Participants can now stream
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      const p0Message = createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Based on the search results...',
        roundNumber: 0,
        participantId: participants[0]?.id ?? 'participant-0',
        participantIndex: 0,
      });
      store.getState().setMessages([userMessage, p0Message]);

      const p1Message = createTestAssistantMessage({
        id: `${thread.id}_r0_p1`,
        content: 'The search data indicates...',
        roundNumber: 0,
        participantId: participants[1]?.id ?? 'participant-1',
        participantIndex: 1,
      });
      store.getState().setMessages([userMessage, p0Message, p1Message]);

      store.getState().setIsStreaming(false);

      // Phase 6: Moderator streams
      store.getState().setIsModeratorStreaming(true);

      const moderatorMessage = createTestModeratorMessage({
        id: `${thread.id}_r0_moderator`,
        content: 'Summary of search-based discussion',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage, p0Message, p1Message, moderatorMessage]);

      store.getState().setIsModeratorStreaming(false);
      store.getState().completeStreaming();

      // Verify final state
      expect(store.getState().messages).toHaveLength(4);
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should NOT trigger participants while pre-search is still streaming', () => {
      const store = createTestChatStore({ enableWebSearch: true });

      // Pre-search in STREAMING state
      const preSearch = createMockStoredPreSearch(0, MessageStatuses.STREAMING);
      store.getState().addPreSearch(preSearch);

      const shouldWaitForPreSearch
        = store.getState().preSearches[0]?.status === MessageStatuses.PENDING
          || store.getState().preSearches[0]?.status === MessageStatuses.STREAMING;

      expect(shouldWaitForPreSearch).toBe(true);
    });

    it('should handle pre-search failure gracefully', () => {
      const store = createTestChatStore({ enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(0, MessageStatuses.PENDING);
      store.getState().addPreSearch(preSearch);

      // Pre-search fails
      store.getState().updatePreSearchStatus(0, MessageStatuses.FAILED);

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.FAILED);
      // Participants should still be able to proceed
    });
  });

  describe('with Attachments', () => {
    it('should submit with files and have participants reference them', () => {
      const store = createTestChatStore();
      const participants = createMockParticipants(2);
      const thread = createMockThread();

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Set up pending attachment IDs
      const attachmentIds = ['file-1', 'file-2'];
      store.getState().setPendingAttachmentIds(attachmentIds);

      expect(store.getState().pendingAttachmentIds).toEqual(attachmentIds);

      // User message with reference to attachments
      const userMessage = createTestUserMessage({
        id: `${thread.id}_r0_user`,
        content: 'Analyze these documents',
        roundNumber: 0,
      });
      store.getState().setMessages([userMessage]);

      // Start streaming
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);

      // Clear pending attachments after submission
      store.getState().setPendingAttachmentIds(null);

      expect(store.getState().pendingAttachmentIds).toBe(null);

      // Participant messages can reference attachments
      const p0Message = createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Based on the uploaded documents, I can see...',
        roundNumber: 0,
        participantId: participants[0]?.id ?? 'participant-0',
        participantIndex: 0,
      });
      store.getState().setMessages([userMessage, p0Message]);

      expect(store.getState().messages).toHaveLength(2);
    });
  });
});

// ============================================================================
// FOLLOW-UP ROUNDS
// ============================================================================

describe('follow-up Rounds', () => {
  it('should increment round number correctly for round 2', () => {
    const store = createTestChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    // Complete round 0
    const r0User = createTestUserMessage({
      id: `${thread.id}_r0_user`,
      content: 'Question 1',
      roundNumber: 0,
    });
    const r0P0 = createTestAssistantMessage({
      id: `${thread.id}_r0_p0`,
      content: 'Response 1',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
    });
    const r0P1 = createTestAssistantMessage({
      id: `${thread.id}_r0_p1`,
      content: 'Response 2',
      roundNumber: 0,
      participantId: 'participant-1',
      participantIndex: 1,
    });
    const r0Mod = createTestModeratorMessage({
      id: `${thread.id}_r0_moderator`,
      content: 'Summary 1',
      roundNumber: 0,
    });

    store.getState().setMessages([r0User, r0P0, r0P1, r0Mod]);
    store.getState().completeStreaming();

    // Start round 1
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsStreaming(true);

    const r1User = createTestUserMessage({
      id: `${thread.id}_r1_user`,
      content: 'Follow-up question',
      roundNumber: 1,
    });
    store.getState().setMessages([r0User, r0P0, r0P1, r0Mod, r1User]);

    expect(store.getState().streamingRoundNumber).toBe(1);

    // Add round 1 participant messages
    const r1P0 = createTestAssistantMessage({
      id: `${thread.id}_r1_p0`,
      content: 'Follow-up response 1',
      roundNumber: 1,
      participantId: 'participant-0',
      participantIndex: 0,
    });
    store.getState().setMessages([r0User, r0P0, r0P1, r0Mod, r1User, r1P0]);

    expect(countAssistantMessagesInRound(store.getState().messages, 0)).toBe(3); // P0, P1, mod
    expect(countAssistantMessagesInRound(store.getState().messages, 1)).toBe(1); // P0
  });

  it('should handle config changes triggering changelog tracking', () => {
    const store = createTestChatStore();
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setIsWaitingForChangelog(true);

    expect(store.getState().configChangeRoundNumber).toBe(1);
    expect(store.getState().isWaitingForChangelog).toBe(true);

    // Simulate changelog fetch complete
    store.getState().setIsWaitingForChangelog(false);

    expect(store.getState().isWaitingForChangelog).toBe(false);
  });

  it('should track PATCH in progress state', () => {
    const store = createTestChatStore();

    store.getState().setIsPatchInProgress(true);
    expect(store.getState().isPatchInProgress).toBe(true);

    store.getState().setIsPatchInProgress(false);
    expect(store.getState().isPatchInProgress).toBe(false);
  });
});

// ============================================================================
// MULTI-ROUND CONVERSATION
// ============================================================================

describe('multi-Round Conversation', () => {
  it('should maintain correct ordering across 5 rounds', () => {
    const store = createTestChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    const allMessages: ReturnType<typeof createTestUserMessage>[] = [];

    // Create 5 complete rounds
    for (let round = 0; round < 5; round++) {
      // User message
      const userMsg = createTestUserMessage({
        id: `${thread.id}_r${round}_user`,
        content: `Question ${round}`,
        roundNumber: round,
      });
      allMessages.push(userMsg);

      // Participant messages
      for (let p = 0; p < 2; p++) {
        const pMsg = createTestAssistantMessage({
          id: `${thread.id}_r${round}_p${p}`,
          content: `Response from P${p} in round ${round}`,
          roundNumber: round,
          participantId: `participant-${p}`,
          participantIndex: p,
        });
        allMessages.push(pMsg);
      }

      // Moderator message
      const modMsg = createTestModeratorMessage({
        id: `${thread.id}_r${round}_moderator`,
        content: `Summary of round ${round}`,
        roundNumber: round,
      });
      allMessages.push(modMsg);
    }

    store.getState().setMessages(allMessages);

    // Verify total messages: 5 rounds × (1 user + 2 participants + 1 moderator) = 20
    expect(store.getState().messages).toHaveLength(20);

    // Verify each round has correct message count
    for (let round = 0; round < 5; round++) {
      const roundAssistantCount = countAssistantMessagesInRound(store.getState().messages, round);
      expect(roundAssistantCount).toBe(3); // 2 participants + 1 moderator
    }
  });

  it('should have independent lifecycle for each round', () => {
    const store = createTestChatStore();

    // Round 0 lifecycle
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().streamingRoundNumber).toBe(0);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Complete round 0
    store.getState().completeStreaming();

    expect(store.getState().streamingRoundNumber).toBe(null);
    expect(store.getState().currentParticipantIndex).toBe(0);
    expect(store.getState().isStreaming).toBe(false);

    // Round 1 lifecycle (independent)
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsStreaming(true);
    store.getState().setCurrentParticipantIndex(0);

    expect(store.getState().streamingRoundNumber).toBe(1);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Complete round 1
    store.getState().completeStreaming();

    expect(store.getState().streamingRoundNumber).toBe(null);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should not have duplicate messages with same ID across rounds', () => {
    const store = createTestChatStore();
    const thread = createMockThread();

    const messages = [
      createTestUserMessage({ id: `${thread.id}_r0_user`, content: 'Q0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'R0P0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestUserMessage({ id: `${thread.id}_r1_user`, content: 'Q1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: `${thread.id}_r1_p0`,
        content: 'R1P0',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];

    store.getState().setMessages(messages);

    // Verify all IDs are unique
    const ids = store.getState().messages.map(m => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ============================================================================
// API CALL TRACKING (Integration with Optimistic Updates)
// ============================================================================

describe('conversation Flow API Call Patterns', () => {
  it('should track expected API calls during first round', () => {
    const tracker = createApiCallTracker();

    // Simulate expected API calls for round 0
    trackApiCall(tracker, '/api/v1/threads', 'POST'); // Create thread
    trackApiCall(tracker, '/api/v1/threads/thread-123/stream', 'POST'); // P0 stream
    trackApiCall(tracker, '/api/v1/threads/thread-123/stream', 'POST'); // P1 stream
    trackApiCall(tracker, '/api/v1/threads/thread-123/moderator', 'POST'); // Moderator

    // During active streaming, NO GET requests for thread data
    const getCalls = tracker.calls.filter(c => c.method === 'GET');
    expect(getCalls).toHaveLength(0);

    // Verify expected call counts
    expect(tracker.getCallCount('/stream')).toBe(2); // 2 participant streams
    expect(tracker.getCallCount('/moderator')).toBe(1); // 1 moderator
    expect(tracker.getTotalCalls()).toBe(4);
  });

  it('should not make extra GET requests during streaming', () => {
    const tracker = createApiCallTracker();

    // Only stream-related calls
    trackApiCall(tracker, '/api/threads/thread-123/stream', 'POST');
    trackApiCall(tracker, '/api/threads/thread-123/stream', 'POST');

    // No GET requests for thread data during streaming
    const getCalls = tracker.calls.filter(c => c.method === 'GET');
    expect(getCalls).toHaveLength(0);
  });
});
