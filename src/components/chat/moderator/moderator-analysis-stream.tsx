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
const triggeredAnalysisIds = new Map<string, boolean>();
function ModeratorAnalysisStreamComponent({
  threadId,
  analysis,
  onStreamComplete,
  onStreamStart,
}: ModeratorAnalysisStreamProps) {
  const is409Conflict = useBoolean(false);
  const { object: partialAnalysis, error, submit } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`,
    schema: ModeratorAnalysisPayloadSchema,
    onFinish: ({ object: finalObject, error: streamError }) => {
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
      if (finalObject) {
        onStreamComplete?.(finalObject);
      }
    },
  });
  useEffect(() => {
    if (triggeredAnalysisIds.has(analysis.id)) {
      return undefined;
    }
    if (analysis.status === AnalysisStatuses.FAILED || analysis.status === AnalysisStatuses.COMPLETED) {
      triggeredAnalysisIds.set(analysis.id, true);
      return undefined;
    }
    const shouldTrigger = analysis.status === AnalysisStatuses.PENDING;
    if (shouldTrigger) {
      triggeredAnalysisIds.set(analysis.id, true);
      onStreamStart?.();
      submit({ participantMessageIds: analysis.participantMessageIds });
    }
    if (analysis.status === AnalysisStatuses.STREAMING) {
      triggeredAnalysisIds.set(analysis.id, true);
    }
    return undefined;
  }, [analysis.status, analysis.id]);
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
