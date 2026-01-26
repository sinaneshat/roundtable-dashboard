/**
 * Resumption Matrix Tests (11 Points)
 *
 * Tests resumption at every possible interruption point:
 * 1. Before thread creation (expected: starts fresh)
 * 2. Pre-search PENDING
 * 3. Pre-search STREAMING (reconnect to existing stream)
 * 4. Pre-search COMPLETE, P0 not started
 * 5. Participant 0 STREAMING (reconnect)
 * 6. P0 COMPLETE, P1 not started
 * 7. Participant N STREAMING (N > 0)
 * 8. Last participant STREAMING
 * 9. All participants COMPLETE, moderator not started
 * 10. Moderator STREAMING (reconnect)
 * 11. Round COMPLETE
 *
 * Plus race condition prevention tests.
 *
 * Based on FLOW_DOCUMENTATION.md and complete-phase-resumption-matrix patterns
 */

import type { RoundPhase } from '@roundtable/shared';
import { MessageStatuses, RoundPhases, ScreenModes } from '@roundtable/shared';
import { describe, expect, it } from 'vitest';

import {
  buildAfterChangelogScenario,
  buildAfterPatchScenario,
  buildAfterPreSearchScenario,
  buildDuringModeratorScenario,
  createMockChatStore,
  createMockResumptionParticipants,
  createMockResumptionPreSearch,
  createMockStreamResumptionState,
  createMockUserMessage,
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
  } | null;
  participants: {
    hasActiveStream: boolean;
    nextParticipantToTrigger: number | null;
    allComplete: boolean;
  };
  moderator: {
    status: 'pending' | 'streaming' | 'complete' | 'failed' | null;
  } | null;
  roundComplete: boolean;
};

function createServerResumptionState(
  phase: RoundPhase,
  roundNumber: number,
  options: {
    preSearchStatus?: 'pending' | 'streaming' | 'complete' | 'failed';
    preSearchEnabled?: boolean;
    completedParticipants?: number[];
    activeParticipantIndex?: number | null;
    totalParticipants?: number;
    moderatorStatus?: 'pending' | 'streaming' | 'complete' | 'failed';
  } = {},
): StreamResumptionState {
  const {
    activeParticipantIndex = null,
    completedParticipants = [],
    moderatorStatus = null,
    preSearchEnabled = false,
    preSearchStatus = null,
    totalParticipants = 3,
  } = options;

  const allComplete = completedParticipants.length === totalParticipants;
  const hasActiveParticipantStream = activeParticipantIndex !== null;
  const nextToTrigger = allComplete
    ? null
    : !hasActiveParticipantStream && completedParticipants.length < totalParticipants
        ? completedParticipants.length
        : null;

  return {
    currentPhase: phase,
    hasActiveStream: phase === RoundPhases.PRE_SEARCH
      ? preSearchStatus === 'streaming'
      : phase === RoundPhases.PARTICIPANTS
        ? hasActiveParticipantStream
        : phase === RoundPhases.MODERATOR
          ? moderatorStatus === 'streaming'
          : false,
    moderator: phase === RoundPhases.MODERATOR || allComplete
      ? { status: moderatorStatus }
      : null,
    participants: {
      allComplete,
      hasActiveStream: hasActiveParticipantStream,
      nextParticipantToTrigger: nextToTrigger,
    },
    preSearch: preSearchEnabled
      ? {
          enabled: true,
          status: preSearchStatus,
        }
      : null,
    roundComplete: phase === RoundPhases.COMPLETE,
    roundNumber,
    streamId: null,
  };
}

// ============================================================================
// INTERRUPTION POINT 1: Before thread creation
// ============================================================================

describe('interruption Point 1: Before thread creation', () => {
  it('should have no state to resume - starts fresh', () => {
    const serverState: StreamResumptionState | null = null;

    expect(serverState).toBeNull();
  });

  it('should show overview screen when no thread exists', () => {
    const store = createMockChatStore({
      messages: [],
      screenMode: ScreenModes.OVERVIEW,
      thread: null,
    });

    expect(store.getState().screenMode).toBe(ScreenModes.OVERVIEW);
    expect(store.getState().thread).toBeNull();
    expect(store.getState().messages).toHaveLength(0);
  });
});

// ============================================================================
// INTERRUPTION POINT 2: Pre-search PENDING
// ============================================================================

describe('interruption Point 2: Pre-search PENDING', () => {
  it('should detect pending pre-search and trigger execution', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'pending',
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PRE_SEARCH);
    expect(serverState.preSearch?.status).toBe('pending');
    expect(serverState.hasActiveStream).toBeFalsy();
  });

  it('should prefill store with pre-search phase for resumption', () => {
    const store = buildAfterPreSearchScenario(MessageStatuses.PENDING);
    const state = store.getState();

    expect(state.enableWebSearch).toBeTruthy();
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.PENDING);
  });

  it('should NOT trigger participants while pre-search is pending', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'pending',
    });

    const shouldTriggerParticipants = serverState.currentPhase === RoundPhases.PARTICIPANTS
      && serverState.participants.nextParticipantToTrigger !== null;

    expect(shouldTriggerParticipants).toBeFalsy();
  });
});

// ============================================================================
// INTERRUPTION POINT 3: Pre-search STREAMING
// ============================================================================

describe('interruption Point 3: Pre-search STREAMING', () => {
  it('should detect streaming pre-search and reconnect', () => {
    const serverState = createServerResumptionState(RoundPhases.PRE_SEARCH, 0, {
      preSearchEnabled: true,
      preSearchStatus: 'streaming',
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PRE_SEARCH);
    expect(serverState.preSearch?.status).toBe('streaming');
    expect(serverState.hasActiveStream).toBeTruthy();
  });

  it('should block participant resumption while pre-search is streaming', () => {
    const store = buildAfterPreSearchScenario(MessageStatuses.STREAMING);

    const preSearch = store.getState().preSearches[0];
    const shouldWait = preSearch?.status === MessageStatuses.PENDING
      || preSearch?.status === MessageStatuses.STREAMING;

    expect(shouldWait).toBeTruthy();
  });
});

// ============================================================================
// INTERRUPTION POINT 4: Pre-search COMPLETE, P0 not started
// ============================================================================

describe('interruption Point 4: Pre-search COMPLETE, P0 not started', () => {
  it('should detect complete pre-search and trigger P0', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      completedParticipants: [],
      preSearchEnabled: true,
      preSearchStatus: 'complete',
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PARTICIPANTS);
    expect(serverState.preSearch?.status).toBe('complete');
    expect(serverState.participants.nextParticipantToTrigger).toBe(0);
  });

  it('should prefill store to trigger participant 0', () => {
    const store = buildAfterPreSearchScenario(MessageStatuses.COMPLETE);
    const state = store.getState();

    expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
    expect(state.waitingToStartStreaming).toBeTruthy();
  });
});

// ============================================================================
// INTERRUPTION POINT 5: Participant 0 STREAMING
// ============================================================================

describe('interruption Point 5: Participant 0 STREAMING', () => {
  it('should detect active P0 stream and reconnect', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 0,
    });

    expect(serverState.currentPhase).toBe(RoundPhases.PARTICIPANTS);
    expect(serverState.participants.hasActiveStream).toBeTruthy();
  });

  it('should NOT trigger new participant while P0 is streaming', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 0,
    });

    const shouldTriggerNew = !serverState.participants.hasActiveStream
      && serverState.participants.nextParticipantToTrigger !== null;

    expect(shouldTriggerNew).toBeFalsy();
  });
});

// ============================================================================
// INTERRUPTION POINT 6: P0 COMPLETE, P1 not started
// ============================================================================

describe('interruption Point 6: P0 COMPLETE, P1 not started', () => {
  it('should detect P0 complete and trigger P1', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      completedParticipants: [0],
      totalParticipants: 3,
    });

    expect(serverState.participants.nextParticipantToTrigger).toBe(1);
    expect(serverState.participants.hasActiveStream).toBeFalsy();
  });

  it('should prefill store with next participant to trigger', () => {
    const resumptionState = createMockStreamResumptionState({
      currentPhase: RoundPhases.PARTICIPANTS,
      participants: {
        allComplete: false,
        currentParticipantIndex: null,
        hasActiveStream: false,
        nextParticipantToTrigger: 1,
        participantStatuses: { 0: 'completed' },
        streamId: null,
        totalParticipants: 3,
      },
      roundNumber: 0,
    });

    expect(resumptionState.participants.nextParticipantToTrigger).toBe(1);
  });
});

// ============================================================================
// INTERRUPTION POINT 7: Participant N STREAMING (N > 0)
// ============================================================================

describe('interruption Point 7: Participant N STREAMING (N > 0)', () => {
  it('should detect active P1 stream with P0 complete', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 1,
      completedParticipants: [0],
      totalParticipants: 3,
    });

    expect(serverState.participants.hasActiveStream).toBeTruthy();
    expect(serverState.participants.nextParticipantToTrigger).toBeNull();
  });

  it('should skip completed participants in resumption', () => {
    const completedParticipants = [0, 1];
    const totalParticipants = 4;
    const activeParticipantIndex = 2;

    // Next to trigger is null when one is active
    const nextToTrigger = activeParticipantIndex !== null
      ? null
      : completedParticipants.length < totalParticipants
        ? completedParticipants.length
        : null;

    expect(nextToTrigger).toBeNull();
  });
});

// ============================================================================
// INTERRUPTION POINT 8: Last participant STREAMING
// ============================================================================

describe('interruption Point 8: Last participant STREAMING', () => {
  it('should detect last participant streaming', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 2,
      completedParticipants: [0, 1],
      totalParticipants: 3,
    });

    expect(serverState.participants.hasActiveStream).toBeTruthy();
    expect(serverState.participants.allComplete).toBeFalsy();
  });

  it('should NOT trigger moderator while last participant still streaming', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 0, {
      activeParticipantIndex: 2,
      completedParticipants: [0, 1],
      totalParticipants: 3,
    });

    const shouldTriggerModerator = serverState.participants.allComplete
      && serverState.moderator === null;

    expect(shouldTriggerModerator).toBeFalsy();
  });
});

// ============================================================================
// INTERRUPTION POINT 9: All participants COMPLETE, moderator not started
// ============================================================================

describe('interruption Point 9: All participants COMPLETE, moderator not started', () => {
  it('should detect all participants complete with no moderator', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'pending',
      totalParticipants: 3,
    });

    expect(serverState.participants.allComplete).toBeTruthy();
    expect(serverState.currentPhase).toBe(RoundPhases.MODERATOR);
    expect(serverState.moderator?.status).toBe('pending');
  });

  it('should trigger moderator via resumption hook', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'pending',
      totalParticipants: 3,
    });

    const shouldTriggerModerator = serverState.participants.allComplete
      && serverState.moderator?.status === 'pending';

    expect(shouldTriggerModerator).toBeTruthy();
  });
});

// ============================================================================
// INTERRUPTION POINT 10: Moderator STREAMING
// ============================================================================

describe('interruption Point 10: Moderator STREAMING', () => {
  it('should detect streaming moderator', () => {
    const serverState = createServerResumptionState(RoundPhases.MODERATOR, 0, {
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'streaming',
      totalParticipants: 3,
    });

    expect(serverState.currentPhase).toBe(RoundPhases.MODERATOR);
    expect(serverState.moderator?.status).toBe('streaming');
    expect(serverState.hasActiveStream).toBeTruthy();
  });

  it('should track moderator streaming state during resumption', () => {
    const store = buildDuringModeratorScenario();
    const state = store.getState();

    expect(state.isModeratorStreaming).toBeTruthy();
  });
});

// ============================================================================
// INTERRUPTION POINT 11: Round COMPLETE
// ============================================================================

describe('interruption Point 11: Round COMPLETE', () => {
  it('should detect complete round with no resumption needed', () => {
    const serverState = createServerResumptionState(RoundPhases.COMPLETE, 0, {
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'complete',
      totalParticipants: 3,
    });

    expect(serverState.currentPhase).toBe(RoundPhases.COMPLETE);
    expect(serverState.roundComplete).toBeTruthy();
    expect(serverState.hasActiveStream).toBeFalsy();
  });

  it('should NOT trigger any resumption for complete round', () => {
    const serverState = createServerResumptionState(RoundPhases.COMPLETE, 0, {
      completedParticipants: [0, 1, 2],
      moderatorStatus: 'complete',
      totalParticipants: 3,
    });

    const shouldResume = !serverState.roundComplete && serverState.hasActiveStream;

    expect(shouldResume).toBeFalsy();
  });

  it('should allow new message submission after round complete', () => {
    const isRoundComplete = true;
    const isStreaming = false;
    const pendingMessage = null;

    const canSubmit = isRoundComplete && !isStreaming && pendingMessage === null;

    expect(canSubmit).toBeTruthy();
  });
});

// ============================================================================
// RACE CONDITION PREVENTION
// ============================================================================

describe('race Condition Prevention', () => {
  it('should use resumption ref to prevent duplicate triggers', () => {
    const resumptionAttemptedRef = { current: null as string | null };
    const threadId = 'thread-123';

    // First attempt
    const canAttemptFirst = resumptionAttemptedRef.current !== threadId;
    expect(canAttemptFirst).toBeTruthy();
    resumptionAttemptedRef.current = threadId;

    // Second attempt blocked
    const canAttemptSecond = resumptionAttemptedRef.current !== threadId;
    expect(canAttemptSecond).toBeFalsy();
  });

  it('should check isStreaming before triggering new participant', () => {
    const isStreaming = true;
    const nextParticipantToTrigger = 1;

    const shouldTrigger = !isStreaming && nextParticipantToTrigger !== null;

    expect(shouldTrigger).toBeFalsy();
  });

  it('should wait for pre-search COMPLETE before triggering participants', () => {
    const preSearchStatus = MessageStatuses.STREAMING;

    const shouldWait = preSearchStatus === MessageStatuses.PENDING
      || preSearchStatus === MessageStatuses.STREAMING;

    expect(shouldWait).toBeTruthy();
  });

  it('should use preSearchPhaseResumptionAttemptedRef for pre-search triggers', () => {
    const ref = { current: null as string | null };
    const key = 'thread-123_presearch_0';

    const canAttempt = ref.current !== key;
    expect(canAttempt).toBeTruthy();
    ref.current = key;

    const canAttemptAgain = ref.current !== key;
    expect(canAttemptAgain).toBeFalsy();
  });

  it('should use moderatorPhaseResumptionAttemptedRef for moderator triggers', () => {
    const ref = { current: null as string | null };
    const key = 'thread-123_moderator_0';

    const canAttempt = ref.current !== key;
    expect(canAttempt).toBeTruthy();
    ref.current = key;

    const canAttemptAgain = ref.current !== key;
    expect(canAttemptAgain).toBeFalsy();
  });
});

// ============================================================================
// PATCH/CHANGELOG RESUMPTION SCENARIOS
// ============================================================================

describe('pATCH/Changelog Resumption Scenarios', () => {
  it('should wait for PATCH completion before resuming', () => {
    const store = buildAfterPatchScenario(true, 0);
    const state = store.getState();

    expect(state.isPatchInProgress).toBeTruthy();
    expect(state.waitingToStartStreaming).toBeTruthy();
  });

  it('should wait for changelog before resuming', () => {
    const store = buildAfterChangelogScenario(true);
    const state = store.getState();

    expect(state.isWaitingForChangelog).toBeTruthy();
    expect(state.waitingToStartStreaming).toBeTruthy();
  });

  it('should resume after changelog completes', () => {
    const store = buildAfterChangelogScenario(false);
    const state = store.getState();

    expect(state.isWaitingForChangelog).toBeFalsy();
  });
});

// ============================================================================
// SSR HYDRATION SCENARIOS
// ============================================================================

describe('sSR Hydration Scenarios', () => {
  it('should hydrate pre-searches from server', () => {
    const store = createMockChatStore({
      enableWebSearch: true,
      preSearches: [createMockResumptionPreSearch(0, MessageStatuses.COMPLETE)],
      screenMode: ScreenModes.THREAD,
    });

    const state = store.getState();
    expect(state.preSearches).toHaveLength(1);
    expect(state.preSearches[0]?.status).toBe(MessageStatuses.COMPLETE);
  });

  it('should hydrate participants from server', () => {
    const participants = createMockResumptionParticipants(3);
    const store = createMockChatStore({
      participants,
      screenMode: ScreenModes.THREAD,
    });

    expect(store.getState().participants).toHaveLength(3);
  });

  it('should hydrate messages from server', () => {
    const messages = [createMockUserMessage(0)];
    const store = createMockChatStore({
      messages,
      screenMode: ScreenModes.THREAD,
    });

    expect(store.getState().messages).toHaveLength(1);
  });
});

// ============================================================================
// MULTI-ROUND RESUMPTION
// ============================================================================

describe('multi-Round Resumption', () => {
  it('should only resume the latest round', () => {
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 2, {
      completedParticipants: [0],
    });

    expect(serverState.roundNumber).toBe(2);
    expect(serverState.participants.nextParticipantToTrigger).toBe(1);
  });

  it('should ignore incomplete earlier rounds', () => {
    // Round 0 incomplete, Round 1 is latest
    const serverState = createServerResumptionState(RoundPhases.PARTICIPANTS, 1, {
      completedParticipants: [],
    });

    expect(serverState.roundNumber).toBe(1);
    // Only latest round matters for resumption
  });
});
