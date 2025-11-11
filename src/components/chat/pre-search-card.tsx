'use client';

import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
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
};

export function PreSearchCard({
  threadId,
  preSearch,
  isLatest = false,
  className,
}: PreSearchCardProps) {
  const t = useTranslations();

  // Manual control state for accordion (follows RoundAnalysisCard pattern)
  const [isManuallyControlled, setIsManuallyControlled] = useState(false);
  const [manuallyOpen, setManuallyOpen] = useState(false);

  // Completion callback: invalidate query to refetch completed data
  const handleStreamComplete = useCallback((completedData?: PreSearchDataPayload) => {
    if (completedData) {
      const queryClient = getQueryClient();

      // Invalidate list query to sync orchestrator (store-first pattern)
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }
  }, [threadId]);

  const isStreaming = preSearch.status === AnalysisStatuses.STREAMING;
  const hasError = preSearch.status === AnalysisStatuses.FAILED;
  const isCompleted = preSearch.status === AnalysisStatuses.COMPLETED;

  // Disable interaction during streaming
  const handleOpenChange = useCallback((open: boolean) => {
    if (isStreaming)
      return;

    setIsManuallyControlled(true);
    setManuallyOpen(open);
  }, [isStreaming]);

  // Determine accordion state (follows RoundAnalysisCard pattern)
  const isOpen = isManuallyControlled ? manuallyOpen : isLatest;

  // Show progress for streaming state
  const completedCount = isCompleted && preSearch.searchData
    ? preSearch.searchData.successCount
    : 0;
  const totalCount = isCompleted && preSearch.searchData
    ? preSearch.searchData.successCount + preSearch.searchData.failureCount
    : 0;

  return (
    <div className={cn('py-1.5', className)}>
      <ChainOfThought
        open={isOpen}
        onOpenChange={handleOpenChange}
        disabled={isStreaming}
        className={cn(isStreaming && 'cursor-default')}
      >
        <ChainOfThoughtHeader>
          <div className="flex items-center gap-2.5 w-full">
            <Zap className="size-4 text-blue-500 flex-shrink-0" />
            <span className="text-sm font-medium">
              {t('chat.preSearch.title')}
            </span>

            {/* Show summary badge for completed */}
            {isCompleted && totalCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {completedCount}
                /
                {totalCount}
              </Badge>
            )}

            {/* Status badges */}
            {isStreaming && (
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

        <ChainOfThoughtContent>
          <div className="space-y-4">
            {/* Streaming state - show PreSearchStream */}
            {(preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING) && (
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
              <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
                {preSearch.errorMessage}
              </div>
            )}
          </div>
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
