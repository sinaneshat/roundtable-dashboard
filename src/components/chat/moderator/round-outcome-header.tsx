'use client';

import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ConfidenceWeighting, DebatePhase } from '@/api/core/enums';
import { ConfidenceWeightings, DebatePhases } from '@/api/core/enums';
import type { ConsensusEvolution, ContributorPerspective } from '@/api/routes/chat/schema';
import { ModelBadge } from '@/components/chat/model-badge';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type RoundOutcomeHeaderProps = {
  roundConfidence?: number;
  confidenceWeighting?: ConfidenceWeighting;
  consensusEvolution?: ConsensusEvolution;
  contributors?: ContributorPerspective[];
  isStreaming?: boolean;
};

/**
 * Get phase display label from phase enum value
 */
function getPhaseLabel(phase: DebatePhase, t: (key: string) => string): string {
  switch (phase) {
    case DebatePhases.OPENING:
      return t('consensusEvolution.opening');
    case DebatePhases.REBUTTAL:
      return t('consensusEvolution.rebuttal');
    case DebatePhases.CROSS_EXAM:
      return t('consensusEvolution.crossExam');
    case DebatePhases.SYNTHESIS:
      return t('consensusEvolution.synthesis');
    case DebatePhases.FINAL_VOTE:
      return t('consensusEvolution.finalVote');
    default:
      return phase;
  }
}

/**
 * Get weighting display label
 */
function getWeightingLabel(weighting: ConfidenceWeighting | undefined, t: (key: string) => string): string {
  switch (weighting) {
    case ConfidenceWeightings.BALANCED:
      return t('roundOutcome.balanced');
    case ConfidenceWeightings.EVIDENCE_HEAVY:
      return t('roundOutcome.evidenceHeavy');
    case ConfidenceWeightings.CONSENSUS_HEAVY:
      return t('roundOutcome.consensusHeavy');
    case ConfidenceWeightings.EXPERTISE_WEIGHTED:
      return t('roundOutcome.expertiseWeighted');
    default:
      return t('roundOutcome.balanced');
  }
}

/**
 * Get color class for confidence percentage
 */
function getConfidenceColor(percentage: number): string {
  if (percentage >= 70)
    return 'text-emerald-500 border-emerald-500';
  if (percentage >= 50)
    return 'text-amber-500 border-amber-500';
  return 'text-red-500 border-red-500';
}

/**
 * Get progress gradient color based on percentage
 */
function getProgressGradientColor(percentage: number): string {
  if (percentage >= 70)
    return 'bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500';
  if (percentage >= 50)
    return 'bg-gradient-to-r from-red-500 via-amber-500 to-amber-500';
  return 'bg-gradient-to-r from-red-500 to-red-500';
}

/**
 * RoundOutcomeHeader - Multi-AI Deliberation Framework
 *
 * Displays dynamic data from analysis:
 * - Round confidence with weighting
 * - Contributors badges
 * - Consensus evolution timeline
 */
export function RoundOutcomeHeader({
  roundConfidence,
  confidenceWeighting,
  consensusEvolution,
  contributors,
  isStreaming = false,
}: RoundOutcomeHeaderProps) {
  const t = useTranslations('moderator');

  const phaseCount = consensusEvolution?.length ?? 0;
  const hasConfidence = roundConfidence !== undefined && roundConfidence > 0;
  const hasContributors = contributors && contributors.length > 0;

  // Don't render if no dynamic data available
  if (!hasConfidence && !hasContributors && !consensusEvolution?.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Confidence Row - Always inline layout */}
      {hasConfidence && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium whitespace-nowrap">{t('roundOutcome.roundConfidence')}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">
                      Overall confidence score based on vote distribution and evidence strength
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              {confidenceWeighting && (
                <Badge variant="outline" className="text-[10px] sm:text-xs h-5 px-1.5 hidden sm:inline-flex">
                  {getWeightingLabel(confidenceWeighting, t)}
                </Badge>
              )}
              <span className={cn('text-xl sm:text-2xl font-bold', getConfidenceColor(roundConfidence))}>
                {roundConfidence}%
              </span>
            </div>
          </div>

          {/* Confidence Progress Bar */}
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={cn('h-full transition-all duration-500', getProgressGradientColor(roundConfidence))}
              style={{ width: `${roundConfidence}%` }}
            />
          </div>
        </>
      )}

      {/* Contributors - horizontal scroll on mobile */}
      {hasContributors && (
        <ScrollArea className="w-full">
          <div className="flex items-center gap-2 pb-2">
            {contributors.map(contributor => (
              <ModelBadge
                key={contributor.participantIndex}
                modelId={contributor.modelId}
                role={contributor.role ?? undefined}
                size="sm"
                className="flex-shrink-0"
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" className="h-1.5" />
        </ScrollArea>
      )}

      {/* Consensus Evolution Timeline */}
      {consensusEvolution && consensusEvolution.length > 0 && (
        <div className="space-y-2 sm:space-y-3 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium whitespace-nowrap">{t('consensusEvolution.title')}</h4>
            <span className="text-[10px] sm:text-xs text-muted-foreground whitespace-nowrap">
              {t('roundOutcome.debatePhases', { count: phaseCount })}
            </span>
          </div>

          {/* Horizontally scrollable timeline on mobile */}
          <ScrollArea className="w-full">
            <div className="flex justify-center py-4 px-4 min-w-max">
              {/* Timeline container with relative positioning for the connecting line */}
              <div className="relative">
                {/* Connecting line - responsive positioning for circle centers */}
                {/* Mobile: size-10 (40px) → center at 20px (top-5) */}
                {/* Desktop: size-12 (48px) → center at 24px (sm:top-6) */}
                <div
                  className={cn(
                    'absolute h-0.5 bg-gradient-to-r from-amber-500/60 via-amber-400/60 to-emerald-500/60',
                    'top-5 sm:top-6', // 20px mobile, 24px desktop (half of circle size)
                    'left-5 sm:left-6', // Start from center of first circle
                    'right-5 sm:right-6', // End at center of last circle
                  )}
                />

                {/* Timeline Points */}
                <div className="relative flex gap-8 sm:gap-12">
                  {consensusEvolution.map((phase, index) => {
                    const percentage = phase.percentage;
                    const isLast = index === consensusEvolution.length - 1;

                    return (
                      <div
                        key={phase.phase}
                        className="flex flex-col items-center"
                      >
                        {/* Percentage Circle */}
                        <div
                          className={cn(
                            'relative z-10 flex items-center justify-center rounded-full border-2 bg-background',
                            // Fixed square dimensions for perfect circle
                            'min-w-10 min-h-10 w-10 h-10 sm:min-w-12 sm:min-h-12 sm:w-12 sm:h-12',
                            'aspect-square flex-shrink-0',
                            isLast
                              ? 'border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/30'
                              : percentage >= 70
                                ? 'border-emerald-500/60 text-emerald-400'
                                : percentage >= 50
                                  ? 'border-amber-500/60 text-amber-400'
                                  : 'border-red-500/60 text-red-400',
                          )}
                        >
                          <span className="text-xs sm:text-sm font-bold tabular-nums leading-none">
                            {percentage}%
                          </span>
                        </div>

                        {/* Phase Label */}
                        <span className="mt-2 text-[10px] sm:text-xs text-muted-foreground text-center leading-tight max-w-14 sm:max-w-20">
                          {phase.label || getPhaseLabel(phase.phase, t)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <ScrollBar orientation="horizontal" className="h-1.5" />
          </ScrollArea>
        </div>
      )}

      {isStreaming && (
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-primary/60 animate-pulse" />
          <span className="text-xs text-muted-foreground">Analyzing...</span>
        </div>
      )}
    </div>
  );
}
