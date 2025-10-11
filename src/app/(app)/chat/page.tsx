import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { ChatOverviewScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { listModelsService } from '@/services/api';
import { createMetadata } from '@/utils/metadata';

/**
 * Generate metadata for chat overview page
 */
export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Dashboard - ${BRAND.fullName}`,
    description: 'Start a new AI conversation or continue your existing chats with multiple AI models collaborating together.',
    robots: 'noindex, nofollow', // Private dashboard - don't index
    keywords: [
      'AI dashboard',
      'chat overview',
      'AI conversations',
      'collaborative AI',
      'multiple AI models',
    ],
  });
}

/**
 * Chat Overview Page - Server Component with SSG Prefetching
 *
 * Landing page for authenticated users showing:
 * - Quick access to start new conversations
 * - Recent chat history
 * - Favorite conversations
 *
 * Prefetching Strategy:
 * - Models: Prefetched at BUILD TIME (SSG), cached indefinitely
 * - Memories: Already prefetched in layout (no duplicate needed)
 * - Threads: Already prefetched in layout (no duplicate needed)
 */
export default async function ChatOverviewPage() {
  const queryClient = getQueryClient();

  // Prefetch all OpenRouter models at BUILD TIME (SSG)
  // This data is baked into the HTML during build
  // Same model data served to all users, cached indefinitely
  await queryClient.prefetchQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => listModelsService(),
    staleTime: STALE_TIMES.models, // Infinity - never stale
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatOverviewScreen />
    </HydrationBoundary>
  );
}
