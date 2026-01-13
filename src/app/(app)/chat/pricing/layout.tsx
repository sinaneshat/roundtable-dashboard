import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
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

  // ✅ PERF: Fire-and-forget prefetches - don't block rendering
  // Prefetches populate the cache for instant client hydration
  // But we don't await them - let the page render immediately
  void Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.products.list(),
      queryFn: getProductsService,
      staleTime: STALE_TIMES.products,
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.models.list(),
      queryFn: () => listModelsService(),
      staleTime: STALE_TIMES.models,
    }),
    // Prefetch subscriptions for authenticated users
    ...(session?.user
      ? [
          queryClient.prefetchQuery({
            queryKey: queryKeys.subscriptions.list(),
            queryFn: () => getSubscriptionsService(),
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
