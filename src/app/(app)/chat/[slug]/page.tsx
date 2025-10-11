import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BRAND } from '@/constants';
import { ChatThreadScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { STALE_TIMES } from '@/lib/data/stale-times';
import { getThreadBySlugService, getThreadChangelogService, listModelsService } from '@/services/api';
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
 * Chat Thread Page - OFFICIAL NEXT.JS APP ROUTER PATTERN + SSG Model Prefetching
 *
 * SERVER COMPONENT: Fetches data directly on server
 * - Thread data fetched directly (user-specific)
 * - Models prefetched with SSG strategy (static, cached indefinitely)
 * - Passes raw data as props to Client Component
 * - Client Component uses useChat with initialMessages
 *
 * SSG Strategy for Models:
 * - Models are prefetched with staleTime: Infinity
 * - Cached indefinitely across all chat threads
 * - No refetching after initial load
 * - Models available immediately on client
 *
 * This pattern follows official Next.js + AI SDK best practices:
 * https://nextjs.org/docs/app/building-your-application/rendering/server-components
 * https://sdk.vercel.ai/docs/getting-started/nextjs-app-router
 */
export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  // OFFICIAL PATTERN: Fetch data directly in Server Component
  // No QueryClient, no prefetch, no hydration - just raw data fetching
  const threadResult = await getThreadBySlugService(slug);

  // Handle error states
  if (!threadResult?.success || !threadResult.data?.thread) {
    redirect('/chat');
  }

  const { thread, participants, messages, memories } = threadResult.data;

  // Prefetch changelog using proper TanStack Query pattern
  // This populates the cache so useThreadChangelogQuery has data immediately
  await queryClient.prefetchQuery({
    queryKey: queryKeys.threads.changelog(thread.id),
    queryFn: () => getThreadChangelogService(thread.id),
    staleTime: STALE_TIMES.changelog, // 30 seconds - matches client-side query
  });

  // Prefetch all OpenRouter models (SSG strategy - cached indefinitely)
  // This ensures models are available immediately when adding participants
  await queryClient.prefetchQuery({
    queryKey: queryKeys.models.list(),
    queryFn: () => listModelsService(),
    staleTime: STALE_TIMES.models, // Infinity - never stale
  });

  // OFFICIAL PATTERN: Pass raw data as props to Client Component
  // Client Component will use useChat with initialMessages
  // Changelog is prefetched and accessed via useThreadChangelogQuery hook
  // NavigationHeader in layout will automatically show thread actions for this route
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ChatThreadScreen
        thread={thread}
        participants={participants}
        initialMessages={messages}
        memories={memories}
        slug={slug}
      />
    </HydrationBoundary>
  );
}
