/**
 * useAnalysisCreation Hook
 *
 * Manages analysis creation lifecycle with duplicate prevention and regeneration support.
 *
 * React 19.2 Pattern: Uses refs for tracking + useCallback for stable functions
 * AI SDK v5 Pattern: Timing with requestAnimationFrame for browser paint cycles
 *
 * Used by:
 * - ChatOverviewScreen: Basic analysis creation after streaming
 * - ChatThreadScreen: Advanced with regeneration, state management, query invalidation
 *
 * Key Features:
 * - Duplicate prevention via Set-based tracking
 * - Participant failure detection
 * - User question extraction from messages
 * - Regeneration timing with requestAnimationFrame
 * - Flexible state management callbacks
 *
 * @module hooks/utils/use-analysis-creation
 */

import type { UIMessage } from 'ai';
import { startTransition, useCallback, useEffect, useRef } from 'react';

import type { ChatParticipant } from '@/api/routes/chat/schema';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { checkAllParticipantsFailed, shouldCreateAnalysis } from '@/lib/utils/analysis-utils';
import { getCurrentRoundNumber } from '@/lib/utils/round-utils';

/**
 * Configuration options for analysis creation
 */
export type AnalysisCreationOptions = {
  /**
   * Function to create a pending analysis in the cache
   */
  createPendingAnalysis: (
    roundNumber: number,
    messages: UIMessage[],
    participants: ChatParticipant[],
    userQuestion: string,
  ) => void;

  /**
   * Current messages from useChat
   */
  messages: UIMessage[];

  /**
   * Current participants from context
   */
  participants: ChatParticipant[];

  /**
   * Ref to latest messages (prevents stale closures)
   */
  messagesRef: React.MutableRefObject<UIMessage[]>;

  /**
   * Ref to latest participants (prevents stale closures)
   */
  participantsRef: React.MutableRefObject<ChatParticipant[]>;

  /**
   * Whether currently in regeneration mode
   * @default false
   */
  isRegeneration?: boolean;

  /**
   * Round number being regenerated (null if not regenerating)
   */
  regeneratingRoundNumber?: number | null;

  /**
   * Callback before analysis creation starts
   * Use for setting flags like isCreatingAnalysis
   */
  onBeforeCreate?: (roundNumber: number) => void;

  /**
   * Callback after analysis creation completes
   * Use for clearing flags, invalidating queries
   */
  onAfterCreate?: (roundNumber: number) => void;

  /**
   * Callback when all participants failed
   * Use for cleanup when no analysis should be created
   */
  onAllParticipantsFailed?: (roundNumber: number) => void;
};

/**
 * Return value from useAnalysisCreation hook
 */
export type AnalysisCreationReturn = {
  /**
   * Set of round numbers that have had analyses created
   * Used to prevent duplicate creation
   */
  createdAnalysisRoundsRef: React.MutableRefObject<Set<number>>;

  /**
   * Stable callback for onComplete from useSharedChatContext
   * Call this when all participants finish streaming
   */
  handleComplete: () => void;

  /**
   * Manually trigger analysis creation for a specific round
   * Useful for retry scenarios
   */
  createAnalysisForRound: (roundNumber: number) => void;
};

/**
 * Hook to manage analysis creation lifecycle
 *
 * Consolidates the complex analysis creation logic from ChatOverviewScreen
 * and ChatThreadScreen into a single reusable hook.
 *
 * Flow:
 * 1. All participants finish streaming
 * 2. handleComplete() is called by useSharedChatContext
 * 3. Checks if analysis should be created (duplicates, failures)
 * 4. Calls onBeforeCreate (sets flags)
 * 5. Creates pending analysis via createPendingAnalysis
 * 6. Schedules onAfterCreate (clears flags, invalidates queries)
 *
 * Regeneration Handling:
 * - Delays analysis creation by one frame (requestAnimationFrame)
 * - Allows UI to settle before starting analysis stream
 *
 * @param options - Configuration for analysis creation
 * @returns Tracking ref and callbacks for analysis lifecycle
 *
 * @example
 * ```typescript
 * const {
 *   createdAnalysisRoundsRef,
 *   handleComplete,
 *   createAnalysisForRound
 * } = useAnalysisCreation({
 *   createPendingAnalysis,
 *   messages,
 *   participants,
 *   messagesRef,
 *   participantsRef,
 *   isRegeneration: state.data.regeneratingRoundNumber !== null,
 *   onBeforeCreate: (roundNumber) => {
 *     dispatch({ type: 'SET_IS_CREATING_ANALYSIS', payload: true });
 *   },
 *   onAfterCreate: (roundNumber) => {
 *     dispatch({ type: 'SET_IS_CREATING_ANALYSIS', payload: false });
 *     queryClient.invalidateQueries({ queryKey: queryKeys.threads.analyses(threadId) });
 *   }
 * });
 *
 * // Set in useSharedChatContext
 * useEffect(() => {
 *   setOnComplete(handleComplete);
 * }, [handleComplete, setOnComplete]);
 * ```
 */
export function useAnalysisCreation(
  options: AnalysisCreationOptions,
): AnalysisCreationReturn {
  const {
    createPendingAnalysis,
    messagesRef,
    participantsRef,
    isRegeneration = false,
    onBeforeCreate,
    onAfterCreate,
    onAllParticipantsFailed,
  } = options;

  // Track which rounds have had analyses created
  const createdAnalysisRoundsRef = useRef(new Set<number>());

  // Timeout refs for cleanup
  const analysisTimeoutRef = useRef<number | null>(null);
  const queryReEnableTimeoutRef = useRef<number | null>(null);

  /**
   * Core analysis creation logic
   * Extracted for reuse in both handleComplete and manual creation
   */
  const createAnalysis = useCallback(
    (roundNumber: number) => {
      // Prevent duplicate analysis creation
      if (createdAnalysisRoundsRef.current.has(roundNumber)) {
        return;
      }

      const latestMessages = messagesRef.current;
      const latestParticipants = participantsRef.current;

      // Validate that analysis should be created
      if (
        !shouldCreateAnalysis(
          latestMessages,
          latestParticipants,
          roundNumber,
          createdAnalysisRoundsRef.current,
        )
      ) {
        // Check if all participants failed
        if (checkAllParticipantsFailed(latestMessages)) {
          onAllParticipantsFailed?.(roundNumber);
        }
        return;
      }

      // Extract user question from messages
      const latestUserMessage = latestMessages.findLast(m => m.role === 'user');
      const latestUserQuestion = extractTextFromMessage(latestUserMessage);

      // Call before-create callback (set flags)
      onBeforeCreate?.(roundNumber);

      // Mark this round as having analysis created BEFORE calling createPendingAnalysis
      // This prevents duplicate calls if onComplete is triggered multiple times
      createdAnalysisRoundsRef.current.add(roundNumber);

      try {
        // Create pending analysis synchronously
        createPendingAnalysis(
          roundNumber,
          latestMessages,
          latestParticipants,
          latestUserQuestion,
        );
      } catch (error) {
        // If creation fails, remove from tracked set so it can be retried
        createdAnalysisRoundsRef.current.delete(roundNumber);
        throw error;
      }

      // AI SDK v5 Pattern: Use startTransition to defer non-urgent state updates
      // This ensures the pending analysis renders and triggers the stream BEFORE
      // the query is re-enabled (which would cause a refetch that overwrites the pending analysis)
      startTransition(() => {
        // AI SDK v5 Pattern: Use double requestAnimationFrame for reliable render completion
        // First rAF ensures pending analysis renders, second ensures stream triggers
        queryReEnableTimeoutRef.current = requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            // Call after-create callback (clear flags, invalidate queries)
            onAfterCreate?.(roundNumber);
          });
        });
      });
    },
    [
      messagesRef,
      participantsRef,
      createPendingAnalysis,
      onBeforeCreate,
      onAfterCreate,
      onAllParticipantsFailed,
    ],
  );

  /**
   * Handle completion of all participants
   * Called by useSharedChatContext when last participant finishes
   */
  const handleComplete = useCallback(() => {
    const currentMessages = messagesRef.current;
    const roundNumber = getCurrentRoundNumber(currentMessages);

    if (isRegeneration) {
      // AI SDK v5 Pattern: Use requestAnimationFrame for UI settling
      // Waits for browser paint cycle instead of arbitrary 100ms delay
      analysisTimeoutRef.current = requestAnimationFrame(() => {
        createAnalysis(roundNumber);
      });
    } else {
      // Create analysis immediately for normal rounds
      createAnalysis(roundNumber);
    }
  }, [messagesRef, isRegeneration, createAnalysis]);

  /**
   * Manually create analysis for a specific round
   * Useful for retry scenarios
   */
  const createAnalysisForRound = useCallback(
    (roundNumber: number) => {
      createAnalysis(roundNumber);
    },
    [createAnalysis],
  );

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (analysisTimeoutRef.current) {
        cancelAnimationFrame(analysisTimeoutRef.current);
        analysisTimeoutRef.current = null;
      }
      if (queryReEnableTimeoutRef.current) {
        cancelAnimationFrame(queryReEnableTimeoutRef.current);
        queryReEnableTimeoutRef.current = null;
      }
    };
  }, []);

  return {
    createdAnalysisRoundsRef,
    handleComplete,
    createAnalysisForRound,
  };
}
