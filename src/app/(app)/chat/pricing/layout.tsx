import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';

// Force dynamic rendering - products API not available at build time
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
  await queryClient.prefetchQuery({
    queryKey: queryKeys.products.list(),
    queryFn: getProductsService,
    staleTime: Infinity,
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatLayoutShell>
        {children}
      </ChatLayoutShell>
    </HydrationBoundary>
  );
}
