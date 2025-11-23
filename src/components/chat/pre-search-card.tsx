'use client';

import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

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
import { AnimationIndices } from '@/stores/chat';

import { PreSearchStream } from './pre-search-stream';

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

  // Store actions (moved from child to parent callbacks)
  const updatePreSearchStatus = useChatStore(s => s.updatePreSearchStatus);
  const updatePreSearchData = useChatStore(s => s.updatePreSearchData);

  // ✅ ANIMATION COORDINATION: Track animation lifecycle (pattern from ModelMessageCard)
  const registerAnimation = useChatStore(s => s.registerAnimation);
  const completeAnimation = useChatStore(s => s.completeAnimation);
  const hasRegisteredRef = useRef(false);
  const prevStatusRef = useRef(preSearch.status);

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

  // ✅ FIX: Use useLayoutEffect for synchronous animation registration
  // This ensures animations are registered BEFORE any callbacks fire
  // useLayoutEffect runs synchronously after DOM mutations, before browser paint
  useLayoutEffect(() => {
    const isStreaming = preSearch.status === AnalysisStatuses.STREAMING;
    if (isStreaming && !hasRegisteredRef.current) {
      registerAnimation(AnimationIndices.PRE_SEARCH);
      hasRegisteredRef.current = true;
    }
  }, [preSearch.status, registerAnimation]);

  // ✅ FIX: Use requestAnimationFrame instead of setTimeout for deterministic timing
  // RAF aligns with browser paint cycle, more reliable than arbitrary 16ms delay
  useLayoutEffect(() => {
    const wasStreaming = prevStatusRef.current === AnalysisStatuses.STREAMING;
    const nowComplete = preSearch.status !== AnalysisStatuses.STREAMING
      && preSearch.status !== AnalysisStatuses.PENDING;

    if (wasStreaming && nowComplete && hasRegisteredRef.current) {
      // Use RAF to complete animation on next frame
      // This is more deterministic than setTimeout and aligns with browser rendering
      const rafId = requestAnimationFrame(() => {
        completeAnimation(AnimationIndices.PRE_SEARCH);
        hasRegisteredRef.current = false;
      });

      prevStatusRef.current = preSearch.status;
      return () => cancelAnimationFrame(rafId);
    }

    prevStatusRef.current = preSearch.status;
    return undefined;
  }, [preSearch.status, completeAnimation]);

  // Stream start callback: Update status to STREAMING when backend starts processing
  // This ensures the UI reflects the actual streaming state and maintains loading indicator visibility
  const handleStreamStart = useCallback(() => {
    updatePreSearchStatus(preSearch.roundNumber, AnalysisStatuses.STREAMING);
  }, [preSearch.roundNumber, updatePreSearchStatus]);

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
  // Demo mode override: If demoOpen is provided, use it instead of computed state
  const isOpen = demoOpen !== undefined ? demoOpen : (isManuallyControlled ? manuallyOpen : isLatest);

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
          {/* Demo mode: only show content when demoShowContent is true */}
          {(demoShowContent === undefined || demoShowContent) && (
            <div className="space-y-4">
              {/* PreSearchStream handles all states: PENDING, STREAMING, and COMPLETE */}
              {!hasError && (
                <PreSearchStream
                  threadId={threadId}
                  preSearch={preSearch}
                  onStreamStart={handleStreamStart}
                  onStreamComplete={handleStreamComplete}
                />
              )}

              {/* Failed state */}
              {hasError && preSearch.errorMessage && (
                <div className="flex items-center gap-2 py-1.5 text-xs text-destructive">
                  <span className="size-1.5 rounded-full bg-destructive/80" />
                  <span>{preSearch.errorMessage}</span>
                </div>
              )}
            </div>
          )}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
