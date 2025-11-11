'use client';
import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader } from '@/components/ai-elements/chain-of-thought';

import { ModeratorAnalysisPanel } from './moderator-analysis-panel';

type ModeratorRoundTriggerProps = {
  analysis: StoredModeratorAnalysis;
  startExpanded?: boolean;
};
export function ModeratorRoundTrigger({
  analysis,
  startExpanded,
}: ModeratorRoundTriggerProps) {
  const t = useTranslations('moderator');
  const isStreaming = analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING;
  const defaultOpen = startExpanded ?? isStreaming;

  return (
    <ChainOfThought defaultOpen={defaultOpen} disabled={isStreaming}>
      <ChainOfThoughtHeader>
        <span className="font-medium">
          {t('roundAnalysis', { number: analysis.roundNumber })}
        </span>
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <ModeratorAnalysisPanel analysis={analysis} />
      </ChainOfThoughtContent>
    </ChainOfThought>
  );
}
