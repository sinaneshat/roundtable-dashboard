import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';

// Force dynamic to prevent build-time API calls
export const dynamic = 'force-dynamic';

type PricingLayoutProps = {
  children: React.ReactNode;
};

/**
 * Pricing Layout - Dynamic with SSR prefetch
 * Same ChatLayoutShell as protected routes but NO auth required
 * Products prefetched at request time for fast hydration
 */
export default async function PricingLayout({ children }: PricingLayoutProps) {
  const queryClient = getQueryClient();

  // Prefetch products at request time (SSR)
  // Wrapped in try-catch to prevent Server Component failures in OpenNext preview
  try {
    await queryClient.prefetchQuery({
      queryKey: queryKeys.products.list(),
      queryFn: getProductsService,
      staleTime: Infinity,
    });
  } catch (error) {
    // Log but don't crash - client will refetch on hydration
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
