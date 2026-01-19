import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { rlog } from '@/lib/utils/dev-logger';
import type { ChatStoreApi } from '@/stores/chat';
import { isRoundComplete } from '@/stores/chat';

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
