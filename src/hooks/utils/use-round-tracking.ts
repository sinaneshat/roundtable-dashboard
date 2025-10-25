'use client';

import { useCallback, useEffect, useRef } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';

/**
 * Return value from the round tracking hook
 */
export type UseRoundTrackingReturn = {
  /** Set the current round number */
  setRoundNumber: (roundNumber: number) => void;
  /** Get the current round number (returns null if not set) */
  getRoundNumber: () => number | null;
  /** Snapshot the current participants at the start of a round */
  snapshotParticipants: (participants: ChatParticipant[]) => void;
  /** Get the snapshotted participants for the current round */
  getRoundParticipants: () => ChatParticipant[];
  /** Reset all round tracking state */
  reset: () => void;
};

/**
 * Round Tracking Hook - Round Context and Participant Snapshot Management
 *
 * Maintains round number and participant snapshot across streaming sessions.
 * Ensures participants can't join or leave mid-round by capturing state at round start.
 *
 * @example
 * ```typescript
 * const roundTracking = useRoundTracking('thread-123');
 *
 * // At the start of a round
 * const enabledParticipants = participants.filter(p => p.isEnabled);
 * roundTracking.snapshotParticipants(enabledParticipants); // Freeze participant list
 * roundTracking.setRoundNumber(2);
 *
 * // During the round
 * const roundNumber = roundTracking.getRoundNumber(); // 2
 * const participants = roundTracking.getRoundParticipants(); // Original 3 participants
 *
 * // Even if user enables a 4th participant mid-round:
 * // getRoundParticipants() still returns the original 3
 * // The 4th participant will join in round 3
 * ```
 *
 * **Why Snapshots Matter**:
 * Without snapshots, participants could be added/removed mid-round, causing:
 * - Incorrect participant indexing in the queue
 * - Mismatched metadata (wrong participant tagged in message)
 * - Race conditions in error tracking
 *
 * **Thread Management**:
 * - Automatically resets when `threadId` changes
 * - Preserves state within the same thread across re-renders
 * - Safe to call multiple times with the same threadId
 *
 * **Integration**: Works with `useParticipantQueue` and `useParticipantErrorTracking`
 * to provide complete participant orchestration. See `/src/hooks/utils/README.md`
 * for full architecture documentation.
 *
 * @param threadId - The current chat thread ID
 * @returns Round tracking state and control functions
 */
export function useRoundTracking(threadId: string): UseRoundTrackingReturn {
  const currentRoundNumberRef = useRef<number | null>(null);
  const roundParticipantsRef = useRef<ChatParticipant[]>([]);
  const prevThreadIdRef = useRef<string>(threadId);

  /**
   * Set the current round number
   *
   * Called at the start of a round to track which round is active.
   * This is used for message metadata and round-based operations.
   *
   * @param roundNumber - The round number to set (typically starts at 1)
   */
  const setRoundNumber = useCallback((roundNumber: number) => {
    currentRoundNumberRef.current = roundNumber;
  }, []);

  /**
   * Get the current round number
   *
   * @returns The current round number, or null if not set
   */
  const getRoundNumber = useCallback(() => {
    return currentRoundNumberRef.current;
  }, []);

  /**
   * Snapshot the current participants at the start of a round
   *
   * Captures the participant list to prevent mid-round changes from affecting
   * the current round. New participants will join starting in the next round.
   *
   * @param participants - The enabled participants to snapshot
   */
  const snapshotParticipants = useCallback((participants: ChatParticipant[]) => {
    roundParticipantsRef.current = participants;
  }, []);

  /**
   * Get the snapshotted participants for the current round
   *
   * @returns The participant list as it was at the start of the round
   */
  const getRoundParticipants = useCallback(() => {
    return roundParticipantsRef.current;
  }, []);

  /**
   * Reset all round tracking state
   *
   * Clears round number and participant snapshot. Called when starting a new
   * round or switching threads.
   */
  const reset = useCallback(() => {
    currentRoundNumberRef.current = null;
    roundParticipantsRef.current = [];
  }, []);

  /**
   * Auto-reset on thread change
   *
   * When the user navigates to a different thread, automatically clear the
   * round tracking state to prevent stale data from affecting the new thread.
   */
  useEffect(() => {
    const hasSnapshot = roundParticipantsRef.current.length > 0;
    const isThreadChange = prevThreadIdRef.current && prevThreadIdRef.current !== threadId;

    if (isThreadChange && hasSnapshot) {
      currentRoundNumberRef.current = null;
      roundParticipantsRef.current = [];
    }

    prevThreadIdRef.current = threadId;
  }, [threadId]);

  return {
    setRoundNumber,
    getRoundNumber,
    snapshotParticipants,
    getRoundParticipants,
    reset,
  };
}
