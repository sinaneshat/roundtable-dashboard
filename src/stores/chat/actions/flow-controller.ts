/**
 * Chat Flow Controller
 *
 * Centralized navigation and flow control logic
 * Uses flow state machine output to determine navigation actions
 *
 * SINGLE SOURCE OF TRUTH for flow control decisions
 * Consolidates navigation logic from overview-actions.ts
 *
 * RESPONSIBILITIES:
 * - Slug polling and URL updates
 * - Navigation to thread detail page
 * - Analysis completion detection
 * - Timeout fallbacks for stuck states
 *
 * Location: /src/stores/chat/actions/flow-controller.ts
 * Used by: ChatOverviewScreen (and potentially ChatThreadScreen)
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { startTransition, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AnalysisStatuses } from '@/api/core/enums';
import { navigateToThread } from '@/app/(app)/chat/actions';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadSlugStatusQuery } from '@/hooks/queries/chat/threads';
import { queryKeys } from '@/lib/data/query-keys';

export type UseFlowControllerOptions = {
  /** Whether controller is enabled (typically true for overview screen) */
  enabled?: boolean;
};

/**
 * Flow controller hook
 *
 * Manages navigation flow based on state machine outputs
 * Handles slug polling, URL updates, and navigation to thread detail
 *
 * @example
 * // In ChatOverviewScreen
 * useFlowController({ enabled: !showInitialUI })
 */
export function useFlowController(options: UseFlowControllerOptions = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();

  // State selectors
  const streamingState = useChatStore(useShallow(s => ({
    showInitialUI: s.showInitialUI,
    isStreaming: s.isStreaming,
    screenMode: s.screenMode,
  })));

  const threadState = useChatStore(useShallow(s => ({
    currentThread: s.thread,
    createdThreadId: s.createdThreadId,
  })));

  const analyses = useChatStore(s => s.analyses);
  const setThread = useChatStore(s => s.setThread);

  // Navigation tracking
  const [hasNavigated, setHasNavigated] = useState(false);
  const [hasUpdatedThread, setHasUpdatedThread] = useState(false);
  const [aiGeneratedSlug, setAiGeneratedSlug] = useState<string | null>(null);

  // ✅ FIX: Disable controller if screen mode changed (navigated away)
  const isActive = enabled && streamingState.screenMode === 'overview';

  // Reset flags when returning to initial UI
  useEffect(() => {
    if (streamingState.showInitialUI) {
      startTransition(() => {
        setHasNavigated(false);
        setHasUpdatedThread(false);
        setAiGeneratedSlug(null);
      });
    }
  }, [streamingState.showInitialUI]);

  // ============================================================================
  // ANALYSIS COMPLETION DETECTION
  // ============================================================================

  /**
   * Check if first analysis is completed
   * PRIMARY: Analysis status = 'complete'
   * FALLBACK: Timeout-based completion (safety net)
   * ✅ 0-BASED: First round is round 0
   */
  const firstAnalysisCompleted = useMemo(() => {
    const firstAnalysis = analyses[0];
    if (!firstAnalysis || firstAnalysis.roundNumber !== 0) {
      return false;
    }

    // PRIMARY: Analysis reached 'completed' status
    if (firstAnalysis.status === AnalysisStatuses.COMPLETE) {
      return true;
    }

    // SAFETY NET 1: Analysis stuck at 'streaming' for >60s
    if (
      firstAnalysis.status === AnalysisStatuses.STREAMING
      && firstAnalysis.createdAt
    ) {
      const SAFETY_TIMEOUT_MS = 60000; // 60 seconds
      const createdTime = firstAnalysis.createdAt instanceof Date
        ? firstAnalysis.createdAt.getTime()
        : new Date(firstAnalysis.createdAt).getTime();
      const elapsed = Date.now() - createdTime;

      if (elapsed > SAFETY_TIMEOUT_MS) {
        return true;
      }
    }

    // SAFETY NET 2: Analysis stuck at 'pending' for >60s
    if (
      !streamingState.isStreaming
      && firstAnalysis.status === AnalysisStatuses.PENDING
      && firstAnalysis.createdAt
    ) {
      const SAFETY_TIMEOUT_MS = 60000; // 60 seconds
      const createdTime = firstAnalysis.createdAt instanceof Date
        ? firstAnalysis.createdAt.getTime()
        : new Date(firstAnalysis.createdAt).getTime();
      const elapsed = Date.now() - createdTime;

      if (elapsed > SAFETY_TIMEOUT_MS) {
        return true;
      }
    }

    return false;
  }, [analyses, streamingState.isStreaming]);

  /**
   * Defensive fallback: Allow navigation when participants done + AI slug ready
   * Even if analysis is stuck, navigate after 15s timeout
   * ✅ 0-BASED: First round is round 0
   */
  const canNavigateWithoutAnalysis = useMemo(() => {
    const firstAnalysis = analyses[0];
    if (!firstAnalysis || firstAnalysis.roundNumber !== 0) {
      return false;
    }

    // After 15s, if participants done + AI slug ready, proceed
    if (firstAnalysis.createdAt) {
      const createdTime = firstAnalysis.createdAt instanceof Date
        ? firstAnalysis.createdAt.getTime()
        : new Date(firstAnalysis.createdAt).getTime();
      const elapsed = Date.now() - createdTime;
      const hasAiSlug = Boolean(aiGeneratedSlug || (threadState.currentThread?.isAiGeneratedTitle && threadState.currentThread?.slug));

      if (elapsed > 15000 && !streamingState.isStreaming && hasAiSlug) {
        return true;
      }
    }

    return false;
  }, [analyses, streamingState.isStreaming, aiGeneratedSlug, threadState.currentThread]);

  // ============================================================================
  // SLUG POLLING & URL UPDATES
  // ============================================================================

  // Start polling when chat started and haven't detected AI title yet
  const shouldPoll = isActive
    && !streamingState.showInitialUI
    && !!threadState.createdThreadId
    && !hasUpdatedThread;

  const slugStatusQuery = useThreadSlugStatusQuery(
    threadState.createdThreadId,
    shouldPoll,
  );

  /**
   * STEP 1: URL replacement when AI slug ready
   * Polls immediately after thread creation, replaces URL in background
   */
  useEffect(() => {
    if (!isActive)
      return;

    const slugData = slugStatusQuery.data?.success && slugStatusQuery.data.data ? slugStatusQuery.data.data : null;

    if (
      slugData
      && slugData.isAiGeneratedTitle
      && !hasUpdatedThread
    ) {
      startTransition(() => {
        setAiGeneratedSlug(slugData.slug);
        setHasUpdatedThread(true);
      });

      // Invalidate thread list to update sidebar with AI-generated title
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.all,
      });

      // Update thread in store
      const currentThread = threadState.currentThread;
      if (currentThread) {
        const updatedThread = {
          ...currentThread,
          isAiGeneratedTitle: true,
          title: slugData.title,
          slug: slugData.slug,
        };
        setThread(updatedThread);
      }

      // Replace URL in background without navigation
      queueMicrotask(() => {
        window.history.replaceState(
          window.history.state,
          '',
          `/chat/${slugData.slug}`,
        );
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    slugStatusQuery.data,
    setThread,
    queryClient,
    hasUpdatedThread,
  ]);

  // ============================================================================
  // NAVIGATION TO THREAD DETAIL
  // ============================================================================

  /**
   * STEP 2: Navigate to thread detail page when first analysis completes
   * After URL replaced, do full navigation to ChatThreadScreen
   */
  const hasAiSlug = Boolean(aiGeneratedSlug || (threadState.currentThread?.isAiGeneratedTitle && threadState.currentThread?.slug));

  useEffect(() => {
    if (!isActive)
      return;

    // Only navigate if initial UI is hidden
    if (streamingState.showInitialUI) {
      return;
    }

    // ✅ FIX: Only navigate if we're in an ACTIVE chat creation flow
    // Don't navigate if user intentionally returned to /chat (e.g., clicked logo/new chat)
    // Check that we have a URL update pending (hasUpdatedThread) which indicates
    // we're in the middle of creating a new thread, not just viewing overview
    if (!hasUpdatedThread) {
      return;
    }

    // Navigate when either:
    // A) Analysis completed + AI slug ready
    // B) Participants done + AI slug ready + timeout passed
    const shouldNavigate = !hasNavigated
      && hasAiSlug
      && (firstAnalysisCompleted || canNavigateWithoutAnalysis);

    if (shouldNavigate) {
      // Mark as navigated
      startTransition(() => {
        setHasNavigated(true);
      });

      const slug = threadState.currentThread?.slug;
      const threadId = threadState.createdThreadId;

      if (slug && threadId) {
        // ✅ FIX: Don't invalidate analyses query before navigation
        // The orchestrator on thread screen will naturally sync server data with store
        // Premature invalidation causes race condition where:
        // 1. Query cache gets cleared
        // 2. Thread screen mounts and orchestrator fetches
        // 3. Server returns incomplete data (analysis still being persisted)
        // 4. Incomplete server data overwrites complete client data in store
        // 5. Accordion content disappears (analysisData becomes null)
        //
        // The merge logic in useThreadAnalysesQuery already preserves cached analyses
        // that aren't on server yet, so invalidation is unnecessary and harmful here.

        // Use server action for proper cache revalidation before navigation
        startTransition(() => {
          void navigateToThread(slug);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    firstAnalysisCompleted,
    canNavigateWithoutAnalysis,
    streamingState.showInitialUI,
    hasNavigated,
    hasAiSlug,
    hasUpdatedThread,
    threadState.createdThreadId,
    queryClient,
  ]);
}
