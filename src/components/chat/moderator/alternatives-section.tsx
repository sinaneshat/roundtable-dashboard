'use client';

import type { AlternativeScenario } from '@/api/routes/chat/schema';
import { Progress } from '@/components/ui/progress';

import { getConfidenceProgressColor } from './moderator-ui-utils';

type AlternativesSectionProps = {
  alternatives: AlternativeScenario[];
  isStreaming?: boolean;
};

/**
 * AlternativesSection - Multi-AI Deliberation Framework
 *
 * Displays alternative scenarios with confidence percentages.
 * Simple visualization of what-if scenarios explored during deliberation.
 */
export function AlternativesSection({
  alternatives,
  isStreaming: _isStreaming = false,
}: AlternativesSectionProps) {
  if (!alternatives || alternatives.length === 0) {
    return null;
  }

  // Sort by confidence descending
  const sortedAlternatives = [...alternatives].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-3">
      {sortedAlternatives.map(alternative => (
        <div
          key={`alt-${alternative.scenario}-${alternative.confidence}`}
          className="space-y-2"
        >
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm flex-1">
              {alternative.scenario}
            </p>
            <span className="text-sm font-medium tabular-nums">
              {alternative.confidence}
              %
            </span>
          </div>
          <Progress
            value={alternative.confidence}
            className="h-1.5"
            indicatorClassName={getConfidenceProgressColor(alternative.confidence)}
          />
        </div>
      ))}
    </div>
  );
}
