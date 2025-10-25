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
 * Simple Set-based tracking to prevent duplicate participant responses.
 * Key format: `${participant.modelId}-${participantIndex}`
 */
export function useParticipantErrorTracking(): UseParticipantErrorTrackingReturn {
  const respondedParticipantsRef = useRef<Set<string>>(new Set());

  const hasResponded = useCallback((participantKey: string) => {
    return respondedParticipantsRef.current.has(participantKey);
  }, []);

  const markAsResponded = useCallback((participantKey: string) => {
    respondedParticipantsRef.current.add(participantKey);
  }, []);

  const reset = useCallback(() => {
    respondedParticipantsRef.current.clear();
  }, []);

  return {
    hasResponded,
    markAsResponded,
    reset,
  };
}
