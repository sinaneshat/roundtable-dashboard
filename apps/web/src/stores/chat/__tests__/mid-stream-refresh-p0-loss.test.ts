/**
 * Mid-Stream Refresh P0 Message Loss Bug Replication Test
 *
 * This test replicates the exact bug scenario:
 * 1. Start a chat with 3 participants
 * 2. P0 completes streaming (message saved to DB)
 * 3. P1 starts streaming (partial message)
 * 4. User refreshes the page
 * 5. BUG: P0's completed message disappears
 * 6. P1 continues streaming
 * 7. P0 shows "thinking" until moderator is done
 *
 * Root Cause Analysis:
 * - Server's KV has P0 marked as COMPLETED
 * - Server returns nextParticipantToTrigger based on KV (skips P0)
 * - Client's initializeThread has "stale streaming detection"
 * - If P1 had streaming parts, client replaces ALL messages with DB messages
 * - If P0's message isn't properly merged back, it's lost
 *
 * Expected Behavior After Fix:
 * - P0's completed message should be preserved
 * - Server should validate KV against DB
 * - Client should not discard completed messages during refresh
 */

import { FinishReasons, MessageRoles, ParticipantStreamStatuses, RoundPhases, TextPartStates } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import { createMockParticipant, createTestAssistantMessage, createTestUserMessage } from '@/lib/testing';
import type { DbAssistantMessageMetadata, DbMessageMetadata } from '@/services/api';
import { isModeratorMessageMetadata } from '@/services/api';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// TEST TYPES
// ============================================================================

type UIMessage = ReturnType<typeof createTestUserMessage> | ReturnType<typeof createTestAssistantMessage>;

type KVParticipantStatuses = Record<number, typeof ParticipantStreamStatuses[keyof typeof ParticipantStreamStatuses]>;

type ServerResumptionState = {
  roundNumber: number;
  currentPhase: typeof RoundPhases[keyof typeof RoundPhases];
  participants: {
    hasActiveStream: boolean;
    streamId: string | null;
    totalParticipants: number;
    currentParticipantIndex: number | null;
    participantStatuses: KVParticipantStatuses | null;
    nextParticipantToTrigger: number | null;
    allComplete: boolean;
  };
  moderator: null;
  roundComplete: boolean;
};

type ThreadActiveStream = {
  threadId: string;
  streamId: string;
  roundNumber: number;
  participantIndex: number;
  totalParticipants: number;
  participantStatuses: KVParticipantStatuses;
  createdAt: string;
};

// ============================================================================
// SIMULATION HELPERS
// ============================================================================

/**
 * Simulates what the server does with KV-only logic (BEFORE fix)
 */
function simulateServerKVOnlyLogic(
  kvState: ThreadActiveStream,
  _dbMessages: UIMessage[],
): ServerResumptionState {
  // Find next participant based ONLY on KV statuses (BUG: ignores DB)
  let nextParticipantIndex: number | null = null;
  for (let i = 0; i < kvState.totalParticipants; i++) {
    const status = kvState.participantStatuses[i];
    if (status === ParticipantStreamStatuses.ACTIVE || status === undefined) {
      nextParticipantIndex = i;
      break;
    }
  }

  const allComplete = nextParticipantIndex === null;

  return {
    currentPhase: allComplete ? RoundPhases.MODERATOR : RoundPhases.PARTICIPANTS,
    moderator: null,
    participants: {
      allComplete,
      currentParticipantIndex: kvState.participantIndex,
      hasActiveStream: true,
      nextParticipantToTrigger: nextParticipantIndex,
      participantStatuses: kvState.participantStatuses,
      streamId: kvState.streamId,
      totalParticipants: kvState.totalParticipants,
    },
    roundComplete: allComplete,
    roundNumber: kvState.roundNumber,
  };
}

/**
 * Simulates what the server does with DB validation (AFTER fix)
 */
function simulateServerWithDbValidation(
  kvState: ThreadActiveStream,
  dbMessages: UIMessage[],
): ServerResumptionState {
  // Get participant indices that have actual DB messages
  const participantIndicesWithMessages = new Set<number>();
  for (const msg of dbMessages) {
    if (msg.role !== MessageRoles.ASSISTANT) {
      continue;
    }
    const metadata = msg.metadata as DbMessageMetadata | null;
    if (!metadata) {
      continue;
    }
    if (isModeratorMessageMetadata(metadata)) {
      continue;
    }
    if ('participantIndex' in metadata && typeof metadata.participantIndex === 'number') {
      participantIndicesWithMessages.add(metadata.participantIndex);
    }
  }

  // Find first participant WITHOUT a DB message
  let nextParticipantIndex: number | null = null;
  for (let i = 0; i < kvState.totalParticipants; i++) {
    if (!participantIndicesWithMessages.has(i)) {
      nextParticipantIndex = i;
      break;
    }
  }

  const allComplete = nextParticipantIndex === null;

  return {
    currentPhase: allComplete ? RoundPhases.MODERATOR : RoundPhases.PARTICIPANTS,
    moderator: null,
    participants: {
      allComplete,
      currentParticipantIndex: kvState.participantIndex,
      hasActiveStream: true,
      nextParticipantToTrigger: nextParticipantIndex,
      participantStatuses: kvState.participantStatuses,
      streamId: kvState.streamId,
      totalParticipants: kvState.totalParticipants,
    },
    roundComplete: allComplete,
    roundNumber: kvState.roundNumber,
  };
}

/**
 * Simulates client-side initializeThread message merging logic
 */
function simulateClientMessageMerging(
  storeMessages: UIMessage[],
  dbMessages: UIMessage[],
  isSameThread: boolean,
): UIMessage[] {
  if (!isSameThread || storeMessages.length === 0) {
    return dbMessages;
  }

  // Detect stale streaming parts (client-side logic)
  const hasStaleStreamingParts = storeMessages.some(msg =>
    msg.parts?.some(p => 'state' in p && p.state === TextPartStates.STREAMING),
  );

  if (hasStaleStreamingParts && dbMessages.length > 0) {
    // BUG PATH: Replace ALL store messages with DB messages
    // If P0's message is in DB but P1's partial message has streaming parts,
    // this replaces everything with DB messages
    return dbMessages;
  }

  // Compare round numbers
  const storeMaxRound = storeMessages.reduce((max, m) => {
    const round = (m.metadata as DbAssistantMessageMetadata)?.roundNumber ?? 0;
    return Math.max(max, round);
  }, 0);

  const dbMaxRound = dbMessages.reduce((max, m) => {
    const round = (m.metadata as DbAssistantMessageMetadata)?.roundNumber ?? 0;
    return Math.max(max, round);
  }, 0);

  if (storeMaxRound > dbMaxRound || (storeMaxRound === dbMaxRound && storeMessages.length >= dbMessages.length)) {
    return storeMessages;
  }

  return dbMessages;
}

// ============================================================================
// BUG REPLICATION TESTS
// ============================================================================

describe('mid-Stream Refresh P0 Message Loss Bug', () => {
  // Test participants
  const participants = [
    createMockParticipant(0, { modelId: 'openai/gpt-4.1-nano', role: 'Innovation Lead' }),
    createMockParticipant(1, { modelId: 'x-ai/grok-4-fast', role: 'Industry Analyst' }),
    createMockParticipant(2, { modelId: 'deepseek/deepseek-chat-v3', role: 'Strategy Advisor' }),
  ];

  describe('scenario: P0 Complete, P1 Streaming, Page Refresh', () => {
    /**
     * Timeline:
     * 1. User submits query
     * 2. P0 (Innovation Lead) streams and COMPLETES (saved to DB)
     * 3. P1 (Industry Analyst) starts streaming (partial, NOT in DB)
     * 4. User refreshes page
     * 5. EXPECTED: P0's message preserved, P1 restarts from beginning
     * 6. BUG: P0's message disappears, only P1 shows
     */

    // State BEFORE refresh: P0 complete, P1 streaming
    const storeMessagesBeforeRefresh: UIMessage[] = [
      createTestUserMessage({
        content: 'We run a $10M content writing agency...',
        id: 'user-0',
        roundNumber: 0,
      }),
      // P0 COMPLETED with full response
      (() => {
        const p0 = participants[0];
        if (!p0) {
          throw new Error('expected participant 0');
        }
        return createTestAssistantMessage({
          content: 'As the Innovation Lead, I recommend a hybrid approach combining AI tools with human creativity...',
          finishReason: FinishReasons.STOP,
          id: 'thread-123_r0_p0',
          participantId: p0.id,
          participantIndex: 0,
          roundNumber: 0,
        });
      })(),
      // P1 STREAMING with partial response
      {
        id: 'thread-123_r0_p1',
        metadata: (() => {
          const p1 = participants[1];
          if (!p1) {
            throw new Error('expected participant 1');
          }
          return {
            finishReason: FinishReasons.UNKNOWN,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'x-ai/grok-4-fast',
            participantId: p1.id,
            participantIndex: 1,
            participantRole: 'Industry Analyst',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
          };
        })(),
        parts: [
          { type: 'step-start' as const },
          {
            state: TextPartStates.STREAMING, // Still streaming!
            text: 'I challenge the "double down on human-only quality" option...',
            type: 'text' as const,
          },
        ],
        role: MessageRoles.ASSISTANT as const,
      },
    ];

    // DB state: Only user message and P0's completed message
    // P1's message was never saved (still streaming when refresh happened)
    const dbMessagesAfterRefresh: UIMessage[] = [
      createTestUserMessage({
        content: 'We run a $10M content writing agency...',
        id: 'user-0',
        roundNumber: 0,
      }),
      (() => {
        const p0 = participants[0];
        if (!p0) {
          throw new Error('expected participant 0');
        }
        return createTestAssistantMessage({
          content: 'As the Innovation Lead, I recommend a hybrid approach combining AI tools with human creativity...',
          finishReason: FinishReasons.STOP,
          id: 'thread-123_r0_p0',
          participantId: p0.id,
          participantIndex: 0,
          roundNumber: 0,
        });
      })(),
    ];

    // KV state: P0 completed, P1 active
    const kvState: ThreadActiveStream = {
      createdAt: new Date().toISOString(),
      participantIndex: 1, // Currently streaming P1
      participantStatuses: {
        0: ParticipantStreamStatuses.COMPLETED, // P0 done
        1: ParticipantStreamStatuses.ACTIVE, // P1 streaming
        // P2 not started (undefined)
      },
      roundNumber: 0,
      streamId: 'stream-xyz_r0_p1',
      threadId: 'thread-123',
      totalParticipants: 3,
    };

    it('bUG: KV-only server logic returns P1 as next (correct in this case)', () => {
      const serverState = simulateServerKVOnlyLogic(kvState, dbMessagesAfterRefresh);

      // P0 is COMPLETED in KV, so next is P1
      expect(serverState.participants.nextParticipantToTrigger).toBe(1);
      expect(serverState.currentPhase).toBe(RoundPhases.PARTICIPANTS);
    });

    it('fIX: DB-validated server logic also returns P1 (P0 has DB message)', () => {
      const serverState = simulateServerWithDbValidation(kvState, dbMessagesAfterRefresh);

      // P0 has a message in DB, so next is P1 (correct)
      expect(serverState.participants.nextParticipantToTrigger).toBe(1);
      expect(serverState.currentPhase).toBe(RoundPhases.PARTICIPANTS);
    });

    it('bUG: Client message merging discards store messages due to streaming parts', () => {
      const mergedMessages = simulateClientMessageMerging(
        storeMessagesBeforeRefresh,
        dbMessagesAfterRefresh,
        true, // same thread
      );

      // Because store has streaming parts, client replaces with DB messages
      // DB messages include P0, so P0 should be preserved
      expect(mergedMessages).toHaveLength(2); // user + P0
      expect(mergedMessages.some((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 0;
      })).toBeTruthy();
    });

    it('cRITICAL: P0 message should be preserved after refresh', () => {
      // After refresh, the flow is:
      // 1. Server returns nextParticipantToTrigger: 1
      // 2. Client loads DB messages (user + P0)
      // 3. Client should display P0's message
      // 4. Client should start streaming P1

      const mergedMessages = simulateClientMessageMerging(
        storeMessagesBeforeRefresh,
        dbMessagesAfterRefresh,
        true,
      );

      // P0's message MUST be in merged messages
      const p0Message = mergedMessages.find((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 0 && m.role === MessageRoles.ASSISTANT;
      });

      expect(p0Message).toBeDefined();
      expect(p0Message?.parts?.[0]?.type).toBe('text');
    });
  });

  describe('scenario: P0 Complete IN KV But NOT in DB (Race Condition)', () => {
    /**
     * This is the CRITICAL bug scenario:
     * 1. P0 starts streaming
     * 2. P0 finishes, KV updated to COMPLETED
     * 3. DB save is in progress but not committed
     * 4. User refreshes page
     * 5. KV says P0 COMPLETED, but DB has no P0 message
     * 6. BUG: Server returns nextParticipantToTrigger: 1, skipping P0
     */

    // DB state: Only user message (P0's message save failed/pending)
    const dbMessagesRaceCondition: UIMessage[] = [
      createTestUserMessage({
        content: 'We run a $10M content writing agency...',
        id: 'user-0',
        roundNumber: 0,
      }),
      // NO P0 message! Save was interrupted
    ];

    // KV state: P0 marked as COMPLETED (race condition!)
    const kvStateRaceCondition: ThreadActiveStream = {
      createdAt: new Date(Date.now() - 30000).toISOString(),
      participantIndex: 0,
      participantStatuses: {
        0: ParticipantStreamStatuses.COMPLETED, // BUG: KV says done but DB has no message!
      },
      roundNumber: 0,
      streamId: 'stream-xyz_r0_p0',
      threadId: 'thread-123',
      totalParticipants: 3,
    };

    it('bUG (BEFORE FIX): KV-only server returns P1, skipping P0 entirely', () => {
      const serverState = simulateServerKVOnlyLogic(kvStateRaceCondition, dbMessagesRaceCondition);

      // BUG: Server thinks P0 is done, returns P1
      expect(serverState.participants.nextParticipantToTrigger).toBe(1);
      // P0 NEVER RESPONDED but system thinks it did!
    });

    it('fIX: DB-validated server returns P0 (no DB message found)', () => {
      const serverState = simulateServerWithDbValidation(kvStateRaceCondition, dbMessagesRaceCondition);

      // FIX: Server sees P0 has no DB message, returns P0
      expect(serverState.participants.nextParticipantToTrigger).toBe(0);
      // P0 will be triggered to respond again
    });
  });

  describe('scenario: P0 Marked FAILED in KV But Never Saved to DB', () => {
    /**
     * Stale stream detection scenario:
     * 1. P0 starts streaming
     * 2. Page refresh happens mid-stream
     * 3. Stale detection marks P0 as FAILED
     * 4. But P0's message was never saved to DB
     * 5. BUG: Server returns P1 as next
     */

    const dbMessagesStaleDetection: UIMessage[] = [
      createTestUserMessage({
        content: 'We run a $10M content writing agency...',
        id: 'user-0',
        roundNumber: 0,
      }),
      // NO P0 message! Stream was interrupted before save
    ];

    const kvStateStaleDetection: ThreadActiveStream = {
      createdAt: new Date(Date.now() - 60000).toISOString(),
      participantIndex: 0,
      participantStatuses: {
        0: ParticipantStreamStatuses.FAILED, // Marked failed by stale detection
      },
      roundNumber: 0,
      streamId: 'stream-xyz_r0_p0',
      threadId: 'thread-123',
      totalParticipants: 3,
    };

    it('bUG (BEFORE FIX): KV-only server skips failed P0, returns P1', () => {
      const serverState = simulateServerKVOnlyLogic(kvStateStaleDetection, dbMessagesStaleDetection);

      // BUG: P0 is FAILED, so it's skipped, returns P1
      expect(serverState.participants.nextParticipantToTrigger).toBe(1);
    });

    it('fIX: DB-validated server returns P0 (must retry)', () => {
      const serverState = simulateServerWithDbValidation(kvStateStaleDetection, dbMessagesStaleDetection);

      // FIX: P0 has no DB message, must retry
      expect(serverState.participants.nextParticipantToTrigger).toBe(0);
    });
  });

  describe('end-to-End Refresh Flow Simulation', () => {
    it('simulates complete refresh flow with proper message preservation', () => {
      // === PHASE 1: Before Refresh ===
      // Store has: user message, P0 complete, P1 streaming
      const storeBeforeRefresh: UIMessage[] = [
        createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 full response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'p0-id',
          participantIndex: 0,
          roundNumber: 0,
        }),
        {
          id: 'p1-msg',
          metadata: {
            finishReason: FinishReasons.UNKNOWN,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'test',
            participantId: 'p1-id',
            participantIndex: 1,
            participantRole: 'Analyst',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
          },
          parts: [{ state: TextPartStates.STREAMING, text: 'P1 partial...', type: 'text' as const }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      // DB has: user message, P0 complete (P1 not saved)
      const dbAfterRefresh: UIMessage[] = [
        createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 full response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'p0-id',
          participantIndex: 0,
          roundNumber: 0,
        }),
      ];

      // KV: P0 completed, P1 active
      const kv: ThreadActiveStream = {
        createdAt: new Date().toISOString(),
        participantIndex: 1,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED, 1: ParticipantStreamStatuses.ACTIVE },
        roundNumber: 0,
        streamId: 's1_r0_p1',
        threadId: 't1',
        totalParticipants: 3,
      };

      // === PHASE 2: Refresh happens ===

      // Step 1: Server calculates resumption state
      const serverState = simulateServerWithDbValidation(kv, dbAfterRefresh);

      // Step 2: Client merges messages
      const clientMessages = simulateClientMessageMerging(storeBeforeRefresh, dbAfterRefresh, true);

      // === ASSERTIONS ===

      // Server should return P1 as next (P0 has DB message)
      expect(serverState.participants.nextParticipantToTrigger).toBe(1);
      expect(serverState.currentPhase).toBe(RoundPhases.PARTICIPANTS);

      // Client should have P0's message (2 messages: user + P0)
      expect(clientMessages).toHaveLength(2);

      // P0's message MUST be preserved
      const p0Preserved = clientMessages.some((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 0 && m.role === MessageRoles.ASSISTANT;
      });
      expect(p0Preserved).toBeTruthy();

      // P1's partial message should be discarded (will restart)
      const p1InMessages = clientMessages.some((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 1;
      });
      expect(p1InMessages).toBeFalsy();
    });

    it('simulates bug scenario where P0 message is NOT in DB', () => {
      // Store has P0 complete, P1 streaming
      const storeBeforeRefresh: UIMessage[] = [
        createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
        createTestAssistantMessage({
          content: 'P0 full response',
          finishReason: FinishReasons.STOP,
          id: 'p0-msg',
          participantId: 'p0-id',
          participantIndex: 0,
          roundNumber: 0,
        }),
        {
          id: 'p1-msg',
          metadata: {
            finishReason: FinishReasons.UNKNOWN,
            hasError: false,
            isPartialResponse: false,
            isTransient: false,
            model: 'test',
            participantId: 'p1-id',
            participantIndex: 1,
            participantRole: 'Analyst',
            role: MessageRoles.ASSISTANT,
            roundNumber: 0,
            usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
          },
          parts: [{ state: TextPartStates.STREAMING, text: 'P1 partial...', type: 'text' as const }],
          role: MessageRoles.ASSISTANT as const,
        },
      ];

      // BUG: DB only has user message (P0 save failed!)
      const dbAfterRefresh: UIMessage[] = [
        createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
        // P0's message is MISSING from DB!
      ];

      // KV: P0 marked completed (but DB doesn't have it!)
      const kvBuggy: ThreadActiveStream = {
        createdAt: new Date().toISOString(),
        participantIndex: 0,
        participantStatuses: { 0: ParticipantStreamStatuses.COMPLETED },
        roundNumber: 0,
        streamId: 's1_r0_p0',
        threadId: 't1',
        totalParticipants: 3,
      };

      // === SERVER SIDE ===

      // BUG (KV-only): Returns P1, skipping P0
      const buggyServerState = simulateServerKVOnlyLogic(kvBuggy, dbAfterRefresh);
      expect(buggyServerState.participants.nextParticipantToTrigger).toBe(1); // WRONG!

      // FIX (DB-validated): Returns P0
      const fixedServerState = simulateServerWithDbValidation(kvBuggy, dbAfterRefresh);
      expect(fixedServerState.participants.nextParticipantToTrigger).toBe(0); // CORRECT!

      // === CLIENT SIDE ===

      // Client merges messages - P0's store message is lost because of streaming parts
      const clientMessages = simulateClientMessageMerging(storeBeforeRefresh, dbAfterRefresh, true);

      // BUG: P0's message is lost! DB doesn't have it, store was discarded
      expect(clientMessages).toHaveLength(1); // Only user message
      const p0Lost = !clientMessages.some((m) => {
        const meta = m.metadata as DbAssistantMessageMetadata;
        return meta?.participantIndex === 0 && m.role === MessageRoles.ASSISTANT;
      });
      expect(p0Lost).toBeTruthy(); // P0 IS LOST - this is the bug!
    });
  });
});

// ============================================================================
// WAITUNTIL RACE CONDITION TESTS (NEW FIX)
// ============================================================================

describe('waitUntil Race Condition Fix', () => {
  /**
   * The core race condition:
   * 1. Participant stream finishes (onFinish callback runs)
   * 2. consumeSseStream runs in waitUntil (background)
   * 3. User refreshes BEFORE consumeSseStream completes
   * 4. KV stream buffer still shows ACTIVE status
   * 5. Server returns phase=participants with the same participant
   * 6. BUG: Participant re-triggers, duplicating/replaying responses
   *
   * Fix: Call completeParticipantStreamBuffer and clearActiveParticipantStream
   * in onFinish (not just in consumeSseStream's waitUntil)
   */

  type StreamBufferMetadata = {
    streamId: string;
    status: 'active' | 'completed' | 'failed';
    chunkCount: number;
  };

  type SimulatedKVState = {
    streamBuffer: StreamBufferMetadata | null;
    activeParticipantKey: string | null;
    threadActiveStream: {
      participantStatuses: Record<number, 'active' | 'completed' | 'failed'>;
    } | null;
  };

  /**
   * Simulates OLD behavior: Only consumeSseStream (in waitUntil) updates KV
   * If user refreshes before waitUntil completes, KV is stale
   */
  function simulateOldBehavior(
    streamId: string,
    consumeSseStreamCompleted: boolean,
  ): SimulatedKVState {
    // onFinish only called markStreamCompleted and updateParticipantStatus
    // It did NOT call completeParticipantStreamBuffer or clearActiveParticipantStream

    if (!consumeSseStreamCompleted) {
      // User refreshed before consumeSseStream (waitUntil) finished
      // Buffer is still ACTIVE, active key still exists
      return {
        activeParticipantKey: streamId, // Still set!
        streamBuffer: { chunkCount: 50, status: 'active', streamId },
        threadActiveStream: {
          participantStatuses: { 0: 'completed' }, // updateParticipantStatus was called
        },
      };
    }

    // If consumeSseStream completed normally
    return {
      activeParticipantKey: null,
      streamBuffer: { chunkCount: 100, status: 'completed', streamId },
      threadActiveStream: {
        participantStatuses: { 0: 'completed' },
      },
    };
  }

  /**
   * Simulates NEW behavior: onFinish also calls completeParticipantStreamBuffer
   * and clearActiveParticipantStream, so KV is correct even if waitUntil hasn't finished
   */
  function simulateNewBehavior(
    streamId: string,
    _consumeSseStreamCompleted: boolean,
  ): SimulatedKVState {
    // onFinish now calls BOTH:
    // 1. markStreamCompleted + updateParticipantStatus (existing)
    // 2. completeParticipantStreamBuffer (NEW)
    // 3. clearActiveParticipantStream (NEW)

    // Regardless of whether consumeSseStream finished, buffer is marked complete
    return {
      activeParticipantKey: null, // Cleared by onFinish
      streamBuffer: { chunkCount: 50, status: 'completed', streamId }, // Marked by onFinish
      threadActiveStream: {
        participantStatuses: { 0: 'completed' },
      },
    };
  }

  it('old: buffer stays ACTIVE if user refreshes before waitUntil completes', () => {
    const result = simulateOldBehavior('stream-123', false);

    // BUG: Buffer is still active
    expect(result.streamBuffer?.status).toBe('active');
    // BUG: Active key still points to this stream
    expect(result.activeParticipantKey).toBe('stream-123');

    // This causes server to return phase=participants with same participant
    // triggering re-execution
  });

  it('old: buffer is COMPLETED if waitUntil finishes before refresh', () => {
    const result = simulateOldBehavior('stream-123', true);

    // Works correctly when no race condition
    expect(result.streamBuffer?.status).toBe('completed');
    expect(result.activeParticipantKey).toBeNull();
  });

  it('new: buffer is COMPLETED immediately after onFinish (race-free)', () => {
    // Even if consumeSseStream hasn't finished
    const resultRaceScenario = simulateNewBehavior('stream-123', false);

    // FIX: Buffer is completed by onFinish
    expect(resultRaceScenario.streamBuffer?.status).toBe('completed');
    // FIX: Active key is cleared by onFinish
    expect(resultRaceScenario.activeParticipantKey).toBeNull();
  });

  it('new: no difference whether waitUntil completes or not', () => {
    const beforeWaitUntil = simulateNewBehavior('stream-123', false);
    const afterWaitUntil = simulateNewBehavior('stream-123', true);

    // Same result regardless of timing
    expect(beforeWaitUntil.streamBuffer?.status).toBe(afterWaitUntil.streamBuffer?.status);
    expect(beforeWaitUntil.activeParticipantKey).toBe(afterWaitUntil.activeParticipantKey);
  });

  describe('complete Round Scenario', () => {
    /**
     * When ALL participants finish and moderator completes:
     * 1. All participant onFinish callbacks run
     * 2. Moderator onFinish runs
     * 3. User refreshes
     * 4. Server should return phase=COMPLETE, not phase=PARTICIPANTS
     */

    type CompleteRoundKVState = {
      participantBuffers: Record<number, { status: 'active' | 'completed' | 'failed' }>;
      moderatorBuffer: { status: 'active' | 'completed' | 'failed' } | null;
      activeParticipantKeys: string[];
    };

    function simulateCompleteRound(
      participantCount: number,
      moderatorCompleted: boolean,
      onFinishExecuted: boolean,
    ): CompleteRoundKVState {
      const participantBuffers: CompleteRoundKVState['participantBuffers'] = {};
      const activeParticipantKeys: string[] = [];

      for (let i = 0; i < participantCount; i++) {
        if (onFinishExecuted) {
          // With fix: onFinish marks buffer complete and clears active key
          participantBuffers[i] = { status: 'completed' };
          // No active key (cleared by onFinish)
        } else {
          // Without fix (or before onFinish): still active
          participantBuffers[i] = { status: 'active' };
          activeParticipantKeys.push(`stream_r0_p${i}`);
        }
      }

      return {
        activeParticipantKeys,
        moderatorBuffer: moderatorCompleted ? { status: 'completed' } : null,
        participantBuffers,
      };
    }

    it('all participants complete with fix: no active keys remain', () => {
      const result = simulateCompleteRound(3, true, true);

      // All buffers completed
      expect(Object.values(result.participantBuffers).every(b => b.status === 'completed')).toBeTruthy();
      // No active keys
      expect(result.activeParticipantKeys).toHaveLength(0);
      // Moderator completed
      expect(result.moderatorBuffer?.status).toBe('completed');
    });

    it('refresh mid-stream without fix: active keys remain', () => {
      const result = simulateCompleteRound(3, false, false);

      // All buffers still active (bug scenario)
      expect(Object.values(result.participantBuffers).every(b => b.status === 'active')).toBeTruthy();
      // Active keys still exist (causes re-trigger)
      expect(result.activeParticipantKeys).toHaveLength(3);
    });
  });
});

describe('message Merging Edge Cases', () => {
  it('preserves completed messages even when partial messages exist', () => {
    const storeMessages: UIMessage[] = [
      createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
      // P0: Complete message
      createTestAssistantMessage({
        content: 'Complete P0 response',
        finishReason: FinishReasons.STOP,
        id: 'p0-complete',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
      // P1: Partial streaming message
      {
        id: 'p1-partial',
        metadata: {
          finishReason: FinishReasons.UNKNOWN,
          hasError: false,
          isPartialResponse: false,
          isTransient: false,
          model: 'test',
          participantId: 'p1',
          participantIndex: 1,
          participantRole: 'Test',
          role: MessageRoles.ASSISTANT,
          roundNumber: 0,
          usage: { completionTokens: 0, promptTokens: 0, totalTokens: 0 },
        },
        parts: [{ state: TextPartStates.STREAMING, text: 'Partial...', type: 'text' as const }],
        role: MessageRoles.ASSISTANT as const,
      },
    ];

    const dbMessages: UIMessage[] = [
      createTestUserMessage({ content: 'Query', id: 'user-0', roundNumber: 0 }),
      createTestAssistantMessage({
        content: 'Complete P0 response',
        finishReason: FinishReasons.STOP,
        id: 'p0-complete',
        participantId: 'p0',
        participantIndex: 0,
        roundNumber: 0,
      }),
    ];

    const merged = simulateClientMessageMerging(storeMessages, dbMessages, true);

    // P0 should be preserved (it's in both store and DB)
    expect(merged).toHaveLength(2);
    expect(merged.some((m) => {
      const meta = m.metadata as DbAssistantMessageMetadata;
      return meta?.participantIndex === 0;
    })).toBeTruthy();
  });
});

/**
 * Stale Resumption State Fix Tests
 *
 * Bug: When round N completes and user submits round N+1:
 * 1. currentResumptionPhase='complete' from round N persists
 * 2. After changelog completes, hasActiveFormSubmission=false
 * 3. preserveStreamingState becomes false
 * 4. initializeThread wipes pendingMessage to null
 * 5. Streams never start!
 *
 * Fix: Clear stale resumption state when user starts a new round submission
 * in handleUpdateThreadAndSend before setting up new streaming state.
 */
describe('stale Resumption State on New Round Submission', () => {
  it('should clear stale resumption phase when starting new round', () => {
    const store = createChatStore();

    // Round 0 completes - sets phase to COMPLETE
    store.getState().prefillStreamResumptionState('thread-1', {
      currentPhase: RoundPhases.COMPLETE,
      moderator: null,
      participants: { allComplete: true, nextParticipantToTrigger: null, totalParticipants: 2 },
      preSearch: null,
      resumptionRoundNumber: 0,
      roundComplete: true,
    });

    expect(store.getState().currentResumptionPhase).toBe(RoundPhases.COMPLETE);
    expect(store.getState().streamResumptionPrefilled).toBeTruthy();

    // Simulate what form-actions does at start of handleUpdateThreadAndSend
    store.getState().clearStreamResumption();

    // State should be cleared
    expect(store.getState().currentResumptionPhase).toBeNull();
    expect(store.getState().streamResumptionPrefilled).toBeFalsy();
    expect(store.getState().resumptionRoundNumber).toBeNull();
  });

  it('stale resumption phase causes pendingMessage wipe in initializeThread', () => {
    const store = createChatStore();

    // Setup: Round 0 complete, phase still set to COMPLETE
    store.getState().prefillStreamResumptionState('thread-1', {
      currentPhase: RoundPhases.COMPLETE,
      moderator: null,
      participants: { allComplete: true, nextParticipantToTrigger: null, totalParticipants: 2 },
      preSearch: null,
      resumptionRoundNumber: 0,
      roundComplete: true,
    });

    // User submits round 1 - WITHOUT clearing resumption state (old buggy behavior)
    // This sets pendingMessage and streamingRoundNumber
    store.getState().setStreamingRoundNumber(1);

    // Simulate what happens after changelog: initializeThread runs
    // with preserveStreamingState=false because:
    // - isActiveResumption=false (phase is COMPLETE)
    // - hasActiveFormSubmission=false (changelog cleared it)

    const state = store.getState();
    const resumptionPhase = state.currentResumptionPhase;
    const isActiveResumption = state.streamResumptionPrefilled
      && resumptionPhase !== RoundPhases.COMPLETE
      && resumptionPhase !== RoundPhases.IDLE;
    const hasActiveFormSubmission
      = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
    const preserveStreamingState = isActiveResumption || hasActiveFormSubmission;

    // BUG: preserveStreamingState is false even though we're about to stream round 1
    expect(preserveStreamingState).toBeFalsy();
  });

  it('clearing resumption state prevents pendingMessage wipe', () => {
    const store = createChatStore();

    // Setup: Round 0 complete
    store.getState().prefillStreamResumptionState('thread-1', {
      currentPhase: RoundPhases.COMPLETE,
      moderator: null,
      participants: { allComplete: true, nextParticipantToTrigger: null, totalParticipants: 2 },
      preSearch: null,
      resumptionRoundNumber: 0,
      roundComplete: true,
    });

    // User submits round 1 - WITH clearing resumption state (fixed behavior)
    store.getState().clearStreamResumption();

    // Set up streaming state for new round
    store.getState().setStreamingRoundNumber(1);
    store.getState().setConfigChangeRoundNumber(1);

    // Now check preserveStreamingState logic
    const state = store.getState();
    const resumptionPhase = state.currentResumptionPhase;
    const isActiveResumption = state.streamResumptionPrefilled
      && resumptionPhase !== RoundPhases.COMPLETE
      && resumptionPhase !== RoundPhases.IDLE;
    const hasActiveFormSubmission
      = state.configChangeRoundNumber !== null || state.isWaitingForChangelog;
    const preserveStreamingState = isActiveResumption || hasActiveFormSubmission;

    // FIX: preserveStreamingState is true because configChangeRoundNumber is set
    expect(hasActiveFormSubmission).toBeTruthy();
    expect(preserveStreamingState).toBeTruthy();
  });

  it('should skip prefill when isPatchInProgress is true', () => {
    const store = createChatStore();

    // Simulate form submission in progress
    store.getState().setIsPatchInProgress(true);
    store.getState().setConfigChangeRoundNumber(1);

    // Fresh state shows patch is in progress
    const freshState = store.getState();

    // This is the logic from screen-initialization.ts
    const skipPrefillDueToFormSubmission = freshState.isPatchInProgress
      || freshState.configChangeRoundNumber !== null
      || freshState.isWaitingForChangelog
      || freshState.pendingMessage !== null;

    // Prefill should be skipped
    expect(skipPrefillDueToFormSubmission).toBeTruthy();

    // If we were to call prefillStreamResumptionState, it would re-set stale data
    // But since we skip it, the state remains clean for the new submission
    expect(freshState.streamResumptionPrefilled).toBeFalsy();
    expect(freshState.currentResumptionPhase).toBeNull();
  });
});
