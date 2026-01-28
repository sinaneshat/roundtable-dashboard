/**
 * Round Subscription Hook - Backend-First Streaming Architecture
 *
 * Per FLOW_DOCUMENTATION.md:
 * - Frontend SUBSCRIBES and DISPLAYS only
 * - Backend ORCHESTRATES everything (P0 → P1 → ... → Moderator)
 *
 * ============================================================================
 * ARCHITECTURAL PATTERN: Fixed Hook Array with Dynamic Behavior
 * ============================================================================
 *
 * React's rules of hooks require unconditional hook calls. To support up to 10
 * participants while maintaining DRY code, we use:
 *
 * 1. **Tuple-based Hook Registration**: All 10 participant hooks are called
 *    unconditionally but controlled via computed `enabled` flags
 *
 * 2. **Factory Functions**: Callback creation and enabled-state computation
 *    are centralized in reusable functions
 *
 * 3. **Index-based Access**: Arrays and tuples provide O(1) access to any
 *    participant's state by index
 *
 * This pattern aligns with AI SDK resumable streams where each entity is
 * independent and the backend orchestrates execution order.
 *
 * ✅ STAGGERED SUBSCRIPTIONS: Avoids HTTP/1.1 connection exhaustion
 * - Presearch + P0 subscribe immediately (when presearch completes)
 * - P(n+1) subscribes when P(n) COMPLETES (baton passing)
 * - Moderator subscribes when all participants complete
 *
 * ============================================================================
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { rlog } from '@/lib/utils/dev-logger';
import { parseParticipantEntityIndex } from '@/lib/utils/streaming-helpers';

import type { EntitySubscriptionCallbacks, EntitySubscriptionState } from './use-entity-subscription';
import {
  useModeratorSubscription,
  useParticipantSubscription,
  usePreSearchSubscription,
} from './use-entity-subscription';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Participant indices as a tuple for type safety */
const PARTICIPANT_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

// ============================================================================
// TYPES
// ============================================================================

export type EntityType = 'presearch' | `participant_${number}` | 'moderator';

export type RoundSubscriptionState = {
  /** Status of presearch subscription */
  presearch: EntitySubscriptionState;
  /** Status of each participant subscription (indexed by participant index) */
  participants: EntitySubscriptionState[];
  /** Status of moderator subscription */
  moderator: EntitySubscriptionState;
  /** Whether the entire round is complete */
  isRoundComplete: boolean;
  /** Whether any entity is currently streaming */
  hasActiveStream: boolean;
};

/** Initial lastSeq values for stream resumption */
export type InitialLastSeqs = {
  /** Initial lastSeq for presearch stream */
  presearch?: number;
  /** Initial lastSeqs per participant (keyed by index) */
  participants?: Record<string, number>;
  /** Initial lastSeq for moderator stream */
  moderator?: number;
};

export type UseRoundSubscriptionOptions = {
  /** Thread ID to subscribe to */
  threadId: string;
  /** Round number to subscribe to */
  roundNumber: number;
  /** Number of participants (creates this many participant subscriptions) */
  participantCount: number;
  /** Whether pre-search is enabled for this round */
  enablePreSearch: boolean;
  /** Whether subscription is enabled */
  enabled: boolean;
  /** Initial lastSeq values for stream resumption */
  initialLastSeqs?: InitialLastSeqs;
  /**
   * Signal that P0 has completed via AI SDK (not through subscription).
   * When enableWebSearch is false, P0 streams through AI SDK directly,
   * bypassing the subscription system. This flag tells the stagger mechanism
   * to treat P0 as complete so P1 can start.
   */
  aiSdkP0Complete?: boolean;
  /** Called when a text chunk is received from any entity */
  onChunk?: (entity: EntityType, text: string, seq: number) => void;
  /** Called when an entity completes */
  onEntityComplete?: (entity: EntityType, lastSeq: number) => void;
  /** Called when the entire round completes (all entities done) */
  onRoundComplete?: () => void;
  /** Called when an entity errors */
  onEntityError?: (entity: EntityType, error: Error) => void;
  /**
   * Called for presearch-specific events (query, result, start, complete, done)
   *
   * DESIGN NOTE: `data: unknown` is intentional here - this is a PROTOCOL BOUNDARY
   * where SSE data arrives from the server as JSON that must be parsed.
   */
  onPreSearchEvent?: (eventType: string, data: unknown) => void;
};

export type UseRoundSubscriptionReturn = {
  /** Current state of all subscriptions */
  state: RoundSubscriptionState;
  /** Abort all active subscriptions */
  abort: () => void;
  /** Retry a specific entity subscription */
  retryEntity: (entity: EntityType) => void;
};

/** Sequence tracking state for gap detection */
type ExpectedSeqsState = {
  presearch: number;
  participants: Record<string, number>;
  moderator: number;
};

/** Completion-relevant data extracted from EntitySubscriptionState */
type CompletionData = {
  status: EntitySubscriptionState['status'];
  roundNumber: number;
  isStreaming: boolean;
};

// ============================================================================
// HELPER FUNCTIONS (Pure - No Hooks)
// ============================================================================

/**
 * Extracts completion-relevant data from subscription state.
 * Used to create stable dependency arrays for useMemo hooks.
 */
function extractCompletionData(state: EntitySubscriptionState): CompletionData {
  return {
    isStreaming: state.isStreaming,
    roundNumber: state.roundNumber,
    status: state.status,
  };
}

/**
 * Computes whether a participant subscription should be enabled.
 *
 * @param index - Participant index (0-9)
 * @param enabled - Global subscription enabled flag
 * @param participantCount - Number of active participants
 * @param maxEnabledIndex - Highest index allowed by stagger logic
 * @param initialParticipantsEnabled - P0 bypass flag for stagger condition
 */
function computeParticipantEnabled(
  index: number,
  enabled: boolean,
  participantCount: number,
  maxEnabledIndex: number,
  initialParticipantsEnabled: boolean,
): boolean {
  // Not enabled globally or participant doesn't exist
  if (!enabled || participantCount <= index) {
    return false;
  }

  // P0 special case: use explicit flag to bypass stagger condition (0 > 0 = false)
  if (index === 0) {
    return initialParticipantsEnabled && maxEnabledIndex >= 0;
  }

  // P1+ follow stagger logic
  return maxEnabledIndex >= index;
}

/**
 * Checks if a participant is complete for stagger logic.
 *
 * @param index - Participant index
 * @param status - Participant's subscription status
 * @param stateRoundNumber - Round number from participant's state
 * @param currentRoundNumber - Current round being processed
 * @param aiSdkP0Complete - P0 completion via AI SDK flag
 */
function isParticipantCompleteForStagger(
  index: number,
  status: EntitySubscriptionState['status'] | undefined,
  stateRoundNumber: number | undefined,
  currentRoundNumber: number,
  aiSdkP0Complete: boolean,
): boolean {
  // P0 via AI SDK counts as complete
  if (index === 0 && aiSdkP0Complete) {
    return true;
  }

  // Must be current round and in terminal state
  const isCurrentRound = stateRoundNumber === currentRoundNumber;
  return isCurrentRound && (status === 'complete' || status === 'error');
}

// ============================================================================
// CALLBACK FACTORY HOOK
// ============================================================================

/**
 * Creates subscription callbacks for a specific entity with seq validation.
 * This hook encapsulates the repetitive callback creation pattern.
 */
function useEntityCallbacks(
  entity: EntityType,
  options: Pick<UseRoundSubscriptionOptions, 'onChunk' | 'onEntityComplete' | 'onEntityError'>,
  expectedSeqsRef: React.MutableRefObject<ExpectedSeqsState>,
): EntitySubscriptionCallbacks {
  const { onChunk, onEntityComplete, onEntityError } = options;

  return useMemo(() => ({
    onComplete: (lastSeq) => {
      rlog.stream('end', `🏁 ${entity} complete! lastSeq=${lastSeq}`);
      onEntityComplete?.(entity, lastSeq);
    },
    onError: (error) => {
      rlog.stuck('sub', `${entity} error: ${error.message}`);
      onEntityError?.(entity, error);
    },
    onTextChunk: (text, seq) => {
      // Seq validation for gap detection
      let expectedSeq: number;
      if (entity === 'presearch') {
        expectedSeq = expectedSeqsRef.current.presearch;
      } else if (entity === 'moderator') {
        expectedSeq = expectedSeqsRef.current.moderator;
      } else {
        const index = entity.replace('participant_', '');
        expectedSeq = expectedSeqsRef.current.participants[index] ?? 0;
      }

      const expectedNextSeq = expectedSeq + 1;
      if (seq !== expectedNextSeq && expectedSeq !== 0) {
        rlog.stuck('seq-gap', `${entity} seq gap: expected=${expectedNextSeq} received=${seq}`);
      }

      // Update expected seq
      if (entity === 'presearch') {
        expectedSeqsRef.current.presearch = seq;
      } else if (entity === 'moderator') {
        expectedSeqsRef.current.moderator = seq;
      } else {
        const index = entity.replace('participant_', '');
        expectedSeqsRef.current.participants[index] = seq;
      }

      onChunk?.(entity, text, seq);
    },
  }), [entity, onChunk, onEntityComplete, onEntityError, expectedSeqsRef]);
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for subscribing to all entity streams for a round.
 *
 * Uses the Fixed Hook Array pattern: all 10 participant hooks are called
 * unconditionally but controlled via computed `enabled` flags. This satisfies
 * React's hooks rules while providing dynamic behavior.
 *
 * ✅ STAGGERED SUBSCRIPTIONS to avoid HTTP/1.1 connection exhaustion:
 * - Presearch subscribes immediately
 * - P0 subscribes when presearch completes (or immediately if disabled)
 * - P(n+1) subscribes when P(n) completes
 * - Moderator subscribes when all participants complete
 */
export function useRoundSubscription({
  aiSdkP0Complete = false,
  enabled,
  enablePreSearch,
  initialLastSeqs,
  onChunk,
  onEntityComplete,
  onEntityError,
  onPreSearchEvent,
  onRoundComplete,
  participantCount,
  roundNumber,
  threadId,
}: UseRoundSubscriptionOptions): UseRoundSubscriptionReturn {
  // ============================================================================
  // REFS
  // ============================================================================

  const hasCalledRoundCompleteRef = useRef(false);
  const initialParticipantCountRef = useRef<number | null>(null);
  const logDedupeRef = useRef<{ key: string; count: number }>({ count: 0, key: '' });
  const lastResetKeyRef = useRef<string | null>(null);
  const maxEnabledIndexRef = useRef(0);
  const staggerLogRef = useRef<string>('');
  const lastPresearchTransitionLogRef = useRef<string>('');
  const lastModeratorTransitionLogRef = useRef<string>('');
  const prevCompletionKeyRef = useRef<string>('');

  // Seq validation tracking
  const expectedSeqsRef = useRef<ExpectedSeqsState>({
    moderator: initialLastSeqs?.moderator ?? 0,
    participants: initialLastSeqs?.participants ?? {},
    presearch: initialLastSeqs?.presearch ?? 0,
  });

  // ============================================================================
  // PARTICIPANT COUNT STABILIZATION
  // ============================================================================

  useLayoutEffect(() => {
    if (enabled && participantCount > 0 && initialParticipantCountRef.current === null) {
      initialParticipantCountRef.current = participantCount;
      rlog.race('pcount-init', `r${roundNumber} pCount=${participantCount}`);
    }

    if (enabled && initialParticipantCountRef.current !== null
      && initialParticipantCountRef.current !== participantCount) {
      rlog.race('pcount-mismatch', `r${roundNumber} pCount=${initialParticipantCountRef.current}(store)/${participantCount}(props)`);
    }

    if (!enabled) {
      initialParticipantCountRef.current = null;
    }
  }, [enabled, participantCount, roundNumber]);

  const stableParticipantCount = enabled && initialParticipantCountRef.current !== null
    ? initialParticipantCountRef.current
    : participantCount;

  // ============================================================================
  // STAGGER STATE
  // ============================================================================

  const [maxEnabledIndex, setMaxEnabledIndex] = useState(() => enablePreSearch ? -1 : 0);
  const [moderatorEnabled, setModeratorEnabled] = useState(false);
  const [presearchReady, setPresearchReady] = useState(!enablePreSearch);
  const [initialParticipantsEnabled, setInitialParticipantsEnabled] = useState(!enablePreSearch);

  const presearchReadyRef = useRef(presearchReady);
  presearchReadyRef.current = presearchReady;
  maxEnabledIndexRef.current = maxEnabledIndex;

  // Reset stagger state on round change
  useLayoutEffect(() => {
    const resetKey = `${threadId}-${roundNumber}-${enablePreSearch}`;
    if (lastResetKeyRef.current === resetKey) {
      return;
    }

    lastResetKeyRef.current = resetKey;
    hasCalledRoundCompleteRef.current = false;
    initialParticipantCountRef.current = null;
    setMaxEnabledIndex(enablePreSearch ? -1 : 0);
    setModeratorEnabled(false);
    setPresearchReady(!enablePreSearch);
    setInitialParticipantsEnabled(!enablePreSearch);

    expectedSeqsRef.current = {
      moderator: initialLastSeqs?.moderator ?? 0,
      participants: initialLastSeqs?.participants ?? {},
      presearch: initialLastSeqs?.presearch ?? 0,
    };

    rlog.stream('check', `r${roundNumber} stagger reset`);
  }, [threadId, roundNumber, enablePreSearch, initialLastSeqs]);

  // ============================================================================
  // CALLBACK OPTIONS (Shared across all entities)
  // ============================================================================

  const callbackOptions = useMemo(
    () => ({ onChunk, onEntityComplete, onEntityError }),
    [onChunk, onEntityComplete, onEntityError],
  );

  // ============================================================================
  // PRESEARCH SUBSCRIPTION
  // ============================================================================

  const presearchCallbacks = useEntityCallbacks('presearch', callbackOptions, expectedSeqsRef);

  const presearchCallbacksWithEvents: EntitySubscriptionCallbacks = useMemo(() => ({
    ...presearchCallbacks,
    onPreSearchEvent,
    onStatusChange: (status) => {
      rlog.gate('presearch-status', `r${roundNumber} status=${status} ready=${presearchReadyRef.current}`);
      if ((status === 'complete' || status === 'error') && !presearchReadyRef.current) {
        rlog.gate('presearch-gate', `r${roundNumber} COMPLETE → enabling P0`);
        setPresearchReady(true);
        setMaxEnabledIndex(0);
        setInitialParticipantsEnabled(true);
      }
    },
  }), [presearchCallbacks, onPreSearchEvent, roundNumber]);

  const presearchSub = usePreSearchSubscription({
    callbacks: presearchCallbacksWithEvents,
    enabled: enabled && enablePreSearch,
    initialLastSeq: initialLastSeqs?.presearch,
    roundNumber,
    threadId,
  });

  // Presearch gate backup effect
  useLayoutEffect(() => {
    if (!enabled || !enablePreSearch) {
      return;
    }
    const presearchComplete = presearchSub.state.status === 'complete' || presearchSub.state.status === 'error';
    if (presearchComplete && !presearchReady) {
      rlog.gate('presearch-gate', `r${roundNumber} COMPLETE → enabling P0 (backup)`);
      setPresearchReady(true);
      setMaxEnabledIndex(0);
      setInitialParticipantsEnabled(true);
    }
  }, [enabled, enablePreSearch, presearchSub.state.status, presearchReady, roundNumber]);

  // ============================================================================
  // PARTICIPANT SUBSCRIPTIONS (Fixed Hook Array Pattern)
  // ============================================================================
  // All 10 hooks are called unconditionally as required by React.
  // The `enabled` flag controls which ones are actually active.
  // ============================================================================

  // Create callbacks for each participant using the factory pattern
  const p0Callbacks = useEntityCallbacks('participant_0', callbackOptions, expectedSeqsRef);
  const p1Callbacks = useEntityCallbacks('participant_1', callbackOptions, expectedSeqsRef);
  const p2Callbacks = useEntityCallbacks('participant_2', callbackOptions, expectedSeqsRef);
  const p3Callbacks = useEntityCallbacks('participant_3', callbackOptions, expectedSeqsRef);
  const p4Callbacks = useEntityCallbacks('participant_4', callbackOptions, expectedSeqsRef);
  const p5Callbacks = useEntityCallbacks('participant_5', callbackOptions, expectedSeqsRef);
  const p6Callbacks = useEntityCallbacks('participant_6', callbackOptions, expectedSeqsRef);
  const p7Callbacks = useEntityCallbacks('participant_7', callbackOptions, expectedSeqsRef);
  const p8Callbacks = useEntityCallbacks('participant_8', callbackOptions, expectedSeqsRef);
  const p9Callbacks = useEntityCallbacks('participant_9', callbackOptions, expectedSeqsRef);

  // Callbacks array for indexed access
  const allParticipantCallbacks = useMemo(() => [
    p0Callbacks,
    p1Callbacks,
    p2Callbacks,
    p3Callbacks,
    p4Callbacks,
    p5Callbacks,
    p6Callbacks,
    p7Callbacks,
    p8Callbacks,
    p9Callbacks,
  ], [p0Callbacks, p1Callbacks, p2Callbacks, p3Callbacks, p4Callbacks, p5Callbacks, p6Callbacks, p7Callbacks, p8Callbacks, p9Callbacks]);

  // Compute enabled state for each participant using the helper function
  const participantEnabledStates = useMemo(() =>
    PARTICIPANT_INDICES.map(i =>
      computeParticipantEnabled(i, enabled, stableParticipantCount, maxEnabledIndex, initialParticipantsEnabled),
    ), [enabled, stableParticipantCount, maxEnabledIndex, initialParticipantsEnabled]);

  // All 10 participant subscriptions (unconditional hook calls)
  const p0Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[0], enabled: participantEnabledStates[0], initialLastSeq: initialLastSeqs?.participants?.['0'], participantIndex: 0, roundNumber, threadId });
  const p1Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[1], enabled: participantEnabledStates[1], initialLastSeq: initialLastSeqs?.participants?.['1'], participantIndex: 1, roundNumber, threadId });
  const p2Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[2], enabled: participantEnabledStates[2], initialLastSeq: initialLastSeqs?.participants?.['2'], participantIndex: 2, roundNumber, threadId });
  const p3Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[3], enabled: participantEnabledStates[3], initialLastSeq: initialLastSeqs?.participants?.['3'], participantIndex: 3, roundNumber, threadId });
  const p4Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[4], enabled: participantEnabledStates[4], initialLastSeq: initialLastSeqs?.participants?.['4'], participantIndex: 4, roundNumber, threadId });
  const p5Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[5], enabled: participantEnabledStates[5], initialLastSeq: initialLastSeqs?.participants?.['5'], participantIndex: 5, roundNumber, threadId });
  const p6Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[6], enabled: participantEnabledStates[6], initialLastSeq: initialLastSeqs?.participants?.['6'], participantIndex: 6, roundNumber, threadId });
  const p7Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[7], enabled: participantEnabledStates[7], initialLastSeq: initialLastSeqs?.participants?.['7'], participantIndex: 7, roundNumber, threadId });
  const p8Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[8], enabled: participantEnabledStates[8], initialLastSeq: initialLastSeqs?.participants?.['8'], participantIndex: 8, roundNumber, threadId });
  const p9Sub = useParticipantSubscription({ callbacks: allParticipantCallbacks[9], enabled: participantEnabledStates[9], initialLastSeq: initialLastSeqs?.participants?.['9'], participantIndex: 9, roundNumber, threadId });

  // Subscription tuple for indexed access
  const allParticipantSubs = useMemo(() => [
    p0Sub,
    p1Sub,
    p2Sub,
    p3Sub,
    p4Sub,
    p5Sub,
    p6Sub,
    p7Sub,
    p8Sub,
    p9Sub,
  ], [p0Sub, p1Sub, p2Sub, p3Sub, p4Sub, p5Sub, p6Sub, p7Sub, p8Sub, p9Sub]);

  // Active participants (sliced by count)
  const activeParticipantSubs = useMemo(
    () => allParticipantSubs.slice(0, stableParticipantCount),
    [allParticipantSubs, stableParticipantCount],
  );

  // Participant states array
  const participantStates = useMemo(
    () => allParticipantSubs.map(sub => sub.state).slice(0, stableParticipantCount),
    [allParticipantSubs, stableParticipantCount],
  );

  // Status-only array for stagger effect optimization
  const participantStatuses = useMemo(
    () => participantStates.map(s => s.status),
    [participantStates],
  );

  // ============================================================================
  // MODERATOR SUBSCRIPTION
  // ============================================================================

  const moderatorCallbacks = useEntityCallbacks('moderator', callbackOptions, expectedSeqsRef);

  const moderatorSub = useModeratorSubscription({
    callbacks: moderatorCallbacks,
    enabled: enabled && moderatorEnabled,
    initialLastSeq: initialLastSeqs?.moderator,
    roundNumber,
    threadId,
  });

  // ============================================================================
  // STAGGER EFFECT (Baton Passing)
  // ============================================================================

  useLayoutEffect(() => {
    if (!enabled || !presearchReady) {
      return;
    }
    if (moderatorEnabled && participantStatuses.every((s, i) =>
      isParticipantCompleteForStagger(i, s, participantStates[i]?.roundNumber, roundNumber, aiSdkP0Complete),
    )) {
      return;
    }

    // Find highest complete index
    let highestCompleteIndex = -1;
    for (let i = 0; i < stableParticipantCount; i++) {
      if (isParticipantCompleteForStagger(
        i,
        participantStatuses[i],
        participantStates[i]?.roundNumber,
        roundNumber,
        aiSdkP0Complete,
      )) {
        highestCompleteIndex = i;
      } else {
        break; // Sequential order
      }
    }

    const nextIndex = highestCompleteIndex + 1;
    const willEnableNext = nextIndex < stableParticipantCount && nextIndex > maxEnabledIndexRef.current;
    const allComplete = highestCompleteIndex === stableParticipantCount - 1;
    const willEnableModerator = allComplete && stableParticipantCount > 0 && !moderatorEnabled;

    // Log on state change
    if (willEnableNext || willEnableModerator) {
      const summary = participantStatuses.map((s, i) => `P${i}:${s ?? 'null'}`).join(' ');
      const logKey = `${roundNumber}-${summary}-${maxEnabledIndexRef.current}`;
      if (logKey !== staggerLogRef.current) {
        staggerLogRef.current = logKey;
        rlog.stream('check', `r${roundNumber} stagger: ${summary}`);
      }
    }

    if (willEnableNext) {
      rlog.stream('check', `r${roundNumber} baton: P${highestCompleteIndex}→P${nextIndex}`);
      setMaxEnabledIndex(nextIndex);
    }

    if (willEnableModerator) {
      rlog.stream('check', `r${roundNumber} all participants complete → moderator`);
      setModeratorEnabled(true);
    }
  }, [enabled, presearchReady, stableParticipantCount, participantStatuses, participantStates, moderatorEnabled, roundNumber, aiSdkP0Complete]);

  // ============================================================================
  // COMPLETION STATE
  // ============================================================================

  const presearchStatus = presearchSub.state.status;
  const presearchRound = presearchSub.state.roundNumber;
  const presearchIsStreaming = presearchSub.state.isStreaming;
  const moderatorStatus = moderatorSub.state.status;
  const moderatorRound = moderatorSub.state.roundNumber;
  const moderatorIsStreaming = moderatorSub.state.isStreaming;

  // Completion data for participants
  const allCompletionData = useMemo(
    () => allParticipantSubs.map(sub => extractCompletionData(sub.state)),
    [allParticipantSubs],
  );

  const participantStatusesForCompletion = useMemo(
    () => allCompletionData.slice(0, stableParticipantCount),
    [allCompletionData, stableParticipantCount],
  );

  const completionState = useMemo(() => {
    const presearchComplete = !enablePreSearch
      || presearchStatus === 'disabled'
      || presearchRound !== roundNumber
      || presearchStatus === 'complete'
      || presearchStatus === 'error';

    const allParticipantsDone = participantStatusesForCompletion.length > 0
      && participantStatusesForCompletion.every((s, i) =>
        (i === 0 && aiSdkP0Complete) || (s.roundNumber === roundNumber && (s.status === 'complete' || s.status === 'error')),
      );

    const moderatorComplete = moderatorRound === roundNumber
      && (moderatorStatus === 'complete' || moderatorStatus === 'error');

    const isRoundComplete = presearchComplete && allParticipantsDone && moderatorComplete;

    const hasActiveStream = presearchIsStreaming
      || participantStatusesForCompletion.some((s, i) => !(i === 0 && aiSdkP0Complete) && s.isStreaming)
      || moderatorIsStreaming;

    return { allParticipantsDone, hasActiveStream, isRoundComplete, moderatorComplete, presearchComplete };
  }, [
    enablePreSearch,
    presearchStatus,
    presearchRound,
    presearchIsStreaming,
    moderatorStatus,
    moderatorRound,
    moderatorIsStreaming,
    participantStatusesForCompletion,
    roundNumber,
    aiSdkP0Complete,
  ]);

  // Round-ref-lag detection
  useLayoutEffect(() => {
    lastPresearchTransitionLogRef.current = '';
    lastModeratorTransitionLogRef.current = '';
  }, [roundNumber]);

  useEffect(() => {
    if (enablePreSearch && presearchRound !== roundNumber && presearchStatus !== 'disabled' && presearchStatus !== 'idle' && presearchStatus !== 'waiting') {
      const key = `r${roundNumber}<-r${presearchRound}`;
      if (lastPresearchTransitionLogRef.current !== key) {
        lastPresearchTransitionLogRef.current = key;
        rlog.race('round-ref-lag', `r${roundNumber} presearch state from r${presearchRound}`);
      }
    }
    if (moderatorRound !== roundNumber && moderatorStatus !== 'disabled' && moderatorStatus !== 'waiting' && moderatorStatus !== 'idle') {
      const key = `r${roundNumber}<-r${moderatorRound}`;
      if (lastModeratorTransitionLogRef.current !== key) {
        lastModeratorTransitionLogRef.current = key;
        rlog.race('round-ref-lag', `r${roundNumber} moderator state from r${moderatorRound}`);
      }
    }
  }, [roundNumber, presearchRound, presearchStatus, enablePreSearch, moderatorRound, moderatorStatus]);

  // Completion logging
  const completionLogKey = `${roundNumber}-pre:${completionState.presearchComplete}-allP:${completionState.allParticipantsDone}-mod:${completionState.moderatorComplete}`;
  if (completionLogKey !== prevCompletionKeyRef.current) {
    if (logDedupeRef.current.count > 1) {
      rlog.phase('round-complete-check', `[×${logDedupeRef.current.count}] (deduplicated)`);
    }
    prevCompletionKeyRef.current = completionLogKey;
    logDedupeRef.current = { count: 1, key: completionLogKey };
    rlog.phase('round-complete-check', `r${roundNumber} pre=${completionState.presearchComplete} allP=${completionState.allParticipantsDone} mod=${completionState.moderatorComplete}`);
  } else {
    logDedupeRef.current.count++;
  }

  // ============================================================================
  // COMBINED STATE
  // ============================================================================

  const state = useMemo((): RoundSubscriptionState => ({
    hasActiveStream: completionState.hasActiveStream,
    isRoundComplete: completionState.isRoundComplete,
    moderator: moderatorSub.state,
    participants: participantStates,
    presearch: presearchSub.state,
  }), [completionState, moderatorSub.state, participantStates, presearchSub.state]);

  // Round completion callback
  useEffect(() => {
    rlog.phase('round-complete-effect', `r${roundNumber} isComplete=${state.isRoundComplete} hasCalled=${hasCalledRoundCompleteRef.current}`);
    if (state.isRoundComplete && !hasCalledRoundCompleteRef.current && enabled) {
      hasCalledRoundCompleteRef.current = true;
      rlog.phase('round-subscription', `r${roundNumber} COMPLETE`);
      onRoundComplete?.();
    }
  }, [state.isRoundComplete, enabled, roundNumber, onRoundComplete]);

  // ============================================================================
  // IMPERATIVE METHODS
  // ============================================================================

  const abort = useCallback(() => {
    presearchSub.abort();
    activeParticipantSubs.forEach(sub => sub.abort());
    moderatorSub.abort();
  }, [presearchSub, activeParticipantSubs, moderatorSub]);

  const retryEntity = useCallback((entity: EntityType) => {
    if (entity === 'presearch') {
      presearchSub.retry();
    } else if (entity === 'moderator') {
      moderatorSub.retry();
    } else {
      const index = parseParticipantEntityIndex(entity);
      if (index !== null && index >= 0 && index < activeParticipantSubs.length) {
        activeParticipantSubs[index]?.retry();
      }
    }
  }, [presearchSub, moderatorSub, activeParticipantSubs]);

  return { abort, retryEntity, state };
}
