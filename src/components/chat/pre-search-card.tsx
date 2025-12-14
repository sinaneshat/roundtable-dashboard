'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { AnalysisStatuses } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
} from '@/components/ai-elements/chain-of-thought';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { Badge } from '@/components/ui/badge';
import { FadeIn } from '@/components/ui/motion';
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
  // ✅ FIX: Use useQueryClient() hook instead of getQueryClient()
  // Ensures we use the same QueryClient instance from React context
  const queryClient = useQueryClient();

  // Store actions (moved from child to parent callbacks)
  const updatePreSearchStatus = useChatStore(s => s.updatePreSearchStatus);
  const updatePreSearchData = useChatStore(s => s.updatePreSearchData);

  // ✅ PROGRESSIVE UI FIX: Removed providerTriggered check
  // PreSearchStream now always handles its own stream for progressive UI updates
  // The store's hasPreSearchBeenTriggered is used internally by PreSearchStream
  // for deduplication, not passed as a prop

  // ✅ ANIMATION COORDINATION: Track animation lifecycle (pattern from ModelMessageCard)
  const registerAnimation = useChatStore(s => s.registerAnimation);
  const completeAnimation = useChatStore(s => s.completeAnimation);
  const hasRegisteredRef = useRef(false);
  const prevStatusRef = useRef(preSearch.status);

  // ✅ REACT 19: Manual control state with round tracking (derived state pattern)
  // Track the round number when user took manual control - allows auto-invalidation
  const [manualControl, setManualControl] = useState<{ round: number; open: boolean } | null>(null);

  // ✅ REACT 19: Derive if manual control is still valid (no useEffect needed)
  // Manual control is invalidated when a newer round starts streaming
  const isManualControlValid = useMemo(() => {
    if (!manualControl)
      return false;
    // If streaming a newer round, manual control is no longer valid
    if (streamingRoundNumber != null && streamingRoundNumber > manualControl.round) {
      return false;
    }
    return true;
  }, [manualControl, streamingRoundNumber]);

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

  // ✅ CRITICAL: Cleanup animation on unmount
  // If component unmounts while animation is registered (e.g., navigation during streaming),
  // complete the animation to prevent orphaned entries blocking handleComplete
  useLayoutEffect(() => {
    return () => {
      if (hasRegisteredRef.current) {
        completeAnimation(AnimationIndices.PRE_SEARCH);
        hasRegisteredRef.current = false;
      }
    };
  }, [completeAnimation]);

  // ✅ FIX: Complete animation SYNCHRONOUSLY on status transition
  // Previous RAF approach had a bug: cleanup could cancel RAF before it fired,
  // leaving animation stuck forever (especially on refresh where state changes quickly)
  useLayoutEffect(() => {
    const wasStreaming = prevStatusRef.current === AnalysisStatuses.STREAMING;
    const nowComplete = preSearch.status !== AnalysisStatuses.STREAMING
      && preSearch.status !== AnalysisStatuses.PENDING;

    if (wasStreaming && nowComplete && hasRegisteredRef.current) {
      // Complete synchronously - no RAF that could be canceled
      completeAnimation(AnimationIndices.PRE_SEARCH);
      hasRegisteredRef.current = false;
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
      // Update store with completed data
      updatePreSearchData(preSearch.roundNumber, completedData);
      updatePreSearchStatus(preSearch.roundNumber, AnalysisStatuses.COMPLETE);

      // Invalidate list query to sync orchestrator (store-first pattern)
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.preSearches(threadId),
      });
    }
  }, [threadId, preSearch.roundNumber, updatePreSearchData, updatePreSearchStatus, queryClient]);

  const isStreamingOrPending = preSearch.status === AnalysisStatuses.PENDING || preSearch.status === AnalysisStatuses.STREAMING;
  const hasError = preSearch.status === AnalysisStatuses.FAILED;

  // ✅ REACT 19: Event handler (not useEffect) for user interaction
  const handleOpenChange = useCallback((open: boolean) => {
    // Prevent interaction during streaming
    if (isStreamingOrPending)
      return;

    // Store manual control with current round number for invalidation tracking
    setManualControl({ round: preSearch.roundNumber, open });
  }, [isStreamingOrPending, preSearch.roundNumber]);

  // ✅ REACT 19: Fully derived accordion state (no useEffect needed)
  // Priority: demoOpen > valid manual control > isLatest
  const isOpen = useMemo(() => {
    if (demoOpen !== undefined)
      return demoOpen;
    if (isManualControlValid && manualControl)
      return manualControl.open;
    return isLatest;
  }, [demoOpen, isManualControlValid, manualControl, isLatest]);

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
            {/* Mobile-optimized header layout - inline title and badge */}
            <div className="flex items-center gap-2 w-full min-w-0">
              <Zap className="size-4 text-blue-500 flex-shrink-0" />
              {/* Title and badge - always inline, no wrap */}
              <span className="text-sm font-medium whitespace-nowrap">
                {t('chat.preSearch.title')}
              </span>

              {/* Status badges - inline */}
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
          {/* Demo mode: only show content when demoShowContent is true */}
          {(demoShowContent === undefined || demoShowContent) && (
            <FadeIn duration={0.25}>
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
            </FadeIn>
          )}
        </ChainOfThoughtContent>
      </ChainOfThought>
    </div>
  );
}
