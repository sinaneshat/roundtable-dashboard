'use client';

import type { AlternativeScenario } from '@/api/routes/chat/schema';

import { getConfidenceProgressColors } from './moderator-ui-utils';

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
      {sortedAlternatives.map((alternative, altIndex) => {
        const colors = getConfidenceProgressColors(alternative.confidence);
        return (
          <div
            key={`alt-${altIndex}`}
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
            <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: colors.bg }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${alternative.confidence}%`, backgroundColor: colors.indicator }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
