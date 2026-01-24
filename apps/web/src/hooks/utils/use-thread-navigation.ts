/**
 * Thread Navigation Hook
 *
 * Pre-populates query cache before navigation to eliminate skeleton flash.
 * Uses same pattern as flow-controller.ts prepopulateQueryCache.
 *
 * When navigating to a thread, the $slug.tsx loader checks for cached data
 * with prefetch meta - if found, it returns immediately without network fetch.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';

import { queryKeys } from '@/lib/data/query-keys';
import { createPrefetchMeta } from '@/lib/utils/cache-helpers';

type ThreadPreviewData = {
  id: string;
  slug: string;
  title?: string | null;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Hook for smooth thread navigation with cache pre-population.
 *
 * Pre-populates the bySlug cache before navigation so the loader
 * can return cached data immediately, eliminating skeleton flash.
 *
 * @example
 * ```tsx
 * const { createClickHandler } = useThreadNavigation();
 *
 * <Link
 *   to="/chat/$slug"
 *   params={{ slug: thread.slug }}
 *   onClick={createClickHandler(thread)}
 *   preload={false}
 * >
 * ```
 */
export function useThreadNavigation() {
  const queryClient = useQueryClient();
  const router = useRouter();

  const navigateToThread = useCallback((thread: ThreadPreviewData) => {
    // Pre-populate bySlug cache (what $slug.tsx loader checks first)
    // Minimal data structure that loader expects
    queryClient.setQueryData(queryKeys.threads.bySlug(thread.slug), {
      success: true,
      data: {
        thread: {
          id: thread.id,
          title: thread.title ?? null,
          slug: thread.slug,
          mode: null,
          status: 'active',
          createdAt: thread.createdAt,
          updatedAt: thread.updatedAt,
          isFavorite: thread.isFavorite ?? false,
          isPublic: false,
          projectId: null,
          userId: '',
        },
        participants: [],
        messages: [],
      },
      meta: createPrefetchMeta(), // CRITICAL: signals loader to skip fetch
    });

    // Defer navigation until cache is settled
    queueMicrotask(() => {
      router.navigate({ to: '/chat/$slug', params: { slug: thread.slug } });
    });
  }, [queryClient, router]);

  const createClickHandler = useCallback((thread: ThreadPreviewData) => {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      navigateToThread(thread);
    };
  }, [navigateToThread]);

  return { navigateToThread, createClickHandler };
}
