'use client';
import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ParticipantAnalysis, RecommendedAction, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';

import { LeaderboardCard } from './leaderboard-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { RoundSummarySection } from './round-summary-section';
import { SkillsComparisonChart } from './skills-comparison-chart';

type ModeratorAnalysisPanelProps = {
  analysis: StoredModeratorAnalysis;
  onActionClick?: (action: RecommendedAction) => void;
};
export function ModeratorAnalysisPanel({
  analysis,
  onActionClick,
}: ModeratorAnalysisPanelProps) {
  const t = useTranslations('moderator');
  if (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) {
    return null;
  }
  if (analysis.status === AnalysisStatuses.FAILED) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>{analysis.errorMessage || t('errorAnalyzing')}</span>
      </div>
    );
  }
  // ✅ SINGLE SOURCE OF TRUTH: Use utility function for robust validation
  if (!hasAnalysisData(analysis.analysisData)) {
    return (
      <div className="py-2 text-sm text-destructive">
        {t('errorAnalyzing')}
      </div>
    );
  }
  const { leaderboard, participantAnalyses, roundSummary } = analysis.analysisData;
  const participantData: ParticipantAnalysis[] = participantAnalyses.map(participant => ({
    ...participant,
  }));
  return (
    <div className="space-y-4">
      {leaderboard.length > 0 && (
        <LeaderboardCard leaderboard={leaderboard} />
      )}
      {participantData.length > 0 && (
        <SkillsComparisonChart participants={participantData} />
      )}
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
      {roundSummary && (
        <RoundSummarySection
          roundSummary={roundSummary}
          onActionClick={onActionClick}
        />
      )}
    </div>
  );
}
