'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { motion } from 'framer-motion';
import { memo, useCallback, useEffect, useRef } from 'react';

import { AnalysisStatuses, StreamErrorTypes } from '@/api/core/enums';
import type { StreamErrorType } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, RecommendedAction, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { ChatLoading } from '@/components/chat/chat-loading';
import { useBoolean } from '@/hooks/utils';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';

import { LeaderboardCard } from './leaderboard-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { RoundSummarySection } from './round-summary-section';
import { SkillsComparisonChart } from './skills-comparison-chart';

type ModeratorAnalysisStreamProps = {
  threadId: string;
  analysis: StoredModeratorAnalysis;
  onStreamComplete?: (completedAnalysisData?: ModeratorAnalysisPayload) => void;
  onStreamStart?: () => void;
  onActionClick?: (action: RecommendedAction) => void;
};

// ✅ CRITICAL FIX: Track at TWO levels to prevent duplicate submissions
// 1. Analysis ID level - prevents same analysis from submitting twice
// 2. Round number level - prevents different analyses for same round from submitting
const triggeredAnalysisIds = new Map<string, boolean>();
const triggeredRounds = new Map<string, Set<number>>(); // threadId -> Set of round numbers

// Export cleanup function for regeneration scenarios
// eslint-disable-next-line react-refresh/only-export-components -- Utility function for managing component state
export function clearTriggeredAnalysis(analysisId: string) {
  triggeredAnalysisIds.delete(analysisId);
}

// Export cleanup function to clear all triggered analyses for a round
// eslint-disable-next-line react-refresh/only-export-components -- Utility function for managing component state
export function clearTriggeredAnalysesForRound(roundNumber: number) {
  // Clear analysis IDs
  const keysToDelete: string[] = [];
  triggeredAnalysisIds.forEach((_value, key) => {
    if (key.includes(`-${roundNumber}-`) || key.includes(`round-${roundNumber}`)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => triggeredAnalysisIds.delete(key));

  // Clear round tracking
  triggeredRounds.forEach((roundSet) => {
    roundSet.delete(roundNumber);
  });
}

function ModeratorAnalysisStreamComponent({
  threadId,
  analysis,
  onStreamComplete,
  onStreamStart,
  onActionClick,
}: ModeratorAnalysisStreamProps) {
  const is409Conflict = useBoolean(false);
  const streamErrorTypeRef = useRef<StreamErrorType | null>(null);

  // ✅ CRITICAL FIX: Store callbacks in refs for stability and to allow calling after unmount
  // This prevents analysis from getting stuck in "streaming" state when component unmounts
  // Follows the same pattern as use-multi-participant-chat.ts callback refs
  const onStreamCompleteRef = useRef(onStreamComplete);
  const onStreamStartRef = useRef(onStreamStart);
  const onActionClickRef = useRef(onActionClick);

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  useEffect(() => {
    onActionClickRef.current = onActionClick;
  }, [onActionClick]);

  // ✅ Create stable wrapper for onActionClick that can be safely passed to child components
  // This prevents ref access during render
  const stableOnActionClick = useCallback((action: RecommendedAction) => {
    onActionClickRef.current?.(action);
  }, []);

  // AI SDK v5 Pattern: useObject hook for streaming structured data
  const { object: partialAnalysis, error, submit, stop } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
    // ✅ AI SDK v5: Enable telemetry for debugging
    experimental_telemetry: {
      isEnabled: true,
      metadata: {
        threadId,
        roundNumber: analysis.roundNumber,
        component: 'ModeratorAnalysisStream'
      }
    },
    // ✅ AI SDK v5 Pattern: onFinish callback for handling completion and errors
    // According to AI SDK v5 docs, when object === undefined, schema validation failed
    // The error parameter contains the TypeValidationError or other streaming errors
    onFinish: ({ object: finalObject, error: streamError }) => {
      // ✅ CRITICAL: Log callback execution for AI SDK tracking
      console.log(`[AI-SDK] onFinish fired - round:${analysis.roundNumber} hasData:${!!finalObject} hasError:${!!streamError}`);

      // ✅ AI SDK v5 Pattern: Check if object is undefined (validation failure)
      // From docs: "object is undefined if the final object does not match the schema"
      if (finalObject === undefined) {
        // Classify error type using enum pattern
        let errorType: StreamErrorType = StreamErrorTypes.UNKNOWN;
        const errorMessage = streamError?.message || String(streamError || 'Unknown error');

        // ✅ Enum Pattern: Classify error type
        if (streamError instanceof Error) {
          if (streamError.name === 'AbortError' || errorMessage.includes('aborted')) {
            errorType = StreamErrorTypes.ABORT;
          } else if (streamError.name === 'TypeValidationError' || errorMessage.includes('validation')) {
            errorType = StreamErrorTypes.VALIDATION;
          } else if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('already being generated')) {
            errorType = StreamErrorTypes.CONFLICT;
            is409Conflict.onTrue();
          } else if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
            errorType = StreamErrorTypes.NETWORK;
          }
        }

        // Store error type for UI display
        streamErrorTypeRef.current = errorType;

        console.error(`[AI-SDK] Stream error (${errorType}) in round ${analysis.roundNumber}:`, errorMessage);

        // ✅ CRITICAL FIX: Always call completion callback to prevent stuck 'streaming' status
        // This ensures the analysis status gets updated even when validation or other errors occur
        onStreamCompleteRef.current?.();
        return;
      }

      // ✅ AI SDK v5 Pattern: object is defined, streaming completed successfully
      if (finalObject) {
        onStreamCompleteRef.current?.(finalObject);
      }
    },
    // ✅ AI SDK v5: Add onError for better error tracking
    onError: (error) => {
      console.error(`[AI-SDK] Stream error - round:${analysis.roundNumber}`, error);
    }
  });

  // ✅ Store submit function in ref for stable access in effects
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  }, [submit]);

  // Cleanup on unmount: stop streaming
  useEffect(() => {
    return () => {
      // Stop any active streaming
      stop();

      // ✅ CRITICAL FIX: Do NOT delete analysis ID from triggered map on unmount
      // This prevents double-calling when component unmounts/remounts (e.g., React Strict Mode, parent re-renders)
      // The ID is only cleared via clearTriggeredAnalysesForRound() during regeneration
      // triggeredAnalysisIds.delete(analysis.id); // REMOVED - causes double streaming
    };
  }, [analysis.id, stop]);

  // ✅ CRITICAL FIX: Prevent duplicate submissions at both analysis ID and round number level
  // Use useEffect that only runs when analysis becomes ready (status changes to PENDING/STREAMING)
  // NOT dependent on participantMessageIds to avoid re-triggering for reasoning models
  useEffect(() => {
    const roundAlreadyTriggered = triggeredRounds.get(threadId)?.has(analysis.roundNumber) ?? false;

    if (
      !triggeredAnalysisIds.has(analysis.id)
      && !roundAlreadyTriggered
      && (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING)
    ) {
      // Mark as triggered at BOTH levels BEFORE scheduling to prevent duplicate calls
      triggeredAnalysisIds.set(analysis.id, true);

      const roundSet = triggeredRounds.get(threadId);
      if (roundSet) {
        roundSet.add(analysis.roundNumber);
      } else {
        triggeredRounds.set(threadId, new Set([analysis.roundNumber]));
      }

      // AI SDK v5 Pattern: Use queueMicrotask for post-render scheduling
      // Capture participantMessageIds at time of queueing for stability
      const messageIds = analysis.participantMessageIds;
      queueMicrotask(() => {
        onStreamStartRef.current?.();
        submitRef.current({ participantMessageIds: messageIds });
      });
    }
    // Note: participantMessageIds NOT in deps to avoid re-trigger on metadata updates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.id, analysis.roundNumber, analysis.status, threadId]);

  // Mark completed/failed analyses as triggered to prevent re-triggering on re-renders
  // NOTE: Do NOT mark STREAMING here - that would prevent useEffect from triggering submit()
  const roundAlreadyMarked = triggeredRounds.get(threadId)?.has(analysis.roundNumber) ?? false;

  if (
    !triggeredAnalysisIds.has(analysis.id)
    && !roundAlreadyMarked
    && (analysis.status === AnalysisStatuses.COMPLETE
      || analysis.status === AnalysisStatuses.FAILED)
  ) {
    triggeredAnalysisIds.set(analysis.id, true);

    const roundSet = triggeredRounds.get(threadId);
    if (roundSet) {
      roundSet.add(analysis.roundNumber);
    } else {
      triggeredRounds.set(threadId, new Set([analysis.roundNumber]));
    }
  }
  // ✅ Enum Pattern: Determine if error should be displayed based on error type
  const errorType = streamErrorTypeRef.current;
  const shouldShowError = error && !is409Conflict.value && errorType !== StreamErrorTypes.ABORT;

  // ✅ Enum Pattern: Get user-friendly error message based on error type
  const getErrorMessage = (type: StreamErrorType | null, error: Error | unknown): string => {
    if (!type)
      return error instanceof Error ? error.message : 'Unknown error';

    switch (type) {
      case StreamErrorTypes.VALIDATION:
        return 'Analysis format validation failed. Please try again.';
      case StreamErrorTypes.NETWORK:
        return 'Network error occurred. Please check your connection and try again.';
      case StreamErrorTypes.CONFLICT:
        return 'Analysis is already being generated for this round.';
      case StreamErrorTypes.UNKNOWN:
        return error instanceof Error ? error.message : 'An unexpected error occurred.';
      default:
        return 'Failed to complete analysis.';
    }
  };

  if (shouldShowError) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="size-1.5 rounded-full bg-destructive/80" />
          <span>{getErrorMessage(errorType, error)}</span>
        </div>
      </div>
    );
  }

  // ✅ AI SDK v5 Pattern: Handle streaming state properly
  // PENDING/STREAMING: Only show partialAnalysis (actual stream data), never stored data
  // COMPLETED: Show stored analysisData
  // This prevents UI from showing before stream actually starts
  const displayData = analysis.status === AnalysisStatuses.COMPLETE
    ? analysis.analysisData
    : partialAnalysis;

  const hasData = hasAnalysisData(displayData);

  // Show loading indicator for PENDING/STREAMING analyses with no stream data yet
  if ((analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) && !hasData) {
    return <ChatLoading text="Analyzing responses..." />;
  }

  // Don't render if no data
  if (!hasData) {
    return null;
  }

  // Type-safe destructuring: displayData structure validated by hasAnalysisData
  // Works with both complete ModeratorAnalysisPayload and streaming DeepPartial
  // Extract roundSummary from nested structure
  const { leaderboard = [], participantAnalyses = [], roundSummary } = displayData;

  /**
   * Type compatibility bridge for AI SDK streaming
   *
   * AI SDK's DeepPartial makes all properties recursively optional, but components
   * expect complete types. This is safe because:
   * 1. hasAnalysisData validated that data exists
   * 2. UI will render whatever fields are available during streaming
   * 3. Incomplete data is visually acceptable (progressive rendering)
   *
   * This is an established pattern when bridging streaming (partial) and
   * complete types - similar to how AI SDK itself handles streaming text.
   */
  const validLeaderboard = leaderboard.filter((item): item is NonNullable<typeof item> => item != null) as ModeratorAnalysisPayload['leaderboard'];
  const validParticipantAnalyses = participantAnalyses.filter((item): item is NonNullable<typeof item> => item != null) as ModeratorAnalysisPayload['participantAnalyses'];
  const validRoundSummary = roundSummary as ModeratorAnalysisPayload['roundSummary'];
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {validLeaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <LeaderboardCard leaderboard={validLeaderboard} />
        </motion.div>
      )}
      {validParticipantAnalyses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <SkillsComparisonChart participants={validParticipantAnalyses} />
        </motion.div>
      )}
      {validParticipantAnalyses.length > 0 && (
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {validParticipantAnalyses.map((participant, index) => (
            <motion.div
              key={`${analysis.id}-participant-${participant.participantIndex}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 * index }}
            >
              <ParticipantAnalysisCard analysis={participant} />
            </motion.div>
          ))}
        </motion.div>
      )}
      {validRoundSummary && (
        <RoundSummarySection
          roundSummary={validRoundSummary}
          onActionClick={stableOnActionClick}
          isStreaming={analysis.status === AnalysisStatuses.STREAMING}
        />
      )}
    </motion.div>
  );
}
export const ModeratorAnalysisStream = memo(ModeratorAnalysisStreamComponent, (prevProps, nextProps) => {
  // ✅ Memo optimization: Prevent re-renders when props haven't changed
  // Callbacks are stored in refs internally, so callback equality checks prevent unnecessary work
  return (
    prevProps.analysis.id === nextProps.analysis.id
    && prevProps.analysis.status === nextProps.analysis.status
    && prevProps.analysis.analysisData === nextProps.analysis.analysisData
    && prevProps.threadId === nextProps.threadId
    && prevProps.onStreamComplete === nextProps.onStreamComplete
    && prevProps.onStreamStart === nextProps.onStreamStart
    && prevProps.onActionClick === nextProps.onActionClick
  );
});
