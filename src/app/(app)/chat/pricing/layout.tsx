import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type React from 'react';

import { ChatLayoutShell } from '@/components/layouts/chat-layout-shell';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getProductsService } from '@/services/api';

type PricingLayoutProps = {
  children: React.ReactNode;
};

/**
 * Pricing Layout - Public SSG
 * Same ChatLayoutShell as protected routes but NO auth required
 * Products prefetched at build time for SSG
 */
export default async function PricingLayout({ children }: PricingLayoutProps) {
  const queryClient = getQueryClient();

  // Prefetch products at build time (SSG)
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
