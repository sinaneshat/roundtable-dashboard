import type { RefObject } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import { useRouter } from '@/lib/compat';
import { showApiErrorToast } from '@/lib/toast';
import { getCurrentRoundNumber, getPreSearchTimeout, TIMEOUT_CONFIG } from '@/lib/utils';
import type { ChatStoreApi } from '@/stores/chat';

type UseStuckStreamDetectionParams = {
  store: ChatStoreApi;
  lastStreamActivityRef: RefObject<number>;
};

export function useStuckStreamDetection({
  store,
  lastStreamActivityRef,
}: UseStuckStreamDetectionParams) {
  const router = useRouter();
  const chatIsStreaming = useStore(store, s => s.isStreaming);

  useEffect(() => {
    if (!chatIsStreaming)
      return;

    lastStreamActivityRef.current = Date.now();

    const currentState = store.getState();
    const webSearchEnabled = currentState.enableWebSearch;

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
