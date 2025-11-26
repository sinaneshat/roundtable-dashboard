'use client';
import { Clock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

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

import { ModeratorAnalysisPanel } from './moderator-analysis-panel';
import { ModeratorAnalysisStream } from './moderator-analysis-stream';

type RoundAnalysisCardProps = {
  analysis: StoredModeratorAnalysis;
  threadId: string;
  isLatest?: boolean;
  className?: string;
  onStreamStart?: () => void;
  onStreamComplete?: (completedAnalysisData?: ModeratorAnalysisPayload | null, error?: unknown) => void;
  streamingRoundNumber?: number | null;
  onActionClick?: (action: Recommendation) => void;
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
    // Auto-scroll to bottom when streaming or completed
    if (analysis.status === AnalysisStatuses.STREAMING || analysis.status === AnalysisStatuses.COMPLETE) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      });
    }
    previousStatusRef.current = analysis.status;
  }, [analysis.status, analysis.analysisData]);

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
        <ChainOfThoughtContent>
          {/* Demo mode: only show content when demoShowContent is true */}
          {(demoShowContent === undefined || demoShowContent) && (
            <>
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
                      />
                    )
                  : analysis.status === AnalysisStatuses.FAILED
                    ? (
                        <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                          <span className="size-1.5 rounded-full bg-destructive/80" />
                          <span>{analysis.errorMessage || t('errorAnalyzing')}</span>
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
