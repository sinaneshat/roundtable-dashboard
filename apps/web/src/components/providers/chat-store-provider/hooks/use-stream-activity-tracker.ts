/**
 * Stream Activity Tracker Hook
 *
 * Minimal hook that tracks the last time streaming activity occurred.
 * Used by useStuckStreamDetection to detect stuck streams.
 *
 * This replaces the activity tracking from useMessageSync with a simpler implementation.
 */

import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { ChatStoreApi } from '@/stores/chat';

type UseStreamActivityTrackerParams = {
  store: ChatStoreApi;
};

type UseStreamActivityTrackerReturn = {
  lastStreamActivityRef: RefObject<number>;
};

/**
 * Tracks streaming activity by monitoring store message changes during streaming.
 *
 * The ref is updated whenever:
 * 1. Messages change while isStreaming is true
 * 2. A new participant starts streaming (currentParticipantIndex changes)
 * 3. Pre-search activity occurs
 */
export function useStreamActivityTracker({
  store,
}: UseStreamActivityTrackerParams): UseStreamActivityTrackerReturn {
  const lastStreamActivityRef = useRef<number>(Date.now());

  // ✅ PERF: Batch selectors with useShallow to prevent unnecessary re-renders
  const { isStreaming, messages, currentParticipantIndex, preSearches } = useStore(
    store,
    useShallow(s => ({
      isStreaming: s.isStreaming,
      messages: s.messages,
      currentParticipantIndex: s.currentParticipantIndex,
      preSearches: s.preSearches,
    })),
  );

  // Track message changes during streaming
  useEffect(() => {
    if (isStreaming && messages.length > 0) {
      lastStreamActivityRef.current = Date.now();
    }
  }, [isStreaming, messages, messages.length]);

  // Track participant changes during streaming
  useEffect(() => {
    if (isStreaming) {
      lastStreamActivityRef.current = Date.now();
    }
  }, [isStreaming, currentParticipantIndex]);

  // Track pre-search changes during streaming
  useEffect(() => {
    if (isStreaming && preSearches.length > 0) {
      lastStreamActivityRef.current = Date.now();
    }
  }, [isStreaming, preSearches, preSearches.length]);

  // Reset when streaming starts
  useEffect(() => {
    if (isStreaming) {
      lastStreamActivityRef.current = Date.now();
    }
  }, [isStreaming]);

  return { lastStreamActivityRef };
}
