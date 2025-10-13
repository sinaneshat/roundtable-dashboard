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
import { useEffect, useState } from 'react';

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
 */
export function ModeratorRoundTrigger({
  analysis,
  startExpanded,
}: ModeratorRoundTriggerProps) {
  const t = useTranslations('moderator');

  // Auto-expand for pending/streaming to show progress
  const shouldBeExpanded = startExpanded ?? (analysis.status === 'pending' || analysis.status === 'streaming');
  const [isOpen, setIsOpen] = useState(shouldBeExpanded);

  // ✅ Keep expanded state in sync with analysis status
  // When status changes to pending/streaming, auto-expand to show loading
  useEffect(() => {
    if (analysis.status === 'pending' || analysis.status === 'streaming') {
      setIsOpen(true);
    }
  }, [analysis.status]);

  return (
    <ChainOfThought open={isOpen} onOpenChange={setIsOpen}>
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
