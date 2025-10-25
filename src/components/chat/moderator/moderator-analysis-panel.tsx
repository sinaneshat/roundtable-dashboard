'use client';
import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ParticipantAnalysis, StoredModeratorAnalysis } from '@/api/routes/chat/schema';

import { LeaderboardCard } from './leaderboard-card';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { SkillsComparisonChart } from './skills-comparison-chart';

type ModeratorAnalysisPanelProps = {
  analysis: StoredModeratorAnalysis;
};
export function ModeratorAnalysisPanel({
  analysis,
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
      {overallSummary && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold">{t('summary')}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {overallSummary}
          </p>
        </div>
      )}
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
