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
  preSearchCreationAttemptedRef: MutableRefObject<Set<number>>;
};

/**
 * Handles state cleanup on navigation between routes
 */
export function useNavigationCleanup({
  store,
  prevPathnameRef,
  preSearchCreationAttemptedRef,
}: UseNavigationCleanupParams) {
  const pathname = usePathname();

  useEffect(() => {
    const prevPath = prevPathnameRef.current;

    // Handle initial mount
    if (prevPath === null) {
      prevPathnameRef.current = pathname;
      if (pathname === '/chat') {
        preSearchCreationAttemptedRef.current = new Set();
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

    // Clear waitingToStartStreaming on navigation
    if (currentState.waitingToStartStreaming) {
      currentState.setWaitingToStartStreaming(false);
    }

    // Clear refs when navigating to /chat
    if (isGoingToOverview && (isLeavingThread || isComingFromNonChatPage)) {
      preSearchCreationAttemptedRef.current = new Set();
    }

    // Full reset when navigating between different threads
    if (isNavigatingBetweenThreads) {
      currentState.resetForThreadNavigation();
      preSearchCreationAttemptedRef.current = new Set();
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
  }, [pathname, store, prevPathnameRef, preSearchCreationAttemptedRef]);
}
