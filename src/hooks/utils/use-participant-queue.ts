'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Options for configuring the participant queue hook
 */
export type UseParticipantQueueOptions = {
  /** Total number of participants in the round */
  participantCount: number;
  /** Callback triggered when a round completes (all participants have responded) */
  onRoundComplete?: () => void;
  /** Callback triggered when the entire conversation completes */
  onComplete?: () => void;
  /** When set, indicates this is a round regeneration with the specified round number */
  regenerateRoundNumber?: number | null;
};

/**
 * Return value from the participant queue hook
 */
export type UseParticipantQueueReturn = {
  /** The index of the currently active participant (0-based) */
  currentIndex: number;
  /** Array of participant indices waiting to respond */
  queue: number[];
  /** Whether a participant request is currently in flight */
  pending: boolean;
  /** Whether the queue is empty and no requests are pending (round is complete) */
  isEmpty: boolean;
  /** Initialize the queue for a new round with the given participant count */
  initialize: (participantCount: number) => void;
  /** Advance to the next participant in the queue */
  advance: () => void;
  /** Set the pending state for the current participant */
  setPending: (pending: boolean) => void;
  /** Reset the queue to its initial empty state */
  reset: () => void;
};

/**
 * Participant Queue Hook - Turn Management for Multi-Participant Conversations
 *
 * Manages the sequential turn-taking of AI participants in a conversation round.
 * Participants respond one at a time in order, with the queue tracking who's next.
 *
 * @example
 * ```typescript
 * // Initialize queue for 3 participants
 * const queue = useParticipantQueue({
 *   participantCount: 3,
 *   onRoundComplete: () => console.log('Round complete!')
 * });
 *
 * // Start a new round
 * queue.initialize(3);
 * // State: { currentIndex: 0, queue: [1, 2], pending: false }
 *
 * // Participant 0 starts responding
 * queue.setPending(true);
 *
 * // Participant 0 finishes, advance to participant 1
 * queue.advance();
 * // State: { currentIndex: 1, queue: [2], pending: true }
 *
 * // Continue until queue is empty
 * queue.advance(); // currentIndex: 2, queue: []
 * queue.advance(); // currentIndex: 0, isEmpty: true, onRoundComplete called
 * ```
 *
 * **Queue Flow**:
 * ```
 * Initial:     queue: [1, 2], currentIndex: 0
 * advance() → queue: [2],    currentIndex: 1
 * advance() → queue: [],     currentIndex: 2
 * advance() → queue: [],     currentIndex: 0, onRoundComplete()
 * ```
 *
 * **Key Behaviors**:
 * - Queue contains indices of waiting participants (active participant not in queue)
 * - `advance()` dequeues the next participant and triggers callbacks when empty
 * - `pending` state prevents race conditions during API requests
 * - `isEmpty` is `true` only when queue is empty AND no request is pending
 *
 * **Integration**: Works with `useRoundTracking` and `useParticipantErrorTracking`
 * to provide complete participant orchestration. See `/src/hooks/utils/README.md`
 * for full architecture documentation.
 *
 * @param options - Configuration options for the queue
 * @returns Queue state and control functions
 */
export function useParticipantQueue({
  onRoundComplete,
  onComplete,
  regenerateRoundNumber: regenerateRoundNumberParam,
}: UseParticipantQueueOptions): UseParticipantQueueReturn {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [queue, setQueue] = useState<number[]>([]);

  const [regenerateRoundNumber, setRegenerateRoundNumber] = useState<number | null>(
    regenerateRoundNumberParam || null,
  );
  const regenerateRoundNumberRef = useRef<number | null>(regenerateRoundNumber);

  /**
   * Initialize the queue for a new round
   *
   * Creates a queue of participant indices (excluding the first participant who goes immediately).
   * For example, with 3 participants: queue becomes [1, 2], currentIndex becomes 0.
   *
   * @param participantCount - Total number of participants in this round
   */
  const initialize = useCallback((participantCount: number) => {
    if (participantCount <= 0) {
      setQueue([]);
      setCurrentIndex(0);
      return;
    }

    const newQueue = Array.from(
      { length: participantCount - 1 },
      (_, i) => i + 1,
    );

    setQueue(newQueue);
    setCurrentIndex(0);
    setPending(false);
  }, []);

  /**
   * Advance to the next participant in the queue
   *
   * Dequeues the next participant and makes them active. If the queue becomes empty,
   * this signals round completion and triggers the completion callbacks.
   *
   * **Flow**:
   * - If queue has participants: Dequeue next, set as currentIndex, setPending(true)
   * - If queue is empty: Reset to index 0, setPending(false), trigger callbacks
   *
   * **Callback Timing**: Uses setTimeout(0) to ensure state updates complete before
   * callbacks fire, preventing stale state in callback handlers.
   */
  const advance = useCallback(() => {
    setQueue((prevQueue) => {
      const [nextIndex, ...remaining] = prevQueue;

      if (nextIndex !== undefined) {
        setCurrentIndex(nextIndex);
        setPending(true);
        return remaining;
      }

      setCurrentIndex(0);
      setPending(false);

      if (regenerateRoundNumberRef.current !== null) {
        setRegenerateRoundNumber(null);
        regenerateRoundNumberRef.current = null;
      }

      setTimeout(() => {
        onRoundComplete?.();
        onComplete?.();
      }, 0);

      return [];
    });
  }, [onRoundComplete, onComplete]);

  /**
   * Reset the queue to its initial empty state
   *
   * Clears all queue state. Used when stopping mid-round or switching threads.
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
