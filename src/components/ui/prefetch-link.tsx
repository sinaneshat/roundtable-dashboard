'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useRef } from 'react';

import type { ComponentProps } from 'react';

type QueryPrefetchConfig = {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  staleTime?: number;
};

type PrefetchLinkProps = ComponentProps<typeof Link> & {
  /**
   * TanStack Query prefetch configs to run on hover intent
   * Preloads data before navigation for instant page loads
   */
  prefetchQueries?: QueryPrefetchConfig[];
  /**
   * Delay in ms before triggering prefetch (default: 100ms)
   * Prevents prefetching on accidental hovers
   */
  intentDelay?: number;
};

/**
 * Enhanced Link with intent-based prefetching
 *
 * Combines Next.js route prefetching with TanStack Query data prefetching
 * for near-instant navigation. Similar to TanStack Router's preload="intent".
 *
 * How it works:
 * 1. Next.js prefetches the route JS bundle (default behavior)
 * 2. On hover intent, TanStack Query prefetches the data
 * 3. When user clicks, both route and data are already cached
 *
 * @example
 * ```tsx
 * <PrefetchLink
 *   href={`/chat/${threadId}`}
 *   prefetchQueries={[
 *     {
 *       queryKey: queryKeys.threads.detail(threadId),
 *       queryFn: () => getThreadService({ param: { id: threadId } }),
 *       staleTime: STALE_TIMES.threadDetail,
 *     },
 *   ]}
 * >
 *   View Thread
 * </PrefetchLink>
 * ```
 */
export function PrefetchLink({
  prefetchQueries,
  intentDelay = 100,
  onMouseEnter,
  onTouchStart,
  children,
  ...linkProps
}: PrefetchLinkProps) {
  const queryClient = useQueryClient();
  const intentTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasPrefetchedRef = useRef(false);

  const triggerPrefetch = useCallback(() => {
    if (hasPrefetchedRef.current || !prefetchQueries?.length) return;
    hasPrefetchedRef.current = true;

    // Prefetch all configured queries in parallel
    prefetchQueries.forEach(({ queryKey, queryFn, staleTime }) => {
      queryClient.prefetchQuery({
        queryKey,
        queryFn,
        staleTime,
      });
    });
  }, [prefetchQueries, queryClient]);

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Clear any existing timeout
      if (intentTimeoutRef.current) {
        clearTimeout(intentTimeoutRef.current);
      }

      // Start intent timer - only prefetch if user hovers for intentDelay ms
      intentTimeoutRef.current = setTimeout(triggerPrefetch, intentDelay);

      // Call original handler if provided
      onMouseEnter?.(e);
    },
    [intentDelay, triggerPrefetch, onMouseEnter],
  );

  const handleMouseLeave = useCallback(() => {
    // Cancel prefetch if user leaves before intent delay
    if (intentTimeoutRef.current) {
      clearTimeout(intentTimeoutRef.current);
      intentTimeoutRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLAnchorElement>) => {
      // On touch devices, prefetch immediately on touch
      triggerPrefetch();
      onTouchStart?.(e);
    },
    [triggerPrefetch, onTouchStart],
  );

  return (
    <Link
      {...linkProps}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
    >
      {children}
    </Link>
  );
}
