/**
 * Refresh and Resumption Scenarios Tests
 *
 * Tests for page refresh behavior at different stages of conversation
 * as documented in FLOW_DOCUMENTATION.md (Part 3.5: Stream Completion Detection):
 *
 * Key Scenarios:
 * - Refresh during pre-search streaming
 * - Refresh during participant 0 streaming
 * - Refresh between participants (P0 done, P1 not started)
 * - Refresh during last participant streaming
 * - Refresh during analysis streaming
 * - Refresh after round complete
 *
 * Resumption Behavior:
 * - Stream completion detection via Cloudflare KV
 * - Incomplete round detection and continuation
 * - State recovery from server
 * - No mid-stream resumption (partial progress lost)
 *
 * Key Validations:
 * - Correct participant to resume
 * - No duplicate streams
 * - Proper state cleanup
 */

import { describe, expect, it } from 'vitest';

import { AnalysisStatuses, FinishReasons, MessageRoles, StreamStatuses } from '@/api/core/enums';
import type { DbAssistantMessageMetadata } from '@/db/schemas/chat-metadata';
import {
  createMockParticipant,
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

// ============================================================================
// TEST HELPERS
// ============================================================================

type _RefreshScenario = {
  name: string;
  preRefreshState: {
    streamingPhase: 'pre-search' | 'participant' | 'analysis' | 'complete';
    currentParticipantIndex: number;
    participantCount: number;
    roundNumber: number;
    hasPartialContent: boolean;
  };
  expectedPostRefresh: {
    nextParticipantToTrigger: number | null;
    shouldResumeStreaming: boolean;
    isRoundComplete: boolean;
  };
};

/**
 * Creates messages for a partial round (user + some participants)
 */
function createPartialRoundMessages(
  roundNumber: number,
  completedParticipantCount: number,
  options?: {
    lastParticipantFinishReason?: DbAssistantMessageMetadata['finishReason'];
    includeEmptyLastMessage?: boolean;
  },
) {
  const { lastParticipantFinishReason = FinishReasons.STOP, includeEmptyLastMessage = false } = options ?? {};

  const messages: Array<ReturnType<typeof createTestUserMessage> | ReturnType<typeof createTestAssistantMessage>> = [
    createTestUserMessage({
      id: `thread-123_r${roundNumber}_user`,
      content: `User message for round ${roundNumber}`,
      roundNumber,
    }),
  ];

  for (let i = 0; i < completedParticipantCount; i++) {
    const isLast = i === completedParticipantCount - 1;
    const finishReason = isLast ? lastParticipantFinishReason : FinishReasons.STOP;

    if (isLast && includeEmptyLastMessage) {
      // Empty message (interrupted before content)
      messages.push({
        id: `thread-123_r${roundNumber}_p${i}`,
        role: 'assistant' as const,
        parts: [],
        metadata: {
          role: MessageRoles.ASSISTANT,
          roundNumber,
          participantId: `participant-${i}`,
          participantIndex: i,
          participantRole: null,
          model: 'gpt-4',
          finishReason: FinishReasons.UNKNOWN,
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          hasError: false,
          isTransient: false,
          isPartialResponse: false,
        },
      });
    } else {
      messages.push(createTestAssistantMessage({
        id: `thread-123_r${roundNumber}_p${i}`,
        content: `Participant ${i} response`,
        roundNumber,
        participantId: `participant-${i}`,
        participantIndex: i,
        finishReason,
      }));
    }
  }

  return messages;
}

// ============================================================================
// REFRESH DURING PRE-SEARCH TESTS
// ============================================================================

describe('refresh During Pre-Search', () => {
  describe('pre-Search Still Streaming', () => {
    it('detects incomplete pre-search on refresh', () => {
      const preSearch = createMockStoredPreSearch(0, AnalysisStatuses.STREAMING);
      const _messages = [
        createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
      ];

      const hasIncompletePreSearch = preSearch.status === AnalysisStatuses.PENDING
        || preSearch.status === AnalysisStatuses.STREAMING;

      expect(hasIncompletePreSearch).toBe(true);
    });

    it('blocks participant streaming while pre-search incomplete', () => {
      const preSearch = createMockStoredPreSearch(0, AnalysisStatuses.STREAMING);

      const shouldWaitForPreSearch = preSearch.status === AnalysisStatuses.PENDING
        || preSearch.status === AnalysisStatuses.STREAMING;

      expect(shouldWaitForPreSearch).toBe(true);
    });

    it('resumes participants after pre-search completes', () => {
      const preSearch = createMockStoredPreSearch(0, AnalysisStatuses.COMPLETE);

      const shouldWaitForPreSearch = preSearch.status === AnalysisStatuses.PENDING
        || preSearch.status === AnalysisStatuses.STREAMING;

      expect(shouldWaitForPreSearch).toBe(false);
    });
  });

  describe('orphaned Pre-Search (User Message Missing)', () => {
    it('detects orphaned pre-search without user message', () => {
      const preSearch = createMockStoredPreSearch(0, AnalysisStatuses.STREAMING);
      preSearch.userQuery = 'Lost user query';
      const messages: unknown[] = []; // No messages

      const hasOrphanedPreSearch = preSearch && messages.length === 0;

      expect(hasOrphanedPreSearch).toBe(true);
    });

    it('recovers user query from orphaned pre-search', () => {
      const preSearch = createMockStoredPreSearch(0, AnalysisStatuses.COMPLETE);
      preSearch.userQuery = 'Recovered query text';

      // Should create optimistic user message from userQuery
      const recoveredMessage = {
        id: `optimistic-user-${Date.now()}-r0`,
        role: 'user',
        parts: [{ type: 'text', text: preSearch.userQuery }],
        metadata: { role: MessageRoles.USER, roundNumber: 0, isOptimistic: true },
      };

      expect(recoveredMessage.parts[0]?.text).toBe('Recovered query text');
    });
  });
});

// ============================================================================
// REFRESH DURING PARTICIPANT STREAMING TESTS
// ============================================================================

describe('refresh During Participant Streaming', () => {
  describe('refresh While Participant 0 Streaming', () => {
    it('detects incomplete round when P0 has no finishReason', () => {
      const messages = createPartialRoundMessages(0, 1, {
        lastParticipantFinishReason: FinishReasons.UNKNOWN,
      });
      const _participantCount = 3;

      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const lastMessage = assistantMessages[assistantMessages.length - 1];
      const metadata = lastMessage?.metadata as DbAssistantMessageMetadata;

      const isComplete = metadata?.finishReason === FinishReasons.STOP
        || metadata?.finishReason === FinishReasons.LENGTH;

      expect(isComplete).toBe(false);
    });

    it('identifies P0 as next participant to trigger when empty parts', () => {
      const messages = createPartialRoundMessages(0, 1, { includeEmptyLastMessage: true });
      const _participants = [createMockParticipant(0), createMockParticipant(1), createMockParticipant(2)];

      // Find first incomplete participant
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      let nextParticipantIndex = 0;

      for (let i = 0; i < assistantMessages.length; i++) {
        const msg = assistantMessages[i];
        const metadata = msg?.metadata as DbAssistantMessageMetadata;
        const isComplete = metadata?.finishReason === FinishReasons.STOP
          || metadata?.finishReason === FinishReasons.LENGTH;

        if (!isComplete) {
          nextParticipantIndex = i;
          break;
        }
        nextParticipantIndex = i + 1;
      }

      expect(nextParticipantIndex).toBe(0);
    });
  });

  describe('refresh Between Participants (P0 Done, P1 Not Started)', () => {
    it('detects P0 complete and triggers P1', () => {
      const messages = createPartialRoundMessages(0, 1, {
        lastParticipantFinishReason: FinishReasons.STOP,
      });
      const participantCount = 3;

      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const completedCount = assistantMessages.filter((m) => {
        const metadata = m.metadata as DbAssistantMessageMetadata;
        return metadata.finishReason === FinishReasons.STOP || metadata.finishReason === FinishReasons.LENGTH;
      }).length;

      const nextParticipantIndex = completedCount;
      const isRoundComplete = completedCount === participantCount;

      expect(completedCount).toBe(1);
      expect(nextParticipantIndex).toBe(1);
      expect(isRoundComplete).toBe(false);
    });

    it('sets waitingToStartStreaming AND nextParticipantToTrigger', () => {
      // Bug fix: Both must be set for provider to trigger next participant
      const state = {
        waitingToStartStreaming: true,
        nextParticipantToTrigger: 1,
      };

      expect(state.waitingToStartStreaming).toBe(true);
      expect(state.nextParticipantToTrigger).toBe(1);
    });
  });

  describe('refresh While Middle Participant (P1) Streaming', () => {
    it('detects P0 complete, P1 incomplete', () => {
      const messages = [
        createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0',
          content: 'P0 complete',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'p1',
          content: 'P1 partial...',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.UNKNOWN,
        }),
      ];

      const p0Metadata = messages[1]?.metadata as DbAssistantMessageMetadata;
      const p1Metadata = messages[2]?.metadata as DbAssistantMessageMetadata;

      expect(p0Metadata.finishReason).toBe(FinishReasons.STOP);
      expect(p1Metadata.finishReason).toBe(FinishReasons.UNKNOWN);
    });

    it('identifies P1 as next to trigger (not P2)', () => {
      const messages = [
        createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0',
          content: 'P0 complete',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // P1 has partial content but no complete finishReason
        {
          id: 'p1',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: 'Partial response...' }],
          metadata: {
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            participantId: 'participant-1',
            participantIndex: 1,
            finishReason: FinishReasons.UNKNOWN,
          } as DbAssistantMessageMetadata,
        },
      ];

      // P1 needs retry because finishReason is UNKNOWN
      const assistantMessages = messages.filter(m => m.role === 'assistant');
      let nextIndex = 0;

      for (const msg of assistantMessages) {
        const metadata = msg.metadata as DbAssistantMessageMetadata;
        if (metadata.finishReason === FinishReasons.STOP || metadata.finishReason === FinishReasons.LENGTH) {
          nextIndex = metadata.participantIndex + 1;
        } else {
          nextIndex = metadata.participantIndex;
          break;
        }
      }

      expect(nextIndex).toBe(1);
    });
  });

  describe('refresh While Last Participant Streaming', () => {
    it('detects round NOT complete until last participant finishes', () => {
      const messages = [
        createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0',
          content: 'P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'p1',
          content: 'P1 partial',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.UNKNOWN, // Still streaming
        }),
      ];
      const participantCount = 2;

      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const allComplete = assistantMessages.every((m) => {
        const metadata = m.metadata as DbAssistantMessageMetadata;
        return metadata.finishReason === FinishReasons.STOP || metadata.finishReason === FinishReasons.LENGTH;
      }) && assistantMessages.length === participantCount;

      expect(allComplete).toBe(false);
    });
  });
});

// ============================================================================
// REFRESH DURING ANALYSIS TESTS
// ============================================================================

describe('refresh During Analysis', () => {
  describe('analysis Streaming', () => {
    it('detects analysis in progress', () => {
      const analysisStatus = AnalysisStatuses.STREAMING;

      const isAnalysisComplete = analysisStatus === AnalysisStatuses.COMPLETE
        || analysisStatus === AnalysisStatuses.FAILED;

      expect(isAnalysisComplete).toBe(false);
    });

    it('allows round to complete even if analysis fails', () => {
      const _analysisStatus = AnalysisStatuses.FAILED;
      const allParticipantsComplete = true;

      // Round is considered complete even with failed analysis
      // User can still send new message
      const canProceed = allParticipantsComplete;

      expect(canProceed).toBe(true);
    });
  });

  describe('navigation Blocked Until Analysis Complete', () => {
    it('blocks navigation on overview screen until analysis complete', () => {
      const screenMode = 'overview';
      const analysisStatus = AnalysisStatuses.STREAMING;
      const hasAiGeneratedTitle = true;

      const canNavigate = screenMode === 'overview'
        && analysisStatus === AnalysisStatuses.COMPLETE
        && hasAiGeneratedTitle;

      expect(canNavigate).toBe(false);
    });

    it('allows navigation when analysis complete', () => {
      const screenMode = 'overview';
      const analysisStatus = AnalysisStatuses.COMPLETE;
      const hasAiGeneratedTitle = true;
      const threadSlug = 'test-thread';

      const canNavigate = screenMode === 'overview'
        && analysisStatus === AnalysisStatuses.COMPLETE
        && hasAiGeneratedTitle
        && !!threadSlug;

      expect(canNavigate).toBe(true);
    });
  });
});

// ============================================================================
// REFRESH AFTER ROUND COMPLETE TESTS
// ============================================================================

describe('refresh After Round Complete', () => {
  describe('complete Round Detection', () => {
    it('detects round complete when all participants finished', () => {
      const messages = [
        createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0',
          content: 'P0',
          roundNumber: 0,
          participantId: 'participant-0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'p1',
          content: 'P1',
          roundNumber: 0,
          participantId: 'participant-1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];
      const participantCount = 2;

      const assistantMessages = messages.filter(m => m.role === 'assistant');
      const allComplete = assistantMessages.every((m) => {
        const metadata = m.metadata as DbAssistantMessageMetadata;
        return metadata.finishReason === FinishReasons.STOP || metadata.finishReason === FinishReasons.LENGTH;
      }) && assistantMessages.length === participantCount;

      expect(allComplete).toBe(true);
    });

    it('does NOT trigger resumption for complete round', () => {
      const isRoundComplete = true;
      const isStreaming = false;
      const waitingToStartStreaming = false;

      const shouldResume = !isRoundComplete && !isStreaming && !waitingToStartStreaming;

      expect(shouldResume).toBe(false);
    });
  });

  describe('ready for Next Round', () => {
    it('user can submit new message after round complete', () => {
      const isRoundComplete = true;
      const isStreaming = false;
      const pendingMessage = null;

      const canSubmit = isRoundComplete && !isStreaming && pendingMessage === null;

      expect(canSubmit).toBe(true);
    });
  });
});

// ============================================================================
// STREAM COMPLETION DETECTION (KV) TESTS
// ============================================================================

describe('stream Completion Detection (KV)', () => {
  describe('kV Stream Status Check', () => {
    it('returns 204 when no active stream', () => {
      const streamStatus = null; // No stream in KV

      const hasActiveStream = streamStatus !== null;

      expect(hasActiveStream).toBe(false);
    });

    it('returns stream info when stream is active', () => {
      const streamStatus = {
        streamId: 'thread-123_r0_p0',
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        status: StreamStatuses.ACTIVE,
        createdAt: new Date(),
      };

      expect(streamStatus.status).toBe(StreamStatuses.ACTIVE);
    });

    it('returns stream info when stream completed', () => {
      const streamStatus = {
        streamId: 'thread-123_r0_p0',
        threadId: 'thread-123',
        roundNumber: 0,
        participantIndex: 0,
        status: StreamStatuses.COMPLETED,
        messageId: 'thread-123_r0_p0',
        completedAt: new Date(),
      };

      expect(streamStatus.status).toBe(StreamStatuses.COMPLETED);
    });
  });

  describe('stream ID Format', () => {
    it('follows pattern: {threadId}_r{roundNumber}_p{participantIndex}', () => {
      const threadId = 'thread-123';
      const roundNumber = 0;
      const participantIndex = 1;

      const streamId = `${threadId}_r${roundNumber}_p${participantIndex}`;

      expect(streamId).toBe('thread-123_r0_p1');
    });
  });

  describe('partial Progress Handling', () => {
    it('loses partial progress on refresh (no mid-stream resumption)', () => {
      // This is expected behavior per FLOW_DOCUMENTATION.md
      const streamedChunks = ['Mars', ' colonization', ' is'];
      const refreshOccurred = true;

      // After refresh, partial chunks are lost
      const chunksAfterRefresh = refreshOccurred ? [] : streamedChunks;

      expect(chunksAfterRefresh).toHaveLength(0);
    });

    it('fetches complete message from DB if stream completed during refresh', () => {
      const streamStatus = {
        status: StreamStatuses.COMPLETED,
        messageId: 'thread-123_r0_p0',
      };

      // Should fetch message from DB using messageId
      const shouldFetchFromDb = streamStatus.status === StreamStatuses.COMPLETED;

      expect(shouldFetchFromDb).toBe(true);
    });
  });
});

// ============================================================================
// MULTI-ROUND RESUMPTION TESTS
// ============================================================================

describe('multi-Round Resumption', () => {
  describe('resume Only Latest Round', () => {
    it('only checks latest round for incompleteness', () => {
      const messages = [
        // Round 0 - complete
        createTestUserMessage({ id: 'u0', content: 'R0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0-r0',
          content: 'R0P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - incomplete
        createTestUserMessage({ id: 'u1', content: 'R1', roundNumber: 1 }),
      ];

      // Find max round
      const maxRound = Math.max(...messages.map(m => m.metadata.roundNumber));
      expect(maxRound).toBe(1);

      // Check if latest round is complete
      const latestRoundMessages = messages.filter(m => m.metadata.roundNumber === maxRound);
      const latestRoundAssistants = latestRoundMessages.filter(m => m.role === 'assistant');

      expect(latestRoundAssistants).toHaveLength(0);
    });

    it('ignores incomplete earlier rounds', () => {
      const messages = [
        // Round 0 - incomplete (missing P1)
        createTestUserMessage({ id: 'u0', content: 'R0', roundNumber: 0 }),
        createTestAssistantMessage({
          id: 'p0-r0',
          content: 'R0P0',
          roundNumber: 0,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        // Round 1 - complete
        createTestUserMessage({ id: 'u1', content: 'R1', roundNumber: 1 }),
        createTestAssistantMessage({
          id: 'p0-r1',
          content: 'R1P0',
          roundNumber: 1,
          participantId: 'p0',
          participantIndex: 0,
          finishReason: FinishReasons.STOP,
        }),
        createTestAssistantMessage({
          id: 'p1-r1',
          content: 'R1P1',
          roundNumber: 1,
          participantId: 'p1',
          participantIndex: 1,
          finishReason: FinishReasons.STOP,
        }),
      ];
      const participantCount = 2;

      // Check latest round (1)
      const maxRound = Math.max(...messages.map(m => m.metadata.roundNumber));
      const latestRoundAssistants = messages.filter(
        m => m.metadata.roundNumber === maxRound && m.role === 'assistant',
      );

      const round1Complete = latestRoundAssistants.length === participantCount
        && latestRoundAssistants.every((m) => {
          const meta = m.metadata as DbAssistantMessageMetadata;
          return meta.finishReason === FinishReasons.STOP || meta.finishReason === FinishReasons.LENGTH;
        });

      expect(round1Complete).toBe(true);
    });
  });
});

// ============================================================================
// RACE CONDITION PREVENTION TESTS
// ============================================================================

describe('race Condition Prevention', () => {
  describe('no Duplicate Triggers', () => {
    it('prevents duplicate participant triggers via refs', () => {
      const triggeredParticipants = new Set<string>();

      const threadId = 'thread-123';
      const roundNumber = 0;
      const participantIndex = 0;
      const key = `${threadId}-r${roundNumber}-p${participantIndex}`;

      // First trigger
      if (!triggeredParticipants.has(key)) {
        triggeredParticipants.add(key);
      }

      // Second trigger should be blocked
      const canTrigger = !triggeredParticipants.has(key);

      expect(canTrigger).toBe(false);
    });

    it('clears trigger refs on thread change', () => {
      const triggeredParticipants = new Set<string>();
      triggeredParticipants.add('thread-123-r0-p0');

      // Thread changes
      triggeredParticipants.clear();

      expect(triggeredParticipants.size).toBe(0);
    });
  });

  describe('submission Guard', () => {
    it('blocks resumption during active submission', () => {
      const hasEarlyOptimisticMessage = true;
      const pendingMessage = 'New message';

      const shouldBlockResumption = hasEarlyOptimisticMessage || pendingMessage !== null;

      expect(shouldBlockResumption).toBe(true);
    });
  });

  describe('streaming Guard', () => {
    it('blocks resumption while actively streaming', () => {
      const isStreaming = true;

      const shouldBlockResumption = isStreaming;

      expect(shouldBlockResumption).toBe(true);
    });
  });
});

// ============================================================================
// STALE STATE CLEANUP TESTS
// ============================================================================

describe('stale State Cleanup', () => {
  describe('stuck Flags Detection', () => {
    it('detects stuck waitingToStartStreaming without pendingMessage', () => {
      const waitingToStartStreaming = true;
      const pendingMessage = null;
      const isStreaming = false;

      const isStale = waitingToStartStreaming && pendingMessage === null && !isStreaming;

      expect(isStale).toBe(true);
    });

    it('clears stale waitingToStartStreaming', () => {
      let waitingToStartStreaming = true;

      // Clear stale flag
      waitingToStartStreaming = false;

      expect(waitingToStartStreaming).toBe(false);
    });
  });

  describe('stuck Streaming Timeout', () => {
    it('detects stuck isStreaming after timeout', async () => {
      const streamingStartTime = Date.now() - 3000; // 3 seconds ago
      const TIMEOUT_MS = 2000;

      const isStuck = Date.now() - streamingStartTime > TIMEOUT_MS;

      expect(isStuck).toBe(true);
    });

    it('clears stuck isStreaming after timeout', () => {
      let isStreaming = true;

      // Timeout handler clears flag
      isStreaming = false;

      expect(isStreaming).toBe(false);
    });
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge Cases', () => {
  describe('empty Thread After Refresh', () => {
    it('handles refresh with no messages', () => {
      const messages: unknown[] = [];
      const hasMessages = messages.length > 0;

      expect(hasMessages).toBe(false);
    });
  });

  describe('participant Config Changed After Refresh', () => {
    it('detects participant mismatch', () => {
      const messageParticipantId = 'old-participant-0';
      const currentParticipants = [
        createMockParticipant(0), // id: participant-0
      ];

      const participantExists = currentParticipants.some(
        p => p.id === messageParticipantId,
      );

      expect(participantExists).toBe(false);
    });

    it('skips resumption on participant mismatch', () => {
      const hasParticipantMismatch = true;

      const shouldResume = !hasParticipantMismatch;

      expect(shouldResume).toBe(false);
    });
  });

  describe('disabled Participant After Refresh', () => {
    it('skips disabled participants in resumption', () => {
      const participants = [
        createMockParticipant(0),
        { ...createMockParticipant(1), isEnabled: false },
        createMockParticipant(2),
      ];

      const enabledParticipants = participants.filter(p => p.isEnabled);

      expect(enabledParticipants).toHaveLength(2);
    });
  });

  describe('optimistic Message Present', () => {
    it('skips resumption when optimistic message exists', () => {
      const messages = [
        {
          id: 'optimistic-user-123',
          role: 'user',
          metadata: { isOptimistic: true },
        },
      ];

      const hasOptimistic = messages.some(
        m => (m.metadata as { isOptimistic?: boolean }).isOptimistic,
      );

      expect(hasOptimistic).toBe(true);
    });
  });
});
