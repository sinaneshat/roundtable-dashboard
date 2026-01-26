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
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import { useThreadSlugStatusQuery } from '@/hooks/queries';
import { isListOrSidebarQuery, queryKeys } from '@/lib/data/query-keys';
import { rlog } from '@/lib/utils/dev-logger';
import type { ChatStoreApi } from '@/stores/chat';
import { validateInfiniteQueryCache, validateSlugStatusResponse } from '@/stores/chat/actions/types';

type UseTitlePollingOptions = {
  store: ChatStoreApi;
  queryClientRef: RefObject<QueryClient>;
};

type PollingState = {
  pendingThreadId: string | null;
  pendingProjectId: string | null;
};

type PollingAction
  = { type: 'START_POLLING'; threadId: string; projectId: string | null }
    | { type: 'COMPLETE_POLLING' };

function pollingReducer(state: PollingState, action: PollingAction): PollingState {
  switch (action.type) {
    case 'START_POLLING':
      return {
        pendingProjectId: action.projectId,
        pendingThreadId: action.threadId,
      };
    case 'COMPLETE_POLLING':
      return {
        pendingProjectId: null,
        pendingThreadId: null,
      };
    default:
      return state;
  }
}

export function useTitlePolling({ queryClientRef, store }: UseTitlePollingOptions) {
  const { createdThreadId, createdThreadProjectId } = useStore(store, useShallow(s => ({
    createdThreadId: s.createdThreadId,
    createdThreadProjectId: s.createdThreadProjectId,
  })));

  // Use reducer for state management - this satisfies the linter's preference
  // for not calling setState directly in useEffect
  const [pollingState, dispatch] = useReducer(pollingReducer, {
    pendingProjectId: null,
    pendingThreadId: null,
  });

  // Track if we've already handled the AI title for this thread
  const handledTitleRef = useRef<string | null>(null);

  // Track if polling already started to prevent duplicate thread captures
  const pollingStartedForRef = useRef<string | null>(null);

  // Memoized dispatch callbacks to satisfy linter
  const startPolling = useCallback((threadId: string, projectId: string | null) => {
    dispatch({ projectId, threadId, type: 'START_POLLING' });
  }, []);

  const completePolling = useCallback(() => {
    dispatch({ type: 'COMPLETE_POLLING' });
  }, []);

  // Capture new thread creation BEFORE store clears it on navigation
  // Only set if polling hasn't started yet for this thread (prevents duplicate captures)
  useEffect(() => {
    if (createdThreadId && createdThreadId !== handledTitleRef.current) {
      if (pollingStartedForRef.current !== createdThreadId) {
        rlog.init('titlePolling', `start tid=${createdThreadId.slice(-8)}`);
        pollingStartedForRef.current = createdThreadId;
        startPolling(createdThreadId, createdThreadProjectId);
      }
    }
  }, [createdThreadId, createdThreadProjectId, startPolling]);

  const { pendingProjectId, pendingThreadId } = pollingState;

  // Determine if we should poll:
  // - Have a pending thread ID (captured before navigation cleared it)
  // - Haven't already handled this thread's title
  // Polling continues until API returns isAiGeneratedTitle: true (handled by refetchInterval)
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

    rlog.init('titlePolling', `ready tid=${pendingThreadId.slice(-8)} title="${slugData.title}"`);

    // Capture project ID before clearing state
    const projectId = pendingProjectId;

    // Clear pending state now that we've handled it
    completePolling();

    const queryClient = queryClientRef.current;
    if (!queryClient) {
      return;
    }

    const state = store.getState();
    const currentThread = state.thread;

    // Get old title from the sidebar cache for animation
    let oldTitle = currentThread?.title ?? 'New conversation';

    // Try to get from sidebar cache for more accurate old title
    const sidebarData = queryClient.getQueriesData({
      predicate: isListOrSidebarQuery,
      queryKey: queryKeys.threads.all,
    });

    for (const [, data] of sidebarData) {
      const parsed = validateInfiniteQueryCache(data);
      if (!parsed) {
        continue;
      }

      for (const page of parsed.pages) {
        if (!page.success || !page.data?.items) {
          continue;
        }
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
        slug: slugData.slug,
        title: slugData.title,
      });
    }

    // Optimistically update sidebar cache with new title (always - regardless of current view)
    let cacheUpdated = false;
    queryClient.setQueriesData(
      {
        predicate: isListOrSidebarQuery,
        queryKey: queryKeys.threads.all,
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
              if (thread.id !== pendingThreadId) {
                return thread;
              }

              cacheUpdated = true;
              rlog.init('titlePolling', `cache-update tid=${thread.id.slice(-8)} "${thread.title}" → "${slugData.title}"`);

              // Preserve old slug as previousSlug so isChatActive() can match the URL
              // This ensures sidebar selection state is maintained during slug transition
              const previousSlug = thread.slug !== slugData.slug ? thread.slug : thread.previousSlug;

              return {
                ...thread,
                isAiGeneratedTitle: true,
                previousSlug,
                slug: slugData.slug,
                title: slugData.title,
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

    if (!cacheUpdated) {
      rlog.init('titlePolling', `cache-miss tid=${pendingThreadId.slice(-8)} - thread not in sidebar cache`);
    }

    // Update project threads cache if this is a project thread
    if (projectId) {
      queryClient.setQueryData(
        queryKeys.projects.threads(projectId),
        (old: unknown) => {
          const parsedQuery = validateInfiniteQueryCache(old);
          if (!parsedQuery) {
            return old;
          }

          return {
            ...parsedQuery,
            pages: parsedQuery.pages.map(page => ({
              ...page,
              data: {
                ...page.data,
                items: page.data?.items?.map((thread) => {
                  if (thread.id !== pendingThreadId) {
                    return thread;
                  }

                  const previousSlug = thread.slug !== slugData.slug ? thread.slug : thread.previousSlug;
                  return {
                    ...thread,
                    isAiGeneratedTitle: true,
                    previousSlug,
                    slug: slugData.slug,
                    title: slugData.title,
                  };
                }) ?? [],
              },
            })),
          };
        },
      );
    }

    // Delayed invalidation to fetch fresh data
    const invalidationTimeout = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.threads.all,
      });
      // Also invalidate project threads cache if applicable
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projects.threads(projectId),
        });
      }
    }, 3000);

    return () => {
      clearTimeout(invalidationTimeout);
    };
  }, [slugStatusQuery.data, pendingThreadId, pendingProjectId, queryClientRef, store, completePolling]);
}
