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
      {/* Confidence Row - Only show when we have actual confidence data */}
      {hasConfidence && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('roundOutcome.roundConfidence')}</span>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs text-xs">
                      Overall confidence score based on vote distribution and evidence strength
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="flex items-center gap-3">
              {confidenceWeighting && (
                <Badge variant="outline" className="text-xs">
                  {getWeightingLabel(confidenceWeighting, t)}
                </Badge>
              )}
              <span className={cn('text-2xl font-bold', getConfidenceColor(roundConfidence))}>
                {roundConfidence}
                %
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

      {/* Contributors */}
      {hasContributors && (
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex w-max items-center gap-3 p-4">
            {contributors.map(contributor => (
              <ModelBadge
                key={contributor.participantIndex}
                modelId={contributor.modelId}
                role={contributor.role ?? undefined}
                size="sm"
                className="shrink-0"
              />
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* Consensus Evolution Timeline */}
      {consensusEvolution && consensusEvolution.length > 0 && (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{t('consensusEvolution.title')}</h4>
            <span className="text-xs text-muted-foreground">
              {t('roundOutcome.debatePhases', { count: phaseCount })}
            </span>
          </div>

          {/* Centered Timeline */}
          <div className="flex justify-center py-4 px-2">
            <div className="relative px-6">
              {/* Timeline Line */}
              <div className="absolute top-6 left-10 right-10 h-px bg-gradient-to-r from-amber-600/60 via-amber-500/80 to-emerald-500" />

              {/* Timeline Points */}
              <div className="relative flex gap-10 sm:gap-12">
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
                          'relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-background',
                          isLast
                            ? 'border-emerald-500 text-emerald-400 ring-2 ring-emerald-500/30'
                            : percentage >= 70
                              ? 'border-emerald-500/60 text-emerald-400'
                              : percentage >= 50
                                ? 'border-amber-500/60 text-amber-400'
                                : 'border-red-500/60 text-red-400',
                        )}
                      >
                        <span className="text-sm font-bold tabular-nums">
                          {percentage}
                          %
                        </span>
                      </div>

                      {/* Phase Label */}
                      <span className="mt-3 text-xs text-muted-foreground text-center leading-tight max-w-16">
                        {phase.label || getPhaseLabel(phase.phase, t)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
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
