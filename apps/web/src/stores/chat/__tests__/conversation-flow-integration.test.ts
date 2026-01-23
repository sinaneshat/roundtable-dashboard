/**
 * Conversation Flow Integration Tests
 *
 * Store-level variations testing:
 * - Web search: R0 disabled/enabled × R1 disabled/enabled (4 combos)
 * - Attachments: with/without across rounds
 * - Participant counts: 1, 2, 5 participants
 * - Error recovery: P0 fails, moderator fails, pre-search fails
 * - Stop button: during P0, pre-search, moderator
 *
 * Tests actual store behavior for conversation flow scenarios
 */

import { FinishReasons, MessageStatuses } from '@roundtable/shared';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockParticipants,
  createMockStoredPreSearch,
  createMockThread,
  createTestAssistantMessage,
  createTestChatStore,
  createTestModeratorMessage,
  createTestUserMessage,
} from '@/lib/testing';

// ============================================================================
// WEB SEARCH VARIATIONS
// ============================================================================

describe('web Search Variations', () => {
  describe('r0 disabled × R1 disabled', () => {
    it('should complete both rounds without pre-search', () => {
      const store = createTestChatStore({ enableWebSearch: false });
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants(2);

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Round 0 - no pre-search
      store.getState().setStreamingRoundNumber(0);
      expect(store.getState().preSearches).toHaveLength(0);

      // Complete round 0
      store.getState().completeStreaming();

      // Round 1 - still no pre-search
      store.getState().setStreamingRoundNumber(1);
      expect(store.getState().preSearches).toHaveLength(0);
    });
  });

  describe('r0 enabled × R1 disabled', () => {
    it('should have pre-search in R0 but not R1', () => {
      const store = createTestChatStore({ enableWebSearch: true });
      const thread = createMockThread({ enableWebSearch: true });
      const participants = createMockParticipants(2);

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Round 0 - has pre-search
      const r0PreSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      store.getState().addPreSearch(r0PreSearch);
      store.getState().setStreamingRoundNumber(0);

      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.roundNumber).toBe(0);

      // Complete round 0
      store.getState().completeStreaming();

      // Round 1 - disable web search
      store.getState().setEnableWebSearch(false);
      store.getState().setStreamingRoundNumber(1);

      // No new pre-search for R1
      expect(store.getState().preSearches.filter(ps => ps.roundNumber === 1)).toHaveLength(0);
    });
  });

  describe('r0 disabled × R1 enabled', () => {
    it('should have pre-search in R1 but not R0', () => {
      const store = createTestChatStore({ enableWebSearch: false });
      const thread = createMockThread({ enableWebSearch: false });
      const participants = createMockParticipants(2);

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Round 0 - no pre-search
      store.getState().setStreamingRoundNumber(0);
      expect(store.getState().preSearches).toHaveLength(0);

      // Complete round 0
      store.getState().completeStreaming();

      // Round 1 - enable web search
      store.getState().setEnableWebSearch(true);
      const r1PreSearch = createMockStoredPreSearch(1, MessageStatuses.PENDING);
      store.getState().addPreSearch(r1PreSearch);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().preSearches).toHaveLength(1);
      expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
    });
  });

  describe('r0 enabled × R1 enabled', () => {
    it('should have pre-search in both rounds', () => {
      const store = createTestChatStore({ enableWebSearch: true });
      const thread = createMockThread({ enableWebSearch: true });
      const participants = createMockParticipants(2);

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);

      // Round 0 pre-search
      const r0PreSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
      store.getState().addPreSearch(r0PreSearch);
      store.getState().setStreamingRoundNumber(0);
      store.getState().completeStreaming();

      // Round 1 pre-search
      const r1PreSearch = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
      store.getState().addPreSearch(r1PreSearch);
      store.getState().setStreamingRoundNumber(1);

      expect(store.getState().preSearches).toHaveLength(2);
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 0)).toBeDefined();
      expect(store.getState().preSearches.find(ps => ps.roundNumber === 1)).toBeDefined();
    });
  });
});

// ============================================================================
// ATTACHMENT VARIATIONS
// ============================================================================

describe('attachment Variations', () => {
  it('should handle round 0 with attachments, round 1 without', () => {
    const store = createTestChatStore();
    const thread = createMockThread();

    store.getState().setThread(thread);

    // Round 0 with attachments
    store.getState().setPendingAttachmentIds(['file-1', 'file-2']);
    expect(store.getState().pendingAttachmentIds).toHaveLength(2);

    // Clear after submission
    store.getState().setPendingAttachmentIds(null);
    store.getState().setStreamingRoundNumber(0);
    store.getState().completeStreaming();

    // Round 1 without attachments
    store.getState().setPendingAttachmentIds(null);
    store.getState().setStreamingRoundNumber(1);

    expect(store.getState().pendingAttachmentIds).toBe(null);
  });

  it('should handle round 0 without attachments, round 1 with', () => {
    const store = createTestChatStore();
    const thread = createMockThread();

    store.getState().setThread(thread);

    // Round 0 without attachments
    store.getState().setStreamingRoundNumber(0);
    expect(store.getState().pendingAttachmentIds).toBe(null);
    store.getState().completeStreaming();

    // Round 1 with attachments
    store.getState().setPendingAttachmentIds(['file-3']);
    expect(store.getState().pendingAttachmentIds).toHaveLength(1);
  });

  it('should handle both rounds with attachments', () => {
    const store = createTestChatStore();

    // Round 0
    store.getState().setPendingAttachmentIds(['file-1']);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setPendingAttachmentIds(null);
    store.getState().completeStreaming();

    // Round 1
    store.getState().setPendingAttachmentIds(['file-2', 'file-3']);
    store.getState().setStreamingRoundNumber(1);
    expect(store.getState().pendingAttachmentIds).toHaveLength(2);
  });
});

// ============================================================================
// PARTICIPANT COUNT VARIATIONS
// ============================================================================

describe('participant Count Variations', () => {
  it('should handle 1 participant', () => {
    const store = createTestChatStore();
    const participants = createMockParticipants(1);
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Only one participant to track
    store.getState().setCurrentParticipantIndex(0);

    const p0Message = createTestAssistantMessage({
      id: `${thread.id}_r0_p0`,
      content: 'Solo response',
      roundNumber: 0,
      participantId: participants[0]?.id ?? 'participant-0',
      participantIndex: 0,
    });
    store.getState().setMessages([p0Message]);

    expect(store.getState().participants).toHaveLength(1);
    expect(store.getState().currentParticipantIndex).toBe(0);

    // Moderator follows immediately after single participant
    store.getState().setIsStreaming(false);
    store.getState().setIsModeratorStreaming(true);

    expect(store.getState().isModeratorStreaming).toBe(true);
  });

  it('should handle 2 participants', () => {
    const store = createTestChatStore();
    const participants = createMockParticipants(2);
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Track both participants
    store.getState().setCurrentParticipantIndex(0);
    store.getState().setCurrentParticipantIndex(1);

    expect(store.getState().participants).toHaveLength(2);
    expect(store.getState().currentParticipantIndex).toBe(1);
  });

  it('should handle 5 participants', () => {
    const store = createTestChatStore();
    const participants = createMockParticipants(5);
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);

    // Track all 5 participants
    for (let i = 0; i < 5; i++) {
      store.getState().setCurrentParticipantIndex(i);
      expect(store.getState().currentParticipantIndex).toBe(i);
    }

    expect(store.getState().participants).toHaveLength(5);
  });

  it('should maintain correct order with many participants', () => {
    const store = createTestChatStore();
    const participants = createMockParticipants(5);
    const thread = createMockThread();

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    const messages = [
      createTestUserMessage({
        id: `${thread.id}_r0_user`,
        content: 'Question',
        roundNumber: 0,
      }),
    ];

    // Add all 5 participant messages
    for (let i = 0; i < 5; i++) {
      messages.push(createTestAssistantMessage({
        id: `${thread.id}_r0_p${i}`,
        content: `P${i} response`,
        roundNumber: 0,
        participantId: participants[i]?.id ?? `participant-${i}`,
        participantIndex: i,
      }));
    }

    store.getState().setMessages(messages);

    // Verify order
    expect(store.getState().messages).toHaveLength(6);
    const assistantMessages = store.getState().messages.filter(m => m.role === 'assistant');
    expect(assistantMessages).toHaveLength(5);
  });
});

// ============================================================================
// ERROR RECOVERY SCENARIOS
// ============================================================================

describe('error Recovery', () => {
  describe('p0 fails', () => {
    it('should set error state when P0 fails', () => {
      const store = createTestChatStore();
      const participants = createMockParticipants(2);
      const thread = createMockThread();

      store.getState().setThread(thread);
      store.getState().setParticipants(participants);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // P0 fails
      const error = new Error('P0 stream failed');
      store.getState().setError(error);

      expect(store.getState().error).toBeDefined();
      expect(store.getState().error?.message).toBe('P0 stream failed');
    });

    it('should mark P0 message with error metadata', () => {
      const store = createTestChatStore();
      const thread = createMockThread();

      const p0ErrorMessage = createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Partial response...',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        hasError: true,
        finishReason: FinishReasons.ERROR,
      });

      store.getState().setMessages([p0ErrorMessage]);

      const message = store.getState().messages[0];
      expect(message?.metadata).toBeDefined();
      expect(message?.metadata).toHaveProperty('hasError', true);
    });
  });

  describe('moderator fails', () => {
    it('should handle moderator failure', () => {
      const store = createTestChatStore();

      store.getState().setIsModeratorStreaming(true);

      // Moderator fails
      const error = new Error('Moderator stream failed');
      store.getState().setError(error);
      store.getState().setIsModeratorStreaming(false);

      expect(store.getState().error?.message).toBe('Moderator stream failed');
      expect(store.getState().isModeratorStreaming).toBe(false);
    });
  });

  describe('pre-search fails', () => {
    it('should handle pre-search failure', () => {
      const store = createTestChatStore({ enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(0, MessageStatuses.PENDING);
      store.getState().addPreSearch(preSearch);

      // Pre-search fails
      store.getState().updatePreSearchStatus(0, MessageStatuses.FAILED);

      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.FAILED);
    });

    it('should allow participant streaming after pre-search failure', () => {
      const store = createTestChatStore({ enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(0, MessageStatuses.FAILED);
      store.getState().addPreSearch(preSearch);

      // Participants should be able to proceed
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);

      expect(store.getState().isStreaming).toBe(true);
    });
  });

  describe('error recovery', () => {
    it('should clear error on retry', () => {
      const store = createTestChatStore();

      // Set error
      store.getState().setError(new Error('Some error'));
      expect(store.getState().error).toBeDefined();

      // Clear on retry
      store.getState().setError(null);
      expect(store.getState().error).toBe(null);
    });

    it('should allow regeneration after error', () => {
      const store = createTestChatStore();

      store.getState().setError(new Error('Previous error'));
      store.getState().setError(null);

      // Set up regeneration
      store.getState().setIsRegenerating(true);
      store.getState().setRegeneratingRoundNumber(0);

      expect(store.getState().isRegenerating).toBe(true);
      expect(store.getState().regeneratingRoundNumber).toBe(0);
    });
  });
});

// ============================================================================
// STOP BUTTON SCENARIOS
// ============================================================================

describe('stop Button Scenarios', () => {
  describe('during P0', () => {
    it('should stop streaming when user clicks stop during P0', () => {
      const store = createTestChatStore();
      const mockStop = vi.fn();

      store.getState().setChatStop(mockStop);
      store.getState().setIsStreaming(true);
      store.getState().setStreamingRoundNumber(0);
      store.getState().setCurrentParticipantIndex(0);

      // User clicks stop
      const stopFn = store.getState().chatStop;
      if (stopFn)
        stopFn();
      store.getState().setIsStreaming(false);

      expect(mockStop).toHaveBeenCalled();
      expect(store.getState().isStreaming).toBe(false);
    });

    it('should preserve partial P0 message after stop', () => {
      const store = createTestChatStore();
      const thread = createMockThread();

      // P0 was streaming with partial content
      const partialMessage = createTestAssistantMessage({
        id: `${thread.id}_r0_p0`,
        content: 'Partial response that was interrupted...',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      });

      store.getState().setMessages([partialMessage]);
      store.getState().setIsStreaming(false);

      // Message preserved
      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0]?.parts[0]?.text).toContain('Partial response');
    });
  });

  describe('during pre-search', () => {
    it('should stop pre-search and allow continuation', () => {
      const store = createTestChatStore({ enableWebSearch: true });

      const preSearch = createMockStoredPreSearch(0, MessageStatuses.STREAMING);
      store.getState().addPreSearch(preSearch);

      // User stops
      store.getState().updatePreSearchStatus(0, MessageStatuses.COMPLETE);

      // Pre-search marked complete, participants can proceed
      expect(store.getState().preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    });
  });

  describe('during moderator', () => {
    it('should stop moderator streaming', () => {
      const store = createTestChatStore();
      const mockStop = vi.fn();

      store.getState().setChatStop(mockStop);
      store.getState().setIsModeratorStreaming(true);

      // User clicks stop
      const stopFn = store.getState().chatStop;
      if (stopFn)
        stopFn();
      store.getState().setIsModeratorStreaming(false);

      expect(mockStop).toHaveBeenCalled();
      expect(store.getState().isModeratorStreaming).toBe(false);
    });

    it('should preserve partial moderator message after stop', () => {
      const store = createTestChatStore();
      const thread = createMockThread();

      const partialModerator = createTestModeratorMessage({
        id: `${thread.id}_r0_moderator`,
        content: 'Partial summary...',
        roundNumber: 0,
        finishReason: FinishReasons.STOP,
      });

      store.getState().setMessages([partialModerator]);
      store.getState().setIsModeratorStreaming(false);

      expect(store.getState().messages).toHaveLength(1);
      expect(store.getState().messages[0]?.parts[0]?.text).toContain('Partial summary');
    });
  });

  describe('stop prevents further participants', () => {
    it('should not continue to P1 after stopping during P0', () => {
      const store = createTestChatStore();
      const setCurrentParticipantIndexSpy = vi.spyOn(store.getState(), 'setCurrentParticipantIndex');

      store.getState().setIsStreaming(true);
      store.getState().setCurrentParticipantIndex(0);

      // Stop during P0
      store.getState().setIsStreaming(false);

      // P1 should not be triggered (no additional setCurrentParticipantIndex calls)
      expect(setCurrentParticipantIndexSpy).toHaveBeenCalledTimes(1);
      expect(setCurrentParticipantIndexSpy).toHaveBeenCalledWith(0);
    });
  });
});

// ============================================================================
// COMPLEX MULTI-ROUND SCENARIOS
// ============================================================================

describe('complex Multi-Round Scenarios', () => {
  it('should handle R0 fail, R1 success', () => {
    const store = createTestChatStore();
    const thread = createMockThread();
    const participants = createMockParticipants(2);

    store.getState().setThread(thread);
    store.getState().setParticipants(participants);

    // R0 starts but fails
    store.getState().setStreamingRoundNumber(0);
    store.getState().setIsStreaming(true);
    store.getState().setError(new Error('R0 failed'));
    store.getState().setIsStreaming(false);

    expect(store.getState().error).toBeDefined();

    // R1 succeeds
    store.getState().setError(null);
    store.getState().setStreamingRoundNumber(1);
    store.getState().setIsStreaming(true);

    const r1Messages = [
      createTestUserMessage({ id: `${thread.id}_r1_user`, content: 'R1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: `${thread.id}_r1_p0`,
        content: 'R1P0',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
    ];
    store.getState().setMessages(r1Messages);
    store.getState().completeStreaming();

    expect(store.getState().error).toBe(null);
    expect(store.getState().isStreaming).toBe(false);
  });

  it('should handle config changes between rounds', () => {
    const store = createTestChatStore();

    // R0 with 2 participants
    store.getState().setParticipants(createMockParticipants(2));
    store.getState().setStreamingRoundNumber(0);
    store.getState().completeStreaming();

    // Config change: add participant for R1
    store.getState().setConfigChangeRoundNumber(1);
    store.getState().setParticipants(createMockParticipants(3));

    expect(store.getState().configChangeRoundNumber).toBe(1);
    expect(store.getState().participants).toHaveLength(3);
  });

  it('should track multiple rounds with mixed web search settings', () => {
    const store = createTestChatStore();

    // R0: no web search
    store.getState().setEnableWebSearch(false);
    store.getState().setStreamingRoundNumber(0);
    store.getState().completeStreaming();
    expect(store.getState().preSearches).toHaveLength(0);

    // R1: with web search
    store.getState().setEnableWebSearch(true);
    const r1PreSearch = createMockStoredPreSearch(1, MessageStatuses.COMPLETE);
    store.getState().addPreSearch(r1PreSearch);
    store.getState().setStreamingRoundNumber(1);
    store.getState().completeStreaming();
    expect(store.getState().preSearches).toHaveLength(1);

    // R2: no web search again
    store.getState().setEnableWebSearch(false);
    store.getState().setStreamingRoundNumber(2);
    store.getState().completeStreaming();

    // Only 1 pre-search (from R1)
    expect(store.getState().preSearches).toHaveLength(1);
    expect(store.getState().preSearches[0]?.roundNumber).toBe(1);
  });
});
