import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { BRAND } from '@/constants';
import { ChatThreadScreen } from '@/containers/screens/chat';
import { getThreadBySlugService, getThreadChangelogService } from '@/services/api';
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
 * Chat Thread Page - OFFICIAL NEXT.JS APP ROUTER PATTERN
 *
 * SERVER COMPONENT: Fetches data directly on server
 * - No TanStack Query hydration (prevents hydration mismatches)
 * - Passes raw data as props to Client Component
 * - Client Component uses useChat with initialMessages
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

  // OFFICIAL PATTERN: Fetch data directly in Server Component
  // No QueryClient, no prefetch, no hydration - just raw data fetching
  const threadResult = await getThreadBySlugService(slug);

  // Handle error states
  if (!threadResult?.success || !threadResult.data?.thread) {
    redirect('/chat');
  }

  const { thread, participants, messages, memories } = threadResult.data;

  // Fetch changelog for configuration changes
  const changelogResult = await getThreadChangelogService(thread.id);
  const changelog = changelogResult?.success ? changelogResult.data.changelog : [];

  // OFFICIAL PATTERN: Pass raw data as props to Client Component
  // Client Component will use useChat with initialMessages
  // NavigationHeader in layout will automatically show thread actions for this route
  return (
    <ChatThreadScreen
      thread={thread}
      participants={participants}
      initialMessages={messages}
      memories={memories}
      changelog={changelog}
      slug={slug}
    />
  );
}
