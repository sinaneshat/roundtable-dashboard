import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { getOptionalAuth } from '@/app/auth/actions';
import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getProductsService, listModelsService } from '@/services/api';

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
 * - Uses same ChatLayoutShell for consistent UI
 */
export default async function PricingLayout({ children }: PricingLayoutProps) {
  const queryClient = getQueryClient();

  // Optional auth - show different UI for logged in users
  const session = await getOptionalAuth();

  // Prefetch products and models for pricing page
  try {
    await Promise.all([
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
    ]);
  } catch (error) {
    console.error('[PricingLayout] Prefetch failed:', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatLayoutShell session={session}>
        {children}
      </ChatLayoutShell>
    </HydrationBoundary>
  );
}
