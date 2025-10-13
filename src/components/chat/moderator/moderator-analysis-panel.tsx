'use client';

/**
 * ModeratorAnalysisPanel Component
 *
 * ✅ BACKEND-TRIGGERED ANALYSIS:
 * - Analysis is automatically triggered by backend after last participant responds
 * - Frontend polls via TanStack Query to fetch completed analyses
 * - Polling stops automatically when analysis completes
 *
 * ✅ FOLLOWS ESTABLISHED PATTERNS:
 * - No nested cards - just renders content directly
 * - Simple loading indicator (animated dot like ModelMessageCard)
 * - Reuses existing translation keys
 * - Minimal wrapper divs
 */

import { useTranslations } from 'next-intl';

import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';

import { LeaderboardCard } from './leaderboard-card';
import type { ParticipantAnalysis } from './participant-analysis-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { SkillsComparisonChart } from './skills-comparison-chart';

type ModeratorAnalysisPanelProps = {
  /**
   * Analysis data from backend (may be pending/streaming/completed/failed)
   * Backend automatically triggers analysis after last participant
   * Frontend polls via TanStack Query to get updates
   */
  analysis: StoredModeratorAnalysis;
};

/**
 * ModeratorAnalysisPanel - Display container for AI moderator analysis
 *
 * Simple display component - just renders analysis data
 * No nested cards, no complex animations, follows ModelMessageCard patterns
 */
export function ModeratorAnalysisPanel({
  analysis,
}: ModeratorAnalysisPanelProps) {
  const t = useTranslations('moderator');

  // ✅ PENDING or STREAMING: Show simple loading indicator
  if (analysis.status === 'pending' || analysis.status === 'streaming') {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
        <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
        <span>{t('analyzing')}</span>
      </div>
    );
  }

  // ✅ FAILED: Show simple error message
  if (analysis.status === 'failed') {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>{analysis.errorMessage || t('errorAnalyzing')}</span>
      </div>
    );
  }

  // ✅ COMPLETED: Show analysis results
  if (!analysis.analysisData) {
    return (
      <div className="py-2 text-sm text-destructive">
        {t('errorAnalyzing')}
      </div>
    );
  }

  const { leaderboard, participantAnalyses, overallSummary, conclusion } = analysis.analysisData;

  const participantData: ParticipantAnalysis[] = participantAnalyses.map(participant => ({
    ...participant,
  }));

  return (
    <div className="space-y-4">
      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <LeaderboardCard leaderboard={leaderboard} />
      )}

      {/* Skills Comparison Chart */}
      {participantData.length > 0 && (
        <SkillsComparisonChart participants={participantData} />
      )}

      {/* Participant Analysis Cards */}
      {participantData.length > 0 && (
        <div className="space-y-3">
          {participantData.map(participant => (
            <ParticipantAnalysisCard
              key={`${participant.participantIndex}-${participant.modelId}`}
              analysis={participant}
            />
          ))}
        </div>
      )}

      {/* Overall Summary */}
      {overallSummary && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold">{t('summary')}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {overallSummary}
          </p>
        </div>
      )}

      {/* Conclusion */}
      {conclusion && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold text-primary">{t('conclusion')}</h3>
          <p className="text-sm leading-relaxed">
            {conclusion}
          </p>
        </div>
      )}
    </div>
  );
}
