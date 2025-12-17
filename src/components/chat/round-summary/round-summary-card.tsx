'use client';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

import { MessageStatuses } from '@/api/core/enums';
import type { RoundSummaryAIContent, StoredRoundSummary } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Badge } from '@/components/ui/badge';
import { FadeIn } from '@/components/ui/motion';
import { getDisplayRoundNumber } from '@/lib/schemas/round-schemas';
import { cn } from '@/lib/ui/cn';

import { RoundSummaryPanel } from './round-summary-panel';
import { RoundSummaryStream } from './round-summary-stream';

type RoundSummaryCardProps = {
  summary: StoredRoundSummary;
  threadId: string;
  isLatest?: boolean;
  className?: string;
  onStreamStart?: () => void;
  onStreamComplete?: (completedSummaryData?: RoundSummaryAIContent | null, error?: Error | null) => void;
  streamingRoundNumber?: number | null;
  demoOpen?: boolean;
  demoShowContent?: boolean;
};

/**
 * RoundSummaryCard - Accordion component for round summary
 *
 * Displays a simple summary of what happened in each round.
 */
export function RoundSummaryCard({
  summary,
  threadId,
  isLatest = false,
  className,
  onStreamStart,
  onStreamComplete,
  streamingRoundNumber,
  demoOpen,
  demoShowContent,
}: RoundSummaryCardProps) {
  const t = useTranslations('moderator');

  // Status configuration for badge styling
  const statusConfig = {
    pending: {
      label: t('summarizing'),
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
    },
    streaming: {
      label: t('summarizing'),
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
  const config = statusConfig[summary.status as keyof typeof statusConfig];

  // Manual control state with round tracking
  const [manualControl, setManualControl] = useState<{ round: number; open: boolean } | null>(null);

  // Derive if manual control is still valid
  const isManualControlValid = useMemo(() => {
    if (!manualControl)
      return false;
    if (streamingRoundNumber != null && streamingRoundNumber > manualControl.round) {
      return false;
    }
    return true;
  }, [manualControl, streamingRoundNumber]);

  // Disable accordion interaction during streaming/pending
  const isStreamingOrPending = summary.status === MessageStatuses.STREAMING
    || summary.status === MessageStatuses.PENDING;

  const handleOpenChange = useCallback((open: boolean) => {
    if (isStreamingOrPending)
      return;
    setManualControl({ round: summary.roundNumber, open });
  }, [isStreamingOrPending, summary.roundNumber]);

  // Derived accordion state: demoOpen > valid manual control > isLatest
  const isOpen = useMemo(() => {
    if (demoOpen !== undefined)
      return demoOpen;
    if (isManualControlValid && manualControl)
      return manualControl.open;
    return isLatest;
  }, [demoOpen, isManualControlValid, manualControl, isLatest]);

  return (
    <div className={cn('w-full pt-6 pb-1.5', className)}>
      <ChainOfThought
        open={isOpen}
        onOpenChange={handleOpenChange}
        disabled={isStreamingOrPending}
        className={cn(isStreamingOrPending && 'cursor-default')}
      >
        <div className="relative">
          <ChainOfThoughtHeader>
            <div className="flex items-center gap-2 w-full min-w-0">
              <Clock className="size-4 text-muted-foreground flex-shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">
                {t('roundSummary', { number: getDisplayRoundNumber(summary.roundNumber) })}
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
              <div className="hidden sm:flex items-center gap-2 flex-shrink-0 ml-auto">
                <span className="text-sm text-muted-foreground">•</span>
                <span className="text-xs text-muted-foreground capitalize">
                  {t(`mode.${summary.mode}`)}
                </span>
              </div>
            </div>
          </ChainOfThoughtHeader>
        </div>
        <ChainOfThoughtContent>
          {(demoShowContent === undefined || demoShowContent) && (
            <FadeIn duration={0.25}>
              {(summary.status === MessageStatuses.PENDING || summary.status === MessageStatuses.STREAMING)
                ? (
                    <RoundSummaryStream
                      threadId={threadId}
                      summary={summary}
                      onStreamStart={onStreamStart}
                      onStreamComplete={onStreamComplete}
                    />
                  )
                : summary.status === MessageStatuses.COMPLETE && summary.summaryData
                  ? (
                      <RoundSummaryPanel summary={summary} />
                    )
                  : (summary.status === MessageStatuses.FAILED || (summary.status === MessageStatuses.COMPLETE && !summary.summaryData))
                      ? (
                          <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                            <span className="size-1.5 rounded-full bg-destructive/80" />
                            <span>{t('errorSummarizing')}</span>
                          </div>
                        )
                      : null}
            </FadeIn>
          )}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
