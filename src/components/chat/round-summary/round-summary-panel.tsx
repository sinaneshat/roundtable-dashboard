'use client';

import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { hasAnalysisData } from '@/lib/utils/analysis-utils';

import { RoundSummaryText } from './round-summary-text';

type RoundSummaryPanelProps = {
  analysis: StoredModeratorAnalysis;
};

export function RoundSummaryPanel({ analysis }: RoundSummaryPanelProps) {
  const t = useTranslations('moderator');

  if (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING) {
    return null;
  }

  if (analysis.status === AnalysisStatuses.FAILED) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>{t('errorAnalyzing')}</span>
      </div>
    );
  }

  if (!hasAnalysisData(analysis.analysisData)) {
    return (
      <div className="py-2 text-sm text-destructive">
        {t('errorAnalyzing')}
      </div>
    );
  }

  const data = analysis.analysisData;

  return (
    <RoundSummaryText article={data.article} />
  );
}
