'use client';

import {
  BarChart3,
  ChevronDown,
  Lightbulb,
  Search,
  Wrench,
} from 'lucide-react';
import { useState } from 'react';

import type { ContributorPerspective } from '@/api/routes/chat/schema';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/ui/cn';

import { getVoteCardColor, getVoteIcon } from './moderator-ui-utils';

type ContributorPerspectivesSectionProps = {
  perspectives: ContributorPerspective[];
  isStreaming?: boolean;
};

/**
 * Get role icon based on role name
 */
function getRoleIcon(role: string) {
  const roleLower = role.toLowerCase();
  if (roleLower.includes('innovator') || roleLower.includes('creative')) {
    return <Lightbulb className="size-4" />;
  }
  if (roleLower.includes('skeptic') || roleLower.includes('critic')) {
    return <Search className="size-4" />;
  }
  if (roleLower.includes('analyst') || roleLower.includes('data')) {
    return <BarChart3 className="size-4" />;
  }
  if (roleLower.includes('builder') || roleLower.includes('practical')) {
    return <Wrench className="size-4" />;
  }
  return <Lightbulb className="size-4" />;
}

/**
 * ContributorPerspectivesSection - Multi-AI Deliberation Framework
 *
 * Displays AI contributor perspectives with minimal nesting.
 */
export function ContributorPerspectivesSection({
  perspectives,
  isStreaming: _isStreaming = false,
}: ContributorPerspectivesSectionProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  if (!perspectives || perspectives.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      {perspectives.map((perspective, index) => {
        const isExpanded = expandedIndex === index;

        return (
          <Collapsible
            key={perspective.participantIndex}
            open={isExpanded}
            onOpenChange={open => setExpandedIndex(open ? index : null)}
            className={cn(
              'rounded-xl overflow-hidden transition-colors',
              getVoteCardColor(perspective.vote),
            )}
          >
            <CollapsibleTrigger
              className={cn(
                'flex w-full items-center justify-between px-4 py-3 text-left transition-colors',
                'hover:bg-white/5',
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{getRoleIcon(perspective.role || '')}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{perspective.role || 'Contributor'}</p>
                  <p className="text-xs text-muted-foreground">{perspective.modelName}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {getVoteIcon(perspective.vote)}
                <ChevronDown
                  className={cn(
                    'size-4 text-muted-foreground transition-transform duration-200',
                    isExpanded && 'rotate-180',
                  )}
                />
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="px-4 py-5 space-y-5">
                {/* Scorecard Section */}
                <div className="space-y-3">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Scorecard</h4>
                  <div className="grid gap-3">
                    {/* Logic */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-blue-400">Logic</span>
                        <span className="text-xs font-semibold tabular-nums text-blue-400">{perspective.scorecard.logic}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${perspective.scorecard.logic}%` }}
                        />
                      </div>
                    </div>
                    {/* Creativity */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-purple-400">Creativity</span>
                        <span className="text-xs font-semibold tabular-nums text-purple-400">{perspective.scorecard.creativity}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-purple-500 transition-all duration-300"
                          style={{ width: `${perspective.scorecard.creativity}%` }}
                        />
                      </div>
                    </div>
                    {/* Risk Awareness */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-amber-400">Risk Awareness</span>
                        <span className="text-xs font-semibold tabular-nums text-amber-400">{perspective.scorecard.riskAwareness}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-amber-500 transition-all duration-300"
                          style={{ width: `${perspective.scorecard.riskAwareness}%` }}
                        />
                      </div>
                    </div>
                    {/* Evidence */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-emerald-400">Evidence</span>
                        <span className="text-xs font-semibold tabular-nums text-emerald-400">{perspective.scorecard.evidence}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                          style={{ width: `${perspective.scorecard.evidence}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stance Section */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Stance</h4>
                  <p className="text-sm text-foreground/90 leading-relaxed">
                    {perspective.stance}
                  </p>
                </div>

                {/* Supporting Evidence Section */}
                {perspective.evidence && perspective.evidence.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Supporting Evidence</h4>
                    <ul className="space-y-1.5">
                      {perspective.evidence.map(item => (
                        <li key={`evidence-${perspective.participantIndex}-${item}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="text-primary/50 mt-1">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
