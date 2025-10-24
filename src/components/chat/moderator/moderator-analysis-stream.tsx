'use client';

/**
 * Moderator Analysis Stream Component
 *
 * ✅ AI SDK v5 STREAMING PATTERN:
 * - Uses experimental_useObject() for real-time structured object streaming
 * - Streams analysis via /analyze endpoint using AI SDK streamObject()
 * - Progressive UI updates (leaderboard → skills → participant analyses) as object streams
 * - No polling - real-time updates via server-sent events
 *
 * ✅ ABORT SIGNAL HANDLING:
 * - Calls stop() on component unmount to cancel ongoing streams
 * - Detects AbortError in onFinish callback and error state
 * - Suppresses error display for aborted streams (intentional cancellation)
 * - Prevents wasted resources from orphaned background streams
 *
 * Pattern: AI SDK streamObject() + experimental_useObject() hook
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/stream-object
 */

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

/**
 * ✅ PERSISTENT TRIGGER TRACKING:
 * Store triggered analysis IDs in a Map outside component scope
 * This survives component remounts and ensures we never trigger twice for the same analysis
 * Key: analysis.id (unique identifier)
 * Value: true (already triggered)
 */
const triggeredAnalysisIds = new Map<string, boolean>();

/**
 * Moderator Analysis Stream - AI SDK v5 streaming display component
 *
 * ✅ AI SDK v5 PATTERN:
 * - Uses experimental_useObject() to consume streamObject() from backend
 * - Progressive rendering as partial objects arrive
 * - Calls onStreamComplete when streaming completes
 * - Falls back to completed data from database on page refresh
 *
 * ✅ POLLING STRATEGY:
 * - Status 'pending' → Triggers POST /analyze to start streaming
 * - Status 'streaming' → Backend already processing, useThreadAnalysesQuery polls for completion
 * - 409 Conflict → Silently handled, query polling takes over
 * - No manual polling intervals - all handled by useThreadAnalysesQuery refetchInterval
 *
 * ✅ MEMOIZATION:
 * - Component is memoized to prevent re-renders from accordion state changes
 * - Only re-renders when analysis data actually changes
 *
 * ✅ CRITICAL FIX: Persistent trigger tracking across remounts
 * - Uses Map outside component scope to track triggered analysis IDs
 * - Survives component remounts caused by accordion open/close
 * - Prevents duplicate POST requests even after navigation or state changes
 */
function ModeratorAnalysisStreamComponent({
  threadId,
  analysis,
  onStreamComplete,
  onStreamStart,
}: ModeratorAnalysisStreamProps) {
  // ✅ Track if we got 409 Conflict (backend already streaming)
  // When true, suppress error display and let query polling handle completion
  const is409Conflict = useBoolean(false);

  // ✅ AI SDK v5: experimental_useObject hook for streaming structured objects
  // Uses the same Zod schema as the server for type safety and validation
  // Note: We intentionally don't use stop() - analysis continues in background
  const { object: partialAnalysis, error, submit } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
    onFinish: ({ object: finalObject, error: streamError }) => {
      if (streamError) {
        // ✅ ABORT DETECTION: Check if stream was aborted (user navigated away or component unmounted)
        // AbortError indicates the stream was cancelled - don't mark as failed, just ignore
        const errorMessage = streamError.message || String(streamError);
        const isAborted = streamError instanceof Error
          && (streamError.name === 'AbortError' || errorMessage.includes('aborted'));

        if (isAborted) {
          // ✅ Stream was intentionally cancelled - this is normal, don't treat as error
          // useThreadAnalysesQuery will handle cleanup of pending analyses on next poll
          return;
        }

        // ✅ CRITICAL: Check if error is 409 Conflict (analysis already streaming in background)
        // Set flag to suppress error display - useThreadAnalysesQuery will poll for completion
        if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('already being generated')) {
          is409Conflict.onTrue();
          return;
        }

        // ✅ All other errors are real failures - let them propagate to error state
        return;
      }

      if (finalObject) {
        // ✅ CRITICAL FIX: Pass completed analysis data to parent for direct cache update
        // The parent (ChatThreadScreen) calls updateAnalysisData() which:
        // 1. Updates the analysis status to 'completed'
        // 2. Sets analysisData to finalObject
        // 3. Sets completedAt timestamp
        // This ensures the UI immediately shows the completed state
        onStreamComplete?.(finalObject);
      }
    },
  });

  // ✅ AUTO-TRIGGER: Start streaming ONLY for 'pending' status
  // ✅ STREAMING STATUS: Don't trigger POST - backend already processing
  // ✅ FAILED STATUS: NEVER retry - user must manually regenerate from UI
  // useThreadAnalysesQuery polls every 5-10s to detect completion
  //
  // ✅ CRITICAL FIX: Use persistent Map to track triggered analyses
  // This survives component remounts and prevents duplicate POST requests
  useEffect(() => {
    // ✅ CRITICAL: Check persistent Map to prevent re-execution across remounts
    if (triggeredAnalysisIds.has(analysis.id)) {
      return undefined;
    }

    // ❌ NEVER trigger for FAILED or COMPLETED analyses - they're done
    if (analysis.status === AnalysisStatuses.FAILED || analysis.status === AnalysisStatuses.COMPLETED) {
      triggeredAnalysisIds.set(analysis.id, true);
      return undefined;
    }

    // Only trigger if analysis is 'pending' (newly created) and we haven't triggered yet
    const shouldTrigger = analysis.status === AnalysisStatuses.PENDING;

    if (shouldTrigger) {
      triggeredAnalysisIds.set(analysis.id, true);
      // ✅ CRITICAL FIX: Notify parent that streaming is starting
      // This allows parent to update cache status from 'pending' → 'streaming'
      // matching the backend state transition
      onStreamStart?.();

      // 🔍 DEBUG: Log the participant message IDs being sent to the backend
      console.group(`[ModeratorAnalysisStream] Starting analysis for round ${analysis.roundNumber}`);
      console.log('Analysis ID:', analysis.id);
      console.log('Thread ID:', threadId);
      console.log('Participant Message IDs being sent:', analysis.participantMessageIds);
      console.log('POST URL:', `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`);
      console.groupEnd();

      submit({ participantMessageIds: analysis.participantMessageIds });
    }

    if (analysis.status === AnalysisStatuses.STREAMING) {
      triggeredAnalysisIds.set(analysis.id, true);
    }

    return undefined;
    // ✅ CRITICAL: Minimal dependencies to prevent effect re-runs from object recreation
    // Only react to status changes (pending → streaming → completed/failed)
    // analysis.id in key prop ensures component remounts for different analyses
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.status, analysis.id]);

  // ✅ NO CLEANUP: Analysis continues in background even if component unmounts
  // The stream should NEVER be cancelled - let it complete naturally

  // ❌ ERROR STATE: Show error if streaming fails (unless 409 Conflict or AbortError)
  // If 409 Conflict or AbortError, suppress error display
  // - 409 Conflict: useThreadAnalysesQuery polls for completion
  // - AbortError: Stream was intentionally cancelled (unmount/navigation)
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

  // ✅ STREAMING STATE: Display partial analysis as it streams in
  // partialAnalysis will progressively populate with more fields
  const displayData = (partialAnalysis || analysis.analysisData) as ModeratorAnalysisPayload | undefined;

  // ✅ RENDER: Display streaming or completed analysis data
  // Show partial data AS IT ARRIVES (loading state shown in header, not here)
  const { leaderboard = [], participantAnalyses = [], overallSummary, conclusion } = displayData || {};

  // ✅ NO PLACEHOLDER: If no data yet, return null to avoid showing empty space
  // The header already shows "Analyzing..." status, no need for additional loading indicators
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
      {/* Leaderboard */}
      {leaderboard && leaderboard.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <LeaderboardCard leaderboard={leaderboard} />
        </motion.div>
      )}

      {/* Skills Comparison Chart */}
      {participantAnalyses && participantAnalyses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <SkillsComparisonChart participants={participantAnalyses} />
        </motion.div>
      )}

      {/* Participant Analysis Cards */}
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

      {/* Overall Summary */}
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

      {/* Conclusion */}
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

// ✅ MEMOIZATION: Prevent re-renders from parent accordion state changes
// Only re-render when analysis data actually changes (status, analysisData, etc.)
export const ModeratorAnalysisStream = memo(ModeratorAnalysisStreamComponent, (prevProps, nextProps) => {
  // Custom comparison: only re-render if analysis data actually changed
  return (
    prevProps.analysis.id === nextProps.analysis.id
    && prevProps.analysis.status === nextProps.analysis.status
    && prevProps.analysis.analysisData === nextProps.analysis.analysisData
    && prevProps.threadId === nextProps.threadId
  );
});
