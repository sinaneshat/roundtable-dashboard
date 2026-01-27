/**
 * Round Subscription Hook - Backend-First Streaming Architecture
 *
 * ✅ STAGGERED SUBSCRIPTIONS: Avoids HTTP/1.1 connection exhaustion
 *
 * Per FLOW_DOCUMENTATION.md:
 * - Frontend SUBSCRIBES and DISPLAYS only
 * - Backend ORCHESTRATES everything (P0 → P1 → ... → Moderator)
 *
 * This hook:
 * - Creates STAGGERED subscriptions to entity streams (not all at once!)
 * - Only subscribes to P(n+1) after P(n) starts streaming or completes
 * - Receives chunks from backend as entities stream
 * - Calls callbacks when entities complete
 * - Detects when all entities are done to mark round complete
 *
 * Connection efficiency: ~2-3 concurrent SSE connections instead of 7+
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { rlog } from '@/lib/utils/dev-logger';
import { areAllParticipantsComplete, parseParticipantEntityIndex } from '@/lib/utils/streaming-helpers';

import type { EntitySubscriptionCallbacks, EntitySubscriptionState } from './use-entity-subscription';
import {
  useModeratorSubscription,
  useParticipantSubscription,
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
  /** Called when a text chunk is received from any entity */
  onChunk?: (entity: EntityType, text: string, seq: number) => void;
  /** Called when an entity completes */
  onEntityComplete?: (entity: EntityType, lastSeq: number) => void;
  /** Called when the entire round completes (all entities done) */
  onRoundComplete?: () => void;
  /** Called when an entity errors */
  onEntityError?: (entity: EntityType, error: Error) => void;
  /** Called for presearch-specific events (query, result, start, complete, done) */
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

// ============================================================================
// HELPER HOOKS
// ============================================================================

/**
 * Creates subscription callbacks for a specific entity
 */
function useEntityCallbacks(
  entity: EntityType,
  options: Pick<UseRoundSubscriptionOptions, 'onChunk' | 'onEntityComplete' | 'onEntityError'>,
): EntitySubscriptionCallbacks {
  const { onChunk, onEntityComplete, onEntityError } = options;

  return useMemo(() => ({
    onComplete: (lastSeq) => {
      rlog.stream('end', `${entity} r? complete lastSeq=${lastSeq}`);
      onEntityComplete?.(entity, lastSeq);
    },
    onError: (error) => {
      rlog.stuck('sub', `${entity} error: ${error.message}`);
      onEntityError?.(entity, error);
    },
    onTextChunk: (text, seq) => {
      onChunk?.(entity, text, seq);
    },
  }), [entity, onChunk, onEntityComplete, onEntityError]);
}

// ============================================================================
// MAIN HOOK
// ============================================================================

/**
 * Hook for subscribing to all entity streams for a round.
 *
 * ✅ STAGGERED SUBSCRIPTIONS to avoid HTTP/1.1 connection exhaustion:
 * - Presearch + P0 subscribe immediately
 * - P(n+1) subscribes when P(n) starts streaming or completes
 * - Moderator subscribes when all participants complete
 *
 * Each subscription handles 202 Accepted with retry, JSON status responses,
 * and SSE streaming automatically.
 */
export function useRoundSubscription({
  enabled,
  enablePreSearch,
  onChunk,
  onEntityComplete,
  onEntityError,
  onPreSearchEvent,
  onRoundComplete,
  participantCount,
  roundNumber,
  threadId,
}: UseRoundSubscriptionOptions): UseRoundSubscriptionReturn {
  // Track if round complete has been called to prevent duplicates
  const hasCalledRoundCompleteRef = useRef(false);

  // ✅ STAGGER STATE: Track which participant index is ready to subscribe
  // Start with -1 when presearch is enabled - participants wait for presearch
  // Start with 0 when presearch is disabled - P0 can subscribe immediately
  // When P(n) starts streaming, we enable P(n+1)
  const [maxEnabledIndex, setMaxEnabledIndex] = useState(() => enablePreSearch ? -1 : 0);
  const [moderatorEnabled, setModeratorEnabled] = useState(false);
  // Track if presearch has completed (allows participants to start)
  const [presearchReady, setPresearchReady] = useState(!enablePreSearch);
  // FIX 1: Explicit flag for P0 enable, bypasses stagger condition
  // The stagger logic condition `nextIndex > maxEnabledIndex` (0 > 0 = false) prevents P0 from being enabled
  // This flag is set when presearch completes, ensuring P0 subscription is enabled immediately
  const [initialParticipantsEnabled, setInitialParticipantsEnabled] = useState(!enablePreSearch);

  // Reset stagger state when round changes
  useEffect(() => {
    hasCalledRoundCompleteRef.current = false;
    // When presearch is enabled, start with -1 (no participants)
    // When presearch is disabled, start with 0 (P0 can start)
    setMaxEnabledIndex(enablePreSearch ? -1 : 0);
    setModeratorEnabled(false);
    setPresearchReady(!enablePreSearch);
    setInitialParticipantsEnabled(!enablePreSearch); // FIX 1: Reset explicit P0 flag
    rlog.stream('check', `r${roundNumber} stagger reset: maxIdx=${enablePreSearch ? -1 : 0} modEnabled=false presearchEnabled=${enablePreSearch} initialEnabled=${!enablePreSearch}`);
  }, [threadId, roundNumber, enablePreSearch]);

  // Create callbacks for each entity type
  const basePresearchCallbacks = useEntityCallbacks('presearch', { onChunk, onEntityComplete, onEntityError });
  const moderatorCallbacks = useEntityCallbacks('moderator', { onChunk, onEntityComplete, onEntityError });

  // Presearch callbacks with additional presearch-specific event handler
  const presearchCallbacks: EntitySubscriptionCallbacks = useMemo(() => ({
    ...basePresearchCallbacks,
    onPreSearchEvent,
  }), [basePresearchCallbacks, onPreSearchEvent]);

  // ✅ FIX Phase 5B: Callback-based presearch completion detection
  // The previous effect-based approach relied on presearchSub.state.status polling,
  // which could miss the status change due to React batching or stale closures.
  // Using onStatusChange callback ensures immediate P0 enablement when presearch completes.
  //
  // IMPORTANT: Once presearchReady is true, we should NOT reset it even if status goes
  // back to 'waiting' (which happens when subscription reconnects/retries). The presearch
  // completion is a one-time gate - once passed, participants should stay enabled.
  const presearchCallbacksWithStatusChange: EntitySubscriptionCallbacks = useMemo(() => ({
    ...presearchCallbacks,
    onStatusChange: (status) => {
      rlog.gate('presearch-status', `r${roundNumber} status=${status} ready=${presearchReady}`);

      // Only enable P0 once on complete/error - ignore subsequent status changes
      if ((status === 'complete' || status === 'error') && !presearchReady) {
        rlog.gate('presearch-gate', `r${roundNumber} COMPLETE → enabling P0 via callback`);
        setPresearchReady(true);
        setMaxEnabledIndex(0);
        setInitialParticipantsEnabled(true);
      }
      // Note: We intentionally do NOT reset presearchReady when status goes back to 'waiting'
      // This prevents the race condition where subscription reconnect resets participant enablement
    },
  }), [presearchCallbacks, roundNumber, presearchReady]);

  // Pre-search subscription (conditional)
  const presearchSub = usePreSearchSubscription({
    callbacks: presearchCallbacksWithStatusChange,
    enabled: enabled && enablePreSearch,
    roundNumber,
    threadId,
  });

  // Participant subscriptions (create hooks for up to 10 participants)
  // React hooks must be called unconditionally, so we create fixed number
  // ✅ STAGGER: Each participant only enabled when index <= maxEnabledIndex
  const p0Callbacks = useEntityCallbacks('participant_0', { onChunk, onEntityComplete, onEntityError });
  const p1Callbacks = useEntityCallbacks('participant_1', { onChunk, onEntityComplete, onEntityError });
  const p2Callbacks = useEntityCallbacks('participant_2', { onChunk, onEntityComplete, onEntityError });
  const p3Callbacks = useEntityCallbacks('participant_3', { onChunk, onEntityComplete, onEntityError });
  const p4Callbacks = useEntityCallbacks('participant_4', { onChunk, onEntityComplete, onEntityError });
  const p5Callbacks = useEntityCallbacks('participant_5', { onChunk, onEntityComplete, onEntityError });
  const p6Callbacks = useEntityCallbacks('participant_6', { onChunk, onEntityComplete, onEntityError });
  const p7Callbacks = useEntityCallbacks('participant_7', { onChunk, onEntityComplete, onEntityError });
  const p8Callbacks = useEntityCallbacks('participant_8', { onChunk, onEntityComplete, onEntityError });
  const p9Callbacks = useEntityCallbacks('participant_9', { onChunk, onEntityComplete, onEntityError });

  // ✅ STAGGER: Only enable subscription if index <= maxEnabledIndex
  // FIX 1: P0 uses explicit flag instead of relying on stagger index comparison (0 > 0 = false bug)
  const p0Sub = useParticipantSubscription({ callbacks: p0Callbacks, enabled: enabled && participantCount > 0 && initialParticipantsEnabled && maxEnabledIndex >= 0, participantIndex: 0, roundNumber, threadId });
  const p1Sub = useParticipantSubscription({ callbacks: p1Callbacks, enabled: enabled && participantCount > 1 && maxEnabledIndex >= 1, participantIndex: 1, roundNumber, threadId });
  const p2Sub = useParticipantSubscription({ callbacks: p2Callbacks, enabled: enabled && participantCount > 2 && maxEnabledIndex >= 2, participantIndex: 2, roundNumber, threadId });
  const p3Sub = useParticipantSubscription({ callbacks: p3Callbacks, enabled: enabled && participantCount > 3 && maxEnabledIndex >= 3, participantIndex: 3, roundNumber, threadId });
  const p4Sub = useParticipantSubscription({ callbacks: p4Callbacks, enabled: enabled && participantCount > 4 && maxEnabledIndex >= 4, participantIndex: 4, roundNumber, threadId });
  const p5Sub = useParticipantSubscription({ callbacks: p5Callbacks, enabled: enabled && participantCount > 5 && maxEnabledIndex >= 5, participantIndex: 5, roundNumber, threadId });
  const p6Sub = useParticipantSubscription({ callbacks: p6Callbacks, enabled: enabled && participantCount > 6 && maxEnabledIndex >= 6, participantIndex: 6, roundNumber, threadId });
  const p7Sub = useParticipantSubscription({ callbacks: p7Callbacks, enabled: enabled && participantCount > 7 && maxEnabledIndex >= 7, participantIndex: 7, roundNumber, threadId });
  const p8Sub = useParticipantSubscription({ callbacks: p8Callbacks, enabled: enabled && participantCount > 8 && maxEnabledIndex >= 8, participantIndex: 8, roundNumber, threadId });
  const p9Sub = useParticipantSubscription({ callbacks: p9Callbacks, enabled: enabled && participantCount > 9 && maxEnabledIndex >= 9, participantIndex: 9, roundNumber, threadId });

  // Moderator subscription - ✅ STAGGER: only enabled when all participants complete
  const moderatorSub = useModeratorSubscription({
    callbacks: moderatorCallbacks,
    enabled: enabled && moderatorEnabled,
    roundNumber,
    threadId,
  });

  // Collect all participant subscriptions into array
  const allParticipantSubs = [p0Sub, p1Sub, p2Sub, p3Sub, p4Sub, p5Sub, p6Sub, p7Sub, p8Sub, p9Sub];
  const activeParticipantSubs = allParticipantSubs.slice(0, participantCount);
  const participantStates = activeParticipantSubs.map(sub => sub.state);

  // ✅ PRESEARCH GATE: Backup effect for enabling participants after presearch completes
  // Primary mechanism is the onStatusChange callback above; this effect serves as backup
  // in case the callback doesn't fire (e.g., if status was already complete on mount)
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!enablePreSearch) {
      return;
    } // Presearch not enabled, participants can start immediately

    const presearchComplete = presearchSub.state.status === 'complete' || presearchSub.state.status === 'error';

    // Log gate state for debugging
    rlog.gate('gate-effect', `r${roundNumber} enabled=${enabled} status=${presearchSub.state.status} ready=${presearchReady} complete=${presearchComplete}`);

    if (presearchComplete && !presearchReady) {
      rlog.gate('presearch-gate', `r${roundNumber} COMPLETE → enabling P0 via effect (backup)`);
      setPresearchReady(true);
      setMaxEnabledIndex(0); // Now P0 can subscribe
      setInitialParticipantsEnabled(true); // FIX 1: Explicitly enable P0 (bypasses stagger condition)
    }
  }, [enabled, enablePreSearch, presearchSub.state.status, presearchReady, roundNumber]);

  // ✅ STAGGER EFFECT: Enable next subscription when current one COMPLETES
  // FIX: Previously enabled P(n+1) when P(n) started streaming, causing race condition
  // where P1 would stream while P0 was still streaming. Now we only enable P(n+1)
  // when P(n) is complete or errored, enforcing proper "baton passing" per FLOW_DOCUMENTATION:
  // "Frame 4: P1 complete → P2 starts (baton passed)"
  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!presearchReady) {
      return;
    } // Wait for presearch to complete first

    // ✅ DIAGNOSTIC: Log participant states when stagger effect runs
    const statesSummary = participantStates.map((s, i) => `P${i}:${s?.status ?? 'null'}`).join(' ');
    rlog.stream('check', `r${roundNumber} stagger-effect: ${statesSummary} maxIdx=${maxEnabledIndex}`);

    // Find the highest index that is COMPLETE (not streaming!)
    // This enforces sequential execution: P0 complete → P1 starts → P1 complete → P2 starts
    let highestCompleteIndex = -1;
    for (let i = 0; i < participantCount; i++) {
      const state = participantStates[i];
      // FIX: Only consider complete/error status, NOT isStreaming
      // This ensures P(n+1) waits for P(n) to finish before subscribing
      if (state && (state.status === 'complete' || state.status === 'error')) {
        highestCompleteIndex = i;
      } else {
        // Stop at first non-complete participant - sequential order matters
        break;
      }
    }

    // Enable subscription for next participant (if any)
    const nextIndex = highestCompleteIndex + 1;
    if (nextIndex < participantCount && nextIndex > maxEnabledIndex) {
      rlog.stream('check', `r${roundNumber} baton pass: P${highestCompleteIndex} complete → enabling P${nextIndex}`);
      setMaxEnabledIndex(nextIndex);
    }

    // Check if all participants are complete to enable moderator
    if (areAllParticipantsComplete(participantStates) && !moderatorEnabled) {
      rlog.stream('check', `r${roundNumber} all participants complete → enabling moderator`);
      setModeratorEnabled(true);
    }
  }, [enabled, presearchReady, participantCount, participantStates, maxEnabledIndex, moderatorEnabled, roundNumber]);

  // Build combined state
  const state = useMemo((): RoundSubscriptionState => {
    const presearchComplete = !enablePreSearch || presearchSub.state.status === 'complete' || presearchSub.state.status === 'disabled';
    // Guard against empty array: areAllParticipantsComplete returns false for empty array
    const allParticipantsDone = areAllParticipantsComplete(participantStates);
    const moderatorComplete = moderatorSub.state.status === 'complete' || moderatorSub.state.status === 'error';

    const isRoundComplete = presearchComplete && allParticipantsDone && moderatorComplete;

    const hasActiveStream
      = presearchSub.state.isStreaming
        || participantStates.some(s => s.isStreaming)
        || moderatorSub.state.isStreaming;

    return {
      hasActiveStream,
      isRoundComplete,
      moderator: moderatorSub.state,
      participants: participantStates,
      presearch: presearchSub.state,
    };
  }, [enablePreSearch, presearchSub.state, participantStates, moderatorSub.state]);

  // Check for round completion and call callback
  useEffect(() => {
    if (state.isRoundComplete && !hasCalledRoundCompleteRef.current && enabled) {
      hasCalledRoundCompleteRef.current = true;
      rlog.phase('round-subscription', `r${roundNumber} COMPLETE - all entities done`);
      onRoundComplete?.();
    }
  }, [state.isRoundComplete, enabled, roundNumber, onRoundComplete]);

  // Abort all subscriptions
  const abort = useCallback(() => {
    presearchSub.abort();
    activeParticipantSubs.forEach(sub => sub.abort());
    moderatorSub.abort();
  }, [presearchSub, activeParticipantSubs, moderatorSub]);

  // Retry a specific entity
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

  return {
    abort,
    retryEntity,
    state,
  };
}
