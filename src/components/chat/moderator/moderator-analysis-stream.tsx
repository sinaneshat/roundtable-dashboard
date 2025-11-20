'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { memo, useCallback, useEffect, useRef } from 'react';

import type { StreamErrorType } from '@/api/core/enums';
import { AnalysisStatuses, StreamErrorTypes } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, RecommendedAction, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { ChatLoading } from '@/components/chat/chat-loading';
import { useAutoScroll, useBoolean } from '@/hooks/utils';
import { hasAnalysisData, hasParticipantContent, hasRoundSummaryContent } from '@/lib/utils/analysis-utils';

import { LeaderboardCard } from './leaderboard-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { RoundSummarySection } from './round-summary-section';

type ModeratorAnalysisStreamProps = {
  threadId: string;
  analysis: StoredModeratorAnalysis;
  onStreamComplete?: (completedAnalysisData?: ModeratorAnalysisPayload | null, error?: unknown) => void;
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
  const stableOnActionClick = useCallback((_action: RecommendedAction) => {
    // Disabled for demo mode - no action clicks allowed
    // onActionClickRef.current?.(action);
  }, []);

  // ✅ Error handling state for UI display
  const streamErrorTypeRef = useRef<StreamErrorType>(StreamErrorTypes.UNKNOWN);
  const is409Conflict = useBoolean(false);

  // ✅ FIX: Track if we've already started streaming to prevent infinite loop
  // Without this, calling onStreamStart → updateAnalysisStatus creates new state
  // → triggers re-render → useEffect runs again → infinite loop
  const hasStartedStreamingRef = useRef(false);

  // ✅ Unified auto-scroll: Only scrolls if user is at bottom
  const isStreaming = analysis.status === AnalysisStatuses.STREAMING;
  const bottomRef = useAutoScroll(isStreaming);

  // ✅ Reset the streaming flag when analysis ID changes (new analysis)
  useEffect(() => {
    hasStartedStreamingRef.current = false;
  }, [analysis.id]);

  useEffect(() => {
    onStreamCompleteRef.current = onStreamComplete;
  }, [onStreamComplete]);

  useEffect(() => {
    onStreamStartRef.current = onStreamStart;
  }, [onStreamStart]);

  useEffect(() => {
    onActionClickRef.current = onActionClick;
  }, [onActionClick]);

  // ✅ MOCK MODE: Mock streaming effect (disabled in favor of real API)
  // useEffect(() => {
  //   if (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) {
  //     if (!hasStartedStreamingRef.current) {
  //       hasStartedStreamingRef.current = true;
  //       onStreamStartRef.current?.();
  //     }
  //     const mockData = createMockAnalysisData(analysis.roundNumber);
  //     let progress = 0;
  //     const interval = setInterval(() => {
  //       progress += 0.1;
  //       if (progress >= 1) {
  //         clearInterval(interval);
  //         setPartialAnalysis(mockData);
  //         onStreamCompleteRef.current?.(mockData);
  //       }
  //     }, 800);
  //     return () => clearInterval(interval);
  //   }
  //   return undefined;
  // }, [analysis.status, analysis.roundNumber]);

  // AI SDK v5 Pattern: useObject hook for streaming structured data
  const { object: partialAnalysis, error: _error, submit } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
    // ✅ AI SDK v5 Pattern: onFinish callback for handling completion and errors
    // According to AI SDK v5 docs, when object === undefined, schema validation failed
    // The error parameter contains the TypeValidationError or other streaming errors
    onFinish: ({ object: finalObject, error: streamError }) => {
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

        // ✅ CRITICAL FIX: Pass error information to parent callback
        // Pass null for data and the error object so parent can store error message
        // This prevents silent failures with null errorMessage in the store
        onStreamCompleteRef.current?.(null, streamError || new Error(errorMessage));
        return;
      }

      // ✅ AI SDK v5 Pattern: object is defined, streaming completed successfully
      if (finalObject) {
        onStreamCompleteRef.current?.(finalObject);
      }
    },
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
      // stop();

      // ✅ CRITICAL FIX: Do NOT delete analysis ID from triggered map on unmount
      // This prevents double-calling when component unmounts/remounts (e.g., React Strict Mode, parent re-renders)
      // The ID is only cleared via clearTriggeredAnalysesForRound() during regeneration
      // triggeredAnalysisIds.delete(analysis.id); // REMOVED - causes double streaming
    };
  }, []); // Removed analysis.id, stop from deps as they are no longer used

  // ✅ CRITICAL FIX: Prevent duplicate submissions at both analysis ID and round number level
  // Use useEffect that only runs when analysis becomes ready (status changes to PENDING/STREAMING)
  // NOTE: participantMessageIds intentionally NOT in dependencies to avoid re-trigger on metadata updates
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
        const body = { participantMessageIds: messageIds };
        submitRef.current(body);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- analysis.participantMessageIds intentionally excluded to prevent re-trigger on metadata updates for reasoning models
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
  const validLeaderboard = leaderboard.filter((item: unknown): item is NonNullable<typeof item> => item != null) as ModeratorAnalysisPayload['leaderboard'];
  const validParticipantAnalyses = participantAnalyses.filter((item: unknown): item is NonNullable<typeof item> => item != null) as ModeratorAnalysisPayload['participantAnalyses'];
  const validRoundSummary = roundSummary as ModeratorAnalysisPayload['roundSummary'];

  // Content checking
  const hasSummaryContent = hasRoundSummaryContent(validRoundSummary);

  return (
    <div className="space-y-4">
      {validLeaderboard.length > 0 && (
        <LeaderboardCard leaderboard={validLeaderboard} />
      )}

      {validParticipantAnalyses.length > 0 && (
        <div className="space-y-4">
          {validParticipantAnalyses.map((participant) => {
            if (!hasParticipantContent(participant)) {
              return null;
            }

            return (
              <ParticipantAnalysisCard
                key={`participant-${participant.participantIndex}`}
                analysis={participant}
                isStreaming={analysis.status === AnalysisStatuses.STREAMING}
              />
            );
          })}
        </div>
      )}

      {hasSummaryContent && (
        <RoundSummarySection
          roundSummary={validRoundSummary}
          onActionClick={stableOnActionClick}
          isStreaming={analysis.status === AnalysisStatuses.STREAMING}
        />
      )}

      <div ref={bottomRef} />
    </div>
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
