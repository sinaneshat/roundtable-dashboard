/**
 * Round Number Tracking Hook
 *
 * Manages round number state and participant snapshots for multi-participant chat rounds.
 * Provides ref-based storage for round metadata that persists across component renders.
 *
 * @module hooks/utils/use-round-tracking
 */

'use client';

import { useCallback, useRef } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';

export type UseRoundTrackingReturn = {
  /**
   * Set the current round number
   * @param roundNumber - Round number to track
   */
  setRoundNumber: (roundNumber: number) => void;

  /**
   * Get the current round number
   * @returns Current round number or null if not set
   */
  getRoundNumber: () => number | null;

  /**
   * Snapshot participants at the start of a round
   * Prevents stale metadata when participant list changes mid-round
   *
   * @param participants - Participants to snapshot
   */
  snapshotParticipants: (participants: ChatParticipant[]) => void;

  /**
   * Get the snapshotted participants for current round
   * @returns Participants array from round start
   */
  getRoundParticipants: () => ChatParticipant[];

  /**
   * Reset tracking state (clear round number and participants)
   */
  reset: () => void;
};

/**
 * Hook for tracking round number and participant state in multi-participant chats
 *
 * Uses refs to maintain state across renders without triggering re-renders.
 * Ensures round metadata remains consistent throughout the round lifecycle.
 *
 * Key features:
 * - Round number tracking for consistent metadata
 * - Participant snapshotting to prevent stale data
 * - Ref-based storage for performance
 *
 * @example
 * ```tsx
 * const roundTracking = useRoundTracking();
 *
 * // When starting a round
 * roundTracking.setRoundNumber(5);
 * roundTracking.snapshotParticipants(participants);
 *
 * // During round processing
 * const roundNumber = roundTracking.getRoundNumber(); // 5
 * const participants = roundTracking.getRoundParticipants(); // Frozen snapshot
 *
 * // When round completes
 * roundTracking.reset();
 * ```
 */
export function useRoundTracking(): UseRoundTrackingReturn {
  // ✅ CRITICAL: Track current round number for this streaming session
  // Set ONCE when user sends message, used by all participants in the round
  const currentRoundNumberRef = useRef<number | null>(null);

  // ✅ Snapshot participants at round start to prevent stale metadata
  // When participant list changes mid-round, we use the snapshot to ensure
  // correct metadata is attached to messages
  const roundParticipantsRef = useRef<ChatParticipant[]>([]);

  /**
   * Set the current round number
   */
  const setRoundNumber = useCallback((roundNumber: number) => {
    currentRoundNumberRef.current = roundNumber;
  }, []);

  /**
   * Get the current round number
   */
  const getRoundNumber = useCallback(() => {
    return currentRoundNumberRef.current;
  }, []);

  /**
   * Snapshot participants at the start of a round
   */
  const snapshotParticipants = useCallback((participants: ChatParticipant[]) => {
    roundParticipantsRef.current = participants;
  }, []);

  /**
   * Get the snapshotted participants for current round
   */
  const getRoundParticipants = useCallback(() => {
    return roundParticipantsRef.current;
  }, []);

  /**
   * Reset tracking state
   */
  const reset = useCallback(() => {
    currentRoundNumberRef.current = null;
    roundParticipantsRef.current = [];
  }, []);

  return {
    setRoundNumber,
    getRoundNumber,
    snapshotParticipants,
    getRoundParticipants,
    reset,
  };
}
