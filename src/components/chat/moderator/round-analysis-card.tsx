'use client';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, Recommendation, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';
import { getDisplayRoundNumber } from '@/lib/schemas/round-schemas';
import { cn } from '@/lib/ui/cn';

import type { DemoSectionOpenStates } from './moderator-analysis-panel';
import { ModeratorAnalysisPanel } from './moderator-analysis-panel';
import { ModeratorAnalysisStream } from './moderator-analysis-stream';

type RoundAnalysisCardProps = {
  analysis: StoredModeratorAnalysis;
  threadId: string;
  isLatest?: boolean;
  className?: string;
  onStreamStart?: () => void;
  onStreamComplete?: (completedAnalysisData?: ModeratorAnalysisPayload | null, error?: Error | null) => void;
  streamingRoundNumber?: number | null;
  onActionClick?: (action: Recommendation) => void;
  demoOpen?: boolean; // Demo mode controlled accordion state
  demoShowContent?: boolean; // Demo mode controlled content visibility
  demoSectionStates?: DemoSectionOpenStates; // Demo mode controlled inner section states
};

/**
 * RoundAnalysisCard - Accordion component for moderator analysis
 *
 * ✅ REVISED: This component should ONLY be rendered when analysis has participant responses
 * (participantMessageIds.length > 0). Placeholder states with closed/locked accordions are
 * NOT shown - placeholder states are ONLY for participant cards.
 *
 * Filtering is done upstream in:
 * - ChatOverviewScreen.tsx: checks participantMessageIds before rendering
 * - useThreadTimeline.ts: filters out placeholder analyses from timeline
 */
export function RoundAnalysisCard({
  analysis,
  threadId,
  isLatest = false,
  className,
  onStreamStart,
  onStreamComplete,
  streamingRoundNumber,
  onActionClick,
  demoOpen,
  demoShowContent,
  demoSectionStates,
}: RoundAnalysisCardProps) {
  const t = useTranslations('moderator');

  // Status configuration for badge styling
  const statusConfig = {
    pending: {
      label: t('analyzing'),
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    streaming: {
      label: t('analyzing'),
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    complete: {
      label: t('completed'),
      color: 'bg-green-500/10 text-green-500 border-green-500/20',
    },
    failed: {
      label: t('failed'),
      color: 'bg-red-500/10 text-red-500 border-red-500/20',
    },
  } as const;
  const config = statusConfig[analysis.status];

  // ✅ REACT 19: Manual control state with round tracking (derived state pattern)
  // Track the round number when user took manual control - allows auto-invalidation
  const [manualControl, setManualControl] = useState<{ round: number; open: boolean } | null>(null);

  // ✅ REACT 19: Derive if manual control is still valid (no useEffect needed)
  // Manual control is invalidated when a newer round starts streaming
  const isManualControlValid = useMemo(() => {
    if (!manualControl)
      return false;
    // If streaming a newer round, manual control is no longer valid
    if (streamingRoundNumber != null && streamingRoundNumber > manualControl.round) {
      return false;
    }
    return true;
  }, [manualControl, streamingRoundNumber]);

  // Disable accordion interaction during streaming/pending
  const isStreamingOrPending = analysis.status === AnalysisStatuses.STREAMING
    || analysis.status === AnalysisStatuses.PENDING;

  // ✅ REACT 19: Event handler (not useEffect) for user interaction
  const handleOpenChange = useCallback((open: boolean) => {
    // Prevent interaction during streaming
    if (isStreamingOrPending)
      return;

    // Store manual control with current round number for invalidation tracking
    setManualControl({ round: analysis.roundNumber, open });
  }, [isStreamingOrPending, analysis.roundNumber]);

  // ✅ REACT 19: Fully derived accordion state (no useEffect needed)
  // Priority: demoOpen > valid manual control > isLatest
  const isOpen = useMemo(() => {
    if (demoOpen !== undefined)
      return demoOpen;
    if (isManualControlValid && manualControl)
      return manualControl.open;
    return isLatest;
  }, [demoOpen, isManualControlValid, manualControl, isLatest]);

  // ✅ SCROLL FIX: Removed independent scrollIntoView - scroll is managed centrally by useChatScroll
  // Having each RoundAnalysisCard call scrollIntoView caused multiple scroll anchors to conflict,
  // resulting in excessive jumping/snapping behavior. The useChatScroll hook handles all auto-scroll
  // during streaming via ResizeObserver on document.body.

  return (
    <div className={cn('py-1.5', className)}>
      <ChainOfThought
        open={isOpen}
        onOpenChange={handleOpenChange}
        disabled={isStreamingOrPending}
        className={cn(isStreamingOrPending && 'cursor-default')}
      >
        <div className="relative">
          <ChainOfThoughtHeader>
            {/* Mobile-optimized header layout - inline title and badge */}
            <div className="flex items-center gap-2 w-full min-w-0">
              <Clock className="size-4 text-muted-foreground flex-shrink-0" />
              {/* Title and badge - always inline, no wrap */}
              <span className="text-sm font-medium whitespace-nowrap">
                {t('roundAnalysis', { number: getDisplayRoundNumber(analysis.roundNumber) })}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] sm:text-xs h-5 px-1.5 sm:px-2 flex-shrink-0',
                  config.color,
                )}
              >
                {config.label}
              </Badge>
              {/* Mode indicator - hidden on mobile */}
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0 ml-auto">
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {t(`mode.${analysis.mode}`)}
                </span>
              </div>
            </div>
          </ChainOfThoughtHeader>
        </div>
        <ChainOfThoughtContent>
          {/* Demo mode: only show content when demoShowContent is true */}
          {(demoShowContent === undefined || demoShowContent) && (
            <>
              {/* Render appropriate content based on analysis status */}
              {(analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING)
                ? (
                    <ModeratorAnalysisStream
                      threadId={threadId}
                      analysis={analysis}
                      onStreamStart={onStreamStart}
                      onStreamComplete={onStreamComplete}
                      onActionClick={onActionClick}
                    />
                  )
                : analysis.status === AnalysisStatuses.COMPLETE && analysis.analysisData
                  ? (
                      <ModeratorAnalysisPanel
                        analysis={analysis}
                        onActionClick={onActionClick}
                        demoSectionStates={demoSectionStates}
                      />
                    )
                  : (analysis.status === AnalysisStatuses.FAILED || (analysis.status === AnalysisStatuses.COMPLETE && !analysis.analysisData))
                      ? (
                          <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                            <span className="size-1.5 rounded-full bg-destructive/80" />
                            {/* ✅ FIX: Show error for FAILED or inconsistent COMPLETE-without-data states
                              The latter can happen if streaming completed but validation failed */}
                            <span>{t('errorAnalyzing')}</span>
                          </div>
                        )
                      : null}
            </>
          )}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
