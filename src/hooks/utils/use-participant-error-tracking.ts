'use client';

import { useCallback, useRef } from 'react';

/**
 * Return value from the participant error tracking hook
 */
export type UseParticipantErrorTrackingReturn = {
  /** Check if a participant has already responded (prevents duplicate error messages) */
  hasResponded: (participantKey: string) => boolean;
  /** Mark a participant as having responded */
  markAsResponded: (participantKey: string) => void;
  /** Reset all tracking state */
  reset: () => void;
};

/**
 * Participant Error Tracking Hook - Response Deduplication
 *
 * Prevents duplicate error messages and responses for the same participant.
 * Tracks which participants have already responded in the current round to avoid
 * processing the same participant multiple times due to error recovery or retries.
 *
 * @example
 * ```typescript
 * const errorTracking = useParticipantErrorTracking();
 *
 * // In error handler
 * onError: (error) => {
 *   const participant = participants[currentIndex];
 *   const errorKey = `${participant.modelId}-${currentIndex}`;
 *
 *   if (errorTracking.hasResponded(errorKey)) {
 *     // Skip - we already created an error message for this participant
 *     return;
 *   }
 *
 *   errorTracking.markAsResponded(errorKey);
 *   createErrorMessage(participant, error);
 * }
 *
 * // In success handler
 * onFinish: (data) => {
 *   const participant = participants[currentIndex];
 *   const successKey = `${participant.modelId}-${currentIndex}`;
 *
 *   if (errorTracking.hasResponded(successKey)) {
 *     // Skip - this was a retry after error, don't duplicate response
 *     return;
 *   }
 *
 *   errorTracking.markAsResponded(successKey);
 *   addMessageToUI(data.message);
 * }
 *
 * // At round completion
 * errorTracking.reset(); // Clear for next round
 * ```
 *
 * **Why This is Needed**:
 * Without deduplication, the following can happen:
 * 1. Participant A fails with error → error handler creates error message
 * 2. Error recovery triggers → error handler fires AGAIN
 * 3. Result: Duplicate error messages in the UI
 *
 * **Tracking Key Format**: `${participant.modelId}-${participantIndex}`
 * - Uses modelId (e.g., "gpt-4-turbo") + index (0, 1, 2) as unique identifier
 * - Same participant in different positions gets different keys
 * - Cleared at round completion via `reset()`
 *
 * **Integration**: Works with `useParticipantQueue` and `useRoundTracking`
 * to provide complete participant orchestration. See `/src/hooks/utils/README.md`
 * for full architecture documentation.
 *
 * @returns Error tracking state and control functions
 */
export function useParticipantErrorTracking(): UseParticipantErrorTrackingReturn {
  const respondedParticipantsRef = useRef<Set<string>>(new Set());

  /**
   * Check if a participant has already responded
   *
   * @param participantKey - Unique key for the participant (format: `${modelId}-${index}`)
   * @returns true if the participant has already been marked as responded
   */
  const hasResponded = useCallback((participantKey: string) => {
    return respondedParticipantsRef.current.has(participantKey);
  }, []);

  /**
   * Mark a participant as having responded
   *
   * This prevents duplicate processing for the same participant in the current round.
   * Used in both success and error handlers to ensure only one message per participant.
   *
   * @param participantKey - Unique key for the participant (format: `${modelId}-${index}`)
   */
  const markAsResponded = useCallback((participantKey: string) => {
    respondedParticipantsRef.current.add(participantKey);
  }, []);

  /**
   * Reset all tracking state
   *
   * Clears the set of responded participants. Called at round completion to
   * allow the same participants to respond in the next round.
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
