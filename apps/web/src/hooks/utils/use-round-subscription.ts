/**
 * Round Subscription Hook - Backend-First Streaming Architecture
 *
 * Per FLOW_DOCUMENTATION.md:
 * - Frontend SUBSCRIBES and DISPLAYS only
 * - Backend ORCHESTRATES everything (P0 → P1 → ... → Moderator)
 *
 * ============================================================================
 * ARCHITECTURAL PATTERN: Subscription Manager with Imperative Control
 * ============================================================================
 *
 * Following DRY and SOLID principles, participant subscriptions are managed
 * via a single `useParticipantSubscriptions` hook that:
 *
 * 1. **Single Hook Call**: Satisfies React's rules of hooks (unconditional)
 * 2. **Imperative Management**: Creates/destroys subscriptions via effects
 * 3. **Array-based Config**: Scales to any participant count without code changes
 * 4. **State Aggregation**: Returns unified array of subscription states
 *
 * This pattern mirrors TanStack Query's `useQueries` - a single hook manages
 * multiple queries/subscriptions internally.
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
  useParticipantSubscriptions,
  usePreSearchSubscription,
} from './use-entity-subscription';

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
  const lastResetKeyRef = useRef<string | null>(null);
  const maxEnabledIndexRef = useRef(0);
  const staggerLogRef = useRef<string>('');
  const lastPresearchTransitionLogRef = useRef<string>('');
  const lastModeratorTransitionLogRef = useRef<string>('');
  const prevCompletionKeyRef = useRef<string>('');
  const lastCompleteCheckTimeRef = useRef(0);

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

  // Reset stagger state on round change - MUST run before other effects
  // This ensures entity state tracking is reset before any completion checks
  useLayoutEffect(() => {
    const resetKey = `${threadId}-${roundNumber}-${enablePreSearch}`;
    if (lastResetKeyRef.current === resetKey) {
      return;
    }

    rlog.stream('check', `r${roundNumber} stagger reset (key=${resetKey})`);
    lastResetKeyRef.current = resetKey;

    // Reset all round-specific state
    hasCalledRoundCompleteRef.current = false;
    initialParticipantCountRef.current = null;
    lastCompleteCheckTimeRef.current = 0; // Reset throttle for new round

    // Reset stagger state
    setMaxEnabledIndex(enablePreSearch ? -1 : 0);
    setModeratorEnabled(false);
    setPresearchReady(!enablePreSearch);
    setInitialParticipantsEnabled(!enablePreSearch);

    // Reset sequence tracking
    expectedSeqsRef.current = {
      moderator: initialLastSeqs?.moderator ?? 0,
      participants: initialLastSeqs?.participants ?? {},
      presearch: initialLastSeqs?.presearch ?? 0,
    };

    // Reset completion logging ref
    prevCompletionKeyRef.current = '';
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
  // PARTICIPANT SUBSCRIPTIONS (DRY Subscription Manager Pattern)
  // ============================================================================
  // Single hook call manages all participant subscriptions imperatively.
  // This satisfies React's rules of hooks while eliminating repetitive code.
  // ============================================================================

  // Create callback factory for participants - generates callbacks on demand
  const createParticipantCallbacks = useCallback((index: number): EntitySubscriptionCallbacks => ({
    onComplete: (lastSeq) => {
      rlog.stream('end', `🏁 participant_${index} complete! lastSeq=${lastSeq}`);
      onEntityComplete?.(`participant_${index}`, lastSeq);
    },
    onError: (error) => {
      rlog.stuck('sub', `participant_${index} error: ${error.message}`);
      onEntityError?.(`participant_${index}`, error);
    },
    onTextChunk: (text, seq) => {
      // Seq validation for gap detection
      const expectedSeq = expectedSeqsRef.current.participants[String(index)] ?? 0;
      const expectedNextSeq = expectedSeq + 1;
      if (seq !== expectedNextSeq && expectedSeq !== 0) {
        rlog.stuck('seq-gap', `participant_${index} seq gap: expected=${expectedNextSeq} received=${seq}`);
      }
      expectedSeqsRef.current.participants[String(index)] = seq;
      onChunk?.(`participant_${index}`, text, seq);
    },
  }), [onChunk, onEntityComplete, onEntityError]);

  // Build subscription configs for all participants using array map (DRY)
  const participantConfigs = useMemo(() => {
    const configs = [];
    for (let i = 0; i < stableParticipantCount; i++) {
      configs.push({
        callbacks: createParticipantCallbacks(i),
        enabled: computeParticipantEnabled(i, enabled, stableParticipantCount, maxEnabledIndex, initialParticipantsEnabled),
        index: i,
        initialLastSeq: initialLastSeqs?.participants?.[String(i)],
      });
    }
    return configs;
  }, [stableParticipantCount, enabled, maxEnabledIndex, initialParticipantsEnabled, initialLastSeqs?.participants, createParticipantCallbacks]);

  // Single hook call for all participant subscriptions (satisfies React's rules)
  const allParticipantSubs = useParticipantSubscriptions({
    configs: participantConfigs,
    roundNumber,
    threadId,
  });

  // Active participants (already sliced by config generation)
  const activeParticipantSubs = allParticipantSubs;

  // Participant states array (already filtered by participantConfigs)
  const participantStates = useMemo(
    () => allParticipantSubs.map(sub => sub.state),
    [allParticipantSubs],
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

    // GUARD: Skip if moderator state is from wrong round
    // This prevents false completion detection during round transitions
    if (moderatorEnabled && moderatorSub.state.roundNumber !== roundNumber) {
      rlog.race('stagger-skip', `r${roundNumber} skipping - moderator state from r${moderatorSub.state.roundNumber}`);
      return;
    }

    // GUARD: Check for stale participant states from wrong round
    // Skip if any active participant has state from a different round (except idle which is expected)
    const hasStaleParticipantState = participantStates.some((s, i) =>
      i < stableParticipantCount
      && s.roundNumber !== roundNumber
      && s.status !== 'idle'
      && s.status !== 'waiting',
    );
    if (hasStaleParticipantState) {
      rlog.race('stagger-skip', `r${roundNumber} skipping - participant state from wrong round`);
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
  }, [enabled, presearchReady, stableParticipantCount, participantStatuses, participantStates, moderatorEnabled, roundNumber, aiSdkP0Complete, moderatorSub.state.roundNumber]);

  // ============================================================================
  // COMPLETION STATE
  // ============================================================================

  const presearchStatus = presearchSub.state.status;
  const presearchRound = presearchSub.state.roundNumber;
  const presearchIsStreaming = presearchSub.state.isStreaming;
  const moderatorStatus = moderatorSub.state.status;
  const moderatorRound = moderatorSub.state.roundNumber;
  const moderatorIsStreaming = moderatorSub.state.isStreaming;

  // Completion data for participants (already filtered by participantConfigs)
  const participantStatusesForCompletion = useMemo(
    () => allParticipantSubs.map(sub => extractCompletionData(sub.state)),
    [allParticipantSubs],
  );

  // Split completionState into 3 focused memos to reduce re-render cascades
  const presearchComplete = useMemo(() => {
    return !enablePreSearch
      || presearchStatus === 'disabled'
      || presearchRound !== roundNumber
      || presearchStatus === 'complete'
      || presearchStatus === 'error';
  }, [enablePreSearch, presearchStatus, presearchRound, roundNumber]);

  const allParticipantsDone = useMemo(() => {
    return participantStatusesForCompletion.length > 0
      && participantStatusesForCompletion.every((s, i) =>
        (i === 0 && aiSdkP0Complete) || (s.roundNumber === roundNumber && (s.status === 'complete' || s.status === 'error')),
      );
  }, [participantStatusesForCompletion, roundNumber, aiSdkP0Complete]);

  const moderatorComplete = useMemo(() => {
    return moderatorRound === roundNumber
      && (moderatorStatus === 'complete' || moderatorStatus === 'error');
  }, [moderatorRound, roundNumber, moderatorStatus]);

  // Combined state only for final check - depends on 3 booleans instead of 12 values
  const isRoundComplete = presearchComplete && allParticipantsDone && moderatorComplete;

  const hasActiveStream = useMemo(() => {
    return presearchIsStreaming
      || participantStatusesForCompletion.some((s, i) => !(i === 0 && aiSdkP0Complete) && s.isStreaming)
      || moderatorIsStreaming;
  }, [presearchIsStreaming, participantStatusesForCompletion, aiSdkP0Complete, moderatorIsStreaming]);

  // Round state consistency verification
  // After fixes above, round-ref-lag should never occur during normal operation
  // This effect verifies consistency - if it triggers, investigate the cause
  useLayoutEffect(() => {
    lastPresearchTransitionLogRef.current = '';
    lastModeratorTransitionLogRef.current = '';
  }, [roundNumber]);

  useEffect(() => {
    // Only verify after initial render when we have active states
    if (!enabled) {
      return;
    }

    // Presearch verification - should never have active state from wrong round
    const presearchLag = enablePreSearch
      && presearchRound !== roundNumber
      && presearchStatus !== 'disabled'
      && presearchStatus !== 'idle'
      && presearchStatus !== 'waiting';

    if (presearchLag) {
      const key = `r${roundNumber}<-r${presearchRound}`;
      if (lastPresearchTransitionLogRef.current !== key) {
        lastPresearchTransitionLogRef.current = key;
        // This should never happen after fixes - log as stuck if it does
        rlog.stuck('round-desync', `UNEXPECTED: r${roundNumber} presearch state from r${presearchRound} - investigate!`);
      }
    }

    // Moderator verification - should never have active state from wrong round
    const moderatorLag = moderatorRound !== roundNumber
      && moderatorStatus !== 'disabled'
      && moderatorStatus !== 'waiting'
      && moderatorStatus !== 'idle';

    if (moderatorLag) {
      const key = `r${roundNumber}<-r${moderatorRound}`;
      if (lastModeratorTransitionLogRef.current !== key) {
        lastModeratorTransitionLogRef.current = key;
        // This should never happen after fixes - log as stuck if it does
        rlog.stuck('round-desync', `UNEXPECTED: r${roundNumber} moderator state from r${moderatorRound} - investigate!`);
      }
    }
  }, [enabled, roundNumber, presearchRound, presearchStatus, enablePreSearch, moderatorRound, moderatorStatus]);

  // Completion logging - only log on actual state CHANGES, moved to useEffect
  const completionLogKey = `${roundNumber}-${presearchComplete}-${allParticipantsDone}-${moderatorComplete}`;
  useEffect(() => {
    if (completionLogKey !== prevCompletionKeyRef.current) {
      prevCompletionKeyRef.current = completionLogKey;
      rlog.phase('round-complete-check', `r${roundNumber} pre=${presearchComplete} allP=${allParticipantsDone} mod=${moderatorComplete}`);
    }
  }, [completionLogKey, roundNumber, presearchComplete, allParticipantsDone, moderatorComplete]);

  // ============================================================================
  // COMBINED STATE
  // ============================================================================

  const state = useMemo((): RoundSubscriptionState => ({
    hasActiveStream,
    isRoundComplete,
    moderator: moderatorSub.state,
    participants: participantStates,
    presearch: presearchSub.state,
  }), [hasActiveStream, isRoundComplete, moderatorSub.state, participantStates, presearchSub.state]);

  // Round completion callback - throttled to max once per 100ms
  useEffect(() => {
    const now = Date.now();
    // Throttle to max once per 100ms
    if (now - lastCompleteCheckTimeRef.current < 100) {
      return;
    }
    lastCompleteCheckTimeRef.current = now;

    rlog.phase('round-complete-effect', `r${roundNumber} isComplete=${isRoundComplete} hasCalled=${hasCalledRoundCompleteRef.current}`);
    if (isRoundComplete && !hasCalledRoundCompleteRef.current && enabled) {
      hasCalledRoundCompleteRef.current = true;
      rlog.phase('round-subscription', `r${roundNumber} COMPLETE`);
      onRoundComplete?.();
    }
  }, [isRoundComplete, enabled, roundNumber, onRoundComplete]);

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
