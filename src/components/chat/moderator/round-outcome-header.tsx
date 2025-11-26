'use client';

import { Clock, Info, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ConfidenceWeighting, DebatePhase } from '@/api/core/enums';
import { ConfidenceWeightings, DebatePhases } from '@/api/core/enums';
import type { ConsensusEvolution, ContributorPerspective } from '@/api/routes/chat/schema';
import { ModelBadge } from '@/components/chat/model-badge';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/ui/cn';

type RoundOutcomeHeaderProps = {
  roundConfidence?: number;
  confidenceWeighting?: ConfidenceWeighting;
  consensusEvolution?: ConsensusEvolution;
  contributors?: ContributorPerspective[];
  generatedAt?: string;
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
 * Displays only dynamic data from analysis:
 * - Round confidence with weighting (when roundConfidence > 0)
 * - Contributors list (when contributors exist)
 * - Date and contributor count (when available)
 * - Consensus evolution timeline (when data exists)
 */
export function RoundOutcomeHeader({
  roundConfidence,
  confidenceWeighting,
  consensusEvolution,
  contributors,
  generatedAt,
  isStreaming = false,
}: RoundOutcomeHeaderProps) {
  const t = useTranslations('moderator');

  const contributorCount = contributors?.length ?? 0;
  const phaseCount = consensusEvolution?.length ?? 0;
  const hasConfidence = roundConfidence !== undefined && roundConfidence > 0;

  // Format date if provided
  const formattedDate = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : null;

  // Don't render if no dynamic data available
  if (!hasConfidence && contributorCount === 0 && !consensusEvolution?.length) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Metadata Row - Date & Contributors Count */}
      {(formattedDate || contributorCount > 0) && (
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          {formattedDate && (
            <div className="flex items-center gap-1.5">
              <Clock className="size-4" />
              <span>{formattedDate}</span>
            </div>
          )}
          {contributorCount > 0 && (
            <div className="flex items-center gap-1.5">
              <Users className="size-4" />
              <span>{t('roundOutcome.contributorCount', { count: contributorCount })}</span>
            </div>
          )}
        </div>
      )}

      {/* Confidence Row - Only show when we have actual confidence data */}
      {hasConfidence && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{t('roundOutcome.roundConfidence')}</span>
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
      {contributors && contributors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {contributors.map(contributor => (
            <ModelBadge
              key={contributor.participantIndex}
              modelId={contributor.modelId}
              role={contributor.role}
              size="sm"
            />
          ))}
        </div>
      )}

      {/* Consensus Evolution Timeline */}
      {consensusEvolution && consensusEvolution.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">{t('consensusEvolution.title')}</h4>
            <span className="text-xs text-muted-foreground">
              {t('roundOutcome.debatePhases', { count: phaseCount })}
            </span>
          </div>

          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute top-4 left-0 right-0 h-0.5 bg-gradient-to-r from-red-500 via-amber-500 to-emerald-500" />

            {/* Timeline Points */}
            <div className="relative flex justify-between">
              {consensusEvolution.map((phase) => {
                const percentage = phase.percentage;

                return (
                  <div
                    key={phase.phase}
                    className="flex flex-col items-center"
                    style={{ width: `${100 / consensusEvolution.length}%` }}
                  >
                    {/* Percentage Circle */}
                    <div
                      className={cn(
                        'flex size-8 items-center justify-center rounded-full border-2 bg-background text-xs font-bold',
                        getConfidenceColor(percentage),
                      )}
                    >
                      {percentage}
                      %
                    </div>

                    {/* Phase Label */}
                    <span className="mt-2 text-xs text-muted-foreground text-center">
                      {phase.label || getPhaseLabel(phase.phase, t)}
                    </span>
                  </div>
                );
              })}
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
