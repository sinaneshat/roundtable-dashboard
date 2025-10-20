import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants/brand';
import { ChatOverviewScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { createMetadata } from '@/utils/metadata';

/**
 * Generate metadata for chat overview page
 */
export async function generateMetadata(): Promise<Metadata> {
  return createMetadata({
    title: `Dashboard - ${BRAND.fullName}`,
    description: 'Start a new AI conversation or continue your existing chats with multiple AI models collaborating together.',
    robots: 'noindex, nofollow', // Private dashboard - don't index
    url: '/chat',
    canonicalUrl: '/chat',
    image: '/chat/opengraph-image',
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
 * Prefetching Strategy:
 * - ✅ Models: Already prefetched in layout (chat-layout.tsx)
 * - ✅ Threads: Already prefetched in layout
 * - ✅ Usage stats: Already prefetched in layout
 * - ✅ Subscriptions: Already prefetched in layout
 *
 * All critical data is pre-fetched at the layout level, eliminating
 * all client-side loading states for optimal user experience.
 */
export default async function ChatOverviewPage() {
  const queryClient = getQueryClient();

  // ✅ OPTIMIZATION: All data already pre-fetched at layout level
  // No additional pre-fetching needed here

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatOverviewScreen />
    </HydrationBoundary>
  );
}
