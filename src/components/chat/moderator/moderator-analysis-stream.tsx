'use client';

/**
 * ✅ AI SDK V5 OFFICIAL PATTERN: Streaming Object Generation with useObject
 *
 * This component uses the experimental_useObject hook from @ai-sdk/react to:
 * 1. Stream analysis results in real-time from the backend
 * 2. Display partial objects as they arrive (leaderboard, skills, etc.)
 * 3. Show loading state and error handling
 *
 * Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/use-object
 * Pattern: Official AI SDK documentation from Context7
 */

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import type { LeaderboardEntry, ParticipantAnalysis } from '@/api/routes/chat/schema';
import { ModeratorAnalysisSchema } from '@/api/services/moderator-analysis.service';
import { queryKeys } from '@/lib/data/query-keys';

import { LeaderboardCard } from './leaderboard-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { SkillsComparisonChart } from './skills-comparison-chart';

// ✅ TYPE GUARDS: Filter partial/undefined objects to complete objects for rendering
// Note: useObject returns partial objects where properties can be undefined during streaming
function isCompleteLeaderboardEntry(entry: unknown): entry is LeaderboardEntry {
  return entry != null
    && typeof entry === 'object'
    && 'rank' in entry && typeof entry.rank === 'number'
    && 'participantIndex' in entry && typeof entry.participantIndex === 'number'
    && 'modelId' in entry && typeof entry.modelId === 'string';
}

function isCompleteParticipantAnalysis(p: unknown): p is ParticipantAnalysis {
  return p != null
    && typeof p === 'object'
    && 'participantIndex' in p && typeof p.participantIndex === 'number'
    && 'skillsMatrix' in p && Array.isArray(p.skillsMatrix)
    && 'pros' in p && Array.isArray(p.pros)
    && 'cons' in p && Array.isArray(p.cons);
}

type ModeratorAnalysisStreamProps = {
  /** Thread ID for the analysis */
  threadId: string;
  /** Round number to analyze */
  roundNumber: number;
  /** Participant message IDs for this round */
  participantMessageIds: string[];
  /** Auto-trigger analysis on mount */
  autoTrigger?: boolean;
};

/**
 * ModeratorAnalysisStream - Real-time streaming analysis component
 *
 * ✅ OFFICIAL AI SDK V5 PATTERN:
 * - Uses experimental_useObject for streaming structured objects
 * - Displays partial results as they stream in
 * - Handles loading states and errors
 * - Persists to database via backend onFinish callback
 *
 * ✅ CODE REDUCTION:
 * - No manual polling logic
 * - No custom streaming implementation
 * - Uses official SDK patterns only
 */
export function ModeratorAnalysisStream({
  threadId,
  roundNumber,
  participantMessageIds,
  autoTrigger = true,
}: ModeratorAnalysisStreamProps) {
  const t = useTranslations('moderator');
  const queryClient = useQueryClient();

  // ✅ AI SDK V5 OFFICIAL PATTERN: useObject hook for streaming objects
  const { object, submit, isLoading, error, stop } = useObject({
    api: `/api/v1/chat/threads/${threadId}/rounds/${roundNumber}/analyze`,
    schema: ModeratorAnalysisSchema,
  });

  // ✅ Auto-trigger analysis when component mounts
  useEffect(() => {
    if (autoTrigger && participantMessageIds.length > 0 && !isLoading) {
      // ✅ AI SDK V5 PATTERN: Submit sends request body (AI SDK handles JSON encoding)
      // Backend expects: { participantMessageIds: string[] }
      submit({ participantMessageIds });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrigger]); // Only trigger on mount

  // ✅ Invalidate analyses query when streaming completes
  useEffect(() => {
    if (!isLoading && object && !error) {
      // Analysis completed successfully - invalidate to refresh list
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.analyses(threadId) });
    }
  }, [isLoading, object, error, queryClient, threadId]);

  // ✅ LOADING STATE: Show simple loading indicator
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
            <span>{t('analyzing')}</span>
          </div>
          <button
            type="button"
            onClick={stop}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {t('stop')}
          </button>
        </div>

        {/* ✅ PARTIAL STREAMING: Show partial results as they arrive */}
        {object && (
          <div className="space-y-4 opacity-75">
            {/* Leaderboard - shows as soon as available */}
            {object.leaderboard && object.leaderboard.length > 0 && (
              <LeaderboardCard
                leaderboard={object.leaderboard.filter(isCompleteLeaderboardEntry)}
              />
            )}

            {/* Skills comparison - shows as participants analyzed */}
            {object.participantAnalyses && object.participantAnalyses.length > 0 && (
              <SkillsComparisonChart
                participants={object.participantAnalyses.filter(isCompleteParticipantAnalysis)}
              />
            )}

            {/* Individual analyses - shows as each completes */}
            {object.participantAnalyses && object.participantAnalyses.length > 0 && (
              <div className="space-y-3">
                {object.participantAnalyses.filter(isCompleteParticipantAnalysis).map((participant, index) => (
                  <ParticipantAnalysisCard
                    key={`${participant.participantIndex}-${index}`}
                    analysis={participant}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ✅ ERROR STATE: Show error message
  if (error) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>{error.message || t('errorAnalyzing')}</span>
      </div>
    );
  }

  // ✅ COMPLETED STATE: Show final results
  if (!object) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Leaderboard */}
      {object.leaderboard && object.leaderboard.length > 0 && (
        <LeaderboardCard
          leaderboard={object.leaderboard.filter(isCompleteLeaderboardEntry)}
        />
      )}

      {/* Skills Comparison Chart */}
      {object.participantAnalyses && object.participantAnalyses.length > 0 && (
        <SkillsComparisonChart
          participants={object.participantAnalyses.filter(isCompleteParticipantAnalysis)}
        />
      )}

      {/* Participant Analysis Cards */}
      {object.participantAnalyses && object.participantAnalyses.length > 0 && (
        <div className="space-y-3">
          {object.participantAnalyses.filter(isCompleteParticipantAnalysis).map((participant, index) => (
            <ParticipantAnalysisCard
              key={`${participant.participantIndex}-${index}`}
              analysis={participant}
            />
          ))}
        </div>
      )}

      {/* Overall Summary */}
      {object.overallSummary && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold">{t('summary')}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {object.overallSummary}
          </p>
        </div>
      )}

      {/* Conclusion */}
      {object.conclusion && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold text-primary">{t('conclusion')}</h3>
          <p className="text-sm leading-relaxed">
            {object.conclusion}
          </p>
        </div>
      )}
    </div>
  );
}
