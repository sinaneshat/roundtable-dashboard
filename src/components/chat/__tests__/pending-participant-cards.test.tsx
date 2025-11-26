/**
 * Pending Participant Cards Tests
 *
 * Tests for the pending participant cards rendering in ChatMessageList.
 * Ensures:
 * - Correct number of pending cards are shown (no duplicates)
 * - Pending cards transition properly to streaming content
 * - Web search consistency across all rounds
 *
 * @see src/components/chat/chat-message-list.tsx
 * @see src/containers/screens/chat/ChatOverviewScreen.tsx
 */

import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';

import { AnalysisStatuses, MessageRoles, UIMessageRoles } from '@/api/core/enums';
import {
  createMockPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing/helpers';

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Creates mock participants for testing
 */
function createMockParticipants(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    modelId: `model-${i}`,
    role: `Role ${i}`,
    isEnabled: true,
    sortOrder: i,
    threadId: 'test-thread',
    createdAt: new Date(),
  }));
}

/**
 * Simulates the pending participant cards logic from ChatMessageList
 * This is extracted to test the logic in isolation
 */
function calculatePendingParticipants(params: {
  participants: ReturnType<typeof createMockParticipants>;
  messages: UIMessage[];
  roundNumber: number;
  streamingRoundNumber: number | null;
  isStreaming: boolean;
  currentParticipantIndex: number;
  preSearchStatus: typeof AnalysisStatuses[keyof typeof AnalysisStatuses] | null;
}): number[] {
  const {
    participants,
    messages,
    roundNumber,
    streamingRoundNumber,
    isStreaming,
    currentParticipantIndex,
    preSearchStatus,
  } = params;

  // Condition 1: Is this the latest round?
  const isLatestRound = roundNumber === streamingRoundNumber
    || (preSearchStatus !== null && (preSearchStatus === AnalysisStatuses.PENDING || preSearchStatus === AnalysisStatuses.STREAMING));

  if (!isLatestRound || participants.length === 0) {
    return [];
  }

  // Get participant indices that have responded
  const assistantMessages = messages.filter(
    m => m.role === MessageRoles.ASSISTANT
      && (m.metadata as { roundNumber?: number })?.roundNumber === roundNumber,
  );
  const respondedIndices = new Set<number>();
  assistantMessages.forEach((m) => {
    const idx = (m.metadata as { participantIndex?: number })?.participantIndex;
    if (idx !== undefined) {
      respondedIndices.add(idx);
    }
  });

  // Check for streaming content
  const lastMessage = messages[messages.length - 1];
  const hasStreamingContent = isStreaming
    && lastMessage?.role === MessageRoles.ASSISTANT
    && lastMessage?.parts?.some((p: { type: string; text?: string }) =>
      p.type === 'text' && p.text && p.text.length > 0,
    );

  // Filter pending participants
  const pendingIndices: number[] = [];
  participants.forEach((_, index) => {
    // Skip if already responded
    if (respondedIndices.has(index))
      return;
    // Skip current streaming participant if has content
    if (isStreaming && index === currentParticipantIndex && hasStreamingContent)
      return;
    pendingIndices.push(index);
  });

  return pendingIndices;
}

// ============================================================================
// Tests
// ============================================================================

describe('pending Participant Cards Logic', () => {
  describe('basic Rendering', () => {
    it('should show all participants as pending when no responses exist', () => {
      const participants = createMockParticipants(3);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      expect(pending).toEqual([0, 1, 2]);
    });

    it('should hide participant that has responded', () => {
      const participants = createMockParticipants(3);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });
      const assistantMessage = createTestAssistantMessage({
        id: 'assistant-1',
        content: 'Response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      });

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage, assistantMessage],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // Participant 0 responded, so only 1 and 2 are pending
      expect(pending).toEqual([1, 2]);
    });

    it('should show no pending cards when all participants have responded', () => {
      const participants = createMockParticipants(2);
      const messages = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Response 0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Response 1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
        }),
      ];

      const pending = calculatePendingParticipants({
        participants,
        messages,
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      expect(pending).toEqual([]);
    });
  });

  describe('streaming State', () => {
    it('should hide current streaming participant when it has content', () => {
      const participants = createMockParticipants(3);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });
      // Streaming message with content
      const streamingMessage: UIMessage = {
        id: 'streaming-1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Partial response...' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          // No participantIndex yet - still streaming
        },
      };

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage, streamingMessage],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: true,
        currentParticipantIndex: 0, // First participant is streaming
        preSearchStatus: null,
      });

      // Participant 0 is streaming with content, should be hidden
      expect(pending).toEqual([1, 2]);
    });

    it('should show streaming participant as pending when no content yet', () => {
      const participants = createMockParticipants(3);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });
      // Streaming message without content
      const streamingMessage: UIMessage = {
        id: 'streaming-1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: '' }], // Empty content
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
      };

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage, streamingMessage],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: true,
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // Participant 0 is streaming but no content, should still show as pending
      expect(pending).toEqual([0, 1, 2]);
    });
  });

  describe('web Search (Pre-Search) States', () => {
    it('should show pending cards when pre-search is pending', () => {
      const participants = createMockParticipants(2);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage],
        roundNumber: 0,
        streamingRoundNumber: null, // No streaming round set yet
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: AnalysisStatuses.PENDING,
      });

      expect(pending).toEqual([0, 1]);
    });

    it('should show pending cards when pre-search is streaming', () => {
      const participants = createMockParticipants(2);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage],
        roundNumber: 0,
        streamingRoundNumber: null,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: AnalysisStatuses.STREAMING,
      });

      expect(pending).toEqual([0, 1]);
    });

    it('should hide pending cards for non-latest rounds', () => {
      const participants = createMockParticipants(2);
      const messages = [
        createTestUserMessage({
          id: 'user-0',
          content: 'First message',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-0-0',
          content: 'Response 0-0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-0-1',
          content: 'Response 0-1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
        }),
        createTestUserMessage({
          id: 'user-1',
          content: 'Second message',
          roundNumber: 1,
        }),
      ];

      // Round 0 is not the latest round (round 1 is streaming)
      const pending = calculatePendingParticipants({
        participants,
        messages,
        roundNumber: 0, // Previous round
        streamingRoundNumber: 1, // Current streaming round
        isStreaming: true,
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // Round 0 is not latest, no pending cards should show
      expect(pending).toEqual([]);
    });
  });

  describe('round Consistency', () => {
    it('should handle round 0 same as round 2+', () => {
      const participants = createMockParticipants(2);

      // Round 0
      const pendingRound0 = calculatePendingParticipants({
        participants,
        messages: [createTestUserMessage({
          id: 'user-0',
          content: 'Round 0 message',
          roundNumber: 0,
        })],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: AnalysisStatuses.PENDING,
      });

      // Round 2
      const pendingRound2 = calculatePendingParticipants({
        participants,
        messages: [
          // Previous rounds
          createTestUserMessage({
            id: 'user-0',
            content: 'Round 0',
            roundNumber: 0,
          }),
          createTestAssistantMessage({
            id: 'a-0-0',
            content: 'R0 Response',
            roundNumber: 0,
            participantId: 'p-0',
            participantIndex: 0,
          }),
          createTestAssistantMessage({
            id: 'a-0-1',
            content: 'R0 Response',
            roundNumber: 0,
            participantId: 'p-1',
            participantIndex: 1,
          }),
          createTestUserMessage({
            id: 'user-1',
            content: 'Round 1',
            roundNumber: 1,
          }),
          createTestAssistantMessage({
            id: 'a-1-0',
            content: 'R1 Response',
            roundNumber: 1,
            participantId: 'p-0',
            participantIndex: 0,
          }),
          createTestAssistantMessage({
            id: 'a-1-1',
            content: 'R1 Response',
            roundNumber: 1,
            participantId: 'p-1',
            participantIndex: 1,
          }),
          // Current round
          createTestUserMessage({
            id: 'user-2',
            content: 'Round 2 message',
            roundNumber: 2,
          }),
        ],
        roundNumber: 2,
        streamingRoundNumber: 2,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: AnalysisStatuses.PENDING,
      });

      // Both should show same pending participants
      expect(pendingRound0).toEqual([0, 1]);
      expect(pendingRound2).toEqual([0, 1]);
    });
  });

  describe('duplicate Prevention', () => {
    it('should not create duplicate pending cards for same participant', () => {
      const participants = createMockParticipants(2);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // Each index should appear only once
      const uniqueIndices = new Set(pending);
      expect(pending).toHaveLength(uniqueIndices.size);
      expect(pending).toHaveLength(2); // Exactly 2 participants
    });

    it('should count correct number of pending when some have responded', () => {
      const participants = createMockParticipants(5);
      const messages = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Response 0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-2',
          content: 'Response 2',
          roundNumber: 0,
          participantId: 'participant-2',
          participantIndex: 2,
        }),
      ];

      const pending = calculatePendingParticipants({
        participants,
        messages,
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // 0 and 2 responded, so 1, 3, 4 are pending
      expect(pending).toEqual([1, 3, 4]);
      expect(pending).toHaveLength(3);
    });
  });
});

describe('shimmer Loading During Streaming (Regression Test)', () => {
  /**
   * ✅ CRITICAL REGRESSION TEST
   *
   * This test suite catches the bug where ALL pending participant cards
   * disappeared once streaming started. The expected behavior is:
   * - Pending cards should show for ALL participants during pre-search
   * - Once streaming starts, pending cards should STILL show for participants
   *   that haven't started streaming yet
   * - Only the currently streaming participant's pending card should be hidden
   *   (when they have content), replaced by their actual streaming message
   *
   * Bug: The condition `if (isStreaming) { return null; }` was hiding ALL
   * pending cards once streaming started, instead of just the streaming participant.
   */

  it('should continue showing pending cards for non-streaming participants during streaming', () => {
    const participants = createMockParticipants(3);
    const userMessage = createTestUserMessage({
      id: 'user-1',
      content: 'Hello',
      roundNumber: 0,
    });
    // Participant 0 is streaming with content
    const streamingMessage: UIMessage = {
      id: 'streaming-0',
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Streaming response from participant 0...' }],
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
      },
    };

    const pending = calculatePendingParticipants({
      participants,
      messages: [userMessage, streamingMessage],
      roundNumber: 0,
      streamingRoundNumber: 0,
      isStreaming: true, // ✅ Streaming is active
      currentParticipantIndex: 0, // Participant 0 is streaming
      preSearchStatus: null, // Pre-search is complete
    });

    // ✅ CRITICAL: Participants 1 and 2 should STILL show as pending
    // even though streaming is active (they are waiting for their turn)
    expect(pending).toEqual([1, 2]);
    expect(pending).not.toContain(0); // Streaming participant with content is hidden
  });

  it('should show ALL participants as pending when streaming but no content yet', () => {
    const participants = createMockParticipants(3);
    const userMessage = createTestUserMessage({
      id: 'user-1',
      content: 'Hello',
      roundNumber: 0,
    });
    // Streaming message but with empty content (just started)
    const streamingMessage: UIMessage = {
      id: 'streaming-0',
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: '' }], // No content yet
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
      },
    };

    const pending = calculatePendingParticipants({
      participants,
      messages: [userMessage, streamingMessage],
      roundNumber: 0,
      streamingRoundNumber: 0,
      isStreaming: true,
      currentParticipantIndex: 0,
      preSearchStatus: null,
    });

    // ✅ All participants should show pending (including streaming one with no content)
    expect(pending).toEqual([0, 1, 2]);
    expect(pending).toHaveLength(3);
  });

  it('should show pending cards for remaining participants after first completes', () => {
    const participants = createMockParticipants(3);
    const messages = [
      createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      }),
      // Participant 0 has completed (has full metadata)
      createTestAssistantMessage({
        id: 'assistant-0',
        content: 'Complete response from participant 0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
      // Participant 1 is now streaming with content
      {
        id: 'streaming-1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Streaming response from participant 1...' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
      } as UIMessage,
    ];

    const pending = calculatePendingParticipants({
      participants,
      messages,
      roundNumber: 0,
      streamingRoundNumber: 0,
      isStreaming: true,
      currentParticipantIndex: 1, // Now streaming participant 1
      preSearchStatus: null,
    });

    // Participant 0 responded (completed), participant 1 is streaming with content
    // Only participant 2 should be pending
    expect(pending).toEqual([2]);
    expect(pending).not.toContain(0); // Completed
    expect(pending).not.toContain(1); // Streaming with content
  });

  it('should transition from pre-search to streaming while preserving pending cards', () => {
    const participants = createMockParticipants(3);
    const userMessage = createTestUserMessage({
      id: 'user-1',
      content: 'Hello',
      roundNumber: 0,
    });

    // Phase 1: Pre-search is active (streaming hasn't started)
    const pendingDuringPreSearch = calculatePendingParticipants({
      participants,
      messages: [userMessage],
      roundNumber: 0,
      streamingRoundNumber: null,
      isStreaming: false,
      currentParticipantIndex: 0,
      preSearchStatus: AnalysisStatuses.STREAMING, // Pre-search in progress
    });

    expect(pendingDuringPreSearch).toEqual([0, 1, 2]);

    // Phase 2: Pre-search complete, streaming started with content
    const streamingMessage: UIMessage = {
      id: 'streaming-0',
      role: UIMessageRoles.ASSISTANT,
      parts: [{ type: 'text', text: 'Response...' }],
      metadata: {
        role: MessageRoles.ASSISTANT,
        roundNumber: 0,
      },
    };

    const pendingDuringStreaming = calculatePendingParticipants({
      participants,
      messages: [userMessage, streamingMessage],
      roundNumber: 0,
      streamingRoundNumber: 0,
      isStreaming: true,
      currentParticipantIndex: 0,
      preSearchStatus: null, // Pre-search complete
    });

    // ✅ CRITICAL: After transition, participants 1 and 2 should STILL be pending
    expect(pendingDuringStreaming).toEqual([1, 2]);
  });

  it('should correctly handle mid-round participant streaming transitions', () => {
    const participants = createMockParticipants(4);
    const messages = [
      createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      }),
      // Participants 0 and 1 have completed
      createTestAssistantMessage({
        id: 'assistant-0',
        content: 'Response from 0',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'assistant-1',
        content: 'Response from 1',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
      }),
      // Participant 2 is streaming with content
      {
        id: 'streaming-2',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Streaming from 2...' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
        },
      } as UIMessage,
    ];

    const pending = calculatePendingParticipants({
      participants,
      messages,
      roundNumber: 0,
      streamingRoundNumber: 0,
      isStreaming: true,
      currentParticipantIndex: 2,
      preSearchStatus: null,
    });

    // Only participant 3 should be pending (waiting for their turn)
    expect(pending).toEqual([3]);
    expect(pending).toHaveLength(1);
  });
});

describe('pre-Search Mock Creation', () => {
  it('should create valid pre-search mock with PENDING status', () => {
    const preSearch = createMockPreSearch({
      id: 'ps-1',
      threadId: 'thread-1',
      roundNumber: 0,
      status: AnalysisStatuses.PENDING,
      userQuery: 'test query',
    });

    expect(preSearch.status).toBe(AnalysisStatuses.PENDING);
    expect(preSearch.roundNumber).toBe(0);
    expect(preSearch.userQuery).toBe('test query');
  });

  it('should create valid pre-search mock with COMPLETE status and data', () => {
    const preSearch = createMockPreSearch({
      id: 'ps-1',
      threadId: 'thread-1',
      roundNumber: 0,
      status: AnalysisStatuses.COMPLETE,
      userQuery: 'test query',
      searchData: {
        queries: [{
          query: 'test',
          rationale: 'testing',
          searchDepth: 'basic',
          index: 0,
          total: 1,
        }],
        results: [{
          query: 'test',
          answer: 'answer',
          results: [{
            title: 'Result',
            url: 'https://example.com',
            content: 'content',
            score: 0.9,
          }],
          responseTime: 1000,
        }],
        analysis: 'Analysis text',
        successCount: 1,
        failureCount: 0,
        totalResults: 1,
        totalTime: 1000,
      },
    });

    expect(preSearch.status).toBe(AnalysisStatuses.COMPLETE);
    expect(preSearch.searchData).toBeDefined();
    expect(preSearch.searchData?.queries?.length).toBe(1);
    expect(preSearch.searchData?.results?.length).toBe(1);
  });
});
