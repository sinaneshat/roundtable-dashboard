'use client';

import { Clock, RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { StoredModeratorAnalysis } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/ui/cn';

import { LeaderboardCard } from './leaderboard-card';
import { ModeratorAnalysisStream } from './moderator-analysis-stream';
import { ParticipantAnalysisCard } from './participant-analysis-card';
import { SkillsComparisonChart } from './skills-comparison-chart';

type RoundAnalysisCardProps = {
  analysis: StoredModeratorAnalysis;
  threadId: string;
  isLatest?: boolean;
  className?: string;
  onStreamStart?: () => void;
  onStreamComplete?: (completedAnalysisData?: unknown) => void;
  streamingRoundNumber?: number | null;
};

export function RoundAnalysisCard({
  analysis,
  threadId,
  isLatest = false,
  className,
  onStreamStart,
  onStreamComplete,
  streamingRoundNumber,
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
    completed: {
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
  const prevStreamingRoundRef = useRef<number | null | undefined>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (streamingRoundNumber !== prevStreamingRoundRef.current) {
      prevStreamingRoundRef.current = streamingRoundNumber;

      if (streamingRoundNumber != null && !isLatest && streamingRoundNumber > analysis.roundNumber) {
        const timeoutId = setTimeout(() => {
          setIsManuallyControlled(false);
          setManuallyOpen(false);
        }, 0);
        return () => clearTimeout(timeoutId);
      }
    }
    return undefined;
  }, [streamingRoundNumber, isLatest, analysis.roundNumber, threadId]);

  const isOpen = isManuallyControlled ? manuallyOpen : isLatest;

  const handleOpenChange = useCallback((open: boolean) => {
    setIsManuallyControlled(true);
    setManuallyOpen(open);
  }, []);

  const handleRetry = useCallback(async () => {
    // Debounce: prevent multiple rapid clicks
    if (isRetrying)
      return;

    // Clear any pending retry timeout
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }

    setIsRetrying(true);

    try {
      await fetch(`/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantMessageIds: analysis.participantMessageIds,
        }),
      });
    } catch {
      /* Intentionally suppressed */
    }

    // Debounce timeout: re-enable after 2 seconds
    retryTimeoutRef.current = setTimeout(() => {
      setIsRetrying(false);
    }, 2000);
  }, [threadId, analysis.roundNumber, analysis.participantMessageIds, isRetrying]);

  const containerRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef(analysis.status);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const justCompleted = (previousStatusRef.current === AnalysisStatuses.PENDING || previousStatusRef.current === AnalysisStatuses.STREAMING)
      && analysis.status === AnalysisStatuses.COMPLETED;

    const cleanup = (() => {
      if (justCompleted && isLatest && isOpen && containerRef.current) {
        const scrollTimeout = setTimeout(() => {
          containerRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
          });
        }, 300);

        return () => clearTimeout(scrollTimeout);
      }
      return undefined;
    })();

    previousStatusRef.current = analysis.status;

    return cleanup;
  }, [analysis.status, isLatest, isOpen]);

  return (
    <div ref={containerRef} className={cn('py-1.5', className)}>
      <ChainOfThought open={isOpen} onOpenChange={handleOpenChange}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2.5 w-full">
            <Clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium">
              {t('roundAnalysis', { number: analysis.roundNumber })}
            </span>

            <Badge variant="outline" className={cn('text-xs h-6', config.color)}>
              {config.label}
            </Badge>

            <span className="hidden md:inline text-sm text-muted-foreground">•</span>
            <span className="hidden md:inline text-xs text-muted-foreground capitalize">
              {t(`mode.${analysis.mode}`)}
            </span>

            {analysis.status === AnalysisStatuses.FAILED && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRetry();
                }}
                disabled={isRetrying}
                className={cn(
                  'ml-auto flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded-md transition-colors',
                  'text-primary hover:text-primary/80 hover:bg-primary/10',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent',
                )}
                aria-label={t('retryAnalysis')}
              >
                <RotateCcw className={cn('size-3.5', isRetrying && 'animate-spin')} />
                <span className="hidden sm:inline">{t('retryAnalysis')}</span>
              </button>
            )}
          </div>
        </ChainOfThoughtHeader>

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
                  />
                )
              : analysis.status === AnalysisStatuses.COMPLETED && analysis.analysisData
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

                      {analysis.analysisData.overallSummary && (
                        <div className="space-y-1.5 pt-2">
                          <h3 className="text-sm font-semibold">{t('summary')}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {analysis.analysisData.overallSummary}
                          </p>
                        </div>
                      )}

                      {analysis.analysisData.conclusion && (
                        <div className="space-y-1.5 pt-2">
                          <h3 className="text-sm font-semibold text-primary">{t('conclusion')}</h3>
                          <p className="text-sm leading-relaxed">
                            {analysis.analysisData.conclusion}
                          </p>
                        </div>
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
