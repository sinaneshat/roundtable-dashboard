'use client';

import { Bot, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { VoteTypes } from '@/api/core/enums';
import type { ContributorPerspective } from '@/api/routes/chat/schema';
import { cn } from '@/lib/ui/cn';

import { getContributorColor, getVoteIcon } from './moderator-ui-utils';

type AboutFrameworkSectionProps = {
  contributors?: ContributorPerspective[];
};

/**
 * AboutFrameworkSection - Multi-AI Deliberation Framework
 *
 * Shows framework explanation with dynamic stats and contributors.
 */
export function AboutFrameworkSection({ contributors }: AboutFrameworkSectionProps) {
  const t = useTranslations('moderator');

  const hasContributors = contributors && contributors.length > 0;

  // Compute dynamic stats from contributors
  const stats = useMemo(() => {
    if (!hasContributors)
      return null;

    const totalContributors = contributors.length;
    const approveCount = contributors.filter(c => c.vote === VoteTypes.APPROVE).length;
    const rejectCount = contributors.filter(c => c.vote === VoteTypes.REJECT).length;
    const cautionCount = contributors.filter(c => c.vote === VoteTypes.CAUTION || c.vote === null).length;

    // Calculate average scorecard metrics
    const avgLogic = Math.round(contributors.reduce((sum, c) => sum + (c.scorecard?.logic || 0), 0) / totalContributors);
    const avgCreativity = Math.round(contributors.reduce((sum, c) => sum + (c.scorecard?.creativity || 0), 0) / totalContributors);
    const avgEvidence = Math.round(contributors.reduce((sum, c) => sum + (c.scorecard?.evidence || 0), 0) / totalContributors);

    return {
      totalContributors,
      approveCount,
      rejectCount,
      cautionCount,
      avgLogic,
      avgCreativity,
      avgEvidence,
    };
  }, [contributors, hasContributors]);

  return (
    <div className="space-y-4">
      {/* Section Subtitle */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t('aboutFramework.subtitle')}
      </p>

      {/* Main Description */}
      <p className="text-sm text-foreground/80 leading-relaxed">
        {t('aboutFramework.description')}
      </p>

      {/* Vote Summary */}
      {stats && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10">
            <span className="text-sm font-semibold text-emerald-400">{stats.approveCount}</span>
            <span className="text-xs text-muted-foreground">Approve</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/10">
            <span className="text-sm font-semibold text-red-400">{stats.rejectCount}</span>
            <span className="text-xs text-muted-foreground">Reject</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/10">
            <span className="text-sm font-semibold text-amber-400">{stats.cautionCount}</span>
            <span className="text-xs text-muted-foreground">Caution</span>
          </div>
        </div>
      )}

      {/* Average Quality Scores */}
      {stats && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Avg Scores:</span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">
            Logic
            {' '}
            {stats.avgLogic}
            %
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">
            Creativity
            {' '}
            {stats.avgCreativity}
            %
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
            Evidence
            {' '}
            {stats.avgEvidence}
            %
          </span>
        </div>
      )}

      {/* Contributors List */}
      {hasContributors && (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">
            {t('roundOutcome.contributors')}
            {' '}
            (
            {contributors.length}
            )
          </span>
          <div className="space-y-1.5">
            {contributors.map((contributor, index) => {
              const color = getContributorColor(index);

              return (
                <div
                  key={contributor.participantIndex}
                  className="flex items-center gap-2 py-1.5"
                >
                  <Bot className={cn('size-3.5 flex-shrink-0', color)} />
                  <span className={cn('text-sm font-medium', color)}>
                    {contributor.role || contributor.modelName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {contributor.modelName}
                  </span>
                  {contributor.vote && (
                    <span className="ml-auto flex-shrink-0">{getVoteIcon(contributor.vote)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback when no contributors */}
      {!hasContributors && (
        <p className="text-sm text-muted-foreground">
          {t('aboutFramework.noContributors')}
        </p>
      )}

      {/* Confidence Explanation */}
      <div className="flex items-start gap-2 pt-3 border-t border-border/40">
        <Sparkles className="size-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('aboutFramework.confidenceExplanation')}
        </p>
      </div>
    </div>
  );
}
