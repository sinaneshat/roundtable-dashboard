'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { MessageStatuses } from '@/api/core/enums';
import type { StoredPreSearch } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { Icons } from '@/components/icons';
import { useChatStore } from '@/components/providers';
import { Badge } from '@/components/ui/badge';
import { FadeIn } from '@/components/ui/motion';
import { queryKeys } from '@/lib/data/query-keys';
import { cn } from '@/lib/ui/cn';
import { AnimationIndices } from '@/stores/chat';

import { PreSearchStream } from './pre-search-stream';

// Infer PreSearchDataPayload from StoredPreSearch
type PreSearchDataPayload = NonNullable<StoredPreSearch['searchData']>;

type PreSearchCardProps = {
  threadId: string;
  preSearch: StoredPreSearch;
  isLatest?: boolean;
  className?: string;
  streamingRoundNumber?: number | null;
  demoOpen?: boolean; // Demo mode controlled accordion state
  demoShowContent?: boolean; // Demo mode controlled content visibility
};

export function PreSearchCard({
  threadId,
  preSearch,
  isLatest = false,
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
    if (!manualControl)
      return false;
    // If streaming a newer round, manual control is no longer valid
    if (streamingRoundNumber != null && streamingRoundNumber > manualControl.round) {
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
    if (completedData) {
      updatePreSearchData(preSearch.roundNumber, completedData);
      updatePreSearchStatus(preSearch.roundNumber, MessageStatuses.COMPLETE);
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }
  }, [threadId, preSearch.roundNumber, updatePreSearchData, updatePreSearchStatus, queryClient]);

  const isStreamingOrPending = preSearch.status === MessageStatuses.PENDING || preSearch.status === MessageStatuses.STREAMING;
  const hasError = preSearch.status === MessageStatuses.FAILED;

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
    return isLatest;
  }, [demoOpen, isStreamingOrPending, isManualControlValid, manualControl, isLatest]);

  return (
    <div className={cn('w-full mb-4', className)}>
      <ChainOfThought
        open={isOpen}
        onOpenChange={handleOpenChange}
        disabled={isStreamingOrPending}
        className={cn(isStreamingOrPending && 'cursor-default')}
      >
        <div className="relative">
          <ChainOfThoughtHeader>
            <div className="flex items-center gap-2 w-full min-w-0">
              <Icons.zap className="size-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">
                {t('chat.preSearch.title')}
              </span>
              {isStreamingOrPending && (
                <Badge
                  variant="outline"
                  className="text-[10px] sm:text-xs h-5 px-1.5 sm:px-2 flex-shrink-0 bg-blue-500/10 text-blue-500 border-blue-500/20"
                >
                  {t('chat.preSearch.searching')}
                </Badge>
              )}
              {hasError && (
                <Badge
                  variant="outline"
                  className="text-[10px] sm:text-xs h-5 px-1.5 sm:px-2 flex-shrink-0 bg-red-500/10 text-red-500 border-red-500/20"
                >
                  {t('chat.preSearch.error')}
                </Badge>
              )}
            </div>
          </ChainOfThoughtHeader>
        </div>

        <ChainOfThoughtContent>
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
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
