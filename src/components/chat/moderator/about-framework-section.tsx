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
 * Clean, minimal display of framework stats and contributors.
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

    const avgLogic = Math.round(contributors.reduce((sum, c) => sum + (c.scorecard?.logic || 0), 0) / totalContributors);
    const avgCreativity = Math.round(contributors.reduce((sum, c) => sum + (c.scorecard?.creativity || 0), 0) / totalContributors);
    const avgEvidence = Math.round(contributors.reduce((sum, c) => sum + (c.scorecard?.evidence || 0), 0) / totalContributors);

    return { approveCount, rejectCount, cautionCount, avgLogic, avgCreativity, avgEvidence };
  }, [contributors, hasContributors]);

  return (
    <div className="space-y-4">
      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed">
        {t('aboutFramework.description')}
      </p>

      {/* Vote Summary - Inline with colored numbers */}
      {stats && (
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-emerald-400">{stats.approveCount}</span>
            <span className="text-muted-foreground">Approve</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-red-400">{stats.rejectCount}</span>
            <span className="text-muted-foreground">Reject</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-amber-400">{stats.cautionCount}</span>
            <span className="text-muted-foreground">Caution</span>
          </span>
        </div>
      )}

      {/* Average Scores - Simple inline display */}
      {stats && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-muted-foreground">Avg:</span>
          <span>
            <span className="text-blue-400 font-medium">
              {stats.avgLogic}
              %
            </span>
            {' '}
            Logic
          </span>
          <span>
            <span className="text-purple-400 font-medium">
              {stats.avgCreativity}
              %
            </span>
            {' '}
            Creativity
          </span>
          <span>
            <span className="text-emerald-400 font-medium">
              {stats.avgEvidence}
              %
            </span>
            {' '}
            Evidence
          </span>
        </div>
      )}

      {/* Contributors - Clean list */}
      {hasContributors && (
        <div className="space-y-2 pt-1">
          <span className="text-xs text-muted-foreground">
            {t('roundOutcome.contributors')}
            {' '}
            (
            {contributors.length}
            )
          </span>
          <div className="space-y-1">
            {contributors.map((contributor, index) => {
              const color = getContributorColor(index);
              return (
                <div
                  key={contributor.participantIndex}
                  className="flex items-center gap-2 py-1"
                >
                  <Bot className={cn('size-3.5 flex-shrink-0', color)} />
                  <span className={cn('text-sm font-medium flex-1 min-w-0 truncate', color)}>
                    {contributor.role || contributor.modelName}
                  </span>
                  <span className="text-xs text-muted-foreground truncate max-w-24 sm:max-w-none">
                    {contributor.modelName}
                  </span>
                  {contributor.vote && (
                    <span className="flex-shrink-0">{getVoteIcon(contributor.vote)}</span>
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
      <div className="flex items-start gap-2 pt-3 border-t border-border/30">
        <Sparkles className="size-3.5 mt-0.5 flex-shrink-0 text-muted-foreground/50" />
        <p className="text-[11px] text-muted-foreground/70 leading-relaxed">
          {t('aboutFramework.confidenceExplanation')}
        </p>
      </div>
    </div>
  );
}
