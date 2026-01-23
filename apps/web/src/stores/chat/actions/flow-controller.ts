/**
 * Chat Flow Controller
 *
 * Handles slug polling, URL updates, navigation to thread detail,
 * moderator completion detection, and query cache pre-population.
 */

import { ScreenModes } from '@roundtable/shared';
import { useQueryClient } from '@tanstack/react-query';
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore, useChatStoreApi } from '@/components/providers/chat-store-provider/context';
import { useSession } from '@/lib/auth/client';
import { queryKeys } from '@/lib/data/query-keys';
import { createEmptyListCache, createPrefetchMeta, getCreatedAt, toISOString, toISOStringOrNull } from '@/lib/utils';

import { getModeratorMessageForRound } from '../utils/participant-completion-gate';

export type UseFlowControllerOptions = {
  enabled?: boolean;
  /** Project ID for project-scoped threads (updates URL to /chat/projects/{projectId}/{slug}) */
  projectId?: string;
};

export function useFlowController(options: UseFlowControllerOptions = {}) {
  const { enabled = true, projectId } = options;
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  // Use store API for imperative access inside effects (avoids dependency loops)
  const storeApi = useChatStoreApi();
  const streamingState = useChatStore(useShallow(s => ({
    showInitialUI: s.showInitialUI,
    isStreaming: s.isStreaming,
    screenMode: s.screenMode,
  })));

  const threadState = useChatStore(useShallow(s => ({
    currentThread: s.thread,
    createdThreadId: s.createdThreadId,
    setThread: s.setThread,
  })));

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
  const prepopulateQueryCache = useCallback((threadId: string, slug: string, currentSession: typeof session) => {
    // ✅ REACT BEST PRACTICE: Read current state imperatively via getState()
    // This avoids infinite loops from adding state to dependency arrays
    const state = storeApi.getState();
    const thread = state.thread;
    const currentParticipants = state.participants;
    const currentMessages = state.messages;
    const currentPreSearches = state.preSearches;

    if (!thread)
      return;

    // Build the thread data object once for reuse
    const threadData = {
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
    };

    // 1. Pre-populate thread detail by ID
    queryClient.setQueryData(queryKeys.threads.detail(threadId), threadData);

    // 2. ✅ FIX: Also pre-populate bySlug cache - this is what $slug.tsx route uses
    // Without this, navigation to /chat/{slug} causes unnecessary GET request
    queryClient.setQueryData(queryKeys.threads.bySlug(slug), threadData);

    // 3. Pre-populate pre-searches - ALWAYS set cache to prevent fetch
    // ✅ FIX: Always pre-populate, even when empty, to prevent query from fetching
    queryClient.setQueryData(
      queryKeys.threads.preSearches(threadId),
      {
        success: true,
        data: {
          items: currentPreSearches.length > 0
            ? currentPreSearches.map(ps => ({
                ...ps,
                createdAt: toISOString(ps.createdAt),
                completedAt: toISOStringOrNull(ps.completedAt),
              }))
            : [],
        },
        meta: createPrefetchMeta(),
      },
    );

    // 4. Pre-populate empty changelog (we don't have this data yet, but prevents loading)
    queryClient.setQueryData(
      queryKeys.threads.changelog(threadId),
      createEmptyListCache(),
    );

    // 5. Pre-populate empty feedback (we don't have this data yet, but prevents loading)
    queryClient.setQueryData(
      queryKeys.threads.feedback(threadId),
      createEmptyListCache(),
    );
    // ✅ REACT BEST PRACTICE: Only stable dependencies (storeApi, queryClient)
    // State is read imperatively via getState() at call time
  }, [queryClient, storeApi]);

  // Navigation tracking
  // ✅ FIX: Use refs to track immediately, preventing re-entry during startTransition
  // Refs update synchronously; state via startTransition is deferred → effects see stale state
  const [hasNavigated, setHasNavigated] = useState(false);
  const [hasUpdatedUrl, setHasUpdatedUrl] = useState(false);
  const hasUpdatedUrlRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  // Disable controller if screen mode changed (navigated away)
  const isActive = enabled && streamingState.screenMode === ScreenModes.OVERVIEW;

  // Reset flags when returning to initial UI
  useEffect(() => {
    if (streamingState.showInitialUI) {
      // ✅ FIX: Reset refs immediately (synchronous) before deferred state update
      hasUpdatedUrlRef.current = false;
      hasNavigatedRef.current = false;
      startTransition(() => {
        setHasNavigated(false);
        setHasUpdatedUrl(false);
      });
    }
  }, [streamingState.showInitialUI]);

  // ============================================================================
  // MODERATOR COMPLETION DETECTION
  // ============================================================================

  // ✅ TEXT STREAMING: Check for moderator messages in messages array
  // useShallow for referential stability with array selector
  const messages = useChatStore(useShallow(s => s.messages));

  /**
   * Check if first moderator message is completed
   * ✅ TEXT STREAMING: Moderator messages rendered inline via ChatMessageList
   * Moderator messages have metadata.isModerator: true
   * ✅ 0-BASED: First round is round 0
   */
  const firstModeratorCompleted = useMemo(() => {
    // Check if there's a moderator message for round 0
    const moderatorMessage = getModeratorMessageForRound(messages, 0);
    return !!moderatorMessage;
  }, [messages]);

  // ============================================================================
  // URL UPDATE ON AI TITLE READY
  // ============================================================================

  /**
   * URL replacement when AI title is ready
   * Triggered by thread.isAiGeneratedTitle change (set by use-title-polling hook)
   * Only handles URL navigation - polling and cache updates handled by useTitlePolling
   */
  useEffect(() => {
    if (!isActive)
      return;
    if (!threadState.currentThread?.isAiGeneratedTitle)
      return;
    if (!threadState.currentThread?.slug)
      return;
    if (hasUpdatedUrlRef.current)
      return;

    const slug = threadState.currentThread.slug;
    const threadId = threadState.createdThreadId;

    // ✅ FIX: Pre-populate cache BEFORE URL change to prevent skeleton flash
    // Route loader's ensureQueryData will find data in cache → no network request → no skeleton
    if (slug && threadId) {
      prepopulateQueryCache(threadId, slug, session);
    }

    // Set ref IMMEDIATELY to prevent re-entry
    hasUpdatedUrlRef.current = true;
    startTransition(() => {
      setHasUpdatedUrl(true);
    });

    // ✅ FIX: Use history.replaceState instead of router.navigate
    // ChatOverviewScreen already shows ChatView when thread exists
    // Full navigation is unnecessary and causes duplicate loader fetches
    // URL update is sufficient for bookmarking/sharing
    queueMicrotask(() => {
      const targetUrl = projectId
        ? `/chat/projects/${projectId}/${slug}`
        : `/chat/${slug}`;
      window.history.replaceState(
        window.history.state,
        '',
        targetUrl,
      );
    });
  }, [
    isActive,
    threadState.currentThread?.isAiGeneratedTitle,
    threadState.currentThread?.slug,
    threadState.createdThreadId,
    prepopulateQueryCache,
    session,
    projectId,
  ]);

  // ============================================================================
  // NAVIGATION TO THREAD DETAIL
  // ============================================================================

  /**
   * STEP 2: Navigate to thread detail page when first moderator completes
   * After URL replaced, do full navigation to ChatThreadScreen
   */
  const hasAiSlug = Boolean(threadState.currentThread?.isAiGeneratedTitle && threadState.currentThread?.slug);

  useEffect(() => {
    if (!isActive)
      return;

    // Only navigate if initial UI is hidden
    if (streamingState.showInitialUI) {
      return;
    }

    // ✅ FIX: Only navigate if we're in an ACTIVE chat creation flow
    // Don't navigate if user intentionally returned to /chat (e.g., clicked logo/new chat)
    // Check that we have a URL update completed (hasUpdatedUrl) which indicates
    // we're in the middle of creating a new thread, not just viewing overview
    if (!hasUpdatedUrl) {
      return;
    }

    // Navigate ONLY when moderator is fully completed + AI slug ready
    // Wait for participants to speak AND moderator to finish before navigating
    // ✅ FIX: Check REF not state - ref updates synchronously, state via startTransition is deferred
    const shouldNavigate = !hasNavigatedRef.current
      && hasAiSlug
      && firstModeratorCompleted;

    if (shouldNavigate) {
      // ✅ FIX: Set ref IMMEDIATELY to prevent re-entry before startTransition propagates
      hasNavigatedRef.current = true;

      // Mark as navigated
      startTransition(() => {
        setHasNavigated(true);
      });

      const slug = threadState.currentThread?.slug;
      const threadId = threadState.createdThreadId;

      if (slug && threadId) {
        // ✅ PREFETCH DATA: Pre-populate TanStack Query cache for future navigation
        // This ensures data is available if user refreshes or navigates away and back
        // ✅ FIX: Pass slug to pre-populate both detail(threadId) and bySlug(slug) caches
        prepopulateQueryCache(threadId, slug, session);
      }
    }
  }, [
    isActive,
    firstModeratorCompleted,
    streamingState.showInitialUI,
    hasNavigated,
    hasAiSlug,
    hasUpdatedUrl,
    threadState.createdThreadId,
    threadState.currentThread?.slug,
    prepopulateQueryCache,
    session,
  ]);
}
