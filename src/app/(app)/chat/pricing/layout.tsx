import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import { headers } from 'next/headers';
import type React from 'react';

import { getOptionalAuth } from '@/app/auth/actions';
import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { ChatLayoutProviders } from '@/components/providers';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getProductsService, getSubscriptionsService, listModelsService } from '@/services/api';

type PricingLayoutProps = {
  children: React.ReactNode;
};

/**
 * Pricing Layout - Public Access (ISR enabled)
 *
 * Separate layout for /chat/pricing that:
 * - Doesn't require authentication
 * - Enables static generation with ISR
 * - Prefetches products for instant load
 * - Prefetches subscriptions for authenticated users
 * - Uses same ChatLayoutShell for consistent UI
 */
export default async function PricingLayout({ children }: PricingLayoutProps) {
  const queryClient = getQueryClient();

  // Optional auth - show different UI for logged in users
  const session = await getOptionalAuth();

  // ✅ CRITICAL: Capture cookies SYNCHRONOUSLY before fire-and-forget prefetches
  // headers() is request-scoped and may not be available in async contexts
  // Without this, prefetches would fail with 401 as the request context is lost
  const headersList = await headers();
  const cookieHeader = headersList.get('cookie') || '';

  // ✅ PERF: Fire-and-forget prefetches - don't block rendering
  // Prefetches populate the cache for instant client hydration
  // But we don't await them - let the page render immediately
  // Pass pre-captured cookieHeader to ensure auth works in async context
  void Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.products.list(),
      queryFn: getProductsService,
      staleTime: STALE_TIMES.products,
    }),
    queryClient.prefetchQuery({
      // eslint-disable-next-line @tanstack/query/exhaustive-deps -- cookieHeader is auth context, not cache identity
      queryKey: queryKeys.models.list(),
      queryFn: () => listModelsService({ cookieHeader }),
      staleTime: STALE_TIMES.models,
    }),
    // Prefetch subscriptions for authenticated users
    ...(session?.user
      ? [
          queryClient.prefetchQuery({
            // eslint-disable-next-line @tanstack/query/exhaustive-deps -- cookieHeader is auth context, not cache identity
            queryKey: queryKeys.subscriptions.list(),
            queryFn: () => getSubscriptionsService({ cookieHeader }),
            staleTime: STALE_TIMES.subscriptions,
          }),
        ]
      : []),
  ]).catch(() => {
    // Silently fail - client will refetch if needed
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatLayoutProviders>
        <ChatLayoutShell session={session}>
          {children}
        </ChatLayoutShell>
      </ChatLayoutProviders>
    </HydrationBoundary>
  );
}
