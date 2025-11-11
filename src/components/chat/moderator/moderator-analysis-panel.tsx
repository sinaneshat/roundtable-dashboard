'use client';
import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { RecommendedAction, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
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

  // Type-safe destructuring: analysisData is validated and narrowed by hasAnalysisData type guard
  const { leaderboard, participantAnalyses, roundSummary } = analysis.analysisData;

  return (
    <div className="space-y-4">
      {leaderboard.length > 0 && (
        <LeaderboardCard leaderboard={leaderboard} />
      )}
      {participantAnalyses.length > 0 && (
        <SkillsComparisonChart participants={participantAnalyses} />
      )}
      {participantAnalyses.length > 0 && (
        <div className="space-y-3">
          {participantAnalyses.map(participant => (
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
