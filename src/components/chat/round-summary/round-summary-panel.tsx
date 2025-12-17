'use client';

import { useTranslations } from 'next-intl';

import { MessageStatuses } from '@/api/core/enums';
import type { StoredRoundSummary } from '@/api/routes/chat/schema';
import { hasSummaryData } from '@/lib/utils/summary-utils';

import { RoundSummaryText } from './round-summary-text';

type RoundSummaryPanelProps = {
  summary: StoredRoundSummary;
};

export function RoundSummaryPanel({ summary }: RoundSummaryPanelProps) {
  const t = useTranslations('moderator');

  if (summary.status === MessageStatuses.PENDING || summary.status === MessageStatuses.STREAMING) {
    return null;
  }

  if (summary.status === MessageStatuses.FAILED) {
    return (
      <div className="flex items-center gap-2 py-2 text-sm text-destructive">
        <span className="size-1.5 rounded-full bg-destructive/80" />
        <span>{t('errorSummarizing')}</span>
      </div>
    );
  }

  if (!hasSummaryData(summary.summaryData)) {
    return (
      <div className="py-2 text-sm text-destructive">
        {t('errorSummarizing')}
      </div>
    );
  }

  const data = summary.summaryData;

  return (
    <RoundSummaryText
      summary={data.summary}
      metrics={data.metrics}
    />
  );
}
