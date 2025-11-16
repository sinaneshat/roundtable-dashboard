'use client';

import { Clock, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { ModeratorAnalysisPayload, RecommendedAction, StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';
import { getDisplayRoundNumber } from '@/lib/schemas/round-schemas';
import { cn } from '@/lib/ui/cn';

import { LeaderboardCard } from './leaderboard-card';
import { ModeratorAnalysisStream } from './moderator-analysis-stream';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { RoundSummarySection } from './round-summary-section';
import { SkillsComparisonChart } from './skills-comparison-chart';

type RoundAnalysisCardProps = {
  analysis: StoredModeratorAnalysis;
  threadId: string;
  isLatest?: boolean;
  className?: string;
  onStreamStart?: () => void;
  onStreamComplete?: (completedAnalysisData?: ModeratorAnalysisPayload | null, error?: unknown) => void;
  streamingRoundNumber?: number | null;
  onActionClick?: (action: RecommendedAction) => void;
  /** Callback to regenerate entire round (participants + analysis) */
  onRetry?: (roundNumber: number) => void;
  /** Whether round has incomplete participant responses */
  isRoundIncomplete?: boolean;
};
export function RoundAnalysisCard({
  analysis,
  threadId,
  isLatest = false,
  className,
  onStreamStart,
  onStreamComplete,
  streamingRoundNumber,
  onActionClick,
  onRetry,
  isRoundIncomplete = false,
}: RoundAnalysisCardProps) {
  const t = useTranslations('moderator');
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
  const [isManuallyControlled, setIsManuallyControlled] = useState(false);
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // React 19 Pattern: Effect runs when streamingRoundNumber changes (dependency array handles detection)
  // No need for ref to track previous value - effect dependencies already do this
  useEffect(() => {
    if (streamingRoundNumber != null && !isLatest && streamingRoundNumber > analysis.roundNumber) {
      // AI SDK v5 Pattern: Use queueMicrotask instead of setTimeout(0)
      // This schedules state updates in the microtask queue, more efficient than timer queue
      queueMicrotask(() => {
        setIsManuallyControlled(false);
        setManuallyOpen(false);
      });
    }
  }, [streamingRoundNumber, isLatest, analysis.roundNumber]);
  const isOpen = isManuallyControlled ? manuallyOpen : isLatest;

  // ✅ Disable accordion interaction during streaming
  const isStreamingOrPending = analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING;

  const handleOpenChange = useCallback((open: boolean) => {
    // Prevent interaction during streaming
    if (isStreamingOrPending)
      return;

    setIsManuallyControlled(true);
    setManuallyOpen(open);
  }, [isStreamingOrPending]);
  const handleRetry = useCallback(async () => {
    if (isRetrying)
      return;
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    setIsRetrying(true);

    // ✅ CRITICAL FIX: If onRetry provided, call it for FAILED analysis or incomplete rounds
    // Previously only called onRetry when isRoundIncomplete was true
    // But onRetry should also be called when analysis FAILED and user clicks retry
    // This allows parent component to handle retry logic (e.g., regenerate entire round)
    if (onRetry && (isRoundIncomplete || analysis.status === AnalysisStatuses.FAILED)) {
      onRetry(analysis.roundNumber);
      retryTimeoutRef.current = setTimeout(() => {
        setIsRetrying(false);
      }, 1000);
      return;
    }

    // Otherwise, just retry analysis generation via API
    try {
      await fetch(`/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantMessageIds: analysis.participantMessageIds,
        }),
      });
    } catch {
    }
    retryTimeoutRef.current = setTimeout(() => {
      setIsRetrying(false);
    }, 2000);
  }, [threadId, analysis.roundNumber, analysis.participantMessageIds, analysis.status, isRetrying, onRetry, isRoundIncomplete]);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef(analysis.status);
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);
  useEffect(() => {
    // ✅ FIX: REMOVED forced scrollIntoView on analysis completion
    // Previously: Forced scroll to analysis card when it completed, overriding user position
    // Now: Respects user scroll position - only auto-scrolls if user is near bottom (via useChatScroll)
    // User maintains scroll control during object stream generation
    previousStatusRef.current = analysis.status;
  }, [analysis.status]);
  return (
    <div ref={containerRef} className={cn('py-1.5', className)}>
      <ChainOfThought
        open={isOpen}
        onOpenChange={handleOpenChange}
        disabled={isStreamingOrPending}
        className={cn(isStreamingOrPending && 'cursor-default')}
      >
        <div className="relative">
          <ChainOfThoughtHeader>
            <div className="flex items-center gap-2.5 w-full pr-24">
              <Clock className="size-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium">
                {t('roundAnalysis', { number: getDisplayRoundNumber(analysis.roundNumber) })}
              </span>
              <Badge variant="outline" className={cn('text-xs h-6', config.color)}>
                {config.label}
              </Badge>
              <span className="hidden md:inline text-sm text-muted-foreground">•</span>
              <span className="hidden md:inline text-xs text-muted-foreground capitalize">
                {t(`mode.${analysis.mode}`)}
              </span>
            </div>
          </ChainOfThoughtHeader>
          {(analysis.status === AnalysisStatuses.FAILED || isRoundIncomplete) && (
            <div className="absolute right-4 top-3 z-10">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetry();
                }}
                disabled={isRetrying}
                className={cn(
                  'flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors',
                  'text-primary hover:text-primary/80 hover:bg-primary/10',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
                aria-label={t('retryAnalysis')}
              >
                <RotateCcw className={cn('size-3.5', isRetrying && 'animate-spin')} />
                <span className="hidden sm:inline">{isRoundIncomplete ? t('retryRound') : t('retryAnalysis')}</span>
              </button>
            </div>
          )}
        </div>
        <ChainOfThoughtContent>
          <div className="space-y-4">
            {analysis.userQuestion && analysis.userQuestion !== 'N/A' && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Question:</p>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {analysis.userQuestion}
                </p>
              </div>
            )}
            {(analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING)
              ? (
                  <ModeratorAnalysisStream
                    key={analysis.id}
                    threadId={threadId}
                    analysis={analysis}
                    onStreamStart={onStreamStart}
                    onStreamComplete={onStreamComplete}
                    onActionClick={onActionClick}
                  />
                )
              : analysis.status === AnalysisStatuses.COMPLETE && analysis.analysisData
                ? (
                    <div className="space-y-4">
                      {analysis.analysisData.leaderboard && analysis.analysisData.leaderboard.length > 0 && (
                        <LeaderboardCard leaderboard={analysis.analysisData.leaderboard} />
                      )}
                      {analysis.analysisData.participantAnalyses && analysis.analysisData.participantAnalyses.length > 0 && (
                        <>
                          <SkillsComparisonChart participants={analysis.analysisData.participantAnalyses} />
                          <div className="space-y-3">
                            {analysis.analysisData.participantAnalyses.map(participant => (
                              <ParticipantAnalysisCard
                                key={`${analysis.id}-participant-${participant.participantIndex}`}
                                analysis={participant}
                              />
                            ))}
                          </div>
                        </>
                      )}
                      {analysis.analysisData.roundSummary && (
                        <RoundSummarySection
                          roundSummary={analysis.analysisData.roundSummary}
                          onActionClick={onActionClick}
                        />
                      )}
                    </div>
                  )
                : analysis.status === AnalysisStatuses.FAILED
                  ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                          <span className="size-1.5 rounded-full bg-destructive/80" />
                          <span>{analysis.errorMessage || t('errorAnalyzing')}</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleRetry}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                        >
                          <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {t('retryAnalysis')}
                        </button>
                      </div>
                    )
                  : null}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
