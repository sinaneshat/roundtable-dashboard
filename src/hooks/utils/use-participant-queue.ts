/**
 * Participant Queue Hook
 *
 * Manages sequential participant progression in multi-participant chat rounds.
 * Handles queue state, advancement logic, and round completion detection.
 *
 * @module hooks/utils/use-participant-queue
 */

'use client';

import { useCallback, useRef, useState } from 'react';

export type UseParticipantQueueOptions = {
  /**
   * Number of participants in the round (including user)
   */
  participantCount: number;

  /**
   * Callback when round completes (all participants responded)
   */
  onRoundComplete?: () => void;

  /**
   * Callback when all processing completes
   */
  onComplete?: () => void;

  /**
   * Current regeneration round number (if any)
   */
  regenerateRoundNumber?: number | null;
};

export type UseParticipantQueueReturn = {
  /**
   * Current participant index (0-based)
   */
  currentIndex: number;

  /**
   * Remaining participant indices in queue
   */
  queue: number[];

  /**
   * Whether next participant request is pending
   */
  pending: boolean;

  /**
   * Whether queue is empty and no requests pending
   */
  isEmpty: boolean;

  /**
   * Initialize queue with participant count
   * Creates queue [1, 2, 3, ...] (skips 0, user message already sent)
   */
  initialize: (participantCount: number) => void;

  /**
   * Advance to next participant in queue
   * Calls onRoundComplete when queue is empty
   */
  advance: () => void;

  /**
   * Set pending state for next participant
   */
  setPending: (pending: boolean) => void;

  /**
   * Reset queue to empty state
   */
  reset: () => void;
};

/**
 * Hook for managing participant queue in multi-participant chat rounds
 *
 * Handles:
 * - Queue initialization with participant indices
 * - Sequential advancement through participants
 * - Round completion detection and callbacks
 * - Pending state management
 *
 * @example
 * ```tsx
 * const queue = useParticipantQueue({
 *   participantCount: 3,
 *   onRoundComplete: () => console.log('Round complete'),
 *   onComplete: () => console.log('All complete'),
 * });
 *
 * // Initialize queue when starting round
 * queue.initialize(3); // Creates queue: [1, 2]
 *
 * // Advance to next participant
 * queue.advance(); // currentIndex: 1, queue: [2]
 * queue.advance(); // currentIndex: 2, queue: []
 * queue.advance(); // Calls onRoundComplete, resets to currentIndex: 0
 * ```
 */
export function useParticipantQueue({
  onRoundComplete,
  onComplete,
  regenerateRoundNumber: regenerateRoundNumberParam,
}: UseParticipantQueueOptions): UseParticipantQueueReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);

  // Track regeneration state
  const [regenerateRoundNumber, setRegenerateRoundNumber] = useState<number | null>(
    regenerateRoundNumberParam || null,
  );
  const regenerateRoundNumberRef = useRef<number | null>(regenerateRoundNumber);

  /**
   * Initialize queue with participant indices
   * Creates queue [1, 2, 3, ...] (skips 0, user message already sent)
   */
  const initialize = useCallback((participantCount: number) => {
    if (participantCount <= 0) {
      setQueue([]);
      setCurrentIndex(0);
      return;
    }

    // Create queue [1, 2, 3, ...] (skip 0, user message already sent)
    const newQueue = Array.from(
      { length: participantCount - 1 },
      (_, i) => i + 1,
    );

    setQueue(newQueue);
    setCurrentIndex(0);
    setPending(false);
  }, []);

  /**
   * Advance to next participant in queue, or complete round if queue is empty
   */
  const advance = useCallback(() => {
    setQueue((prevQueue) => {
      const [nextIndex, ...remaining] = prevQueue;

      if (nextIndex !== undefined) {
        // More participants in queue - advance to next
        setCurrentIndex(nextIndex);
        setPending(true);
        return remaining;
      }

      // Queue empty - round complete
      setCurrentIndex(0);

      // ✅ CRITICAL FIX: Clear regeneration flag AFTER all participants complete
      // Use ref to reliably access the current value
      if (regenerateRoundNumberRef.current !== null) {
        setRegenerateRoundNumber(null);
        regenerateRoundNumberRef.current = null;
      }

      // ✅ FIX: Use setTimeout instead of queueMicrotask to ensure state updates are committed
      // This ensures onRoundComplete sees all messages including the last participant's
      setTimeout(() => {
        console.warn('[useParticipantQueue] Round completed, calling callbacks', {
          hasRoundComplete: !!onRoundComplete,
          hasComplete: !!onComplete,
          queueLength: prevQueue.length,
          isRegeneration: regenerateRoundNumberRef.current !== null,
        });

        // ✅ CRITICAL FIX: Always call onRoundComplete, even during regeneration
        // During regeneration, the analysis was removed by onRetry, so we need to create a new one
        onRoundComplete?.();
        onComplete?.();
      }, 0);

      return [];
    });
  }, [onRoundComplete, onComplete]);

  /**
   * Reset queue to empty state
   */
  const reset = useCallback(() => {
    setQueue([]);
    setCurrentIndex(0);
    setPending(false);
  }, []);

  const isEmpty = queue.length === 0 && !pending;

  return {
    currentIndex,
    queue,
    pending,
    isEmpty,
    initialize,
    advance,
    setPending,
    reset,
  };
}
