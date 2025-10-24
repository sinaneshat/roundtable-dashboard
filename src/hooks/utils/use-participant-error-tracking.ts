/**
 * Participant Error Tracking Hook
 *
 * Prevents duplicate error messages for the same participant during multi-participant rounds.
 * Tracks which participants have already responded (success or error) to avoid duplicate UI updates.
 *
 * @module hooks/utils/use-participant-error-tracking
 */

'use client';

import { useCallback, useRef } from 'react';

export type UseParticipantErrorTrackingReturn = {
  /**
   * Check if participant has already responded
   * @param participantKey - Unique key for participant (e.g., "modelId-index")
   * @returns True if participant has already responded
   */
  hasResponded: (participantKey: string) => boolean;

  /**
   * Mark participant as responded
   * @param participantKey - Unique key for participant (e.g., "modelId-index")
   */
  markAsResponded: (participantKey: string) => void;

  /**
   * Reset all tracking state (called when round completes)
   */
  reset: () => void;
};

/**
 * Hook for tracking participant responses to prevent duplicates
 *
 * Uses a Set-based ref to track which participants have already responded.
 * Prevents duplicate error messages when:
 * - AI SDK triggers multiple error callbacks
 * - Same participant fails multiple times
 * - Race conditions in async response handling
 *
 * Key features:
 * - Efficient Set-based tracking
 * - No re-renders (ref-based)
 * - Automatic deduplication by participant key
 *
 * @example
 * ```tsx
 * const errorTracking = useParticipantErrorTracking();
 *
 * // When participant responds (success or error)
 * const participantKey = `${participant.modelId}-${index}`;
 *
 * if (!errorTracking.hasResponded(participantKey)) {
 *   errorTracking.markAsResponded(participantKey);
 *   // Create error message or process response
 * }
 *
 * // When round completes
 * errorTracking.reset();
 * ```
 */
export function useParticipantErrorTracking(): UseParticipantErrorTrackingReturn {
  // ✅ Track which participants have already responded (prevent duplicate errors)
  // Uses modelId-index as key to handle:
  // - Multiple participants with same model
  // - Same model at different indices
  // - Regeneration scenarios where same model responds again
  const respondedParticipantsRef = useRef<Set<string>>(new Set());

  /**
   * Check if participant has already responded
   */
  const hasResponded = useCallback((participantKey: string) => {
    return respondedParticipantsRef.current.has(participantKey);
  }, []);

  /**
   * Mark participant as responded
   */
  const markAsResponded = useCallback((participantKey: string) => {
    respondedParticipantsRef.current.add(participantKey);
  }, []);

  /**
   * Reset all tracking state
   */
  const reset = useCallback(() => {
    respondedParticipantsRef.current.clear();
  }, []);

  return {
    hasResponded,
    markAsResponded,
    reset,
  };
}
