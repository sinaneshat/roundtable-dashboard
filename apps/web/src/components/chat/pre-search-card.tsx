import { MessageStatuses } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Icons } from '@/components/icons';
import { useChatStoreOptional } from '@/components/providers';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FadeIn } from '@/components/ui/motion';
import { queryKeys } from '@/lib/data/query-keys';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/ui/cn';
import type { PreSearchDataPayload, PreSearchResult, StoredPreSearch } from '@/services/api';

import { PreSearchStream } from './pre-search-stream';

// Stable no-op functions for read-only contexts without ChatStoreProvider
function NOOP() {}

type PreSearchCardProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  className?: string;
  streamingRoundNumber?: number | null;
  demoOpen?: boolean;
  demoShowContent?: boolean;
};

export function PreSearchCard({
  className,
  demoOpen,
  demoShowContent,
  preSearch,
  streamingRoundNumber,
  threadId,
}: PreSearchCardProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  // Use optional store hook - returns undefined on public pages without ChatStoreProvider
  const storeData = useChatStoreOptional(
    useShallow(s => ({
      updatePreSearchData: s.updatePreSearchData,
      updatePreSearchStatus: s.updatePreSearchStatus,
    })),
  );

  // Fallback values for read-only pages (public threads) without ChatStoreProvider
  const updatePreSearchStatus = storeData?.updatePreSearchStatus ?? NOOP;
  const updatePreSearchData = storeData?.updatePreSearchData ?? NOOP;

  const [manualControl, setManualControl] = useState<{ round: number; open: boolean } | null>(null);

  const isManualControlValid = useMemo(() => {
    if (!manualControl || (streamingRoundNumber !== null && streamingRoundNumber !== undefined && streamingRoundNumber > manualControl.round)) {
      return false;
    }
    return true;
  }, [manualControl, streamingRoundNumber]);

  const handleStreamComplete = useCallback((completedData?: PreSearchDataPayload) => {
    if (!completedData) {
      return;
    }

    updatePreSearchData(preSearch.roundNumber, completedData);
    updatePreSearchStatus(preSearch.roundNumber, MessageStatuses.COMPLETE);

    queryClient.invalidateQueries({
      queryKey: queryKeys.threads.preSearches(threadId),
    });
  }, [threadId, preSearch.roundNumber, updatePreSearchData, updatePreSearchStatus, queryClient]);

  const isStreamingOrPending = preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING;
  const hasError = preSearch.status === MessageStatuses.FAILED;

  const totalSources = useMemo(() => {
    if (!preSearch.searchData?.results) {
      return 0;
    }
    return preSearch.searchData.results.reduce(
      (sum: number, r: PreSearchResult) => sum + (r.results?.length || 0),
      0,
    );
  }, [preSearch.searchData]);

  const handleOpenChange = useCallback((open: boolean) => {
    setManualControl({ open, round: preSearch.roundNumber });
  }, [preSearch.roundNumber]);

  const isOpen = useMemo(() => {
    if (demoOpen !== undefined) {
      return demoOpen;
    }
    if (isManualControlValid && manualControl) {
      return manualControl.open;
    }
    if (isStreamingOrPending) {
      return true;
    }
    return false;
  }, [demoOpen, isStreamingOrPending, isManualControlValid, manualControl]);

  return (
    <div className={cn('w-full mb-5', className)}>
      <div className="flex items-center gap-3 mb-6">
        <div className="size-8 flex items-center justify-center rounded-full bg-blue-500/20 shrink-0">
          <Icons.globe className="size-4 text-blue-300" />
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xl font-semibold text-muted-foreground">
            {t('chat.preSearch.title')}
          </span>

          {isStreamingOrPending && (
            <span className="size-1.5 rounded-full bg-primary/60 animate-pulse shrink-0" />
          )}

          {hasError && (
            <span className="size-1.5 rounded-full bg-destructive/80 shrink-0" />
          )}
        </div>
      </div>

      <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
        <CollapsibleTrigger
          className={cn(
            'flex items-center gap-1.5 text-muted-foreground text-sm cursor-pointer',
            'hover:text-foreground transition-colors',
          )}
        >
          <Icons.chevronRight
            className={cn(
              'size-3.5 shrink-0 transition-transform duration-200',
              isOpen && 'rotate-90',
            )}
          />
          <span className="font-medium">
            {isStreamingOrPending
              ? t('chat.preSearch.searching')
              : t('chat.preSearch.searchedSources', { count: totalSources })}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3">
          {(demoShowContent === undefined || demoShowContent) && (
            <FadeIn duration={0.25}>
              <div className="space-y-4">
                {!hasError && (
                  <PreSearchStream
                    threadId={threadId}
                    preSearch={preSearch}
                    onStreamComplete={handleStreamComplete}
                  />
                )}

                {hasError && preSearch.errorMessage && (
                  <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                    <span className="size-1.5 rounded-full bg-destructive/80" />
                    <span>{preSearch.errorMessage}</span>
                  </div>
                )}
              </div>
            </FadeIn>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
