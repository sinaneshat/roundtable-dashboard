'use client';

/**
 * ModeratorRoundTrigger - Collapsible container for round analysis
 *
 * ✅ BACKEND-TRIGGERED ONLY:
 * - Analysis is automatically triggered by backend (no manual triggering)
 * - Frontend uses TanStack Query polling to fetch analysis
 * - Polling stops automatically when analysis completes
 *
 * ✅ FOLLOWS ESTABLISHED PATTERNS:
 * - Uses ChainOfThought component like configuration changes
 * - Simple, minimal design
 * - Auto-expands for in-progress analyses
 */

import { useTranslations } from 'next-intl';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader } from '@/components/ai-elements/chain-of-thought';

import { ModeratorAnalysisPanel } from './moderator-analysis-panel';

type ModeratorRoundTriggerProps = {
  analysis: StoredModeratorAnalysis;
  startExpanded?: boolean;
};

/**
 * ModeratorRoundTrigger - Collapsible trigger for round analysis
 *
 * Follows the same pattern as ConfigurationChangeCard - simple ChainOfThought wrapper
 * Auto-expands when analysis is pending/streaming to show loading state
 *
 * ✅ NO useEffect: Uses controlled state from ChainOfThought - parent determines initial state
 */
export function ModeratorRoundTrigger({
  analysis,
  startExpanded,
}: ModeratorRoundTriggerProps) {
  const t = useTranslations('moderator');

  // ✅ Derive open state directly from analysis status - no useEffect needed
  // Auto-expand for pending/streaming to show progress, otherwise respect startExpanded
  const defaultOpen = startExpanded ?? (analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING);

  return (
    <ChainOfThought defaultOpen={defaultOpen}>
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
