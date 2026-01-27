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
  // Start with 0 - only P0 can subscribe initially
  // When P(n) starts streaming, we enable P(n+1)
  const [maxEnabledIndex, setMaxEnabledIndex] = useState(0);
  const [moderatorEnabled, setModeratorEnabled] = useState(false);

  // Reset stagger state when round changes
  useEffect(() => {
    hasCalledRoundCompleteRef.current = false;
    setMaxEnabledIndex(0);
    setModeratorEnabled(false);
    rlog.stream('check', `r${roundNumber} stagger reset: maxIdx=0 modEnabled=false`);
  }, [threadId, roundNumber]);

  // Create callbacks for each entity type
  const basePresearchCallbacks = useEntityCallbacks('presearch', { onChunk, onEntityComplete, onEntityError });
  const moderatorCallbacks = useEntityCallbacks('moderator', { onChunk, onEntityComplete, onEntityError });

  // Presearch callbacks with additional presearch-specific event handler
  const presearchCallbacks: EntitySubscriptionCallbacks = useMemo(() => ({
    ...basePresearchCallbacks,
    onPreSearchEvent,
  }), [basePresearchCallbacks, onPreSearchEvent]);

  // Pre-search subscription (conditional)
  const presearchSub = usePreSearchSubscription({
    callbacks: presearchCallbacks,
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
  const p0Sub = useParticipantSubscription({ callbacks: p0Callbacks, enabled: enabled && participantCount > 0 && 0 <= maxEnabledIndex, participantIndex: 0, roundNumber, threadId });
  const p1Sub = useParticipantSubscription({ callbacks: p1Callbacks, enabled: enabled && participantCount > 1 && 1 <= maxEnabledIndex, participantIndex: 1, roundNumber, threadId });
  const p2Sub = useParticipantSubscription({ callbacks: p2Callbacks, enabled: enabled && participantCount > 2 && 2 <= maxEnabledIndex, participantIndex: 2, roundNumber, threadId });
  const p3Sub = useParticipantSubscription({ callbacks: p3Callbacks, enabled: enabled && participantCount > 3 && 3 <= maxEnabledIndex, participantIndex: 3, roundNumber, threadId });
  const p4Sub = useParticipantSubscription({ callbacks: p4Callbacks, enabled: enabled && participantCount > 4 && 4 <= maxEnabledIndex, participantIndex: 4, roundNumber, threadId });
  const p5Sub = useParticipantSubscription({ callbacks: p5Callbacks, enabled: enabled && participantCount > 5 && 5 <= maxEnabledIndex, participantIndex: 5, roundNumber, threadId });
  const p6Sub = useParticipantSubscription({ callbacks: p6Callbacks, enabled: enabled && participantCount > 6 && 6 <= maxEnabledIndex, participantIndex: 6, roundNumber, threadId });
  const p7Sub = useParticipantSubscription({ callbacks: p7Callbacks, enabled: enabled && participantCount > 7 && 7 <= maxEnabledIndex, participantIndex: 7, roundNumber, threadId });
  const p8Sub = useParticipantSubscription({ callbacks: p8Callbacks, enabled: enabled && participantCount > 8 && 8 <= maxEnabledIndex, participantIndex: 8, roundNumber, threadId });
  const p9Sub = useParticipantSubscription({ callbacks: p9Callbacks, enabled: enabled && participantCount > 9 && 9 <= maxEnabledIndex, participantIndex: 9, roundNumber, threadId });

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

  // ✅ STAGGER EFFECT: Enable next subscription when current one starts streaming or completes
  useEffect(() => {
    if (!enabled) return;

    // Find the highest index that is streaming or complete
    let highestActiveIndex = -1;
    for (let i = 0; i < participantCount; i++) {
      const state = participantStates[i];
      if (state && (state.isStreaming || state.status === 'complete' || state.status === 'error')) {
        highestActiveIndex = i;
      }
    }

    // Enable subscription for next participant (if any)
    const nextIndex = highestActiveIndex + 1;
    if (nextIndex < participantCount && nextIndex > maxEnabledIndex) {
      rlog.stream('check', `r${roundNumber} stagger advance: P${highestActiveIndex} active → enabling P${nextIndex}`);
      setMaxEnabledIndex(nextIndex);
    }

    // Check if all participants are complete to enable moderator
    const allParticipantsComplete = participantCount > 0 && participantStates.every(
      s => s.status === 'complete' || s.status === 'error',
    );
    if (allParticipantsComplete && !moderatorEnabled) {
      rlog.stream('check', `r${roundNumber} all participants complete → enabling moderator`);
      setModeratorEnabled(true);
    }
  }, [enabled, participantCount, participantStates, maxEnabledIndex, moderatorEnabled, roundNumber]);

  // Build combined state
  const state = useMemo((): RoundSubscriptionState => {
    const presearchComplete = !enablePreSearch || presearchSub.state.status === 'complete' || presearchSub.state.status === 'disabled';
    // Guard against empty array: .every() returns true on [], which would prematurely complete
    const allParticipantsComplete = participantStates.length > 0 && participantStates.every(
      s => s.status === 'complete' || s.status === 'error',
    );
    const moderatorComplete = moderatorSub.state.status === 'complete' || moderatorSub.state.status === 'error';

    const isRoundComplete = presearchComplete && allParticipantsComplete && moderatorComplete;

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
    } else if (entity.startsWith('participant_')) {
      const index = Number.parseInt(entity.replace('participant_', ''), 10);
      if (index >= 0 && index < activeParticipantSubs.length) {
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
