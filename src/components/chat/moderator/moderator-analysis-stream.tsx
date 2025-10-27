'use client';
import { experimental_useObject as useObject } from '@ai-sdk/react';
import { motion } from 'framer-motion';
import { memo, useEffect } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { useBoolean } from '@/hooks/utils';

import { LeaderboardCard } from './leaderboard-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { SkillsComparisonChart } from './skills-comparison-chart';

type ModeratorAnalysisStreamProps = {
  threadId: string;
  analysis: StoredModeratorAnalysis;
  onStreamComplete?: (completedAnalysisData?: unknown) => void;
  onStreamStart?: () => void;
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
}: ModeratorAnalysisStreamProps) {
  const is409Conflict = useBoolean(false);

  // Track if component is mounted to prevent state updates after unmount
  const isMountedRef = { current: true };

  // AI SDK v5 Pattern: useObject hook for streaming structured data
  const { object: partialAnalysis, error, submit, stop } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
    // React 19 Pattern: Use onFinish callback instead of useEffect for completion
    onFinish: ({ object: finalObject, error: streamError }) => {
      // CRITICAL: Check if component is still mounted before calling callbacks
      if (!isMountedRef.current) {
        return;
      }

      if (streamError) {
        const errorMessage = streamError.message || String(streamError);
        const isAborted = streamError instanceof Error
          && (streamError.name === 'AbortError' || errorMessage.includes('aborted'));
        if (isAborted) {
          return;
        }
        if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('already being generated')) {
          is409Conflict.onTrue();
          return;
        }
        return;
      }
      if (finalObject && isMountedRef.current) {
        onStreamComplete?.(finalObject);
      }
    },
  });

  // Cleanup on unmount: stop streaming and mark component as unmounted
  useEffect(() => {
    return () => {
      // Mark component as unmounted to prevent state updates
      isMountedRef.current = false;

      // Stop any active streaming
      stop();

      // ✅ CRITICAL FIX: Do NOT delete analysis ID from triggered map on unmount
      // This prevents double-calling when component unmounts/remounts (e.g., React Strict Mode, parent re-renders)
      // The ID is only cleared via clearTriggeredAnalysesForRound() during regeneration
      // triggeredAnalysisIds.delete(analysis.id); // REMOVED - causes double streaming
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isMountedRef is a ref and should not be in dependency array (doesn't trigger re-renders)
  }, [analysis.id, stop]);

  // ✅ CRITICAL FIX: Prevent duplicate submissions at both analysis ID and round number level
  // React 19 Pattern: Schedule side effects using queueMicrotask instead of useEffect
  const roundAlreadyTriggered = triggeredRounds.get(threadId)?.has(analysis.roundNumber) ?? false;

  if (
    !triggeredAnalysisIds.has(analysis.id)
    && !roundAlreadyTriggered
    && analysis.status === AnalysisStatuses.PENDING
  ) {
    // Mark as triggered at BOTH levels BEFORE scheduling to prevent duplicate calls
    triggeredAnalysisIds.set(analysis.id, true);

    if (!triggeredRounds.has(threadId)) {
      triggeredRounds.set(threadId, new Set());
    }
    triggeredRounds.get(threadId)!.add(analysis.roundNumber);

    // Schedule the streaming trigger for after this render completes
    // This is the React 19 pattern for post-render work without useEffect
    queueMicrotask(() => {
      onStreamStart?.();
      submit({ participantMessageIds: analysis.participantMessageIds });
    });
  }

  // Mark completed/failed/streaming analyses as triggered to prevent re-triggering
  const roundAlreadyMarked = triggeredRounds.get(threadId)?.has(analysis.roundNumber) ?? false;

  if (
    !triggeredAnalysisIds.has(analysis.id)
    && !roundAlreadyMarked
    && (analysis.status === AnalysisStatuses.COMPLETED
      || analysis.status === AnalysisStatuses.FAILED
      || analysis.status === AnalysisStatuses.STREAMING)
  ) {
    triggeredAnalysisIds.set(analysis.id, true);

    if (!triggeredRounds.has(threadId)) {
      triggeredRounds.set(threadId, new Set());
    }
    triggeredRounds.get(threadId)!.add(analysis.roundNumber);
  }
  const shouldShowError = error && !is409Conflict.value && !(
    error instanceof Error
    && (error.name === 'AbortError' || error.message?.includes('aborted'))
  );
  if (shouldShowError) {
    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="size-1.5 rounded-full bg-destructive/80" />
          <span>
            Failed to stream analysis:
            {' '}
            {error.message || 'Unknown error'}
          </span>
        </div>
      </div>
    );
  }
  const displayData = (partialAnalysis || analysis.analysisData) as ModeratorAnalysisPayload | undefined;
  const { leaderboard = [], participantAnalyses = [], overallSummary, conclusion } = displayData || {};
  const hasAnyData = (leaderboard && leaderboard.length > 0)
    || (participantAnalyses && participantAnalyses.length > 0)
    || overallSummary
    || conclusion;
  if (!hasAnyData) {
    return null;
  }
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-4"
    >
      {leaderboard && leaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <LeaderboardCard leaderboard={leaderboard} />
        </motion.div>
      )}
      {participantAnalyses && participantAnalyses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <SkillsComparisonChart participants={participantAnalyses} />
        </motion.div>
      )}
      {participantAnalyses && participantAnalyses.length > 0 && (
        <motion.div
          className="space-y-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          {participantAnalyses.map((participant: ModeratorAnalysisPayload['participantAnalyses'][number], index: number) => (
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
      {overallSummary && (
        <motion.div
          className="space-y-2 pt-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <h3 className="text-sm font-semibold">Summary</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {overallSummary}
          </p>
        </motion.div>
      )}
      {conclusion && (
        <motion.div
          className="space-y-2 pt-2"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          <h3 className="text-sm font-semibold text-primary">Conclusion</h3>
          <p className="text-sm leading-relaxed">
            {conclusion}
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}
export const ModeratorAnalysisStream = memo(ModeratorAnalysisStreamComponent, (prevProps, nextProps) => {
  return (
    prevProps.analysis.id === nextProps.analysis.id
    && prevProps.analysis.status === nextProps.analysis.status
    && prevProps.analysis.analysisData === nextProps.analysis.analysisData
    && prevProps.threadId === nextProps.threadId
  );
});
