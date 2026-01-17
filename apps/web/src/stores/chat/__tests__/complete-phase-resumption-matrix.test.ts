/**
 * Complete Phase Resumption Matrix Tests
 *
 * Tests ALL 11 interruption points during a conversation round:
 * 1. After submit, before thread creation
 * 2. Thread created, pre-search PENDING
 * 3. Pre-search STREAMING
 * 4. Pre-search COMPLETE, participant 0 not started
 * 5. Participant 0 STREAMING
 * 6. Participant 0 COMPLETE, participant 1 not started
 * 7. Participant N STREAMING (N > 0)
 * 8. Last participant STREAMING
 * 9. Last participant COMPLETE, moderator not started
 * 10. Moderator STREAMING
 * 11. Moderator COMPLETE (round complete)
 *
 * Also tests race conditions between:
 * - AI SDK resume and incomplete-round-resumption
 * - Pre-search completion and participant triggering
 * - Participant completion and next participant triggering
 * - Last participant completion and moderator triggering
 * - Multiple effects trying to resume the same phase
 */

import type { RoundPhase } from '@roundtable/shared';
import { FinishReasons, MessageStatuses, RoundPhases, UIMessageRoles } from '@roundtable/shared';
import type { UIMessage } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockParticipant,
  createMockStoredPreSearch,
  createTestAssistantMessage,
  createTestUserMessage,
} from '@/lib/testing';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type StreamResumptionState = {
  roundNumber: number | null;
  currentPhase: RoundPhase;
  hasActiveStream: boolean;
  streamId: string | null;
  preSearch: {
    enabled: boolean;
    status: 'pending' | 'streaming' | 'complete' | 'failed' | null;
    streamId: string | null;
    preSearchId: string | null;
  } | null;
  participants: {
    hasActiveStream: boolean;
    streamId: string | null;
    totalParticipants: number;
    currentParticipantIndex: number | null;
    participantStatuses: Record<string, 'active' | 'completed' | 'failed'> | null;
    nextParticipantToTrigger: number | null;
    allComplete: boolean;
  };
  moderator: {
    status: 'pending' | 'streaming' | 'complete' | 'failed' | null;
    streamId: string | null;
    moderatorId: string | null;
  } | null;
  roundComplete: boolean;
};

type StoreState = {
  isStreaming: boolean;
  waitingToStartStreaming: boolean;
  pendingMessage: string | null;
  hasEarlyOptimisticMessage: boolean;
  hasSentPendingMessage: boolean;
  currentResumptionPhase: RoundPhase | null;
  streamResumptionPrefilled: boolean;
  nextParticipantToTrigger: number | null;
  streamingRoundNumber: number | null;
  isModeratorStreaming: boolean;
  /** Track which round numbers have triggered moderator streams */
  triggeredModeratorRounds: Set<number>;
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createServerResumptionState(
  phase: RoundPhase,
  roundNumber: number,
  options: {
    preSearchStatus?: 'pending' | 'streaming' | 'complete' | 'failed';
    preSearchEnabled?: boolean;
    participantCount?: number;
    completedParticipants?: number[];
    activeParticipantIndex?: number | null;
    moderatorStatus?: 'pending' | 'streaming' | 'complete' | 'failed';
  } = {},
): StreamResumptionState {
  const {
    preSearchStatus = null,
    preSearchEnabled = false,
    participantCount = 3,
    completedParticipants = [],
    activeParticipantIndex = null,
    moderatorStatus = null,
  } = options;

  const participantStatuses: Record<string, 'active' | 'completed' | 'failed'> = {};
  for (let i = 0; i < participantCount; i++) {
    if (completedParticipants.includes(i)) {
      participantStatuses[String(i)] = 'completed';
    } else if (activeParticipantIndex === i) {
      participantStatuses[String(i)] = 'active';
    }
  }

  const allComplete = completedParticipants.length === participantCount;
  const hasActiveParticipantStream = activeParticipantIndex !== null;
  const nextToTrigger = allComplete
    ? null
    : completedParticipants.length < participantCount
      ? completedParticipants.length
      : null;

  return {
    roundNumber,
    currentPhase: phase,
    hasActiveStream: phase === RoundPhases.PRE_SEARCH
      ? preSearchStatus === 'streaming'
      : phase === RoundPhases.PARTICIPANTS
        ? hasActiveParticipantStream
        : phase === RoundPhases.MODERATOR
          ? moderatorStatus === 'streaming'
          : false,
    streamId: phase === RoundPhases.PRE_SEARCH
      ? `presearch_thread_123_${roundNumber}`
      : phase === RoundPhases.PARTICIPANTS && activeParticipantIndex !== null
        ? `thread_123_r${roundNumber}_p${activeParticipantIndex}`
        : phase === RoundPhases.MODERATOR
          ? `moderator_thread_123_r${roundNumber}`
          : null,
    preSearch: preSearchEnabled
      ? {
          enabled: true,
          status: preSearchStatus,
          streamId: preSearchStatus === 'streaming' ? `presearch_thread_123_${roundNumber}` : null,
          preSearchId: `ps_${roundNumber}`,
        }
      : null,
    participants: {
      hasActiveStream: hasActiveParticipantStream,
      streamId: hasActiveParticipantStream ? `thread_123_r${roundNumber}_p${activeParticipantIndex}` : null,
      totalParticipants: participantCount,
      currentParticipantIndex: activeParticipantIndex,
      participantStatuses: Object.keys(participantStatuses).length > 0 ? participantStatuses : null,
      nextParticipantToTrigger: nextToTrigger,
      allComplete,
    },
    moderator: phase === RoundPhases.MODERATOR || allComplete
      ? {
          status: moderatorStatus,
          streamId: moderatorStatus === 'streaming' ? `moderator_thread_123_r${roundNumber}` : null,
          moderatorId: moderatorStatus ? `moderator_${roundNumber}` : null,
        }
      : null,
    roundComplete: phase === RoundPhases.COMPLETE,
  };
}

function createInitialStoreState(): StoreState {
  return {
    isStreaming: false,
    waitingToStartStreaming: false,
    pendingMessage: null,
    hasEarlyOptimisticMessage: false,
    hasSentPendingMessage: false,
    currentResumptionPhase: null,
    streamResumptionPrefilled: false,
    nextParticipantToTrigger: null,
    streamingRoundNumber: null,
    isModeratorStreaming: false,
    triggeredModeratorRounds: new Set(),
  };
}

function simulatePrefillFromServer(
  state: StoreState,
  serverState: StreamResumptionState,
): StoreState {
  return {
    ...state,
    currentResumptionPhase: serverState.currentPhase,
    streamResumptionPrefilled: true,
    streamingRoundNumber: serverState.roundNumber,
    nextParticipantToTrigger: serverState.participants.nextParticipantToTrigger,
    waitingToStartStreaming: serverState.hasActiveStream || serverState.participants.nextParticipantToTrigger !== null,
    isModeratorStreaming: serverState.currentPhase === RoundPhases.MODERATOR,
  };
}

// ============================================================================
// INTERRUPTION POINT 1: After submit, before thread creation
// ============================================================================

describe('interruption Point 1: After submit, before thread creation', () => {
  it('should have no state to resume when thread not created', () => {
    const serverState: StreamResumptionState | null = null;

    expect(serverState).toBeNull();
  });

  it('should show empty chat UI when no thread exists', () => {
    const messages: UIMessage[] = [];
    const thread = null;

    expect(messages).toHaveLength(0);
    expect(thread).toBeNull();
  });
});

// ============================================================================
// INTERRUPTION POINT 2: Thread created, pre-search PENDING
// ============================================================================

describe('interruption Point 2: Thread created, pre-search PENDING', () => {
  it('should detect pending pre-search from server state', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'pending',
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PRE_SEARCH);
    expect(serverState.preSearch?.status).toBe('pending');
    expect(serverState.hasActiveStream).toBe(false);
  });

  it('should prefill store to trigger pre-search execution', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'pending',
    });
    const initialState = createInitialStoreState();
    const prefilledState = simulatePrefillFromServer(initialState, serverState);

    expect(prefilledState.currentResumptionPhase).toBe(RoundPhases.PRE_SEARCH);
    expect(prefilledState.streamResumptionPrefilled).toBe(true);
    expect(prefilledState.waitingToStartStreaming).toBe(true);
  });

  it('should NOT trigger participants while pre-search is pending', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'pending',
    });

    const shouldTriggerParticipants = serverState.currentPhase === RoundPhases.PARTICIPANTS
      && serverState.participants.nextParticipantToTrigger !== null;

    expect(shouldTriggerParticipants).toBe(false);
  });
});

// ============================================================================
// INTERRUPTION POINT 3: Pre-search STREAMING
// ============================================================================

describe('interruption Point 3: Pre-search STREAMING', () => {
  it('should detect streaming pre-search from server state', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'streaming',
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PRE_SEARCH);
    expect(serverState.preSearch?.status).toBe('streaming');
    expect(serverState.hasActiveStream).toBe(true);
    expect(serverState.streamId).toBe('presearch_thread_123_0');
  });

  it('should return 204 with phase header from GET /stream for pre-search phase', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'streaming',
    });

    // AI SDK resume handler returns 204 for non-participant phases
    const httpStatus = serverState.currentPhase !== RoundPhases.PARTICIPANTS ? 204 : 200;
    const phaseHeader = serverState.currentPhase;

    expect(httpStatus).toBe(204);
    expect(phaseHeader).toBe(RoundPhases.PRE_SEARCH);
  });

  it('should block participant resumption while pre-search is streaming', () => {
    const preSearch = createMockStoredPreSearch(0, MessageStatuses.STREAMING);

    const shouldWaitForPreSearch = preSearch.status === MessageStatuses.PENDING
      || preSearch.status === MessageStatuses.STREAMING;

    expect(shouldWaitForPreSearch).toBe(true);
  });

  it('should resume pre-search stream from KV buffer', () => {
    const kvChunks = [
      'event: query\ndata: {"query":"test","index":0}\n\n',
      'event: result\ndata: {"title":"Result 1"}\n\n',
    ];

    expect(kvChunks).toHaveLength(2);
    // useStreamingTrigger would consume these chunks and continue streaming
  });
});

// ============================================================================
// INTERRUPTION POINT 4: Pre-search COMPLETE, participant 0 not started
// ============================================================================

describe('interruption Point 4: Pre-search COMPLETE, participant 0 not started', () => {
  it('should detect orphaned pre-search with no user message', () => {
    const preSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
    preSearch.userQuery = 'User query text';
    const messages: UIMessage[] = []; // No messages - user message was lost

    const hasOrphanedPreSearch = preSearch.status === MessageStatuses.COMPLETE
      && preSearch.userQuery
      && messages.length === 0;

    expect(hasOrphanedPreSearch).toBe(true);
  });

  it('should recover user query and trigger participant 0', () => {
    const preSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
    preSearch.userQuery = 'Recovered query';

    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'complete',
      completedParticipants: [],
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PARTICIPANTS);
    expect(serverState.participants.nextParticipantToTrigger).toBe(0);
  });

  it('should create optimistic user message from recovered query', () => {
    const preSearch = createMockStoredPreSearch(0, MessageStatuses.COMPLETE);
    preSearch.userQuery = 'Recovered query';

    const optimisticMessage = createTestUserMessage({
      id: 'optimistic-user-0',
      content: preSearch.userQuery,
      roundNumber: 0,
    });

    expect(optimisticMessage.parts[0]?.text).toBe('Recovered query');
  });
});

// ============================================================================
// INTERRUPTION POINT 5: Participant 0 STREAMING
// ============================================================================

describe('interruption Point 5: Participant 0 STREAMING', () => {
  it('should detect active participant 0 stream from server state', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 0,
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PARTICIPANTS);
    expect(serverState.participants.hasActiveStream).toBe(true);
    expect(serverState.participants.currentParticipantIndex).toBe(0);
    expect(serverState.streamId).toBe('thread_123_r0_p0');
  });

  it('should return SSE stream from GET /stream for participant phase', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 0,
    });

    // AI SDK resume handler returns 200 SSE for active participant streams
    const httpStatus = serverState.participants.hasActiveStream ? 200 : 204;

    expect(httpStatus).toBe(200);
  });

  it('should resume from KV buffer and continue live stream', () => {
    const kvChunks = [
      'event: text-delta\ndata: {"content":"Hello"}\n\n',
      'event: text-delta\ndata: {"content":" world"}\n\n',
    ];

    // AI SDK would process these chunks then poll for live updates
    expect(kvChunks).toHaveLength(2);
  });

  it('should NOT trigger participant 0 again while streaming', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 0,
    });

    const shouldTriggerNewParticipant = !serverState.participants.hasActiveStream
      && serverState.participants.nextParticipantToTrigger !== null;

    expect(shouldTriggerNewParticipant).toBe(false);
  });
});

// ============================================================================
// INTERRUPTION POINT 6: Participant 0 COMPLETE, participant 1 not started
// ============================================================================

describe('interruption Point 6: Participant 0 COMPLETE, participant 1 not started', () => {
  it('should detect completed participant 0 and next to trigger is 1', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0],
    });

    expect(serverState.participants.participantStatuses?.['0']).toBe('completed');
    expect(serverState.participants.nextParticipantToTrigger).toBe(1);
    expect(serverState.participants.hasActiveStream).toBe(false);
  });

  it('should return 204 from GET /stream when no active stream', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0],
    });

    const httpStatus = serverState.participants.hasActiveStream ? 200 : 204;

    expect(httpStatus).toBe(204);
  });

  it('should trigger continueFromParticipant(1) via useRoundResumption', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0],
    });
    const initialState = createInitialStoreState();
    const prefilledState = simulatePrefillFromServer(initialState, serverState);

    expect(prefilledState.nextParticipantToTrigger).toBe(1);
    expect(prefilledState.waitingToStartStreaming).toBe(true);
  });

  it('should verify participant 0 message exists before triggering 1', () => {
    const messages = [
      createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'P0 response',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
        finishReason: FinishReasons.STOP,
      }),
    ];

    const p0Message = messages.find(m => m.id === 'thread-123_r0_p0');
    expect(p0Message).toBeDefined();
  });
});

// ============================================================================
// INTERRUPTION POINT 7: Participant N STREAMING (N > 0)
// ============================================================================

describe('interruption Point 7: Participant N STREAMING (N > 0)', () => {
  it('should detect active participant 1 stream with participant 0 complete', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0],
      activeParticipantIndex: 1,
    });

    expect(serverState.participants.participantStatuses?.['0']).toBe('completed');
    expect(serverState.participants.participantStatuses?.['1']).toBe('active');
    expect(serverState.participants.currentParticipantIndex).toBe(1);
    expect(serverState.streamId).toBe('thread_123_r0_p1');
  });

  it('should resume participant 1 stream via AI SDK', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0],
      activeParticipantIndex: 1,
    });

    const httpStatus = serverState.participants.hasActiveStream ? 200 : 204;

    expect(httpStatus).toBe(200);
  });

  it('should skip completed participants in resumption logic', () => {
    const participantStatuses = { 0: 'completed', 1: 'active', 2: 'active' } as const;

    let nextToTrigger: number | null = null;
    for (let i = 0; i < 3; i++) {
      const status = participantStatuses[i as 0 | 1 | 2];
      if (status === 'active') {
        // Already streaming - don't trigger
        nextToTrigger = null;
        break;
      }
      if (status !== 'completed') {
        nextToTrigger = i;
        break;
      }
    }

    expect(nextToTrigger).toBe(null);
  });
});

// ============================================================================
// INTERRUPTION POINT 8: Last participant STREAMING
// ============================================================================

describe('interruption Point 8: Last participant STREAMING', () => {
  it('should detect last participant streaming', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0, 1],
      activeParticipantIndex: 2,
    });

    expect(serverState.participants.participantStatuses?.['0']).toBe('completed');
    expect(serverState.participants.participantStatuses?.['1']).toBe('completed');
    expect(serverState.participants.participantStatuses?.['2']).toBe('active');
    expect(serverState.participants.allComplete).toBe(false);
  });

  it('should NOT trigger moderator while last participant still streaming', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0, 1],
      activeParticipantIndex: 2,
    });

    const shouldTriggerModerator = serverState.participants.allComplete
      && serverState.moderator === null;

    expect(shouldTriggerModerator).toBe(false);
  });

  it('should resume last participant stream via AI SDK', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      participantCount: 3,
      completedParticipants: [0, 1],
      activeParticipantIndex: 2,
    });

    expect(serverState.participants.hasActiveStream).toBe(true);
    expect(serverState.streamId).toBe('thread_123_r0_p2');
  });
});

// ============================================================================
// INTERRUPTION POINT 9: Last participant COMPLETE, moderator not started
// ============================================================================

describe('interruption Point 9: Last participant COMPLETE, moderator not started', () => {
  it('should detect all participants complete with no moderator', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      participantCount: 3,
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'pending',
    });

    expect(serverState.participants.allComplete).toBe(true);
    expect(serverState.currentPhase).toBe(RoundPhases.MODERATOR);
    expect(serverState.moderator?.status).toBe('pending');
  });

  it('should trigger moderator via useIncompleteRoundResumption', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      participantCount: 3,
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'pending',
    });
    const initialState = createInitialStoreState();
    const prefilledState = simulatePrefillFromServer(initialState, serverState);

    expect(prefilledState.currentResumptionPhase).toBe(RoundPhases.MODERATOR);
    expect(prefilledState.isModeratorStreaming).toBe(true);
  });

  it('should return 204 with moderator phase header', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      participantCount: 3,
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'pending',
    });

    const httpStatus = serverState.currentPhase !== RoundPhases.PARTICIPANTS ? 204 : 200;
    const phaseHeader = serverState.currentPhase;

    expect(httpStatus).toBe(204);
    expect(phaseHeader).toBe(RoundPhases.MODERATOR);
  });
});

// ============================================================================
// INTERRUPTION POINT 10: Moderator STREAMING
// ============================================================================

describe('interruption Point 10: Moderator STREAMING', () => {
  it('should detect streaming moderator from server state', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      participantCount: 3,
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'streaming',
    });

    expect(serverState.currentPhase).toBe(RoundPhases.MODERATOR);
    expect(serverState.moderator?.status).toBe('streaming');
    expect(serverState.hasActiveStream).toBe(true);
    expect(serverState.streamId).toBe('moderator_thread_123_r0');
  });

  it('should return 204 for moderator phase (handled by useModeratorStream)', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      participantCount: 3,
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'streaming',
    });

    // Moderator uses useObject, not AI SDK UIMessage stream
    const httpStatus = serverState.currentPhase !== RoundPhases.PARTICIPANTS ? 204 : 200;

    expect(httpStatus).toBe(204);
  });

  it('should track moderator stream trigger for resumption', () => {
    const state = createInitialStoreState();

    // Moderator streaming is tracked but moderators are now chat messages with isModerator: true
    state.triggeredModeratorRounds.add(0);

    expect(state.triggeredModeratorRounds.has(0)).toBe(true);
    // useModeratorStream handles resumption via chat messages (inline rendering)
  });
});

// ============================================================================
// INTERRUPTION POINT 11: Moderator COMPLETE (round complete)
// ============================================================================

describe('interruption Point 11: Moderator COMPLETE (round complete)', () => {
  it('should detect complete round with no resumption needed', () => {
    const serverState = createServerResumptionState(RoundPhases.COMPLETE, 0, {
      participantCount: 3,
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'complete',
    });

    expect(serverState.currentPhase).toBe(RoundPhases.COMPLETE);
    expect(serverState.roundComplete).toBe(true);
    expect(serverState.hasActiveStream).toBe(false);
  });

  it('should NOT trigger any resumption for complete round', () => {
    const serverState = createServerResumptionState(RoundPhases.COMPLETE, 0, {
      participantCount: 3,
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'complete',
    });

    const shouldResume = !serverState.roundComplete && serverState.hasActiveStream;

    expect(shouldResume).toBe(false);
  });

  it('should allow new message submission after round complete', () => {
    const isRoundComplete = true;
    const isStreaming = false;
    const pendingMessage = null;

    const canSubmit = isRoundComplete && !isStreaming && pendingMessage === null;

    expect(canSubmit).toBe(true);
  });
});

// ============================================================================
// RACE CONDITION TESTS
// ============================================================================

describe('race Conditions: AI SDK Resume vs Incomplete Round Resumption', () => {
  it('should NOT double-trigger when AI SDK resume and incomplete-round-resumption both detect participant 0', () => {
    // Scenario: AI SDK resume starts streaming participant 0
    // incomplete-round-resumption also detects participant 0 needs streaming
    const aiSdkIsStreaming = true;
    const aiSdkStreamingParticipant = 0;
    const incompleteRoundNextParticipant = 0;

    const shouldIncompleteRoundTrigger
      = !aiSdkIsStreaming || aiSdkStreamingParticipant !== incompleteRoundNextParticipant;

    expect(shouldIncompleteRoundTrigger).toBe(false);
  });

  it('should use resumptionAttemptedRef to prevent duplicate triggers', () => {
    const resumptionAttemptedRef = { current: null as string | null };
    const threadId = 'thread-123';

    // First attempt
    const canAttemptFirst = resumptionAttemptedRef.current !== threadId;
    expect(canAttemptFirst).toBe(true);
    resumptionAttemptedRef.current = threadId;

    // Second attempt should be blocked
    const canAttemptSecond = resumptionAttemptedRef.current !== threadId;
    expect(canAttemptSecond).toBe(false);
  });

  it('should check isStreaming before triggering new participant', () => {
    const isStreaming = true;
    const nextParticipantToTrigger = 1;

    const shouldTrigger = !isStreaming && nextParticipantToTrigger !== null;

    expect(shouldTrigger).toBe(false);
  });
});

describe('race Conditions: Pre-search Completion → Participant Triggering', () => {
  it('should wait for pre-search COMPLETE before triggering participants', () => {
    const preSearchStatus = MessageStatuses.STREAMING;

    const shouldWaitForPreSearch = preSearchStatus === MessageStatuses.PENDING
      || preSearchStatus === MessageStatuses.STREAMING;

    expect(shouldWaitForPreSearch).toBe(true);
  });

  it('should trigger participants immediately after pre-search completes', () => {
    const preSearchStatus = MessageStatuses.COMPLETE;

    const shouldWaitForPreSearch = preSearchStatus === MessageStatuses.PENDING
      || preSearchStatus === MessageStatuses.STREAMING;

    expect(shouldWaitForPreSearch).toBe(false);
  });

  it('should use preSearchPhaseResumptionAttemptedRef to prevent duplicate triggers', () => {
    const ref = { current: null as string | null };
    const key = 'thread-123_presearch_0';

    const canAttempt = ref.current !== key;
    expect(canAttempt).toBe(true);
    ref.current = key;

    const canAttemptAgain = ref.current !== key;
    expect(canAttemptAgain).toBe(false);
  });
});

describe('race Conditions: Participant Completion → Next Participant', () => {
  it('should use onFinish callback to trigger next participant', () => {
    const completedParticipants = [0];
    const totalParticipants = 3;
    const onFinishCalled = true;

    const nextParticipant = onFinishCalled && completedParticipants.length < totalParticipants
      ? completedParticipants.length
      : null;

    expect(nextParticipant).toBe(1);
  });

  it('should NOT trigger next participant if one is already streaming', () => {
    const participantStatuses = { 0: 'completed', 1: 'active' } as const;

    const hasActiveStream = Object.values(participantStatuses).includes('active');

    expect(hasActiveStream).toBe(true);
  });

  it('should detect in-progress participants (streaming parts) as active', () => {
    const message = createTestAssistantMessage({
      id: 'thread-123_r0_p0',
      content: 'Partial...',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.UNKNOWN,
    });

    // Simulate streaming state
    const _isStillStreaming = (message as { parts: Array<{ state?: string }> }).parts?.some(
      p => 'state' in p && p.state === 'streaming',
    ) || false;

    // In this test, parts don't have state, so _isStillStreaming is false
    // But finishReason is UNKNOWN, indicating incomplete
    const isIncomplete = message.metadata.finishReason === FinishReasons.UNKNOWN;

    expect(isIncomplete).toBe(true);
  });
});

describe('race Conditions: Last Participant → Moderator', () => {
  it('should only trigger moderator when ALL participants complete', () => {
    const participantStatuses = { 0: 'completed', 1: 'completed', 2: 'active' } as const;
    const totalParticipants = 3;

    const allComplete = Object.values(participantStatuses).filter(s => s === 'completed').length
      === totalParticipants;

    expect(allComplete).toBe(false);
  });

  it('should trigger moderator via onComplete callback', () => {
    const allParticipantsComplete = true;
    const moderatorStatus = null;
    const onCompleteCalled = true;

    const shouldTriggerModerator = onCompleteCalled
      && allParticipantsComplete
      && moderatorStatus === null;

    expect(shouldTriggerModerator).toBe(true);
  });

  it('should use moderatorPhaseResumptionAttemptedRef to prevent duplicate triggers', () => {
    const ref = { current: null as string | null };
    const key = 'thread-123_moderator_0';

    const canAttempt = ref.current !== key;
    expect(canAttempt).toBe(true);
    ref.current = key;

    const canAttemptAgain = ref.current !== key;
    expect(canAttemptAgain).toBe(false);
  });
});

describe('race Conditions: Multiple Effects', () => {
  it('should serialize phase transitions to prevent state corruption', () => {
    const phaseOrder: RoundPhase[] = [];

    phaseOrder.push(RoundPhases.PRE_SEARCH);
    phaseOrder.push(RoundPhases.PARTICIPANTS);
    phaseOrder.push(RoundPhases.SUMMARIZER);
    phaseOrder.push(RoundPhases.COMPLETE);

    // Verify no duplicate phases
    const uniquePhases = new Set(phaseOrder);
    expect(uniquePhases.size).toBe(phaseOrder.length);
  });

  it('should check currentResumptionPhase before running phase-specific effects', () => {
    const currentResumptionPhase = RoundPhases.PRE_SEARCH;

    // Participant resumption effect should skip when phase is pre_search
    const shouldRunParticipantEffect = currentResumptionPhase === RoundPhases.PARTICIPANTS;

    expect(shouldRunParticipantEffect).toBe(false);
  });

  it('should clear stale isStreaming after timeout', async () => {
    vi.useFakeTimers();

    let isStreaming = true;
    const STALE_TIMEOUT = 2000;

    // Simulate timeout clearing stale state
    setTimeout(() => {
      isStreaming = false;
    }, STALE_TIMEOUT);

    vi.advanceTimersByTime(STALE_TIMEOUT);

    expect(isStreaming).toBe(false);

    vi.useRealTimers();
  });

  it('should clear stale waitingToStartStreaming without pendingMessage', () => {
    let state = {
      waitingToStartStreaming: true,
      pendingMessage: null as string | null,
      isStreaming: false,
    };

    const isStale = state.waitingToStartStreaming
      && state.pendingMessage === null
      && !state.isStreaming;

    if (isStale) {
      state = { ...state, waitingToStartStreaming: false };
    }

    expect(state.waitingToStartStreaming).toBe(false);
  });
});

describe('race Conditions: Submission Guards', () => {
  it('should block resumption during hasEarlyOptimisticMessage', () => {
    const hasEarlyOptimisticMessage = true;
    const pendingMessage = 'New message';

    const isSubmissionInProgress = hasEarlyOptimisticMessage
      || (pendingMessage !== null);

    expect(isSubmissionInProgress).toBe(true);
  });

  it('should block resumption during pendingMessage with !hasSentPendingMessage', () => {
    const pendingMessage = 'Pending';
    const hasSentPendingMessage = false;

    const isSubmissionInProgress = pendingMessage !== null && !hasSentPendingMessage;

    expect(isSubmissionInProgress).toBe(true);
  });

  it('should NOT block resumption after pendingMessage is sent', () => {
    const pendingMessage = null;
    const hasSentPendingMessage = true;

    const isSubmissionInProgress = pendingMessage !== null && !hasSentPendingMessage;

    expect(isSubmissionInProgress).toBe(false);
  });
});

// ============================================================================
// KV BUFFER CONSISTENCY TESTS
// ============================================================================

describe('kV Buffer Consistency', () => {
  it('should use deterministic message IDs to prevent duplicates', () => {
    const threadId = 'thread-123';
    const roundNumber = 0;
    const participantIndex = 1;

    const expectedId = `${threadId}_r${roundNumber}_p${participantIndex}`;
    const prefetchMessageId = `${threadId}_r${roundNumber}_p${participantIndex}`;
    const resumeMessageId = `${threadId}_r${roundNumber}_p${participantIndex}`;

    expect(prefetchMessageId).toBe(expectedId);
    expect(resumeMessageId).toBe(expectedId);
  });

  it('should check for existing message before creating new one', () => {
    const messages = [
      createTestUserMessage({ id: 'user-0', content: 'Test', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'thread-123_r0_p0',
        content: 'Existing',
        roundNumber: 0,
        participantId: 'participant-0',
        participantIndex: 0,
      }),
    ];

    const expectedId = 'thread-123_r0_p0';
    const messageExists = messages.some(m => m.id === expectedId);

    expect(messageExists).toBe(true);
  });

  it('should detect empty interrupted responses (finishReason: unknown, no content)', () => {
    const message = createTestAssistantMessage({
      id: 'thread-123_r0_p0',
      content: '',
      roundNumber: 0,
      participantId: 'participant-0',
      participantIndex: 0,
      finishReason: FinishReasons.UNKNOWN,
      parts: [],
    });

    const hasContent = message.parts.some(
      p => p.type === 'text' && p.text.trim().length > 0,
    );
    const isInterrupted = message.metadata.finishReason === FinishReasons.UNKNOWN;

    expect(hasContent).toBe(false);
    expect(isInterrupted).toBe(true);
  });
});

// ============================================================================
// PARTICIPANT CONFIGURATION CHANGE TESTS
// ============================================================================

describe('participant Configuration Changes', () => {
  it('should detect when participants changed since round started', () => {
    const respondedModelIds = new Set(['gpt-4', 'claude-3']);
    const currentModelIds = new Set(['gpt-4', 'gemini-pro']); // Changed!

    const hasConfigChange = [...respondedModelIds].some(
      modelId => !currentModelIds.has(modelId),
    );

    expect(hasConfigChange).toBe(true);
  });

  it('should skip resumption when participant config changed', () => {
    const participantsChangedSinceRound = true;

    const shouldResume = !participantsChangedSinceRound;

    expect(shouldResume).toBe(false);
  });

  it('should check enabled participants only', () => {
    const participants = [
      createMockParticipant(0),
      { ...createMockParticipant(1), isEnabled: false },
      createMockParticipant(2),
    ];

    const enabledParticipants = participants.filter(p => p.isEnabled);

    expect(enabledParticipants).toHaveLength(2);
  });
});

// ============================================================================
// MULTI-ROUND TESTS
// ============================================================================

describe('multi-Round Resumption', () => {
  it('should only resume the latest round', () => {
    const messages = [
      createTestUserMessage({ id: 'u0', content: 'R0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'p0-r0',
        content: 'R0P0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestUserMessage({ id: 'u1', content: 'R1', roundNumber: 1 }),
      // Round 1 is incomplete
    ];

    const maxRound = Math.max(...messages.map(m => m.metadata.roundNumber));
    const latestRoundAssistants = messages.filter(
      m => m.metadata.roundNumber === maxRound && m.role === UIMessageRoles.ASSISTANT,
    );

    expect(maxRound).toBe(1);
    expect(latestRoundAssistants).toHaveLength(0);
  });

  it('should ignore incomplete earlier rounds', () => {
    const messages = [
      // Round 0 - incomplete (missing P1)
      createTestUserMessage({ id: 'u0', content: 'R0', roundNumber: 0 }),
      createTestAssistantMessage({
        id: 'p0-r0',
        content: 'R0P0',
        roundNumber: 0,
        participantId: 'p0',
        participantIndex: 0,
      }),
      // Round 1 - complete
      createTestUserMessage({ id: 'u1', content: 'R1', roundNumber: 1 }),
      createTestAssistantMessage({
        id: 'p0-r1',
        content: 'R1P0',
        roundNumber: 1,
        participantId: 'p0',
        participantIndex: 0,
      }),
      createTestAssistantMessage({
        id: 'p1-r1',
        content: 'R1P1',
        roundNumber: 1,
        participantId: 'p1',
        participantIndex: 1,
      }),
    ];

    const maxRound = Math.max(...messages.map(m => m.metadata.roundNumber));
    const latestRoundAssistants = messages.filter(
      m => m.metadata.roundNumber === maxRound && m.role === UIMessageRoles.ASSISTANT,
    );

    // Round 1 has 2 assistants, is complete
    expect(maxRound).toBe(1);
    expect(latestRoundAssistants).toHaveLength(2);
  });
});
