'use client';

import { motion } from 'motion/react';

import type { AlternativeScenario } from '@/api/routes/chat/schema';
import { StreamingCursor } from '@/components/ui/streaming-text';

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
 * Items animate in top-to-bottom order with 40ms stagger.
 */
export function AlternativesSection({
  alternatives,
  isStreaming = false,
}: AlternativesSectionProps) {
  if (!alternatives || alternatives.length === 0) {
    return null;
  }

  // Sort by confidence descending
  const sortedAlternatives = [...alternatives].sort((a, b) => b.confidence - a.confidence);

  return (
    <div className="space-y-4">
      {sortedAlternatives.map((alternative, index) => {
        const colors = getConfidenceProgressColors(alternative.confidence);
        return (
          <motion.div
            key={alternative.scenario}
            className="space-y-1.5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.2,
              delay: index * 0.04,
              ease: 'easeOut',
            }}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm flex-1">
                {alternative.scenario}
                {/* Show cursor on last item when streaming */}
                {isStreaming && index === sortedAlternatives.length - 1 && <StreamingCursor />}
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
          </motion.div>
        );
      })}
    </div>
  );
}
