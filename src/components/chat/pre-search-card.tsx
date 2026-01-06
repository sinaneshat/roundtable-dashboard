'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { MessageStatuses } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import { Icons } from '@/components/icons';
import { useChatStore } from '@/components/providers';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { FadeIn } from '@/components/ui/motion';
import { queryKeys } from '@/lib/data/query-keys';
import { cn } from '@/lib/ui/cn';
import { AnimationIndices } from '@/stores/chat';

import { PreSearchStream } from './pre-search-stream';

type PreSearchCardProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  className?: string;
  streamingRoundNumber?: number | null;
  demoOpen?: boolean;
  demoShowContent?: boolean;
};

export function PreSearchCard({
  threadId,
  preSearch,
  className,
  streamingRoundNumber,
  demoOpen,
  demoShowContent,
}: PreSearchCardProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const { updatePreSearchStatus, updatePreSearchData, registerAnimation, completeAnimation } = useChatStore(
    useShallow(s => ({
      updatePreSearchStatus: s.updatePreSearchStatus,
      updatePreSearchData: s.updatePreSearchData,
      registerAnimation: s.registerAnimation,
      completeAnimation: s.completeAnimation,
    })),
  );
  const hasRegisteredRef = useRef(false);
  const prevStatusRef = useRef(preSearch.status);

  const [manualControl, setManualControl] = useState<{ round: number; open: boolean } | null>(null);

  const isManualControlValid = useMemo(() => {
    if (!manualControl || (streamingRoundNumber != null && streamingRoundNumber > manualControl.round)) {
      return false;
    }
    return true;
  }, [manualControl, streamingRoundNumber]);

  useLayoutEffect(() => {
    const isStreaming = preSearch.status === MessageStatuses.STREAMING;
    if (isStreaming && !hasRegisteredRef.current) {
      registerAnimation(AnimationIndices.PRE_SEARCH);
      hasRegisteredRef.current = true;
    }
  }, [preSearch.status, registerAnimation]);

  useLayoutEffect(() => {
    return () => {
      if (hasRegisteredRef.current) {
        completeAnimation(AnimationIndices.PRE_SEARCH);
        hasRegisteredRef.current = false;
      }
    };
  }, [completeAnimation]);

  useLayoutEffect(() => {
    const wasStreaming = prevStatusRef.current === MessageStatuses.STREAMING;
    const nowComplete = preSearch.status !== MessageStatuses.STREAMING
      && preSearch.status !== MessageStatuses.PENDING;

    if (wasStreaming && nowComplete && hasRegisteredRef.current) {
      completeAnimation(AnimationIndices.PRE_SEARCH);
      hasRegisteredRef.current = false;
    }

    prevStatusRef.current = preSearch.status;
    return undefined;
  }, [preSearch.status, completeAnimation]);

  const handleStreamStart = useCallback(() => {
    updatePreSearchStatus(preSearch.roundNumber, MessageStatuses.STREAMING);
  }, [preSearch.roundNumber, updatePreSearchStatus]);

  const handleStreamComplete = useCallback((completedData?: PreSearchDataPayload) => {
    if (!completedData)
      return;

    updatePreSearchData(preSearch.roundNumber, completedData);
    updatePreSearchStatus(preSearch.roundNumber, MessageStatuses.COMPLETE);

    queryClient.invalidateQueries({
      queryKey: queryKeys.threads.preSearches(threadId),
    });
  }, [threadId, preSearch.roundNumber, updatePreSearchData, updatePreSearchStatus, queryClient]);

  const isStreamingOrPending = preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING;
  const hasError = preSearch.status === MessageStatuses.FAILED;

  const totalSources = useMemo(() => {
    if (!preSearch.searchData?.results)
      return 0;
    return preSearch.searchData.results.reduce(
      (sum, r) => sum + (r.results?.length || 0),
      0,
    );
  }, [preSearch.searchData]);

  const handleOpenChange = useCallback((open: boolean) => {
    if (isStreamingOrPending)
      return;
    setManualControl({ round: preSearch.roundNumber, open });
  }, [isStreamingOrPending, preSearch.roundNumber]);

  const isOpen = useMemo(() => {
    if (demoOpen !== undefined)
      return demoOpen;
    if (isStreamingOrPending)
      return true;
    if (isManualControlValid && manualControl)
      return manualControl.open;
    return false;
  }, [demoOpen, isStreamingOrPending, isManualControlValid, manualControl]);

  return (
    <div className={cn('w-full mb-14', className)}>
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

      <Collapsible open={isOpen} onOpenChange={handleOpenChange} disabled={isStreamingOrPending}>
        <CollapsibleTrigger
          className={cn(
            'flex items-center gap-1.5 text-muted-foreground text-sm cursor-pointer',
            'hover:text-foreground transition-colors',
            isStreamingOrPending && 'cursor-default pointer-events-none',
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
                    onStreamStart={handleStreamStart}
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
