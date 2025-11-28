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

import { AnalysisStatuses, MessagePartTypes, MessageRoles, UIMessageRoles } from '@/api/core/enums';
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
 * @param count - Number of participants to create
 * @param priorities - Optional array of priority values (defaults to 0, 1, 2, ...)
 */
function createMockParticipants(count: number, priorities?: number[]) {
  return Array.from({ length: count }, (_, i) => ({
    id: `participant-${i}`,
    modelId: `model-${i}`,
    role: `Role ${i}`,
    isEnabled: true,
    sortOrder: i,
    priority: priorities?.[i] ?? i,
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

  // ✅ CRITICAL FIX: Sort participants by priority FIRST, matching actual component behavior
  const sortedParticipants = [...participants].sort((a, b) => a.priority - b.priority);

  // Get assistant messages for this round
  const assistantMessages = messages.filter(
    m => m.role === MessageRoles.ASSISTANT
      && (m.metadata as { roundNumber?: number })?.roundNumber === roundNumber,
  );

  // Build a map of participant messages for quick lookup
  const participantMessages = new Map<string, UIMessage>();
  assistantMessages.forEach((m) => {
    const participantId = (m.metadata as { participantId?: string })?.participantId;
    if (participantId) {
      participantMessages.set(participantId, m);
    }
  });

  // ✅ CRITICAL FIX: Check if ALL participants have complete messages with visible content
  // If so, don't show pending cards - prevents duplicate rendering
  const allParticipantsHaveContent = sortedParticipants.every((p) => {
    const msg = participantMessages.get(p.id);
    if (!msg)
      return false;
    return msg.parts?.some((part: { type: string; text?: string }) =>
      (part.type === MessagePartTypes.TEXT && part.text && part.text.trim().length > 0)
      || part.type === MessagePartTypes.TOOL_CALL
      || part.type === MessagePartTypes.REASONING,
    ) ?? false;
  });

  // Condition: Is this the latest round?
  const preSearchActive = preSearchStatus !== null
    && (preSearchStatus === AnalysisStatuses.PENDING || preSearchStatus === AnalysisStatuses.STREAMING);
  const preSearchComplete = preSearchStatus === AnalysisStatuses.COMPLETE;
  const isLatestRound = roundNumber === streamingRoundNumber || preSearchActive || preSearchComplete;

  if (!isLatestRound || participants.length === 0) {
    return [];
  }

  // ✅ CRITICAL FIX: If all participants have content, return empty (no pending cards needed)
  const shouldShowPendingCards = !allParticipantsHaveContent && (preSearchActive || preSearchComplete || isStreaming);

  if (!shouldShowPendingCards) {
    return [];
  }

  // Get the current streaming participant by priority index
  const currentStreamingParticipant = sortedParticipants[currentParticipantIndex];

  // ✅ FIX: Check if the CURRENT STREAMING PARTICIPANT's message has content
  // First check the participantMessages map, but streaming messages often don't have
  // participantId yet, so also check the last message if it's an assistant message
  const currentStreamingMessage = currentStreamingParticipant
    ? participantMessages.get(currentStreamingParticipant.id)
    : null;

  // ✅ Also check the last message in the array - streaming messages don't have participantId
  // in metadata yet, but they ARE the last message when streaming is active
  // CRITICAL: Only treat it as the streaming message if it DOESN'T have a participantId
  // (completed messages have participantId, streaming messages don't)
  const lastMessage = messages[messages.length - 1];
  const lastMessageMetadata = lastMessage?.metadata as { participantId?: string } | undefined;
  const isLastMessageStreaming = !lastMessageMetadata?.participantId;
  const lastMessageHasContent = isStreaming
    && lastMessage?.role === MessageRoles.ASSISTANT
    && isLastMessageStreaming // ✅ Only count as streaming message if no participantId
    && lastMessage?.parts?.some(
      (p: { type: string; text?: string }) =>
        p.type === MessagePartTypes.TEXT && p.text && p.text.trim().length > 0,
    );

  const streamingParticipantHasContent = currentStreamingMessage?.parts?.some(
    (p: { type: string; text?: string }) =>
      p.type === MessagePartTypes.TEXT && p.text && p.text.trim().length > 0,
  ) || lastMessageHasContent;

  // ✅ FIX: Filter pending participants - check for VISIBLE content, not just having a message
  const pendingParticipants = sortedParticipants.filter((participant) => {
    const msg = participantMessages.get(participant.id);

    // ✅ Check if this participant has VISIBLE content (not just a message)
    const hasVisibleContent = msg?.parts?.some(
      (p: { type: string; text?: string }) =>
        (p.type === MessagePartTypes.TEXT && p.text && p.text.trim().length > 0)
        || p.type === MessagePartTypes.TOOL_CALL
        || p.type === MessagePartTypes.REASONING,
    ) ?? false;

    // Skip if has visible content (already rendered)
    if (hasVisibleContent)
      return false;

    // Skip current streaming participant if it has visible content
    if (isStreaming && currentStreamingParticipant && participant.id === currentStreamingParticipant.id && streamingParticipantHasContent)
      return false;

    return true;
  });

  // Return the ORIGINAL array indices of pending participants, sorted by priority
  return pendingParticipants.map(p => participants.findIndex(orig => orig.id === p.id));
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
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
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
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
        currentParticipantIndex: 1, // ✅ FIX: Now streaming participant 1
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
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
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
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
        currentParticipantIndex: 1, // ✅ FIX: Now streaming participant 1
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

// ============================================================================
// Priority Ordering Tests
// Tests for ensuring pending cards appear in selection order (by priority)
// ============================================================================

describe('priority Ordering', () => {
  describe('pending Cards Should Appear in Priority Order', () => {
    it('should sort pending participants by priority (ascending)', () => {
      // Create participants with non-sequential priorities
      // participant-0 has priority 2, participant-1 has priority 0, participant-2 has priority 1
      const participants = createMockParticipants(3, [2, 0, 1]);
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
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // Should be ordered by priority: [1, 2, 0] (priority 0, 1, 2)
      // participant-1 (priority 0), participant-2 (priority 1), participant-0 (priority 2)
      expect(pending).toEqual([1, 2, 0]);
    });

    it('should maintain priority order when some participants have responded', () => {
      // participant-0 has priority 2, participant-1 has priority 0, participant-2 has priority 1
      const participants = createMockParticipants(3, [2, 0, 1]);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });

      // participant-1 (priority 0) has responded
      const assistantMessage = createTestAssistantMessage({
        id: 'assistant-1',
        content: 'Response from participant 1',
        roundNumber: 0,
        participantId: 'participant-1',
        participantIndex: 1,
      });

      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage, assistantMessage],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
        currentParticipantIndex: 1, // ✅ FIX: Now streaming participant at index 1 in sorted order
        preSearchStatus: null,
      });

      // participant-1 responded, remaining should be [2, 0] (priority 1, 2)
      expect(pending).toEqual([2, 0]);
    });

    it('should handle reverse priority order (user selected last model first)', () => {
      // User selected in reverse order: last model has priority 0
      // participant-0 has priority 2, participant-1 has priority 1, participant-2 has priority 0
      const participants = createMockParticipants(3, [2, 1, 0]);
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
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // Should be ordered by priority: [2, 1, 0] (priority 0, 1, 2)
      expect(pending).toEqual([2, 1, 0]);
    });

    it('should handle equal priorities by maintaining stable order', () => {
      // All participants have the same priority
      const participants = createMockParticipants(3, [0, 0, 0]);
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
        isStreaming: true, // ✅ FIX: Must be streaming to show pending cards
        currentParticipantIndex: 0,
        preSearchStatus: null,
      });

      // With equal priorities, should maintain original order
      expect(pending).toEqual([0, 1, 2]);
    });

    it('should exclude streaming participant while maintaining priority order', () => {
      // participant-0 has priority 1, participant-1 has priority 0, participant-2 has priority 2
      const participants = createMockParticipants(3, [1, 0, 2]);
      const userMessage = createTestUserMessage({
        id: 'user-1',
        content: 'Hello',
        roundNumber: 0,
      });

      // participant-1 (priority 0) is currently streaming with content
      // Streaming messages do NOT have participantId yet (still in progress)
      const streamingMessage: UIMessage = {
        id: 'streaming-1',
        role: UIMessageRoles.ASSISTANT,
        parts: [{ type: 'text', text: 'Streaming response...' }],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          // No participantId - message is still streaming
        },
      };

      // After sorting by priority: [participant-1 (0), participant-0 (1), participant-2 (2)]
      // currentParticipantIndex 0 = participant-1 (priority 0, first to stream)
      const pending = calculatePendingParticipants({
        participants,
        messages: [userMessage, streamingMessage],
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: true,
        currentParticipantIndex: 0, // Index 0 in sorted array = participant-1
        preSearchStatus: null,
      });

      // participant-1 is streaming (excluded because has content), remaining are [0, 2]
      // These are original array indices of participant-0 (priority 1) and participant-2 (priority 2)
      expect(pending).toEqual([0, 2]);
    });
  });
});

// ============================================================================
// Duplicate Rendering Prevention Tests
// Tests for preventing duplicate message rendering when all participants complete
// ============================================================================

describe('duplicate Rendering Prevention', () => {
  describe('all Participants Have Content - No Pending Cards', () => {
    /**
     * ✅ CRITICAL REGRESSION TEST
     *
     * Bug: When preSearchComplete=true but isStreaming=false and all participants
     * have completed messages, both AssistantGroupCard AND pending cards were
     * being rendered, causing duplicate messages in the UI.
     *
     * Fix: If all participants have visible content, skip pending cards entirely
     * to let the normal AssistantGroupCard rendering handle it.
     */
    it('should NOT show pending cards when all participants have complete responses', () => {
      const participants = createMockParticipants(4);
      const messages = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Say hi',
          roundNumber: 0,
        }),
        // All 4 participants have completed responses
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'hi',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Hi.',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
        }),
        createTestAssistantMessage({
          id: 'assistant-2',
          content: 'Hi!',
          roundNumber: 0,
          participantId: 'participant-2',
          participantIndex: 2,
        }),
        createTestAssistantMessage({
          id: 'assistant-3',
          content: 'hi',
          roundNumber: 0,
          participantId: 'participant-3',
          participantIndex: 3,
        }),
      ];

      // Pre-search is complete, streaming is done
      const pending = calculatePendingParticipants({
        participants,
        messages,
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: false, // Streaming is done
        currentParticipantIndex: 0,
        preSearchStatus: AnalysisStatuses.COMPLETE, // Pre-search complete
      });

      // ✅ CRITICAL: NO pending cards should be shown because all participants have content
      expect(pending).toEqual([]);
      expect(pending).toHaveLength(0);
    });

    it('should NOT show pending cards when preSearchComplete=true and all messages exist', () => {
      const participants = createMockParticipants(2);
      const messages = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Hello there!',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Hi!',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
        }),
      ];

      const pending = calculatePendingParticipants({
        participants,
        messages,
        roundNumber: 0,
        streamingRoundNumber: null, // No streaming round
        isStreaming: false,
        currentParticipantIndex: 0,
        preSearchStatus: AnalysisStatuses.COMPLETE,
      });

      // All participants have content - no pending cards
      expect(pending).toEqual([]);
    });

    it('should STILL show pending cards if some participants are missing content', () => {
      const participants = createMockParticipants(4);
      const messages = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Say hi',
          roundNumber: 0,
        }),
        // Only 2 of 4 participants have completed responses
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'hi',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        createTestAssistantMessage({
          id: 'assistant-1',
          content: 'Hi.',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
        }),
        // participant-2 and participant-3 are still pending
      ];

      const pending = calculatePendingParticipants({
        participants,
        messages,
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: true, // Still streaming
        currentParticipantIndex: 2, // Now streaming participant 2
        preSearchStatus: AnalysisStatuses.COMPLETE,
      });

      // Participants 2 and 3 should be pending
      expect(pending).toEqual([2, 3]);
      expect(pending).toHaveLength(2);
    });

    it('should detect empty text as not having content', () => {
      const participants = createMockParticipants(2);
      const messages = [
        createTestUserMessage({
          id: 'user-1',
          content: 'Hello',
          roundNumber: 0,
        }),
        // Both messages exist but one has empty content
        createTestAssistantMessage({
          id: 'assistant-0',
          content: 'Hello!',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
        }),
        {
          id: 'assistant-1',
          role: UIMessageRoles.ASSISTANT,
          parts: [{ type: 'text', text: '' }], // Empty text
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'participant-1',
            participantIndex: 1,
          },
        } as UIMessage,
      ];

      const pending = calculatePendingParticipants({
        participants,
        messages,
        roundNumber: 0,
        streamingRoundNumber: 0,
        isStreaming: true,
        currentParticipantIndex: 1,
        preSearchStatus: AnalysisStatuses.COMPLETE,
      });

      // Participant 1 has empty content, so should show pending card
      expect(pending).toEqual([1]);
    });
  });
});
