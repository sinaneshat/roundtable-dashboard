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

import { Award, Clock, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  // ✅ TIMEOUT CHECK: If analysis is pending/streaming for > 5 minutes, treat as failed
  // Backend watchdog handles timeouts at 2 minutes, so give extra buffer
  // Calculate age directly (Date.now() is impure, but this is a valid use case for timeout checking)
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  // eslint-disable-next-line react-hooks/purity -- Valid use case: timeout check requires current time. Date.now() is intentionally impure here to detect stuck analyses on each render.
  const ageMs = Date.now() - new Date(analysis.createdAt).getTime();
  const isStuck = ageMs > FIVE_MINUTES_MS && (analysis.status === 'pending' || analysis.status === 'streaming');

  // Override status if stuck
  const effectiveStatus = isStuck ? 'failed' : analysis.status;
  const effectiveErrorMessage = isStuck
    ? 'Analysis timed out after 5 minutes. Backend generation may have failed.'
    : analysis.errorMessage;

  // Status configuration
  const statusConfig = {
    pending: {
      label: t('analyzing'),
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: Loader2,
      iconClass: 'animate-spin',
    },
    streaming: {
      label: t('analyzing'),
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: Loader2,
      iconClass: 'animate-spin',
    },
    completed: {
      label: t('completed'),
      color: 'bg-green-500/10 text-green-500 border-green-500/20',
      icon: Award,
      iconClass: '',
    },
    failed: {
      label: t('failed'),
      color: 'bg-red-500/10 text-red-500 border-red-500/20',
      icon: Award,
      iconClass: '',
    },
  } as const;

  const config = statusConfig[effectiveStatus];
  const StatusIcon = config.icon;

  // ✅ CONTROLLED STATE: Smart accordion behavior
  // - Latest analysis stays open by default
  // - Users can manually open/close ANY analysis (including previous rounds)
  // - Manual choices are respected and persist
  // - RESET when new round starts: all previous rounds auto-close
  const [isManuallyControlled, setIsManuallyControlled] = useState(false);
  const [manuallyOpen, setManuallyOpen] = useState(false);

  // ✅ AUTO-CLOSE PREVIOUS ROUNDS: When a new round starts streaming, reset manual control
  // This forces all previous analyses to close (only latest stays open)
  useEffect(() => {
    // Only reset if:
    // 1. streamingRoundNumber is provided
    // 2. This is NOT the latest round
    // 3. A new round has started (streamingRoundNumber > this round)
    if (streamingRoundNumber != null && !isLatest && streamingRoundNumber > analysis.roundNumber) {
      console.warn('[RoundAnalysisCard] 🔒 Auto-closing previous round', {
        analysisRound: analysis.roundNumber,
        streamingRound: streamingRoundNumber,
      });
      setIsManuallyControlled(false);
      setManuallyOpen(false);
    }
  }, [streamingRoundNumber, isLatest, analysis.roundNumber]);

  // ✅ DEFAULT BEHAVIOR: Latest is open, others collapsed
  // If user manually toggles, ALWAYS respect their choice (unless new round starts)
  const isOpen = isManuallyControlled ? manuallyOpen : isLatest;

  const handleOpenChange = useCallback((open: boolean) => {
    setIsManuallyControlled(true);
    setManuallyOpen(open);
  }, []);

  // ✅ AUTO-SCROLL: Scroll to completed analysis if user is not actively interacting
  const containerRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef(analysis.status);

  useEffect(() => {
    // Only scroll if:
    // 1. Analysis just completed (status changed from pending/streaming to completed)
    // 2. This is the latest analysis
    // 3. Analysis is open
    const justCompleted = (previousStatusRef.current === 'pending' || previousStatusRef.current === 'streaming')
      && effectiveStatus === 'completed';

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

  console.warn('[RoundAnalysisCard] Rendering:', {
    roundNumber: analysis.roundNumber,
    status: analysis.status,
    effectiveStatus,
    isStuck,
    ageMs,
    isLatest,
    isOpen,
    isManuallyControlled,
    participantMessageIds: analysis.participantMessageIds.length,
  });

  return (
    <div ref={containerRef} className={cn('py-1.5', className)}>
      <ChainOfThought open={isOpen} onOpenChange={handleOpenChange}>
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2.5 w-full">
            <Clock className="size-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium">
              {t('roundAnalysis', { number: analysis.roundNumber })}
            </span>

            {/* Status Badge */}
            <Badge
              variant="outline"
              className={cn('text-xs h-6', config.color)}
            >
              <StatusIcon className={cn('size-3 mr-1', config.iconClass)} />
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
            {(effectiveStatus === 'pending' || effectiveStatus === 'streaming')
              ? (
                  // ✅ PENDING/STREAMING: Use streaming component for real-time partial object rendering
                  // The ModeratorAnalysisStream component handles both initial trigger and progressive rendering
                  // It will display partial objects as they arrive from the AI SDK streamObject() endpoint
                  <ModeratorAnalysisStream
                    threadId={threadId}
                    analysis={analysis}
                    onStreamComplete={(completedData) => {
                      console.warn('[RoundAnalysisCard] Stream completed for round', analysis.roundNumber);
                      // ✅ Pass completed analysis data to parent for cache update
                      onStreamComplete?.(completedData);
                    }}
                  />
                )
              : effectiveStatus === 'completed' && analysis.analysisData
                ? (
                    // ✅ COMPLETED: Show completed analysis from database
                    <div className="space-y-4">
                      {/* Leaderboard */}
                      {analysis.analysisData.leaderboard && analysis.analysisData.leaderboard.length > 0 && (
                        <LeaderboardCard leaderboard={analysis.analysisData.leaderboard} />
                      )}

                      {/* Skills Comparison Chart */}
                      {analysis.analysisData.participantAnalyses && analysis.analysisData.participantAnalyses.length > 0 && (
                        <SkillsComparisonChart participants={analysis.analysisData.participantAnalyses} />
                      )}

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
                : effectiveStatus === 'failed'
                  ? (
                      <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                        <span className="size-1.5 rounded-full bg-destructive/80" />
                        <span>{effectiveErrorMessage || t('errorAnalyzing')}</span>
                      </div>
                    )
                  : null}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
