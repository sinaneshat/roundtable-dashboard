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
 * - Pre-populating TanStack Query cache before navigation (eliminates loading.tsx)
 *
 * Location: /src/stores/chat/actions/flow-controller.ts
 * Used by: ChatOverviewScreen (and potentially ChatThreadScreen)
 */

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { AnalysisStatuses, ScreenModes } from '@/api/core/enums';
import { useChatStore } from '@/components/providers/chat-store-provider';
import { useThreadSlugStatusQuery } from '@/hooks/queries/chat/threads';
import { useSession } from '@/lib/auth/client';
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
  const { data: session } = useSession();

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
  const messages = useChatStore(s => s.messages);
  const participants = useChatStore(s => s.participants);
  const preSearches = useChatStore(s => s.preSearches);
  const setThread = useChatStore(s => s.setThread);

  // ============================================================================
  // PRE-POPULATE QUERY CACHE (Eliminates loading.tsx skeleton)
  // ============================================================================

  /**
   * Pre-populate TanStack Query cache with data from Zustand store
   * This ensures the thread page has data immediately on navigation,
   * eliminating the loading.tsx skeleton flash.
   *
   * The server-side page.tsx will still fetch fresh data, but
   * HydrationBoundary will merge with existing client cache.
   */
  const prepopulateQueryCache = useCallback((threadId: string) => {
    const thread = threadState.currentThread;
    if (!thread)
      return;

    // 1. Pre-populate thread detail (thread, participants, messages, user)
    // Format matches getThreadBySlugService response
    queryClient.setQueryData(
      queryKeys.threads.detail(threadId),
      {
        success: true,
        data: {
          thread: {
            ...thread,
            // Ensure dates are ISO strings for consistency with server response
            createdAt: thread.createdAt instanceof Date ? thread.createdAt.toISOString() : thread.createdAt,
            updatedAt: thread.updatedAt instanceof Date ? thread.updatedAt.toISOString() : thread.updatedAt,
            lastMessageAt: thread.lastMessageAt
              ? (thread.lastMessageAt instanceof Date ? thread.lastMessageAt.toISOString() : thread.lastMessageAt)
              : null,
          },
          participants: participants.map(p => ({
            ...p,
            createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
            updatedAt: p.updatedAt instanceof Date ? p.updatedAt.toISOString() : p.updatedAt,
          })),
          // Messages from store - add createdAt for server format compatibility
          // UIMessage from AI SDK doesn't have createdAt, but the page expects it
          messages: messages.map(m => ({
            ...m,
            // Use metadata.createdAt if available (our custom field), else default to now
            createdAt: (m as { createdAt?: Date | string }).createdAt
              ? ((m as { createdAt?: Date | string }).createdAt instanceof Date
                  ? ((m as { createdAt?: Date | string }).createdAt as Date).toISOString()
                  : (m as { createdAt?: Date | string }).createdAt)
              : new Date().toISOString(),
          })),
          user: {
            name: session?.user?.name || 'You',
            image: session?.user?.image || null,
          },
        },
        meta: {
          requestId: 'prefetch',
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      },
    );

    // 2. Pre-populate analyses
    // Format matches getThreadAnalysesService response
    if (analyses.length > 0) {
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: analyses.map(a => ({
              ...a,
              createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
              completedAt: a.completedAt
                ? (a.completedAt instanceof Date ? a.completedAt.toISOString() : a.completedAt)
                : null,
            })),
          },
          meta: {
            requestId: 'prefetch',
            timestamp: new Date().toISOString(),
            version: 'v1',
          },
        },
      );
    }

    // 3. Pre-populate pre-searches (if web search enabled)
    if (preSearches.length > 0) {
      queryClient.setQueryData(
        queryKeys.threads.preSearches(threadId),
        {
          success: true,
          data: {
            items: preSearches.map(ps => ({
              ...ps,
              createdAt: ps.createdAt instanceof Date ? ps.createdAt.toISOString() : ps.createdAt,
              completedAt: ps.completedAt
                ? (ps.completedAt instanceof Date ? ps.completedAt.toISOString() : ps.completedAt)
                : null,
            })),
          },
          meta: {
            requestId: 'prefetch',
            timestamp: new Date().toISOString(),
            version: 'v1',
          },
        },
      );
    }

    // 4. Pre-populate empty changelog (we don't have this data yet, but prevents loading)
    queryClient.setQueryData(
      queryKeys.threads.changelog(threadId),
      {
        success: true,
        data: {
          items: [],
        },
        meta: {
          requestId: 'prefetch',
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      },
    );

    // 5. Pre-populate empty feedback (we don't have this data yet, but prevents loading)
    queryClient.setQueryData(
      queryKeys.threads.feedback(threadId),
      {
        success: true,
        data: {
          items: [],
        },
        meta: {
          requestId: 'prefetch',
          timestamp: new Date().toISOString(),
          version: 'v1',
        },
      },
    );
  }, [threadState.currentThread, participants, messages, analyses, preSearches, session, queryClient]);

  // Navigation tracking
  const [hasNavigated, setHasNavigated] = useState(false);
  const [hasUpdatedThread, setHasUpdatedThread] = useState(false);
  const [aiGeneratedSlug, setAiGeneratedSlug] = useState<string | null>(null);

  // Disable controller if screen mode changed (navigated away)
  const isActive = enabled && streamingState.screenMode === ScreenModes.OVERVIEW;

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
    // ✅ CRITICAL FIX: Only apply timeout to placeholder analyses (no participantMessageIds)
    // When analysis has participantMessageIds, it's ready to stream - not stuck
    // The ModeratorAnalysisStream component will render and trigger the POST request
    const isPlaceholderAnalysis = !firstAnalysis.participantMessageIds
      || firstAnalysis.participantMessageIds.length === 0;

    if (
      !streamingState.isStreaming
      && firstAnalysis.status === AnalysisStatuses.PENDING
      && firstAnalysis.createdAt
      && isPlaceholderAnalysis // Only timeout if no participantMessageIds yet
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
      // NOTE: We no longer call router.push() after this - the user stays on
      // the overview screen which already shows thread content. This avoids
      // the loading.tsx skeleton that would show during server render.
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

    // Navigate ONLY when analysis is fully completed + AI slug ready
    // Wait for participants to speak AND analysis to finish before navigating
    const shouldNavigate = !hasNavigated
      && hasAiSlug
      && firstAnalysisCompleted;

    if (shouldNavigate) {
      // Mark as navigated
      startTransition(() => {
        setHasNavigated(true);
      });

      const slug = threadState.currentThread?.slug;
      const threadId = threadState.createdThreadId;

      if (slug && threadId) {
        // ✅ PREFETCH DATA: Pre-populate TanStack Query cache for future navigation
        // This ensures data is available if user refreshes or navigates away and back
        prepopulateQueryCache(threadId);

        // =========================================================================
        // ✅ CRITICAL FIX: NO SERVER NAVIGATION - Eliminates loading.tsx skeleton
        // =========================================================================
        //
        // WHY: Next.js App Router with `dynamic = 'force-dynamic'` ALWAYS shows
        // loading.tsx during server render. Prefetching only works for static routes.
        // For dynamic routes, prefetch only caches down to the loading.js boundary.
        //
        // SOLUTION: Don't trigger server navigation at all!
        // - URL is already `/chat/[slug]` from history.replaceState (Step 1)
        // - Overview screen already renders thread content when !showInitialUI
        // - All data (messages, analyses, etc.) is in Zustand store
        // - User sees seamless transition with NO loading skeleton
        //
        // BEHAVIOR:
        // - User stays on ChatOverviewScreen (which shows thread content)
        // - URL is correct for sharing/bookmarking
        // - On refresh/hard navigation, they get proper ChatThreadScreen from server
        // - Browser back button works correctly
        //
        // ❌ REMOVED: router.push() - triggers server render and loading.tsx
        // ✅ KEPT: history.replaceState (Step 1) - already updated URL
        //
        // The overview screen continues to function as the thread view.
        // When user refreshes, they'll get the full ChatThreadScreen with
        // server-rendered data and all thread features (actions, changelog, etc.)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isActive,
    firstAnalysisCompleted,
    streamingState.showInitialUI,
    hasNavigated,
    hasAiSlug,
    hasUpdatedThread,
    threadState.createdThreadId,
    prepopulateQueryCache,
  ]);
}
