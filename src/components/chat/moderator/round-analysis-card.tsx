'use client';

import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
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
  demoOpen?: boolean; // Demo mode controlled accordion state
  demoShowContent?: boolean; // Demo mode controlled content visibility
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
  demoOpen,
  demoShowContent,
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

  // Demo mode override: If demoOpen is provided, use it instead of computed state
  const isOpen = demoOpen !== undefined ? demoOpen : (isManuallyControlled ? manuallyOpen : isLatest);

  // ✅ Disable accordion interaction during streaming
  const isStreamingOrPending = analysis.status === AnalysisStatuses.PENDING || analysis.status === AnalysisStatuses.STREAMING;

  const handleOpenChange = useCallback((open: boolean) => {
    // Prevent interaction during streaming
    if (isStreamingOrPending)
      return;

    setIsManuallyControlled(true);
    setManuallyOpen(open);
  }, [isStreamingOrPending]);
  const containerRef = useRef<HTMLDivElement>(null);
  const previousStatusRef = useRef(analysis.status);
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
        </div>
        <ChainOfThoughtContent staggerChildren={demoShowContent === undefined}>
          {/* Demo mode: only show content when demoShowContent is true */}
          {(demoShowContent === undefined || demoShowContent) && (
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
                              {analysis.analysisData.participantAnalyses.map((participant, index) => (
                                <motion.div
                                  key={`${analysis.id}-participant-${participant.participantIndex}`}
                                  initial={{ opacity: 0, y: 8 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  transition={{
                                    duration: 0.3,
                                    delay: index * 0.1,
                                    ease: [0.4, 0, 0.2, 1],
                                  }}
                                >
                                  <ParticipantAnalysisCard analysis={participant} />
                                </motion.div>
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
                        <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                          <span className="size-1.5 rounded-full bg-destructive/80" />
                          <span>{analysis.errorMessage || t('errorAnalyzing')}</span>
                        </div>
                      )
                    : null}
            </div>
          )}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
