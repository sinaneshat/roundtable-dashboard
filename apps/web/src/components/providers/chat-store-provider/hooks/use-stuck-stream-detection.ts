import type { RefObject } from 'react';
import { useEffect } from 'react';
import { useStore } from 'zustand';

import type { ChatStoreApi } from '@/stores/chat';

type UseStuckStreamDetectionParams = {
  store: ChatStoreApi;
  lastStreamActivityRef: RefObject<number>;
};

/**
 * Stream activity tracking hook.
 *
 * Previously detected "stuck" streams via timeout-based polling and auto-navigated.
 * Now only tracks activity timestamp for debugging - never auto-navigates based on timeouts.
 *
 * Rationale: Timeout-based detection caused premature navigation during legitimate
 * streaming phases (e.g., moderator starting after participants finish). Stream
 * completion should be event-driven (streamFinishAcknowledged, isModeratorStreaming)
 * not timeout-driven.
 */
export function useStuckStreamDetection({
  store,
  lastStreamActivityRef,
}: UseStuckStreamDetectionParams) {
  const chatIsStreaming = useStore(store, s => s.isStreaming);

  // Track streaming activity timestamp for debugging/monitoring purposes only
  // Never auto-navigate or reset state based on timeouts
  useEffect(() => {
    if (chatIsStreaming) {
      lastStreamActivityRef.current = Date.now();
    }
  }, [chatIsStreaming, lastStreamActivityRef]);
}
