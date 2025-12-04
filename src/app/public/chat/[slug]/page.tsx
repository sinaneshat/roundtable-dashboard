import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { permanentRedirect, redirect } from 'next/navigation';

import { MessageRoles } from '@/api/core/enums';
import { BRAND } from '@/constants';
import { PublicChatThreadScreen } from '@/containers/screens/chat';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
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
    const response = await getPublicThreadService({ param: { slug } });

    if (!response.success || !response.data?.thread) {
      return createMetadata({
        title: `Thread Not Found - ${BRAND.fullName}`,
        description: 'This public chat thread could not be found.',
        robots: 'noindex, nofollow',
      });
    }

    const { thread, participants = [], messages = [] } = response.data;

    // Generate description from first user message or thread title
    const firstUserMessage = messages?.find(m => m.role === MessageRoles.USER);
    const firstUserText = extractTextFromMessage(firstUserMessage);
    const description = firstUserText
      ? `${firstUserText.slice(0, 150)}${firstUserText.length > 150 ? '...' : ''}`
      : `A ${thread.mode} conversation with ${participants.length} AI ${participants.length === 1 ? 'participant' : 'participants'}.`;

    // Extract keywords from thread title, mode, and participant roles
    const participantRoles = participants?.map(p => p.role).filter((role): role is string => typeof role === 'string' && role.length > 0) ?? [];
    const keywords: string[] = [
      thread.mode,
      'AI chat',
      'conversation',
      ...participantRoles,
    ];

    return createMetadata({
      title: `${thread.title} - ${BRAND.fullName}`,
      description,
      keywords,
      url: `/public/chat/${slug}`,
      canonicalUrl: `/public/chat/${slug}`,
      // Dynamic OG image with thread content
      image: `/public/chat/${slug}/opengraph-image`,
      type: 'article',
      publishedTime: thread.createdAt ? new Date(thread.createdAt).toISOString() : undefined,
      modifiedTime: thread.updatedAt ? new Date(thread.updatedAt).toISOString() : undefined,
    });
  } catch {
    // Silently handle errors gracefully - expected for private/deleted threads
    // The page component will handle the error and show appropriate message
    // Don't log here as it clutters logs for expected error cases (410/404)
    return createMetadata({
      title: `Chat Unavailable - ${BRAND.fullName}`,
      description: 'This conversation is not publicly available.',
      robots: 'noindex, nofollow', // Don't index unavailable threads
    });
  }
}

/**
 * Public Chat Thread Page - Server Component with ISR
 * Handles unavailable threads with SEO-friendly redirects and user-friendly messages
 * No authentication required - publicly accessible
 */
export default async function PublicChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  // ✅ Data fetching and validation in try/catch
  try {
    // Prefetch public thread data on server for instant hydration
    await queryClient.prefetchQuery({
      queryKey: queryKeys.threads.public(slug),
      queryFn: () => getPublicThreadService({ param: { slug } }),
      staleTime: 5 * 60 * 1000, // 5 minutes
    });

    // Verify the thread exists and is public before rendering
    const cachedData = queryClient.getQueryData(queryKeys.threads.public(slug));
    if (!cachedData || typeof cachedData !== 'object' || !('success' in cachedData) || !cachedData.success) {
      // SEO-friendly 404: Thread doesn't exist
      const params = new URLSearchParams({
        toast: 'failed',
        message: 'This conversation no longer exists. Create your own to get started!',
        action: 'create',
      });
      redirect(`/auth/sign-in?${params.toString()}`);
    }

    // ✅ BACKWARDS COMPATIBLE SLUGS: 301 redirect from old slug to new AI-generated slug
    // If user accesses via previousSlug (original non-AI slug), permanently redirect to current slug
    // This ensures SEO-friendly URLs and prevents duplicate content issues
    const threadData = cachedData as { success: boolean; data?: { thread?: { slug: string; isAiGeneratedTitle: boolean } } };
    const thread = threadData.data?.thread;
    if (thread?.isAiGeneratedTitle && thread.slug !== slug) {
      permanentRedirect(`/public/chat/${thread.slug}`);
    }
  } catch (error: unknown) {
    // Type-safe error handling using proper narrowing
    const isErrorObject = error && typeof error === 'object';
    const statusCode = isErrorObject && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : null;
    const errorContext = isErrorObject && 'detail' in error ? error.detail : null;

    // Extract reason from error context
    let reason = 'unavailable';
    if (errorContext && typeof errorContext === 'object' && 'unavailabilityReason' in errorContext) {
      const unavailabilityReason = errorContext.unavailabilityReason;
      if (typeof unavailabilityReason === 'string') {
        reason = unavailabilityReason;
      }
    }

    // Determine user-friendly message based on error type
    let message = 'This conversation is no longer available.';
    let action = 'create';

    if (statusCode === 410) {
      // HTTP 410 Gone - Thread existed but is no longer available
      if (reason === 'deleted') {
        message = 'This conversation was deleted by its owner. Create your own to get started!';
        action = 'create';
      } else if (reason === 'archived') {
        message = 'This conversation has been archived and is no longer publicly available.';
        action = 'signin';
      } else if (reason === 'private') {
        message = 'This conversation is now private. Sign in if you own it, or create your own!';
        action = 'signin';
      }
    } else if (statusCode === 404) {
      // HTTP 404 Not Found - Thread never existed
      message = 'This conversation doesn\'t exist. Create your own to get started!';
      action = 'create';
    }

    // SEO-friendly redirect with toast message
    const params = new URLSearchParams({
      toast: 'info',
      message,
      action,
      from: `/public/chat/${slug}`,
    });

    redirect(`/auth/sign-in?${params.toString()}`);
  }

  // ✅ Render JSX outside try/catch to follow React best practices
  // React doesn't immediately render components, so errors wouldn't be caught by try/catch anyway
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PublicChatThreadScreen slug={slug} />
    </HydrationBoundary>
  );
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
