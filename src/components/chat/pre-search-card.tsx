'use client';

import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Badge } from '@/components/ui/badge';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { cn } from '@/lib/ui/cn';

import { PreSearchPanel } from './pre-search-panel';
import { PreSearchStream } from './pre-search-stream';

type PreSearchCardProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  isLatest?: boolean;
  className?: string;
  streamingRoundNumber?: number | null;
};

export function PreSearchCard({
  threadId,
  preSearch,
  isLatest = false,
  className,
  streamingRoundNumber,
}: PreSearchCardProps) {
  const t = useTranslations();

  // Store actions (moved from child to parent callbacks)
  const updatePreSearchStatus = useChatStore(s => s.updatePreSearchStatus);
  const updatePreSearchData = useChatStore(s => s.updatePreSearchData);

  // Manual control state for accordion (follows RoundAnalysisCard pattern)
  const [isManuallyControlled, setIsManuallyControlled] = useState(false);
  const [manuallyOpen, setManuallyOpen] = useState(false);

  // Auto-close logic: Close older searches when newer round streams
  // Pattern from round-analysis-card.tsx:74-85
  useEffect(() => {
    if (streamingRoundNumber != null && !isLatest && streamingRoundNumber > preSearch.roundNumber) {
      // AI SDK v5 Pattern: Use queueMicrotask instead of setTimeout(0)
      // This schedules state updates in the microtask queue, more efficient than timer queue
      queueMicrotask(() => {
        setIsManuallyControlled(false);
        setManuallyOpen(false);
      });
    }
  }, [streamingRoundNumber, isLatest, preSearch.roundNumber]);

  // Stream completion callback: Update store and invalidate queries
  // Pattern from round-analysis-card.tsx:37-47 (onStreamComplete prop)
  const handleStreamComplete = useCallback((completedData?: PreSearchDataPayload) => {
    if (completedData) {
      const queryClient = getQueryClient();

      // Update store with completed data
      updatePreSearchData(preSearch.roundNumber, completedData);
      updatePreSearchStatus(preSearch.roundNumber, AnalysisStatuses.COMPLETE);

      // Invalidate list query to sync orchestrator (store-first pattern)
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }
  }, [threadId, preSearch.roundNumber, updatePreSearchData, updatePreSearchStatus]);

  const isStreamingOrPending = preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING;
  const hasError = preSearch.status === AnalysisStatuses.FAILED;
  const isCompleted = preSearch.status === AnalysisStatuses.COMPLETE;

  // Disable interaction during streaming
  // Pattern from round-analysis-card.tsx:91-98
  const handleOpenChange = useCallback((open: boolean) => {
    // Prevent interaction during streaming
    if (isStreamingOrPending)
      return;

    setIsManuallyControlled(true);
    setManuallyOpen(open);
  }, [isStreamingOrPending]);

  // Determine accordion state (follows RoundAnalysisCard pattern)
  // Pattern from round-analysis-card.tsx:86
  const isOpen = isManuallyControlled ? manuallyOpen : isLatest;

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
            <div className="flex items-center gap-2.5 w-full">
              <Zap className="size-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-medium">
                {t('chat.preSearch.title')}
              </span>

              {/* Status badges */}
              {isStreamingOrPending && (
                <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-500 border-blue-500/20">
                  {t('chat.preSearch.searching')}
                </Badge>
              )}
              {hasError && (
                <Badge variant="outline" className="text-xs bg-red-500/10 text-red-500 border-red-500/20">
                  {t('chat.preSearch.error')}
                </Badge>
              )}
            </div>
          </ChainOfThoughtHeader>
        </div>

        <ChainOfThoughtContent>
          <div className="space-y-4">
            {/* Streaming state - show PreSearchStream with callbacks */}
            {isStreamingOrPending && (
              <PreSearchStream
                threadId={threadId}
                preSearch={preSearch}
                onStreamComplete={handleStreamComplete}
              />
            )}

            {/* Completed state - show PreSearchPanel with data from DB */}
            {isCompleted && preSearch.searchData && (
              <PreSearchPanel preSearch={preSearch.searchData} />
            )}

            {/* Failed state */}
            {hasError && preSearch.errorMessage && (
              <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                <span className="size-1.5 rounded-full bg-destructive/80" />
                <span>{preSearch.errorMessage}</span>
              </div>
            )}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
