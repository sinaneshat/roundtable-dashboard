'use client';

/**
 * Round Analysis Card Component
 *
 * ✅ AI SDK V5 REAL-TIME STREAMING PATTERN:
 * - Backend creates 'pending' analysis record when round completes
 * - Frontend detects 'pending' and streams analysis in real-time using experimental_useObject
 * - Uses ModeratorAnalysisStream for progressive UI updates
 * - Uses ChainOfThought accordion for consistent UI
 * - Shows status badges and loading indicators
 * - Polling automatically detects when analysis completes
 */

import { Clock } from 'lucide-react';
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
  onStreamComplete?: (completedAnalysisData?: unknown) => void;
  // ✅ NEW: Signal to force close when a new round starts
  streamingRoundNumber?: number | null;
};

/**
 * Round Analysis Card - Accordion UI for moderator analysis
 *
 * ✅ AI SDK V5 REAL-TIME STREAMING PATTERN:
 * - Backend creates 'pending' analysis when round completes
 * - Component detects 'pending' and streams analysis in real-time
 * - Uses ModeratorAnalysisStream for progressive UI updates
 * - Shows completed analyses from database
 * - Polling detects when streaming completes and updates
 */
export function RoundAnalysisCard({
  analysis,
  threadId,
  isLatest = false,
  className,
  onStreamComplete,
  streamingRoundNumber,
}: RoundAnalysisCardProps) {
  const t = useTranslations('moderator');

  // ✅ TIMEOUT CHECK: If analysis is pending/streaming for too long, treat as failed
  // - 30s-2min: Likely stuck from page refresh, will auto-recover via polling
  // - > 2min: Definitely stuck, show as failed with recovery instructions
  // ✅ FIX: Use interval to track timeout status without calling Date.now() during render
  const [isStuck, setIsStuck] = useState(false);

  // Use refs to track values and prevent effect from running on every render
  const createdAtTimeRef = useRef<number>(new Date(analysis.createdAt).getTime());
  const statusRef = useRef(analysis.status);

  // Only update refs when actual values change (not object identity)
  useEffect(() => {
    const createdAtTime = new Date(analysis.createdAt).getTime();
    if (createdAtTimeRef.current !== createdAtTime) {
      createdAtTimeRef.current = createdAtTime;
    }
    if (statusRef.current !== analysis.status) {
      statusRef.current = analysis.status;
    }
  }, [analysis.createdAt, analysis.status]);

  useEffect(() => {
    const TWO_MINUTES_MS = 2 * 60 * 1000;

    const checkTimeout = () => {
      const ageMs = Date.now() - createdAtTimeRef.current;
      const shouldBeStuck = ageMs > TWO_MINUTES_MS && (statusRef.current === AnalysisStatuses.PENDING || statusRef.current === AnalysisStatuses.STREAMING);

      // Only update state if value changed to prevent infinite loops
      setIsStuck(prevIsStuck => (prevIsStuck === shouldBeStuck ? prevIsStuck : shouldBeStuck));
    };

    // Check immediately
    checkTimeout();

    // Then check every 30 seconds
    const intervalId = setInterval(checkTimeout, 30000);

    return () => clearInterval(intervalId);
  }, []); // Empty deps - only run once on mount

  // Override status if stuck
  const effectiveStatus = isStuck ? AnalysisStatuses.FAILED : analysis.status;
  const effectiveErrorMessage = isStuck
    ? 'Analysis timed out after 2 minutes. This may happen if the page was refreshed during analysis. Try refreshing the page or retrying the round.'
    : analysis.errorMessage;

  // Status configuration - icons removed to reduce visual clutter (header already shows loading state)
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

  const config = statusConfig[effectiveStatus];

  // ✅ CONTROLLED STATE: Smart accordion behavior
  // - Latest analysis stays open by default
  // - Users can manually open/close ANY analysis (including previous rounds)
  // - Manual choices are respected and persist
  // - RESET when new round starts: all previous rounds auto-close
  const [isManuallyControlled, setIsManuallyControlled] = useState(false);
  const [manuallyOpen, setManuallyOpen] = useState(false);
  const prevStreamingRoundRef = useRef<number | null | undefined>(null);

  // ✅ AUTO-CLOSE PREVIOUS ROUNDS: When a new round starts streaming, reset manual control
  // This forces all previous analyses to close (only latest stays open)
  // Using ref pattern to avoid setState in effect
  useEffect(() => {
    // Only reset if a NEW round has started (streamingRoundNumber changed)
    if (streamingRoundNumber !== prevStreamingRoundRef.current) {
      prevStreamingRoundRef.current = streamingRoundNumber;

      // Only close if this is NOT the latest and a newer round started
      if (streamingRoundNumber != null && !isLatest && streamingRoundNumber > analysis.roundNumber) {
        // Use setTimeout to avoid setState during render phase
        const timeoutId = setTimeout(() => {
          setIsManuallyControlled(false);
          setManuallyOpen(false);
        }, 0);
        return () => clearTimeout(timeoutId);
      }
    }
    return undefined;
  }, [streamingRoundNumber, isLatest, analysis.roundNumber]);

  // ✅ DEFAULT BEHAVIOR: Latest is open, others collapsed
  // If user manually toggles, ALWAYS respect their choice (unless new round starts)
  const isOpen = isManuallyControlled ? manuallyOpen : isLatest;

  const handleOpenChange = useCallback((open: boolean) => {
    setIsManuallyControlled(true);
    setManuallyOpen(open);
  }, []);

  // ✅ FIX: Memoize retry handler to prevent infinite re-renders
  const handleRetry = useCallback(async () => {
    try {
      // ✅ Retry analysis by updating status back to pending
      // This will trigger ModeratorAnalysisStream to re-attempt
      await fetch(`/api/v1/chat/threads/${threadId}/rounds/${analysis.roundNumber}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          participantMessageIds: analysis.participantMessageIds,
        }),
      });
      // Query will auto-refetch and show pending status
    } catch { /* Intentionally suppressed */ }
  }, [threadId, analysis.roundNumber, analysis.participantMessageIds]);

  // ✅ AUTO-SCROLL: Scroll to completed analysis if user is not actively interacting
  const containerRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef(analysis.status);

  useEffect(() => {
    // Only scroll if:
    // 1. Analysis just completed (status changed from pending/streaming to completed)
    // 2. This is the latest analysis
    // 3. Analysis is open
    const justCompleted = (previousStatusRef.current === AnalysisStatuses.PENDING || previousStatusRef.current === AnalysisStatuses.STREAMING)
      && effectiveStatus === AnalysisStatuses.COMPLETED;

    // Update previous status before any early returns
    const cleanup = (() => {
      if (justCompleted && isLatest && isOpen && containerRef.current) {
        // Delay scroll slightly to let animations settle
        const scrollTimeout = setTimeout(() => {
          containerRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest',
          });
        }, 300); // Wait for animations to complete

        return () => clearTimeout(scrollTimeout);
      }
      return undefined;
    })();

    // Update previous status
    previousStatusRef.current = analysis.status;

    return cleanup;
  }, [analysis.status, effectiveStatus, isLatest, isOpen]);

  return (
    <div ref={containerRef} className={cn('py-1.5', className)}>
      <ChainOfThought open={isOpen} onOpenChange={handleOpenChange}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2.5 w-full">
            <Clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium">
              {t('roundAnalysis', { number: analysis.roundNumber })}
            </span>

            {/* Status Badge - no icon to reduce visual clutter */}
            <Badge
              variant="outline"
              className={cn('text-xs h-6', config.color)}
            >
              {config.label}
            </Badge>

            {/* Mode Badge */}
            <span className="hidden md:inline text-sm text-muted-foreground">•</span>
            <span className="hidden md:inline text-xs text-muted-foreground capitalize">
              {t(`mode.${analysis.mode}`)}
            </span>
          </div>
        </ChainOfThoughtHeader>

        <ChainOfThoughtContent>
          <div className="space-y-4">
            {/* Question Context */}
            {analysis.userQuestion && analysis.userQuestion !== 'N/A' && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground">Question:</p>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {analysis.userQuestion}
                </p>
              </div>
            )}

            {/* Analysis Content */}
            {(effectiveStatus === AnalysisStatuses.PENDING || effectiveStatus === AnalysisStatuses.STREAMING)
              ? (
                  // ✅ PENDING/STREAMING: Use streaming component for real-time partial object rendering
                  // The ModeratorAnalysisStream component handles both initial trigger and progressive rendering
                  // It will display partial objects as they arrive from the AI SDK streamObject() endpoint
                  <ModeratorAnalysisStream
                    threadId={threadId}
                    analysis={analysis}
                    onStreamComplete={(completedData) => {
                      // ✅ Pass completed analysis data to parent for cache update
                      onStreamComplete?.(completedData);
                    }}
                  />
                )
              : effectiveStatus === AnalysisStatuses.COMPLETED && analysis.analysisData
                ? (
                    // ✅ COMPLETED: Show completed analysis from database
                    <div className="space-y-4">
                      {/* Leaderboard */}
                      {analysis.analysisData.leaderboard && analysis.analysisData.leaderboard.length > 0 && (
                        <LeaderboardCard leaderboard={analysis.analysisData.leaderboard} />
                      )}

                      {/* Skills Comparison Chart */}
                      {(() => {
                        const shouldRender = analysis.analysisData.participantAnalyses && analysis.analysisData.participantAnalyses.length > 0;

                        return shouldRender
                          ? <SkillsComparisonChart participants={analysis.analysisData.participantAnalyses} />
                          : null;
                      })()}

                      {/* Participant Analysis Cards */}
                      {analysis.analysisData.participantAnalyses && analysis.analysisData.participantAnalyses.length > 0 && (
                        <div className="space-y-3">
                          {analysis.analysisData.participantAnalyses.map(participant => (
                            <ParticipantAnalysisCard
                              key={`${analysis.id}-participant-${participant.participantIndex}`}
                              analysis={participant}
                            />
                          ))}
                        </div>
                      )}

                      {/* Overall Summary */}
                      {analysis.analysisData.overallSummary && (
                        <div className="space-y-1.5 pt-2">
                          <h3 className="text-sm font-semibold">{t('summary')}</h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                            {analysis.analysisData.overallSummary}
                          </p>
                        </div>
                      )}

                      {/* Conclusion */}
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
                : effectiveStatus === AnalysisStatuses.FAILED
                  ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                          <span className="size-1.5 rounded-full bg-destructive/80" />
                          <span>{effectiveErrorMessage || t('errorAnalyzing')}</span>
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
