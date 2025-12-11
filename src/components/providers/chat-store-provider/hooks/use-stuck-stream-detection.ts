'use client';

/**
 * Stuck Stream Detection Hook
 *
 * Auto-stops streams that get stuck in isStreaming=true state.
 * Uses dynamic timeout based on web search complexity.
 */

import { useRouter } from 'next/navigation';
import type { MutableRefObject } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { showApiErrorToast } from '@/lib/toast';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';
import { getPreSearchTimeout, TIMEOUT_CONFIG } from '@/lib/utils/web-search-utils';
import type { ChatStoreApi } from '@/stores/chat';

type UseStuckStreamDetectionParams = {
  store: ChatStoreApi;
  lastStreamActivityRef: MutableRefObject<number>;
};

/**
 * Auto-stops stuck streams after timeout
 */
export function useStuckStreamDetection({
  store,
  lastStreamActivityRef,
}: UseStuckStreamDetectionParams) {
  const router = useRouter();
  const chatIsStreaming = useStore(store, s => s.isStreaming);

  useEffect(() => {
    if (!chatIsStreaming)
      return;

    // Reset activity timer when streaming starts
    lastStreamActivityRef.current = Date.now();

    // Calculate dynamic timeout
    const currentState = store.getState();
    const webSearchEnabled = currentState.thread?.enableWebSearch ?? currentState.enableWebSearch;

    let streamTimeoutMs = 60_000; // Default 60 seconds

    if (webSearchEnabled && currentState.messages.length > 0) {
      const currentRound = getCurrentRoundNumber(currentState.messages);
      const preSearchForRound = Array.isArray(currentState.preSearches)
        ? currentState.preSearches.find(ps => ps.roundNumber === currentRound)
        : undefined;

      const preSearchTimeout = getPreSearchTimeout(preSearchForRound);
      streamTimeoutMs = Math.max(60_000, Math.min(preSearchTimeout + 30_000, TIMEOUT_CONFIG.MAX_MS));
    }

    const checkInterval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastStreamActivityRef.current;

      if (elapsed > streamTimeoutMs) {
        console.error('[ChatStoreProvider] Stream stuck detected - force stopping', {
          elapsed,
          timeout: streamTimeoutMs,
          webSearchEnabled,
        });

        const latestState = store.getState();
        latestState.setWaitingToStartStreaming(false);
        latestState.setIsStreaming(false);
        latestState.setIsCreatingThread(false);
        latestState.checkStuckStreams();
        latestState.resetToOverview();
        router.push('/chat');

        showApiErrorToast('Stream timed out', new Error('The connection timed out. Please try again.'));

        clearInterval(checkInterval);
      }
    }, 5000);

    return () => clearInterval(checkInterval);
  }, [chatIsStreaming, store, router, lastStreamActivityRef]);
}
