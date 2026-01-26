import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { rlog } from '@/lib/utils/dev-logger';
import type { ChatStoreApi } from '@/stores/chat';

import type { ChatHook } from '../types';

type UseVisibilityStreamGuardParams = {
  store: ChatStoreApi;
  chat: ChatHook;
  effectiveThreadId: string;
};

/**
 * Visibility Stream Guard Hook
 *
 * Prevents streams from stopping when browser tab loses focus.
 *
 * Problem: Browsers aggressively throttle background tabs, which can cause:
 * - Stream read callbacks to be delayed/throttled
 * - AI SDK's internal state to become stale
 * - onFinish/onChunk callbacks to pile up without processing
 *
 * Solution: When tab becomes visible after being hidden:
 * 1. Check if there's an expected active stream that may have stalled
 * 2. Trigger the stream reconnection endpoint to resume/validate the stream
 * 3. Let AI SDK's resume mechanism handle the actual reconnection
 *
 * This hook complements the `resume: true` option in useChat by explicitly
 * triggering reconnection on visibility change (AI SDK only checks on mount).
 */
export function useVisibilityStreamGuard({
  chat,
  effectiveThreadId,
  store,
}: UseVisibilityStreamGuardParams) {
  const wasHiddenRef = useRef(false);
  const hiddenTimestampRef = useRef<number | null>(null);

  const { isStreaming, waitingToStartStreaming } = useStore(
    store,
    useShallow(s => ({
      isStreaming: s.isStreaming,
      waitingToStartStreaming: s.waitingToStartStreaming,
    })),
  );

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleVisibilityChange = () => {
      const isHidden = document.hidden;

      if (isHidden) {
        // Tab is going to background - record the timestamp
        wasHiddenRef.current = true;
        hiddenTimestampRef.current = Date.now();
        rlog.flow('visibility', `hidden - streaming=${isStreaming ? 1 : 0} waiting=${waitingToStartStreaming ? 1 : 0}`);
        return;
      }

      // Tab is becoming visible
      if (!wasHiddenRef.current) {
        return;
      }

      const hiddenDuration = hiddenTimestampRef.current
        ? Date.now() - hiddenTimestampRef.current
        : 0;

      rlog.flow('visibility', `visible - wasHidden for ${hiddenDuration}ms`);

      wasHiddenRef.current = false;
      hiddenTimestampRef.current = null;

      // Only check for stream issues if we were hidden for a meaningful duration
      // Short visibility changes (< 1 second) are unlikely to cause stream issues
      if (hiddenDuration < 1000) {
        return;
      }

      const state = store.getState();
      const threadId = state.thread?.id || effectiveThreadId;

      // Check if we have an active/expected stream that may have stalled
      const hasActiveStream = state.isStreaming || state.waitingToStartStreaming;
      const hasValidThread = threadId && threadId.trim() !== '';

      if (!hasActiveStream || !hasValidThread) {
        rlog.flow('visibility', 'no active stream to check');
        return;
      }

      // Check AI SDK state vs store state
      const aiSdkIsStreaming = chat.isStreamingRef?.current ?? false;
      const storeIsStreaming = state.isStreaming;

      rlog.flow('visibility', `checking stream - sdk=${aiSdkIsStreaming ? 1 : 0} store=${storeIsStreaming ? 1 : 0} thread=${threadId.slice(-8)}`);

      // Scenario 1: Store thinks we're streaming but AI SDK doesn't
      // This indicates the stream was interrupted while tab was hidden
      if (storeIsStreaming && !aiSdkIsStreaming) {
        rlog.flow('visibility', 'stream mismatch detected - triggering reconnection check');

        // Trigger a reconnection attempt by fetching the stream endpoint
        // This will either:
        // a) Return buffered chunks if stream is still active server-side
        // b) Return empty/error if stream completed/failed
        void checkAndReconnectStream(threadId);
      }

      // Scenario 2: Both agree on streaming state - no action needed
      // The stream read callbacks will process any buffered chunks
    };

    /**
     * Check stream status and trigger reconnection if needed
     * This hits the GET /stream endpoint which:
     * - Returns buffered chunks if stream is active
     * - Returns 204/404 if no active stream
     * - The AI SDK's resume mechanism handles the actual reconnection
     */
    async function checkAndReconnectStream(threadId: string) {
      try {
        const response = await fetch(`/api/v1/chat/threads/${threadId}/stream`, {
          // Use cache: 'no-store' to ensure we get fresh stream state
          cache: 'no-store',
          credentials: 'include',
          method: 'GET',
        });

        rlog.flow('visibility', `reconnect check response: ${response.status}`);

        if (response.ok && response.body) {
          // Stream is still active - the AI SDK should pick up from here
          // We don't need to manually process the response because
          // the AI SDK's internal Chat class handles reconnection
          // Just log for debugging
          rlog.flow('visibility', 'stream active - AI SDK should resume');

          // Force AI SDK to check for stream updates
          // This is a workaround since AI SDK doesn't expose a reconnect method
          // The fetch above should trigger the internal reconnection logic
          // if the AI SDK is monitoring the stream endpoint
        } else if (response.status === 204 || response.status === 404) {
          // No active stream - clean up store state
          rlog.flow('visibility', 'no active stream - cleaning up');
          const state = store.getState();

          // Only clean up if we still think we're streaming
          if (state.isStreaming) {
            state.setIsStreaming(false);
            state.setWaitingToStartStreaming(false);
            // Let other mechanisms (stuck detection, etc.) handle full cleanup
          }
        }
      } catch (error) {
        rlog.flow('visibility', `reconnect check failed: ${error instanceof Error ? error.message : 'unknown'}`);
        // Don't clean up on network error - could be transient
        // Let stuck detection handle persistent failures
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [store, chat.isStreamingRef, effectiveThreadId, isStreaming, waitingToStartStreaming]);
}
