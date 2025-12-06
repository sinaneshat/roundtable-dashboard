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
import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider';
import { useThreadSlugStatusQuery } from '@/hooks/queries/chat/threads';
import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { createEmptyListCache, createPrefetchMeta } from '@/lib/utils/cache-helpers';
import { toISOString, toISOStringOrNull } from '@/lib/utils/date-transforms';
import { getCreatedAt } from '@/lib/utils/metadata';

import { validateInfiniteQueryCache } from './types';

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

  // ✅ REACT BEST PRACTICE: Use store API for imperative access inside effects
  // This avoids infinite loops from dependency arrays while accessing current state
  const storeApi = useChatStoreApi();

  // State selectors - only subscribe to what triggers re-renders
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
   *
   * ✅ REACT BEST PRACTICE: Uses storeApi.getState() for imperative access
   * This reads current state at call time without causing dependency issues
   */
  const prepopulateQueryCache = useCallback((threadId: string, currentSession: typeof session) => {
    // ✅ REACT BEST PRACTICE: Read current state imperatively via getState()
    // This avoids infinite loops from adding state to dependency arrays
    const state = storeApi.getState();
    const thread = state.thread;
    const currentParticipants = state.participants;
    const currentMessages = state.messages;
    const currentAnalyses = state.analyses;
    const currentPreSearches = state.preSearches;

    if (!thread)
      return;

    // 1. Pre-populate thread detail (thread, participants, messages, user)
    // Format matches getThreadBySlugService response
    // ✅ REFACTORED: Use toISOString/toISOStringOrNull utilities for date serialization
    queryClient.setQueryData(
      queryKeys.threads.detail(threadId),
      {
        success: true,
        data: {
          thread: {
            ...thread,
            createdAt: toISOString(thread.createdAt),
            updatedAt: toISOString(thread.updatedAt),
            lastMessageAt: toISOStringOrNull(thread.lastMessageAt),
          },
          participants: currentParticipants.map(p => ({
            ...p,
            createdAt: toISOString(p.createdAt),
            updatedAt: toISOString(p.updatedAt),
          })),
          // Messages from store - add createdAt for server format compatibility
          // ✅ TYPE-SAFE: Use getCreatedAt utility instead of force casts
          messages: currentMessages.map(m => ({
            ...m,
            createdAt: getCreatedAt(m) ?? new Date().toISOString(),
          })),
          user: {
            name: currentSession?.user?.name || 'You',
            image: currentSession?.user?.image || null,
          },
        },
        meta: createPrefetchMeta(),
      },
    );

    // 2. Pre-populate analyses
    // Format matches getThreadAnalysesService response
    // ✅ REFACTORED: Use toISOString/toISOStringOrNull utilities
    if (currentAnalyses.length > 0) {
      queryClient.setQueryData(
        queryKeys.threads.analyses(threadId),
        {
          success: true,
          data: {
            items: currentAnalyses.map(a => ({
              ...a,
              createdAt: toISOString(a.createdAt),
              completedAt: toISOStringOrNull(a.completedAt),
            })),
          },
          meta: createPrefetchMeta(),
        },
      );
    }

    // 3. Pre-populate pre-searches (if web search enabled)
    // ✅ REFACTORED: Use toISOString/toISOStringOrNull utilities
    if (currentPreSearches.length > 0) {
      queryClient.setQueryData(
        queryKeys.threads.preSearches(threadId),
        {
          success: true,
          data: {
            items: currentPreSearches.map(ps => ({
              ...ps,
              createdAt: toISOString(ps.createdAt),
              completedAt: toISOStringOrNull(ps.completedAt),
            })),
          },
          meta: createPrefetchMeta(),
        },
      );
    }

    // 4. Pre-populate empty changelog (we don't have this data yet, but prevents loading)
    // ✅ REFACTORED: Use createEmptyListCache utility
    queryClient.setQueryData(
      queryKeys.threads.changelog(threadId),
      createEmptyListCache(),
    );

    // 5. Pre-populate empty feedback (we don't have this data yet, but prevents loading)
    // ✅ REFACTORED: Use createEmptyListCache utility
    queryClient.setQueryData(
      queryKeys.threads.feedback(threadId),
      createEmptyListCache(),
    );
    // ✅ REACT BEST PRACTICE: Only stable dependencies (storeApi, queryClient)
    // State is read imperatively via getState() at call time
  }, [queryClient, storeApi]);

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

    // Track timeout for cleanup
    let invalidationTimeoutId: ReturnType<typeof setTimeout> | undefined;

    if (
      slugData
      && slugData.isAiGeneratedTitle
      && !hasUpdatedThread
    ) {
      startTransition(() => {
        setAiGeneratedSlug(slugData.slug);
        setHasUpdatedThread(true);
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

        // ✅ IMMEDIATE SIDEBAR UPDATE: Optimistically update sidebar with AI-generated title
        // This provides instant feedback without waiting for invalidation refetch
        queryClient.setQueriesData(
          {
            queryKey: queryKeys.threads.all,
            predicate: (query) => {
              // Only update infinite queries (thread lists)
              const key = query.queryKey as string[];
              return key.length >= 2 && key[1] === 'list';
            },
          },
          (old: unknown) => {
            const parsedQuery = validateInfiniteQueryCache(old);
            if (!parsedQuery)
              return old;

            return {
              ...parsedQuery,
              pages: parsedQuery.pages.map((page) => {
                if (!page.success || !page.data?.items)
                  return page;

                return {
                  ...page,
                  data: {
                    ...page.data,
                    items: page.data.items.map((thread) => {
                      if (thread.id !== currentThread.id)
                        return thread;

                      // Update thread with AI-generated title and slug
                      return {
                        ...thread,
                        title: slugData.title,
                        slug: slugData.slug,
                        isAiGeneratedTitle: true,
                      };
                    }),
                  },
                };
              }),
            };
          },
        );
      }

      // ✅ FIX: Delayed invalidation to avoid race condition
      // Don't invalidate immediately - the server might not have the updated title yet.
      // The optimistic update above provides instant UI feedback.
      // After 3s delay, invalidate to ensure server data syncs (title gen takes 1-3s)
      invalidationTimeoutId = setTimeout(() => {
        queryClient.invalidateQueries({
          queryKey: queryKeys.threads.all,
        });
      }, 3000);

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

    // Cleanup timeout on unmount or dependency change
    return () => {
      if (invalidationTimeoutId) {
        clearTimeout(invalidationTimeoutId);
      }
    };
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
        prepopulateQueryCache(threadId, session);

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
  }, [
    isActive,
    firstAnalysisCompleted,
    streamingState.showInitialUI,
    hasNavigated,
    hasAiSlug,
    hasUpdatedThread,
    threadState.createdThreadId,
    threadState.currentThread?.slug,
    prepopulateQueryCache,
    session,
  ]);
}
