import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { getCachedPublicModels } from '@/lib/cache/models-cache';
import { getCachedProducts } from '@/lib/cache/products-cache';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';

// ISR: 24 hours (matches products and models cache duration)
// Both use public API clients (no cookies) so SSG/ISR is safe
export const revalidate = 86400;

type PricingLayoutProps = {
  children: React.ReactNode;
};

/**
 * Pricing Layout - ISR with 24h revalidation
 * - Products cached for 24 hours via unstable_cache (SSG-like)
 * - Models cached for 24 hours via unstable_cache (SSG-like)
 * - Both use public API clients (no cookies) for SSG/ISR compatibility
 */
export default async function PricingLayout({ children }: PricingLayoutProps) {
  const queryClient = getQueryClient();

  // Prefetch products and models with server-side caching
  try {
    await Promise.all([
      queryClient.prefetchQuery({
        queryKey: queryKeys.products.list(),
        queryFn: getCachedProducts,
        staleTime: Infinity,
      }),
      // Models for pricing comparison - SSG-like caching (24h)
      queryClient.prefetchQuery({
        queryKey: queryKeys.models.list(),
        queryFn: getCachedPublicModels,
        staleTime: Infinity,
      }),
    ]);
  } catch (error) {
    console.error('[PricingLayout] Prefetch failed:', error);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatLayoutShell>
        {children}
      </ChatLayoutShell>
    </HydrationBoundary>
  );
}
