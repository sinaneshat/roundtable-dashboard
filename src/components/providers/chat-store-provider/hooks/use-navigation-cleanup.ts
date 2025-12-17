'use client';

/**
 * Navigation Cleanup Hook
 *
 * Handles comprehensive cleanup when navigating between routes.
 * Stops streaming, clears pending operations, and resets state.
 */

import { usePathname } from 'next/navigation';
import type { MutableRefObject } from 'react';
import { useEffect } from 'react';

import type { ChatStoreApi } from '@/stores/chat';

type UseNavigationCleanupParams = {
  store: ChatStoreApi;
  prevPathnameRef: MutableRefObject<string | null>;
};

/**
 * Handles state cleanup on navigation between routes
 */
export function useNavigationCleanup({
  store,
  prevPathnameRef,
}: UseNavigationCleanupParams) {
  const pathname = usePathname();

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

    // Clear tracking when navigating to /chat
    if (isGoingToOverview && (isLeavingThread || isComingFromNonChatPage)) {
      currentState.clearAllPreSearchTracking();
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
  }, [pathname, store, prevPathnameRef]);
}
