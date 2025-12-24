'use client';

import { useCallback, useRef, useSyncExternalStore } from 'react';

export type UseElapsedTimeReturn = {
  elapsedSeconds: number;
  finalDuration: number | undefined;
};

/**
 * Custom hook to track elapsed time during an active state
 *
 * Uses useSyncExternalStore for efficient timer updates without
 * direct setState in useEffect (follows React 18+ best practices).
 *
 * @param isActive - Whether the timer should be running
 * @param intervalMs - Update interval in milliseconds (default: 1000ms)
 * @returns Object containing elapsedSeconds and finalDuration
 *
 * @example
 * ```tsx
 * const { elapsedSeconds, finalDuration } = useElapsedTime(isStreaming);
 * // elapsedSeconds updates every second while isStreaming is true
 * // finalDuration is set when isStreaming transitions from true to false
 * ```
 */
export function useElapsedTime(isActive: boolean, intervalMs = 1000): UseElapsedTimeReturn {
  const startTimeRef = useRef<number | null>(null);
  const finalDurationRef = useRef<number | undefined>(undefined);
  const subscribersRef = useRef(new Set<() => void>());

  // Track state transitions
  const wasActiveRef = useRef(false);

  // Handle state transitions
  if (isActive && !wasActiveRef.current) {
    // Just became active - start timing
    startTimeRef.current = Date.now();
    finalDurationRef.current = undefined;
    wasActiveRef.current = true;
  } else if (!isActive && wasActiveRef.current) {
    // Just became inactive - capture final duration
    wasActiveRef.current = false;
    if (startTimeRef.current !== null) {
      finalDurationRef.current = Math.round((Date.now() - startTimeRef.current) / 1000);
      startTimeRef.current = null;
    }
  }

  // Subscribe function for useSyncExternalStore
  const subscribe = useCallback((callback: () => void) => {
    subscribersRef.current.add(callback);

    // Set up interval while active
    let intervalId: ReturnType<typeof setInterval> | null = null;
    if (isActive) {
      intervalId = setInterval(() => {
        // Notify all subscribers to re-render
        subscribersRef.current.forEach(cb => cb());
      }, intervalMs);
    }

    return () => {
      subscribersRef.current.delete(callback);
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
    };
  }, [isActive, intervalMs]);

  // Get current snapshot of elapsed seconds
  const getSnapshot = useCallback(() => {
    if (startTimeRef.current === null) {
      return 0;
    }
    return Math.floor((Date.now() - startTimeRef.current) / 1000);
  }, []);

  // Server snapshot (always 0)
  const getServerSnapshot = useCallback(() => 0, []);

  const elapsedSeconds = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return {
    elapsedSeconds,
    finalDuration: finalDurationRef.current,
  };
}
