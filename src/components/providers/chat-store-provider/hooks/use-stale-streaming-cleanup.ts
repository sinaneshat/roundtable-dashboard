'use client';

/**
 * Stale Streaming State Cleanup Hook
 *
 * Detects and cleans up stale streaming state where streamingRoundNumber
 * is still set but the round has actually completed (all participants +
 * moderator have finished).
 *
 * This is a safety net to prevent the chat input from being stuck in a
 * disabled state due to race conditions or missed cleanup calls.
 *
 * The hook runs periodically when streamingRoundNumber is set and checks:
 * 1. All participants have complete messages (finishReason or content)
 * 2. Moderator message exists and is complete
 *
 * If both conditions are met, it calls completeStreaming() to reset state.
 */

import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { ChatStoreApi } from '@/stores/chat';
import { isRoundComplete } from '@/stores/chat';

type UseStaleStreamingCleanupParams = {
  store: ChatStoreApi;
};

const CLEANUP_CHECK_INTERVAL_MS = 2000;

export function useStaleStreamingCleanup({
  store,
}: UseStaleStreamingCleanupParams) {
  const cleanupAttemptedRef = useRef<number | null>(null);

  const {
    streamingRoundNumber,
    isStreaming,
    isModeratorStreaming,
    waitingToStartStreaming,
  } = useStore(store, useShallow(s => ({
    streamingRoundNumber: s.streamingRoundNumber,
    isStreaming: s.isStreaming,
    isModeratorStreaming: s.isModeratorStreaming,
    waitingToStartStreaming: s.waitingToStartStreaming,
  })));

  useEffect(() => {
    // Only run when streamingRoundNumber is set but streaming flags are false
    // This indicates potentially stale state
    if (streamingRoundNumber === null) {
      cleanupAttemptedRef.current = null;
      return;
    }

    // If actively streaming, no cleanup needed
    if (isStreaming || isModeratorStreaming || waitingToStartStreaming) {
      return;
    }

    // Avoid duplicate cleanup for the same round
    if (cleanupAttemptedRef.current === streamingRoundNumber) {
      return;
    }

    const checkStaleState = () => {
      const state = store.getState();

      // Double-check conditions haven't changed
      if (state.streamingRoundNumber !== streamingRoundNumber) {
        return;
      }
      if (state.isStreaming || state.isModeratorStreaming || state.waitingToStartStreaming) {
        return;
      }

      // Check if the round is actually complete
      const roundComplete = isRoundComplete(
        state.messages,
        state.participants,
        streamingRoundNumber,
      );

      if (roundComplete) {
        // rlog.phase('STALE-CLEANUP', `r${streamingRoundNumber} complete but streamingRoundNumber still set - cleaning up`);
        cleanupAttemptedRef.current = streamingRoundNumber;
        state.completeStreaming();
      }
    };

    // Initial check after a short delay to allow for normal completion
    const initialTimeout = setTimeout(checkStaleState, 500);

    // Periodic check as a safety net
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
