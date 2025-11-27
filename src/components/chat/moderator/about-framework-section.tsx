'use client';

import { Bot, Sparkles, Target, TrendingUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { VoteTypes } from '@/api/core/enums';
import type { ContributorPerspective } from '@/api/routes/chat/schema';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';

import { getVoteIcon } from './moderator-ui-utils';

type AboutFrameworkSectionProps = {
  contributors?: ContributorPerspective[];
};

// Color palette for contributors with background variants
const contributorStyles = [
  { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
  { text: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  { text: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
];

/**
 * AboutFrameworkSection - Multi-AI Deliberation Framework
 *
 * Dynamically shows actual contributors from the analysis when available,
 * with computed stats and insights from their perspectives.
 */
export function AboutFrameworkSection({ contributors }: AboutFrameworkSectionProps) {
  const t = useTranslations('moderator');

  const hasContributors = contributors && contributors.length > 0;

  // Compute dynamic stats from contributors
  const stats = useMemo(() => {
    if (!hasContributors) return null;

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
    <div className="space-y-5">
      {/* Section Subtitle with Icon */}
      <div className="flex items-start gap-2.5 text-sm text-muted-foreground italic border-l-2 border-primary/30 pl-3">
        <Sparkles className="size-4 mt-0.5 flex-shrink-0 text-primary/60" />
        <p>{t('aboutFramework.subtitle')}</p>
      </div>

      {/* Main Description */}
      <p className="text-sm text-foreground/80 leading-relaxed">
        {t('aboutFramework.description')}
      </p>

      {/* Dynamic Stats from Contributors */}
      {stats && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-lg sm:text-xl font-bold text-emerald-400">{stats.approveCount}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Approve</span>
          </div>
          <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="text-lg sm:text-xl font-bold text-red-400">{stats.rejectCount}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Reject</span>
          </div>
          <div className="flex flex-col items-center p-2.5 sm:p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-lg sm:text-xl font-bold text-amber-400">{stats.cautionCount}</span>
            <span className="text-[10px] sm:text-xs text-muted-foreground">Caution</span>
          </div>
        </div>
      )}

      {/* Average Quality Metrics */}
      {stats && (
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Target className="size-3" />
            Average Quality Scores
          </h4>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="text-blue-400 border-blue-500/30 bg-blue-500/5">
              Logic: {stats.avgLogic}%
            </Badge>
            <Badge variant="outline" className="text-purple-400 border-purple-500/30 bg-purple-500/5">
              Creativity: {stats.avgCreativity}%
            </Badge>
            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-500/5">
              Evidence: {stats.avgEvidence}%
            </Badge>
          </div>
        </div>
      )}

      {/* Dynamic Contributors - shows actual participants from analysis */}
      {hasContributors && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="size-3" />
            {t('roundOutcome.contributors')} ({contributors.length})
          </h4>

          <div className="grid gap-2 sm:grid-cols-2">
            {contributors.map((contributor, index) => {
              const styleIndex = index % contributorStyles.length;
              const style = contributorStyles[styleIndex] ?? contributorStyles[0];
              return (
                <div
                  key={contributor.participantIndex}
                  className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border',
                    style?.bg,
                    style?.border,
                  )}
                >
                  <Bot className={cn('size-4 mt-0.5 flex-shrink-0', style?.text)} />
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-sm font-medium truncate', style?.text)}>
                        {contributor.role || contributor.modelName}
                      </p>
                      {contributor.vote && (
                        <span className="flex-shrink-0">{getVoteIcon(contributor.vote)}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {contributor.modelName}
                    </p>
                    {contributor.stance && (
                      <p className="text-xs text-foreground/70 line-clamp-2 leading-relaxed">
                        {contributor.stance}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Fallback: Generic framework roles when no contributors */}
      {!hasContributors && (
        <div className="space-y-3">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t('aboutFramework.howItWorks')}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t('aboutFramework.noContributors')}
          </p>
        </div>
      )}

      {/* Confidence Score Explanation */}
      <div className="flex items-start gap-2 text-sm text-muted-foreground italic pt-2 border-t border-border/30">
        <Sparkles className="size-3.5 mt-0.5 flex-shrink-0 text-primary/40" />
        <p>{t('aboutFramework.confidenceExplanation')}</p>
      </div>
    </div>
  );
}
