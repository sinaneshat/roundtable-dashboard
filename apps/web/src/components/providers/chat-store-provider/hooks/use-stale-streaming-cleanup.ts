import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { RETRY_LIMITS } from '@/constants';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatStoreApi } from '@/stores/chat';
import { getParticipantCompletionStatus, isRoundComplete } from '@/stores/chat';

type UseStaleStreamingCleanupParams = {
  store: ChatStoreApi;
};

const CLEANUP_CHECK_INTERVAL_MS = 2000;

/**
 * Force cleanup timeout: If streaming flags are all false but streamingRoundNumber
 * is still set for this long, force cleanup even if isRoundComplete returns false.
 * This handles edge cases where participant messages have empty parts or no finishReason.
 */
const FORCE_CLEANUP_TIMEOUT_MS = 10000;

export function useStaleStreamingCleanup({
  store,
}: UseStaleStreamingCleanupParams) {
  const cleanupAttemptedRef = useRef<number | null>(null);
  const staleStateStartTimeRef = useRef<number | null>(null);
  const handoffResetCountRef = useRef(0);

  const {
    isModeratorStreaming,
    isStreaming,
    streamingRoundNumber,
    waitingToStartStreaming,
  } = useStore(store, useShallow(s => ({
    isModeratorStreaming: s.isModeratorStreaming,
    isStreaming: s.isStreaming,
    streamingRoundNumber: s.streamingRoundNumber,
    waitingToStartStreaming: s.waitingToStartStreaming,
  })));

  useEffect(() => {
    if (streamingRoundNumber === null) {
      cleanupAttemptedRef.current = null;
      staleStateStartTimeRef.current = null;
      return;
    }

    if (isStreaming || isModeratorStreaming || waitingToStartStreaming) {
      staleStateStartTimeRef.current = null;
      return;
    }

    if (cleanupAttemptedRef.current === streamingRoundNumber) {
      return;
    }

    // Track when we first detected this stale state
    if (staleStateStartTimeRef.current === null) {
      staleStateStartTimeRef.current = Date.now();
    }

    const checkStaleState = () => {
      const state = store.getState();

      if (state.streamingRoundNumber !== streamingRoundNumber) {
        return;
      }
      if (state.isStreaming || state.isModeratorStreaming || state.waitingToStartStreaming) {
        staleStateStartTimeRef.current = null;
        return;
      }

      const roundComplete = isRoundComplete(
        state.messages,
        state.participants,
        streamingRoundNumber,
      );

      if (roundComplete) {
        rlog.sync('stale-cleanup', `r${streamingRoundNumber} round complete - cleaning up`);
        cleanupAttemptedRef.current = streamingRoundNumber;
        staleStateStartTimeRef.current = null;
        state.completeStreaming();
        return;
      }

      // Force cleanup if we've been in stale state too long
      // This handles edge cases where participant messages have empty parts
      // or the round is stuck for unknown reasons
      const staleStartTime = staleStateStartTimeRef.current;
      if (staleStartTime !== null) {
        const staleDuration = Date.now() - staleStartTime;
        if (staleDuration >= FORCE_CLEANUP_TIMEOUT_MS) {
          // ✅ RACE FIX: Re-check streaming flags right before force cleanup
          // During participant transitions, flags may briefly go false.
          // Also check nextParticipantToTrigger - if set, more streaming is expected.
          const freshState = store.getState();
          if (freshState.isStreaming
            || freshState.isModeratorStreaming
            || freshState.waitingToStartStreaming
            || freshState.nextParticipantToTrigger !== null) {
            rlog.sync('stale-cleanup', `r${streamingRoundNumber} skipping force cleanup - streaming activity detected`);
            staleStateStartTimeRef.current = Date.now();
            handoffResetCountRef.current = 0;
            return;
          }

          // ✅ FIX 5: Handoff flag check with max reset counter
          // If handoff flag stuck for RETRY_LIMITS.MAX_HANDOFF_RESETS cycles (30s), force clear it
          if (freshState.participantHandoffInProgress) {
            handoffResetCountRef.current++;
            if (handoffResetCountRef.current >= RETRY_LIMITS.MAX_HANDOFF_RESETS) {
              rlog.sync('stale-cleanup', `r${streamingRoundNumber} handoff stuck, forcing clear after ${RETRY_LIMITS.MAX_HANDOFF_RESETS} resets`);
              freshState.setParticipantHandoffInProgress(false);
              handoffResetCountRef.current = 0;
              // Continue to cleanup logic below
            } else {
              rlog.sync('stale-cleanup', `r${streamingRoundNumber} skipping - handoff in progress (reset ${handoffResetCountRef.current}/${RETRY_LIMITS.MAX_HANDOFF_RESETS})`);
              staleStateStartTimeRef.current = Date.now();
              return;
            }
          } else {
            handoffResetCountRef.current = 0;
          }

          // ✅ V7 FIX: Check if participants are actually complete before force cleanup
          // This prevents cleanup during the gap between P0 finishing and P1 starting
          const participantStatus = getParticipantCompletionStatus(
            freshState.messages,
            freshState.participants,
            streamingRoundNumber,
          );

          if (!participantStatus.allComplete) {
            rlog.sync('stale-cleanup', `r${streamingRoundNumber} skipping force cleanup - participants incomplete (${participantStatus.completedCount}/${participantStatus.expectedCount})`);
            staleStateStartTimeRef.current = Date.now();
            return;
          }

          rlog.sync('stale-force-cleanup', `r${streamingRoundNumber} forcing cleanup after ${staleDuration}ms - round not complete but streaming stuck`);
          cleanupAttemptedRef.current = streamingRoundNumber;
          staleStateStartTimeRef.current = null;
          state.completeStreaming();
        }
      }
    };

    const initialTimeout = setTimeout(checkStaleState, 500);
    const intervalId = setInterval(checkStaleState, CLEANUP_CHECK_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(intervalId);
    };
  }, [
    store,
    streamingRoundNumber,
    isStreaming,
    isModeratorStreaming,
    waitingToStartStreaming,
  ]);
}
