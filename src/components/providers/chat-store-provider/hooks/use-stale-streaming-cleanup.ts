'use client';

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
    if (streamingRoundNumber === null) {
      cleanupAttemptedRef.current = null;
      return;
    }

    if (isStreaming || isModeratorStreaming || waitingToStartStreaming) {
      return;
    }

    if (cleanupAttemptedRef.current === streamingRoundNumber) {
      return;
    }

    const checkStaleState = () => {
      const state = store.getState();

      if (state.streamingRoundNumber !== streamingRoundNumber) {
        return;
      }
      if (state.isStreaming || state.isModeratorStreaming || state.waitingToStartStreaming) {
        return;
      }

      const roundComplete = isRoundComplete(
        state.messages,
        state.participants,
        streamingRoundNumber,
      );

      if (roundComplete) {
        cleanupAttemptedRef.current = streamingRoundNumber;
        state.completeStreaming();
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
