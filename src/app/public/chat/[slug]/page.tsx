import { dehydrate, HydrationBoundary } from '@tanstack/react-query';
import type { Metadata } from 'next';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { permanentRedirect, redirect } from 'next/navigation';

import { MessageRoles, ResourceUnavailableReasons } from '@/api/core/enums';
import { BRAND } from '@/constants';
import PublicChatThreadScreen from '@/containers/screens/chat/PublicChatThreadScreen';
import { getCachedPublicThreadForMetadata } from '@/lib/cache/thread-cache';
import { getQueryClient } from '@/lib/data/query-client';
import { queryKeys } from '@/lib/data/query-keys';
import { extractTextFromMessage } from '@/lib/schemas/message-schemas';
import { listPublicThreadSlugsService } from '@/services/api';
import { createMetadata } from '@/utils';

export const revalidate = 86400;

// Pre-generate pages for all active public threads at build time
// Uses RPC service - no direct database access in pages
export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const response = await listPublicThreadSlugsService();
    if (!response.success || !response.data?.slugs) {
      return [];
    }
    return response.data.slugs;
  } catch (error) {
    console.error('[generateStaticParams] Failed to fetch public thread slugs:', error);
    return [];
  }
}

type PageParams = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;

  try {
    const response = await getCachedPublicThreadForMetadata(slug);

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

    const participantRoles = participants
      .map(p => p.role)
      .filter((role): role is string => typeof role === 'string' && role.length > 0);

    const keywords = [
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
      // Let Next.js auto-detect opengraph-image.tsx - don't pass explicit image path
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

type ErrorDetails = {
  statusCode?: number;
  detail?: {
    unavailabilityReason?: string;
  };
};

function isErrorDetails(error: unknown): error is ErrorDetails {
  return (
    error !== null
    && typeof error === 'object'
    && ('statusCode' in error || 'detail' in error)
  );
}

function getErrorMessage(statusCode: number | undefined, reason: string): { message: string; action: string } {
  if (statusCode === 410) {
    switch (reason) {
      case ResourceUnavailableReasons.DELETED:
        return {
          message: 'This conversation was deleted by its owner. Create your own to get started!',
          action: 'create',
        };
      case ResourceUnavailableReasons.ARCHIVED:
        return {
          message: 'This conversation has been archived and is no longer publicly available.',
          action: 'signin',
        };
      case ResourceUnavailableReasons.PRIVATE:
        return {
          message: 'This conversation is now private. Sign in if you own it, or create your own!',
          action: 'signin',
        };
      default:
        return {
          message: 'This conversation is no longer available.',
          action: 'create',
        };
    }
  }

  if (statusCode === 404) {
    return {
      message: 'This conversation doesn\'t exist. Create your own to get started!',
      action: 'create',
    };
  }

  return {
    message: 'This conversation is no longer available.',
    action: 'create',
  };
}

export default async function PublicChatThreadPage({ params }: PageParams) {
  const { slug } = await params;
  const queryClient = getQueryClient();

  try {
    const response = await getCachedPublicThreadForMetadata(slug);

    queryClient.setQueryData(queryKeys.threads.public(slug), response);

    if (!response.success) {
      const searchParams = new URLSearchParams({
        toast: 'failed',
        message: 'This conversation no longer exists. Create your own to get started!',
        action: 'create',
      });
      redirect(`/auth/sign-in?${searchParams.toString()}`);
    }

    const thread = response.data?.thread;
    if (thread?.isAiGeneratedTitle && thread.slug !== slug) {
      permanentRedirect(`/public/chat/${thread.slug}`);
    }
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    const errorDetails = isErrorDetails(error) ? error : undefined;
    const statusCode = errorDetails?.statusCode;
    const reason = errorDetails?.detail?.unavailabilityReason ?? 'unavailable';

    const { message, action } = getErrorMessage(statusCode, reason);

    const searchParams = new URLSearchParams({
      toast: 'info',
      message,
      action,
      from: `/public/chat/${slug}`,
    });

    redirect(`/auth/sign-in?${searchParams.toString()}`);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PublicChatThreadScreen slug={slug} />
    </HydrationBoundary>
  );
}
