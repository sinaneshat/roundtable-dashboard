/**
 * Navigation Cleanup Hook
 *
 * Handles comprehensive cleanup when navigating between routes.
 * Stops streaming, clears pending operations, resets state, and invalidates queries.
 *
 * CRITICAL: Uses useLayoutEffect to ensure cleanup runs BEFORE child components
 * hydrate the store (useSyncHydrateStore). Without this, the execution order is:
 * 1. Child layoutEffect hydrates store with new data
 * 2. Parent effect RESETS the store → black screen!
 *
 * With useLayoutEffect:
 * 1. Parent layoutEffect RESETS old thread data
 * 2. Child layoutEffect hydrates with new thread data
 * 3. Paint → user sees correct content
 */

import { useLocation } from '@tanstack/react-router';
import type { RefObject } from 'react';
import { useLayoutEffect } from 'react';

import { rlog } from '@/lib/utils/dev-logger';
import type { ChatStoreApi } from '@/stores/chat';

type UseNavigationCleanupParams = {
  store: ChatStoreApi;
  prevPathnameRef: RefObject<string | null>;
};

/**
 * Handles state cleanup on navigation between routes
 */
export function useNavigationCleanup({
  prevPathnameRef,
  store,
}: UseNavigationCleanupParams) {
  const { pathname } = useLocation();

  // CRITICAL: Must be useLayoutEffect to run BEFORE child's useSyncHydrateStore
  useLayoutEffect(() => {
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

    // 🔍 DEBUG: Log navigation detection
    rlog.init('nav-cleanup', `from=${prevPath?.split('/').pop() ?? '-'} to=${pathname?.split('/').pop() ?? '-'} storeT=${currentState.thread?.slug ?? '-'} msgs=${currentState.messages.length}`);

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

    // ✅ FIX: Immediate reset when navigating between threads
    // remountDeps handles component remounting so store starts fresh
    if (isNavigatingBetweenThreads) {
      rlog.init('nav-cleanup', `RESET thread→thread`);
      currentState.chatStop?.();
      currentState.resetForThreadNavigation();
      currentState.clearAllPreSearchTracking();
      const afterState = store.getState();
      rlog.init('nav-cleanup', `AFTER-RESET msgs=${afterState.messages.length} thread=${afterState.thread?.slug ?? '-'}`);
    }

    // Reset when navigating from overview to a DIFFERENT thread
    // ✅ FIX: Don't reset during new thread creation (preserves waitingToStartStreaming)
    if (isFromOverviewToThread && (currentState.thread || currentState.messages.length > 0)) {
      const isNewThreadCreation = currentState.createdThreadId !== null;

      if (!isNewThreadCreation) {
        const targetSlug = pathname?.replace('/chat/', '');
        const currentSlug = currentState.thread?.slug;
        const isNavigatingToSameThread = targetSlug && currentSlug && targetSlug === currentSlug;

        // ✅ FIX: Immediate reset - remountDeps handles component remounting
        if (!isNavigatingToSameThread && !currentState.isStreaming) {
          currentState.chatStop?.();
          currentState.resetForThreadNavigation();
        }
      }
    }

    prevPathnameRef.current = pathname;
  }, [pathname, store, prevPathnameRef]);
}
