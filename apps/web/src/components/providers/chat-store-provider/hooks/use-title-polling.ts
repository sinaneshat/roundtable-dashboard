/**
 * Title Polling Hook - Provider-level polling for AI-generated titles
 *
 * Polls check-slug API every 2s after thread creation until isAiGeneratedTitle is true.
 * Unlike flow-controller.ts, polling persists across overview↔thread navigation.
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
  const { createdThreadId, thread } = useStore(store, useShallow(s => ({
    createdThreadId: s.createdThreadId,
    thread: s.thread,
  })));

  // Track if we've already handled the AI title for this thread
  const handledTitleRef = useRef<string | null>(null);

  // Determine if we should poll:
  // - Have a createdThreadId (new thread was just created)
  // - Thread doesn't have AI-generated title yet
  // - Haven't already handled this thread's title
  const shouldPoll = Boolean(createdThreadId)
    && !thread?.isAiGeneratedTitle
    && handledTitleRef.current !== createdThreadId;

  const slugStatusQuery = useThreadSlugStatusQuery(createdThreadId, shouldPoll);

  // Reset handled ref when a new thread is created
  useEffect(() => {
    if (createdThreadId && handledTitleRef.current !== createdThreadId) {
      // Don't reset if it's the same thread - this would cause duplicate handling
      if (!thread?.isAiGeneratedTitle) {
        // Only clear if we haven't already processed this thread's title
        handledTitleRef.current = null;
      }
    }
  }, [createdThreadId, thread?.isAiGeneratedTitle]);

  // Handle AI title ready
  useEffect(() => {
    const slugData = validateSlugStatusResponse(slugStatusQuery.data);

    if (!slugData?.isAiGeneratedTitle || !createdThreadId) {
      return;
    }

    // Prevent duplicate handling
    if (handledTitleRef.current === createdThreadId) {
      return;
    }
    handledTitleRef.current = createdThreadId;

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
        const thread = page.data.items.find(t => t.id === createdThreadId);
        if (thread) {
          oldTitle = thread.title ?? 'New conversation';
          break;
        }
      }
    }

    // Start the typewriter animation
    state.startTitleAnimation(createdThreadId, oldTitle, slugData.title);

    // Update thread in store
    if (currentThread) {
      state.setThread({
        ...currentThread,
        isAiGeneratedTitle: true,
        title: slugData.title,
        slug: slugData.slug,
      });
    }

    // Optimistically update sidebar cache with new title
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
              if (thread.id !== createdThreadId)
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
  }, [slugStatusQuery.data, createdThreadId, queryClientRef, store]);
}
