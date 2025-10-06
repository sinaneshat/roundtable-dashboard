import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { BRAND } from '@/constants';
import { PublicChatThreadScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { getPublicThreadService } from '@/services/api';
import { createMetadata } from '@/utils/metadata';

// ============================================================================
// ISR Configuration - Daily Revalidation
// ============================================================================

/**
 * ISR Configuration
 * - Revalidates every 24 hours (86400 seconds)
 * - Can be revalidated on-demand via revalidatePath('/public/chat/[slug]')
 * - Uses R2 cache with regional cache for optimal performance
 */
export const revalidate = 86400; // 24 hours

/**
 * Generate metadata for public chat thread page
 * Includes dynamic OG images and SEO optimization
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    // Fetch thread data for metadata generation
    const response = await getPublicThreadService(slug);

    if (!response.success || !response.data?.thread) {
      return createMetadata({
        title: `Thread Not Found - ${BRAND.fullName}`,
        description: 'This public chat thread could not be found.',
        robots: 'noindex, nofollow',
      });
    }

    const { thread, participants = [], messages = [] } = response.data;

    // Generate description from first user message or thread title
    const firstUserMessage = messages?.find(m => m.role === 'user');
    const description = firstUserMessage?.content
      ? `${firstUserMessage.content.slice(0, 150)}${firstUserMessage.content.length > 150 ? '...' : ''}`
      : `A ${thread.mode} conversation with ${participants.length} AI ${participants.length === 1 ? 'participant' : 'participants'}.`;

    // Extract keywords from thread title, mode, and participant roles
    const keywords: string[] = [
      thread.mode,
      'AI chat',
      'conversation',
      ...(participants?.map(p => p.role).filter(Boolean) as string[] || []),
    ];

    return createMetadata({
      title: `${thread.title} - ${BRAND.fullName}`,
      description,
      keywords,
      // Dynamic OG image with thread content
      image: `/public/chat/${slug}/opengraph-image`,
      type: 'article',
    });
  } catch (error) {
    // Handle errors gracefully
    console.error('Error generating metadata for public thread:', error);
    return createMetadata({
      title: `Public Chat - ${BRAND.fullName}`,
      description: 'View this public AI chat conversation.',
    });
  }
}

/**
 * Public Chat Thread Page - Server Component with ISR
 * Prefetches public thread data on server for instant hydration
 * No authentication required - publicly accessible
 */
export default async function PublicChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  try {
    // Prefetch public thread data on server for instant hydration
    await queryClient.prefetchQuery({
      queryKey: queryKeys.threads.public(slug),
      queryFn: () => getPublicThreadService(slug),
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

    // Verify the thread exists and is public before rendering
    const cachedData = queryClient.getQueryData(queryKeys.threads.public(slug));
    if (!cachedData || typeof cachedData !== 'object' || !('success' in cachedData) || !cachedData.success) {
      notFound();
    }

    return (
      <HydrationBoundary state={dehydrate(queryClient)}>
        <PublicChatThreadScreen slug={slug} />
      </HydrationBoundary>
    );
  } catch (error) {
    // If fetching fails, show 404
    console.error('Error fetching public thread:', error);
    notFound();
  }
}

/**
 * Generate static params for build-time generation
 * This will be populated with public threads at build time
 * New public threads will be generated on-demand via ISR
 */
export async function generateStaticParams() {
  // For now, return empty array - threads will be generated on-demand
  // In the future, you could fetch all public threads from the API
  return [];
}
