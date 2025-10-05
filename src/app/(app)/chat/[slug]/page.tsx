import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';

import { BRAND } from '@/constants';
import { ChatThreadScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getThreadBySlugService } from '@/services/api';
import { createMetadata } from '@/utils/metadata';

// Force dynamic rendering for user-specific thread data
export const dynamic = 'force-dynamic';

/**
 * Generate metadata for chat thread page
 * Private pages should not be indexed
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  return createMetadata({
    title: `Chat - ${BRAND.fullName}`,
    description: 'Collaborate with AI models in real-time conversations',
    robots: 'noindex, nofollow', // Don't index private chat pages
    url: `/chat/${slug}`,
  });
}

/**
 * Chat Thread Page - Server Component with Prefetching
 * Prefetches thread data on server for instant hydration
 */
export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  // Prefetch thread data on server for instant hydration
  // This prevents loading states and provides better UX
  await queryClient.prefetchQuery({
    queryKey: queryKeys.threads.bySlug(slug),
    queryFn: () => getThreadBySlugService(slug),
    staleTime: 10 * 1000, // 10 seconds - match client-side hook
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatThreadScreen slug={slug} />
    </HydrationBoundary>
  );
}
