import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { ChatOverviewScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { listModelsService } from '@/services/api/models';
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
 * Chat Overview Page - Server Component
 *
 * Landing page for authenticated users showing:
 * - Quick access to start new conversations
 * - Recent chat history
 * - Favorite conversations
 *
 * Prefetching Strategy (SSG-like):
 * - ✅ Models: SERVER-SIDE prefetch with includeAll=true (all models + default_model_id cached at page load)
 * - ✅ Threads: Already prefetched in layout
 * - ✅ Infinite stale time: Models cached indefinitely (no refetches)
 *
 * IMPORTANT: Models are prefetched server-side so they're immediately available
 * when the input box renders. Backend returns ALL models with tier information
 * AND the default_model_id (best accessible model from top 10 for user's tier).
 * Client components filter based on user's subscription tier and use default_model_id
 * for initial participant selection - all computed on backend, zero client requests.
 */
export default async function ChatOverviewPage() {
  const queryClient = getQueryClient();

  // ✅ SSG STRATEGY: Prefetch all models on server at page load time
  // Models are cached with infinite stale time and available immediately
  await queryClient.prefetchQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => listModelsService(),
    staleTime: STALE_TIMES.models, // Infinity - cached indefinitely
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatOverviewScreen />
    </HydrationBoundary>
  );
}
