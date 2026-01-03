import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { permanentRedirect, redirect } from 'next/navigation';

import { MessageRoles, ResourceUnavailableReasons } from '@/api/core/enums';
import type { ThreadDetailPayload } from '@/api/routes/chat/schema';
import { BRAND } from '@/constants/brand';
import PublicChatThreadScreen from '@/containers/screens/chat/PublicChatThreadScreen';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { getPublicThreadService } from '@/services/api';
import { createMetadata } from '@/utils';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  try {
    const response = await getPublicThreadService({ param: { slug } });

    if (!response.success || !response.data?.thread) {
      return createMetadata({
        title: `Thread Not Found - ${BRAND.fullName}`,
        description: 'This public chat thread could not be found.',
        robots: 'noindex, nofollow',
      });
    }

    const { thread, participants = [], messages = [] } = response.data;

    const firstUserMessage = messages?.find(m => m.role === MessageRoles.USER);
    const firstUserText = extractTextFromMessage(firstUserMessage);
    const description = firstUserText
      ? `${firstUserText.slice(0, 150)}${firstUserText.length > 150 ? '...' : ''}`
      : `A ${thread.mode} conversation with ${participants.length} AI ${participants.length === 1 ? 'participant' : 'participants'}.`;

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
      image: `/public/chat/${slug}/opengraph-image`,
      type: 'article',
      publishedTime: thread.createdAt ? new Date(thread.createdAt).toISOString() : undefined,
      modifiedTime: thread.updatedAt ? new Date(thread.updatedAt).toISOString() : undefined,
    });
  } catch {
    return createMetadata({
      title: `Chat Unavailable - ${BRAND.fullName}`,
      description: 'This conversation is not publicly available.',
      robots: 'noindex, nofollow',
    });
  }
}

export default async function PublicChatThreadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  try {
    // Prefetch thread data only - models load on client with loading state
    await queryClient.prefetchQuery({
      queryKey: queryKeys.threads.public(slug),
      queryFn: () => getPublicThreadService({ param: { slug } }),
      staleTime: 5 * 60 * 1000,
    });

    const cachedData = queryClient.getQueryData<{ success: true; data: ThreadDetailPayload } | { success: false }>(queryKeys.threads.public(slug));
    if (!cachedData?.success) {
      const params = new URLSearchParams({
        toast: 'failed',
        message: 'This conversation no longer exists. Create your own to get started!',
        action: 'create',
      });
      redirect(`/auth/sign-in?${params.toString()}`);
    }

    const thread = cachedData.data?.thread;
    if (thread?.isAiGeneratedTitle && thread.slug !== slug) {
      permanentRedirect(`/public/chat/${thread.slug}`);
    }
  } catch (error) {
    // Re-throw redirect errors - they must propagate to Next.js
    if (isRedirectError(error)) {
      throw error;
    }

    const isErrorObject = error && typeof error === 'object';
    const statusCode = isErrorObject && 'statusCode' in error && typeof error.statusCode === 'number'
      ? error.statusCode
      : null;
    const errorContext = isErrorObject && 'detail' in error ? error.detail : null;

    let reason = 'unavailable';
    if (errorContext && typeof errorContext === 'object' && 'unavailabilityReason' in errorContext) {
      const unavailabilityReason = errorContext.unavailabilityReason;
      if (typeof unavailabilityReason === 'string') {
        reason = unavailabilityReason;
      }
    }

    let message = 'This conversation is no longer available.';
    let action = 'create';

    if (statusCode === 410) {
      if (reason === ResourceUnavailableReasons.DELETED) {
        message = 'This conversation was deleted by its owner. Create your own to get started!';
        action = 'create';
      } else if (reason === ResourceUnavailableReasons.ARCHIVED) {
        message = 'This conversation has been archived and is no longer publicly available.';
        action = 'signin';
      } else if (reason === ResourceUnavailableReasons.PRIVATE) {
        message = 'This conversation is now private. Sign in if you own it, or create your own!';
        action = 'signin';
      }
    } else if (statusCode === 404) {
      message = 'This conversation doesn\'t exist. Create your own to get started!';
      action = 'create';
    }

    const params = new URLSearchParams({
      toast: 'info',
      message,
      action,
      from: `/public/chat/${slug}`,
    });

    redirect(`/auth/sign-in?${params.toString()}`);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PublicChatThreadScreen slug={slug} />
    </HydrationBoundary>
  );
}

// ISR: revalidate every 5 minutes for public threads
// Public threads are read-only for viewers, rarely change, and popular ones benefit from caching
export const revalidate = 300;

// Enable on-demand ISR - slugs are user-generated and not known at build time
export const dynamicParams = true;

// Empty static params enables ISR mode for dynamic routes
export function generateStaticParams() {
  return [];
}
