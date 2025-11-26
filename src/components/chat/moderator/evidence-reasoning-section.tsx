'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EvidenceStrengths } from '@/api/core/enums';
import type { EvidenceAndReasoning } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import {
  getEvidenceStrengthBadgeColor,
  getEvidenceStrengthProgressColors,
} from './moderator-ui-utils';

type EvidenceReasoningSectionProps = {
  evidenceAndReasoning: EvidenceAndReasoning;
  isStreaming?: boolean;
};

/**
 * EvidenceReasoningSection - Multi-AI Deliberation Framework
 *
 * Displays evidence and reasoning analysis:
 * - Reasoning threads (claims with synthesis)
 * - Evidence coverage with strength indicators
 */
export function EvidenceReasoningSection({
  evidenceAndReasoning,
  isStreaming: _isStreaming = false,
}: EvidenceReasoningSectionProps) {
  const t = useTranslations('moderator');
  const [showAllThreads, setShowAllThreads] = useState(false);

  if (!evidenceAndReasoning) {
    return null;
  }

  const { reasoningThreads, evidenceCoverage } = evidenceAndReasoning;

  // Limit threads shown initially
  const INITIAL_THREADS = 2;
  const visibleThreads = showAllThreads
    ? reasoningThreads
    : reasoningThreads?.slice(0, INITIAL_THREADS);
  const hiddenCount = (reasoningThreads?.length || 0) - INITIAL_THREADS;

  return (
    <div className="space-y-4">
      {/* Reasoning Threads */}
      {reasoningThreads && reasoningThreads.length > 0 && (
        <div className="space-y-3">
          <span className="text-sm font-medium">{t('evidenceReasoning.reasoningThreads')}</span>

          <div className="space-y-3">
            {visibleThreads?.map((thread, threadIndex) => (
              <div key={`thread-${threadIndex}`} className="space-y-1.5">
                <p className="text-sm font-medium text-foreground/90">
                  {thread.claim}
                </p>
                <p className="text-xs text-muted-foreground pl-3 border-l-2 border-primary/20">
                  {thread.synthesis}
                </p>
              </div>
            ))}
          </div>

          {hiddenCount > 0 && !showAllThreads && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => setShowAllThreads(true)}
            >
              Show
              {' '}
              {hiddenCount}
              {' '}
              more
            </Button>
          )}
        </div>
      )}

      {/* Evidence Coverage */}
      {evidenceCoverage && evidenceCoverage.length > 0 && (
        <div className="space-y-3">
          <span className="text-sm font-medium">{t('evidenceReasoning.evidenceCoverage')}</span>

          <div className="space-y-3">
            {evidenceCoverage.map((item, coverageIndex) => {
              const colors = getEvidenceStrengthProgressColors(item.strength);
              return (
                <div key={`coverage-${coverageIndex}`} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm flex-1 truncate">
                      {item.claim}
                    </p>
                    <Badge
                      variant="outline"
                      className={`text-xs shrink-0 ${getEvidenceStrengthBadgeColor(item.strength)}`}
                    >
                      {item.strength === EvidenceStrengths.STRONG && 'Strong'}
                      {item.strength === EvidenceStrengths.MODERATE && 'Moderate'}
                      {item.strength === EvidenceStrengths.WEAK && 'Weak'}
                    </Badge>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.bg }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${item.percentage}%`, backgroundColor: colors.indicator }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
