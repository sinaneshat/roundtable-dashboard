'use client';

/**
 * Moderator Analysis Stream Component
 *
 * ✅ AI SDK V5 REAL-TIME STREAMING PATTERN:
 * - Uses experimental_useObject hook from @ai-sdk/react
 * - Streams partial objects from /analyze endpoint as they're generated
 * - Progressive UI updates (leaderboard → skills → participant analyses)
 * - SIMPLIFIED: Display-only component, no complex trigger logic
 *
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/object-generation
 * Pattern: "Render Visual Interface in Chat"
 */

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { useEffect, useRef } from 'react';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';

import { LeaderboardCard } from './leaderboard-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { SkillsComparisonChart } from './skills-comparison-chart';

type ModeratorAnalysisStreamProps = {
  threadId: string;
  analysis: StoredModeratorAnalysis;
  onStreamComplete?: () => void;
};

/**
 * Moderator Analysis Stream - Real-time streaming display component
 *
 * ✅ AI SDK V5 SIMPLIFIED PATTERN:
 * - Uses experimental_useObject hook to consume streaming endpoint
 * - Displays partial objects as they arrive in real-time
 * - Shows progressive UI updates (leaderboard, skills, analyses)
 * - Calls onStreamComplete when streaming finishes
 */
export function ModeratorAnalysisStream({
  threadId,
  analysis,
  onStreamComplete,
}: ModeratorAnalysisStreamProps) {
  // ✅ AI SDK V5 PATTERN: experimental_useObject hook for real-time streaming
  // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/object-generation
  const { object: partialAnalysis, submit, isLoading, error } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
  });

  // ✅ CRITICAL FIX: Track if we've already triggered the analysis
  // Prevents multiple submit() calls from unstable dependencies
  const hasTriggeredRef = useRef(false);

  // ✅ CRITICAL FIX: Track initial status to prevent re-triggering existing streams
  // If analysis is already "streaming" when component mounts, don't trigger
  const initialStatusRef = useRef(analysis.status);

  // ✅ AUTO-TRIGGER: Start streaming immediately when component mounts
  // CRITICAL: Only trigger ONCE using stable dependencies
  // Following AI SDK v5 best practice: avoid multiple stream initiations
  useEffect(() => {
    // ✅ Skip if analysis is already completed with data
    if (initialStatusRef.current === 'completed' && analysis.analysisData) {
      console.warn('[ModeratorAnalysisStream] ⏭️ Skipping trigger - analysis already completed', {
        analysisId: analysis.id,
        initialStatus: initialStatusRef.current,
        hasData: !!analysis.analysisData,
      });
      return;
    }

    // ✅ Only trigger if ALL conditions are met:
    // 1. Analysis is pending (not streaming/completed/failed)
    // 2. We haven't triggered yet (ref-based guard)
    // 3. Not already loading (stream not started)
    // 4. No existing partial object (no data received)
    // 5. No error occurred
    if (
      analysis.status === 'pending'
      && !hasTriggeredRef.current
      && !isLoading
      && !partialAnalysis
      && !error
    ) {
      console.warn('[ModeratorAnalysisStream] 🚀 Triggering analysis stream', {
        analysisId: analysis.id,
        roundNumber: analysis.roundNumber,
        participantMessageCount: analysis.participantMessageIds.length,
        status: analysis.status,
      });

      // ✅ Mark as triggered BEFORE calling submit to prevent race conditions
      hasTriggeredRef.current = true;

      // ✅ AI SDK v5 Pattern: Submit once, stream handles the rest
      submit({
        participantMessageIds: analysis.participantMessageIds,
      });
    } else if (analysis.status === 'streaming' && !hasTriggeredRef.current && !partialAnalysis) {
      // ✅ STREAMING STATUS: Mark as triggered to prevent future attempts
      // This analysis is being streamed by another request/instance
      // We'll wait for the polling to fetch the completed result
      console.warn('[ModeratorAnalysisStream] ⏸️ Analysis already streaming, will poll for result', {
        analysisId: analysis.id,
        roundNumber: analysis.roundNumber,
      });
      hasTriggeredRef.current = true; // Prevent future trigger attempts
    }
  }, [
    // ✅ CRITICAL: STABLE DEPENDENCIES ONLY
    // These values should NOT cause re-triggers:
    // - analysis.id: Only changes when switching to different analysis
    // - analysis.status: String value, stable
    // - isLoading: Boolean from useObject hook, stable
    // - partialAnalysis: Object reference from useObject, stable
    // - error: Error object from useObject, stable
    // - submit: Function from useObject hook, should be stable
    //
    // ❌ EXCLUDED (unstable references that cause unnecessary re-renders):
    // - analysis.participantMessageIds: Array reference changes on every render
    // - analysis.analysisData: Object reference changes
    analysis.id,
    analysis.status,
    isLoading,
    partialAnalysis,
    error,
    submit,
  ]);

  // ✅ STREAM COMPLETE CALLBACK: Notify parent when streaming finishes
  useEffect(() => {
    if (!isLoading && partialAnalysis && onStreamComplete) {
      onStreamComplete();
    }
  }, [isLoading, partialAnalysis, onStreamComplete]);

  // ❌ ERROR STATE: Show error if streaming fails
  if (error) {
    // Check if it's a duplicate request conflict (409)
    const isDuplicateRequest = error.message?.includes('already being generated')
      || error.message?.includes('already pending');

    return (
      <div className="flex flex-col gap-2 py-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <span className="size-1.5 rounded-full bg-destructive/80" />
          <span>
            {isDuplicateRequest
              ? 'Analysis is being generated by another request.'
              : `Failed to generate analysis: ${error.message}`}
          </span>
        </div>
        {isDuplicateRequest && (
          <div className="text-xs text-muted-foreground pl-3.5">
            Please refresh the page to see the completed analysis, or wait a moment for the query to update automatically.
          </div>
        )}
      </div>
    );
  }

  // ⏳ LOADING STATE: Show loading while waiting for first partial
  if (isLoading && !partialAnalysis) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span>Starting analysis...</span>
        </div>
      </motion.div>
    );
  }

  // ⏳ WAITING FOR STREAM: Show waiting state if analysis is streaming but no data yet
  // This happens when another request is streaming the analysis
  if (analysis.status === 'streaming' && !isLoading && !partialAnalysis && !error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-3"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span>Analysis is being generated. Waiting for updates...</span>
        </div>
      </motion.div>
    );
  }

  // ✅ COMPLETED STATE: Display cached analysis data from database
  // If analysis is completed and has data, display it directly without streaming
  if (analysis.status === 'completed' && analysis.analysisData && !partialAnalysis) {
    const { leaderboard, participantAnalyses, overallSummary, conclusion } = analysis.analysisData;

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
            {participantAnalyses.map((participant, index) => (
              <motion.div
                key={`${analysis.id}-participant-${participant.participantIndex ?? index}`}
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

  // ✅ STREAMING/PARTIAL STATE: Display partial object as it arrives in real-time
  // Progressive rendering: show each section as it becomes available during streaming
  if (partialAnalysis) {
    // ✅ TYPE SAFETY: Filter out undefined partial objects
    // experimental_useObject returns PartialObject types which can have undefined values
    const leaderboard = partialAnalysis.leaderboard?.filter(entry => entry !== undefined) as Array<{
      rank: number;
      participantIndex: number;
      participantRole: string | null;
      modelId: string;
      modelName: string;
      overallRating: number;
      badge: string | null;
    }> | undefined;

    const participantAnalyses = partialAnalysis.participantAnalyses?.filter(p => p !== undefined) as Array<{
      participantIndex: number;
      participantRole: string | null;
      modelId: string;
      modelName: string;
      overallRating: number;
      skillsMatrix: Array<{ skillName: string; rating: number }>;
      pros: string[];
      cons: string[];
      summary: string;
    }> | undefined;

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-4"
      >
        {/* Leaderboard - appears first */}
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

        {/* Participant Analysis Cards - stream in as they're generated */}
        {participantAnalyses && participantAnalyses.length > 0 && (
          <motion.div
            className="space-y-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            {participantAnalyses.map((participant, index) => (
              <motion.div
                key={`${analysis.id}-participant-${participant.participantIndex ?? index}`}
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
        {partialAnalysis.overallSummary && (
          <motion.div
            className="space-y-2 pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <h3 className="text-sm font-semibold">Summary</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {partialAnalysis.overallSummary}
            </p>
          </motion.div>
        )}

        {/* Conclusion */}
        {partialAnalysis.conclusion && (
          <motion.div
            className="space-y-2 pt-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <h3 className="text-sm font-semibold text-primary">Conclusion</h3>
            <p className="text-sm leading-relaxed">
              {partialAnalysis.conclusion}
            </p>
          </motion.div>
        )}

        {/* Loading indicator while streaming continues */}
        {isLoading && (
          <motion.div
            className="flex items-center gap-2 text-xs text-muted-foreground"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
            <span>Generating analysis...</span>
          </motion.div>
        )}
      </motion.div>
    );
  }

  // Default: Nothing to render yet
  return null;
}
