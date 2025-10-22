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
 * Pattern: AI SDK streamObject() + experimental_useObject() hook
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-core/stream-object
 */

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

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
};

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
 */
export function ModeratorAnalysisStream({
  threadId,
  analysis,
  onStreamComplete,
}: ModeratorAnalysisStreamProps) {
  // ✅ Track if we've already triggered streaming (prevents duplicate POST requests)
  const hasTriggeredRef = useRef(false);

  // ✅ Track if we got 409 Conflict (backend already streaming)
  // When true, suppress error display and let query polling handle completion
  const is409Conflict = useBoolean(false);

  // ✅ AI SDK v5: experimental_useObject hook for streaming structured objects
  // Uses the same Zod schema as the server for type safety and validation
  const { object: partialAnalysis, error, submit } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
    onFinish: ({ object: finalObject, error: streamError }) => {
      if (streamError) {
        console.error('[ModeratorAnalysisStream] ❌ Stream error:', streamError);

        // ✅ CRITICAL: Check if error is 409 Conflict (analysis already streaming in background)
        // Set flag to suppress error display - useThreadAnalysesQuery will poll for completion
        const errorMessage = streamError.message || String(streamError);
        if (errorMessage.includes('409') || errorMessage.includes('Conflict') || errorMessage.includes('already being generated')) {
          console.warn('[ModeratorAnalysisStream] 🔄 Got 409 Conflict - backend already streaming', {
            roundNumber: analysis.roundNumber,
            analysisId: analysis.id,
            message: 'useThreadAnalysesQuery polling will detect completion',
          });
          is409Conflict.onTrue();
        }
        return;
      }

      if (finalObject) {
        console.warn('[ModeratorAnalysisStream] ✅ Stream completed', finalObject);
        // ✅ Pass completed analysis data to parent for direct cache update
        onStreamComplete?.(finalObject);
      }
    },
  });

  // ✅ AUTO-TRIGGER: Start streaming ONLY for 'pending' status
  // ✅ STREAMING STATUS: Don't trigger POST - backend already processing
  // useThreadAnalysesQuery polls every 5-10s to detect completion
  useEffect(() => {
    // Only trigger if analysis is 'pending' (newly created) and we haven't triggered yet
    // Do NOT trigger for 'streaming' - backend already processing, query polls for completion
    const shouldTrigger = analysis.status === 'pending' && !hasTriggeredRef.current;

    if (shouldTrigger) {
      hasTriggeredRef.current = true;
      console.warn('[ModeratorAnalysisStream] 🌊 Triggering POST /analyze for PENDING analysis', {
        roundNumber: analysis.roundNumber,
        analysisId: analysis.id,
      });
      submit({ participantMessageIds: analysis.participantMessageIds });
    } else if (analysis.status === 'streaming' && !hasTriggeredRef.current) {
      // Backend already processing - don't POST, let query poll
      hasTriggeredRef.current = true;
      console.warn('[ModeratorAnalysisStream] ⏭️ Skipping POST - backend already STREAMING', {
        roundNumber: analysis.roundNumber,
        analysisId: analysis.id,
        message: 'useThreadAnalysesQuery will poll for completion',
      });
    }
  }, [analysis.status, analysis.participantMessageIds, submit, analysis.roundNumber, analysis.id]);

  // ✅ DEBUG: Log when partial data updates (helps verify streaming is working)
  useEffect(() => {
    if (partialAnalysis) {
      console.warn('[ModeratorAnalysisStream] 🔄 Partial data update:', {
        hasLeaderboard: !!partialAnalysis.leaderboard,
        leaderboardCount: partialAnalysis.leaderboard?.length ?? 0,
        hasParticipantAnalyses: !!partialAnalysis.participantAnalyses,
        participantAnalysesCount: partialAnalysis.participantAnalyses?.length ?? 0,
        hasOverallSummary: !!partialAnalysis.overallSummary,
        hasConclusion: !!partialAnalysis.conclusion,
      });
    }
  }, [partialAnalysis]);

  // ❌ ERROR STATE: Show error if streaming fails (unless 409 Conflict)
  // If 409 Conflict, suppress error - useThreadAnalysesQuery polls for completion
  if (error && !is409Conflict.value) {
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
