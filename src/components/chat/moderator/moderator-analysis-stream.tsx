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
import { useEffect } from 'react';

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

  // ✅ AUTO-TRIGGER: Start streaming immediately when component mounts
  // This replaces the complex trigger logic from the previous implementation
  useEffect(() => {
    if (analysis.status === 'pending' && !isLoading && !partialAnalysis && !error) {
      submit({
        participantMessageIds: analysis.participantMessageIds,
      });
    }
  }, [analysis.status, analysis.participantMessageIds, submit, isLoading, partialAnalysis, error]);

  // ✅ STREAM COMPLETE CALLBACK: Notify parent when streaming finishes
  useEffect(() => {
    if (!isLoading && partialAnalysis && onStreamComplete) {
      onStreamComplete();
    }
  }, [isLoading, partialAnalysis, onStreamComplete]);

  // ❌ ERROR STATE: Show error if streaming fails
  if (error) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>
          Failed to generate analysis:
          {error.message}
        </span>
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

  // ✅ STREAMING/COMPLETED STATE: Display partial object as it arrives
  // Progressive rendering: show each section as it becomes available
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
