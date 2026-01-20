/**
 * Navigation Cleanup Hook
 *
 * Handles comprehensive cleanup when navigating between routes.
 * Stops streaming, clears pending operations, resets state, and invalidates queries.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import type { RefObject } from 'react';
import { useEffect } from 'react';

import { invalidationPatterns } from '@/lib/data/query-keys';
import type { ChatStoreApi } from '@/stores/chat';

type UseNavigationCleanupParams = {
  store: ChatStoreApi;
  prevPathnameRef: RefObject<string | null>;
};

/**
 * Handles state cleanup on navigation between routes
 */
export function useNavigationCleanup({
  store,
  prevPathnameRef,
}: UseNavigationCleanupParams) {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    const prevPath = prevPathnameRef.current;

    // Handle initial mount
    if (prevPath === null) {
      prevPathnameRef.current = pathname;
      if (pathname === '/chat') {
        store.getState().clearAllPreSearchTracking();
      }
      return;
    }

    // Only cleanup if pathname actually changed
    if (prevPath === pathname) {
      return;
    }

    const currentState = store.getState();

    // Detect navigation patterns
    const isLeavingThread = prevPath?.startsWith('/chat/') && prevPath !== '/chat';
    const isGoingToOverview = pathname === '/chat';
    const isNavigatingBetweenThreads = prevPath?.startsWith('/chat/') && pathname?.startsWith('/chat/') && prevPath !== pathname;
    const isGoingToThread = pathname?.startsWith('/chat/') && pathname !== '/chat';
    const isFromOverviewToThread = prevPath === '/chat' && isGoingToThread;
    const isComingFromNonChatPage = prevPath && !prevPath.startsWith('/chat') && isGoingToOverview;

    // ✅ FIX: Only clear waitingToStartStreaming when NOT navigating from overview to thread
    // When user creates a new thread from overview, we navigate to /chat/{slug} and need
    // to PRESERVE waitingToStartStreaming so the streaming trigger effect can start participants
    // after pre-search completes. Clearing it here was causing the stream to get stuck.
    // Only clear when navigating AWAY from chat or between different threads.
    const shouldClearWaiting = currentState.waitingToStartStreaming
      && !isFromOverviewToThread
      && (isGoingToOverview || isNavigatingBetweenThreads || isComingFromNonChatPage);

    if (shouldClearWaiting) {
      currentState.setWaitingToStartStreaming(false);
    }

    // ✅ FIX: Full reset when navigating to /chat overview
    // Without this, old thread data remains in store and can flash briefly
    if (isGoingToOverview && isLeavingThread) {
      currentState.resetToOverview();
    }
    // Clear tracking when coming from non-chat pages
    if (isGoingToOverview && isComingFromNonChatPage) {
      currentState.clearAllPreSearchTracking();
    }

    // ✅ CRITICAL: Invalidate queries for the OLD thread when navigating between threads
    // This prevents stale data from the previous thread bleeding into the new thread
    if (isNavigatingBetweenThreads || isLeavingThread) {
      const oldThreadId = currentState.thread?.id || currentState.createdThreadId;
      if (oldThreadId) {
        invalidationPatterns.leaveThread(oldThreadId).forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    }

    // Full reset when navigating between different threads
    if (isNavigatingBetweenThreads) {
      currentState.resetForThreadNavigation();
      currentState.clearAllPreSearchTracking();
    }

    // Reset when navigating from overview to a DIFFERENT thread
    if (isFromOverviewToThread && (currentState.thread || currentState.messages.length > 0)) {
      const targetSlug = pathname?.replace('/chat/', '');
      const currentSlug = currentState.thread?.slug;
      const isNavigatingToSameThread = targetSlug && currentSlug && targetSlug === currentSlug;

      if (!isNavigatingToSameThread) {
        currentState.resetForThreadNavigation();
      }
    }

    prevPathnameRef.current = pathname;
  }, [pathname, store, prevPathnameRef, queryClient]);
}
