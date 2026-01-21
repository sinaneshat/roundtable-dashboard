/**
 * Title Polling Hook - Provider-level polling for AI-generated titles
 *
 * Polls check-slug API every 2s after thread creation until isAiGeneratedTitle is true.
 * CRITICAL: Polling persists across navigation - uses ref to track pending thread,
 * NOT store's createdThreadId which gets cleared on navigation.
 *
 * When AI title is ready:
 * 1. Gets old title from sidebar cache
 * 2. Calls store.startTitleAnimation(threadId, oldTitle, newTitle)
 * 3. Updates sidebar cache and store thread
 */

import type { QueryClient } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useThreadSlugStatusQuery } from '@/hooks/queries';
import { isListOrSidebarQuery, queryKeys } from '@/lib/data/query-keys';
import type { ChatStoreApi } from '@/stores/chat';
import { validateInfiniteQueryCache, validateSlugStatusResponse } from '@/stores/chat/actions/types';

type UseTitlePollingOptions = {
  store: ChatStoreApi;
  queryClientRef: RefObject<QueryClient>;
};

export function useTitlePolling({ store, queryClientRef }: UseTitlePollingOptions) {
  const { createdThreadId } = useStore(store, useShallow(s => ({
    createdThreadId: s.createdThreadId,
  })));

  // CRITICAL: Track pending title thread ID in ref - persists across navigation
  // Store's createdThreadId gets cleared on navigation, but we need to keep polling
  const pendingTitleThreadIdRef = useRef<string | null>(null);

  // Track if we've already handled the AI title for this thread
  const handledTitleRef = useRef<string | null>(null);

  // Capture new thread creation in persistent ref BEFORE store clears it
  useEffect(() => {
    if (createdThreadId && createdThreadId !== handledTitleRef.current) {
      pendingTitleThreadIdRef.current = createdThreadId;
    }
  }, [createdThreadId]);

  // Use the persistent ref for polling - NOT the store's createdThreadId
  const pendingThreadId = pendingTitleThreadIdRef.current;

  // Determine if we should poll:
  // - Have a pending thread ID (captured before navigation cleared it)
  // - Haven't already handled this thread's title
  const shouldPoll = Boolean(pendingThreadId)
    && handledTitleRef.current !== pendingThreadId;

  const slugStatusQuery = useThreadSlugStatusQuery(pendingThreadId, shouldPoll);

  // Handle AI title ready
  useEffect(() => {
    const slugData = validateSlugStatusResponse(slugStatusQuery.data);

    if (!slugData?.isAiGeneratedTitle || !pendingThreadId) {
      return;
    }

    // Prevent duplicate handling
    if (handledTitleRef.current === pendingThreadId) {
      return;
    }
    handledTitleRef.current = pendingThreadId;
    // Clear pending ref now that we've handled it
    pendingTitleThreadIdRef.current = null;

    const queryClient = queryClientRef.current;
    if (!queryClient)
      return;

    const state = store.getState();
    const currentThread = state.thread;

    // Get old title from the sidebar cache for animation
    let oldTitle = currentThread?.title ?? 'New conversation';

    // Try to get from sidebar cache for more accurate old title
    const sidebarData = queryClient.getQueriesData({
      queryKey: queryKeys.threads.all,
      predicate: isListOrSidebarQuery,
    });

    for (const [, data] of sidebarData) {
      const parsed = validateInfiniteQueryCache(data);
      if (!parsed)
        continue;

      for (const page of parsed.pages) {
        if (!page.success || !page.data?.items)
          continue;
        const thread = page.data.items.find(t => t.id === pendingThreadId);
        if (thread) {
          oldTitle = thread.title ?? 'New conversation';
          break;
        }
      }
    }

    // Start the typewriter animation
    state.startTitleAnimation(pendingThreadId, oldTitle, slugData.title);

    // Update thread in store ONLY if user is still viewing this thread
    if (currentThread?.id === pendingThreadId) {
      state.setThread({
        ...currentThread,
        isAiGeneratedTitle: true,
        title: slugData.title,
        slug: slugData.slug,
      });
    }

    // Optimistically update sidebar cache with new title (always - regardless of current view)
    queryClient.setQueriesData(
      {
        queryKey: queryKeys.threads.all,
        predicate: isListOrSidebarQuery,
      },
      (old) => {
        const parsedQuery = validateInfiniteQueryCache(old);
        if (!parsedQuery) {
          return old;
        }

        return {
          ...parsedQuery,
          pages: parsedQuery.pages.map((page) => {
            if (!page.success || !page.data?.items) {
              return page;
            }

            const updatedItems = page.data.items.map((thread) => {
              if (thread.id !== pendingThreadId)
                return thread;

              return {
                ...thread,
                title: slugData.title,
                slug: slugData.slug,
                isAiGeneratedTitle: true,
              };
            });

            return {
              ...page,
              data: {
                ...page.data,
                items: updatedItems,
              },
            };
          }),
        };
      },
    );

    // Delayed invalidation to fetch fresh data
    const invalidationTimeout = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.all,
      });
    }, 3000);

    return () => {
      clearTimeout(invalidationTimeout);
    };
  }, [slugStatusQuery.data, pendingThreadId, queryClientRef, store]);
}
