import { ComponentVariants, ErrorBoundaryContexts } from '@roundtable/shared';
import { useMemo } from 'react';

import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { usePublicThreadQuery } from '@/hooks/queries';
import type { TimelineItem } from '@/hooks/utils';
import { useChatScroll, useThreadTimeline } from '@/hooks/utils';
import { Link, useTranslations } from '@/lib/compat';
import { chatMessagesToUIMessages, transformChatParticipants, transformPreSearches } from '@/lib/utils';
import type { GetPublicThreadResponse } from '@/services/api';
import type { StoredPreSearch } from '@/types/api';

type PublicThreadData = Extract<GetPublicThreadResponse, { success: true }>['data'];

type PublicChatThreadScreenProps = {
  slug: string;
  /** SSR data passed directly - ensures immediate render without hydration flash */
  initialData?: PublicThreadData | null;
};

export default function PublicChatThreadScreen({ slug, initialData }: PublicChatThreadScreenProps) {
  const t = useTranslations();

  // SSR HYDRATION: Use initialData from props first, fallback to React Query
  const { data: threadData, isPending } = usePublicThreadQuery(slug);
  const queryResponse = threadData?.success ? threadData.data : null;

  // Prefer SSR props, fallback to React Query data
  const threadResponse = initialData || queryResponse;
  const thread = threadResponse?.thread || null;

  // Only show pending if we have no data at all (neither SSR nor React Query)
  const isActuallyPending = isPending && !initialData;

  const serverMessages = useMemo(() => threadResponse?.messages || [], [threadResponse]);
  const changelog = useMemo(() => threadResponse?.changelog || [], [threadResponse]);
  const user = threadResponse?.user;
  const rawParticipants = useMemo(() => threadResponse?.participants || [], [threadResponse]);

  const messages = useMemo(() => chatMessagesToUIMessages(serverMessages), [serverMessages]);
  const participants = useMemo(() => transformChatParticipants(rawParticipants), [rawParticipants]);

  const preSearches: StoredPreSearch[] = useMemo(() =>
    transformPreSearches(threadResponse?.preSearches || []), [threadResponse]);

  const timeline: TimelineItem[] = useThreadTimeline({
    messages,
    changelog,
    preSearches,
  });

  // Data is ready when we have SSR props or React Query data
  const isStoreReady = !isActuallyPending && messages.length > 0;

  useChatScroll({
    messages,
    enableNearBottomDetection: true,
  });

  // Show loading skeleton only when truly pending (no SSR data AND no React Query data)
  if (isActuallyPending) {
    // Use the skeleton component inline since we're already inside the screen component
    return (
      <div className="flex flex-col min-h-dvh relative">
        <div className="container max-w-4xl mx-auto px-5 md:px-6 pt-16 sm:pt-20 pb-16">
          {/* Header skeleton */}
          <div className="mb-8 space-y-4">
            <div className="h-8 w-3/4 max-w-md rounded-md bg-muted/50 animate-pulse" />
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-full bg-muted/50 animate-pulse" />
              <div className="h-4 w-32 rounded bg-muted/50 animate-pulse" />
            </div>
          </div>

          {/* Message skeletons */}
          <div className="space-y-6">
            {/* User message */}
            <div className="flex justify-end">
              <div className="max-w-[80%] space-y-2">
                <div className="h-16 w-64 rounded-2xl bg-muted/50 animate-pulse" />
              </div>
            </div>

            {/* AI responses */}
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-3">
                <div className="size-8 rounded-full shrink-0 bg-muted/50 animate-pulse" />
                <div className="flex-1 space-y-3">
                  <div className="h-4 w-24 rounded bg-muted/50 animate-pulse" />
                  <div className="space-y-2">
                    <div className="h-4 w-full rounded bg-muted/50 animate-pulse" />
                    <div className="h-4 w-5/6 rounded bg-muted/50 animate-pulse" />
                    <div className="h-4 w-3/4 rounded bg-muted/50 animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Error cases are handled by the server page (redirects to sign-in)
  if (!thread) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <Icons.lock className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{t('chat.public.threadNotFound')}</h2>
            <p className="text-muted-foreground">
              {t('chat.public.threadNotFoundDescription')}
            </p>
          </div>
          <Button asChild variant={ComponentVariants.DEFAULT}>
            <Link href="/">{t('actions.goHome')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!thread.isPublic) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <Icons.lock className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{t('chat.public.privateChat')}</h2>
            <p className="text-muted-foreground">
              {t('chat.public.privateChatDescription')}
            </p>
          </div>
          <Button asChild variant={ComponentVariants.DEFAULT}>
            <Link href="/">{t('chat.public.goHome')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh relative">
      <UnifiedErrorBoundary context={ErrorBoundaryContexts.CHAT}>
        <div
          id="public-chat-scroll-container"
          className="container max-w-4xl mx-auto px-5 md:px-6 pt-16 sm:pt-20 pb-16"
        >
          {timeline.length === 0
            ? (
                <div className="flex items-center justify-center min-h-[50vh]">
                  <div className="text-center space-y-4 max-w-md px-4">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                      <Icons.sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base sm:text-lg font-semibold">{t('chat.public.noMessagesYet')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('chat.public.noMessagesDescription')}
                      </p>
                    </div>
                  </div>
                </div>
              )
            : (
                <>
                  <ThreadTimeline
                    timelineItems={timeline}
                    user={user || { name: t('user.defaultName'), image: null }}
                    participants={participants}
                    threadId={thread.id}
                    threadTitle={thread.title}
                    isReadOnly={true}
                    preSearches={preSearches}
                    isDataReady={isStoreReady}
                    disableVirtualization={true}
                    skipEntranceAnimations={true}
                  />

                  <div className="mt-8 mb-8">
                    <div className="relative rounded-2xl border-2 border-white/20 dark:border-white/10 p-2 shadow-lg">
                      <GlowingEffect
                        blur={0}
                        borderWidth={2}
                        spread={80}
                        glow={true}
                        disabled={false}
                        proximity={64}
                        inactiveZone={0.01}
                      />
                      <div className="relative rounded-xl border border-white/20 dark:border-white/10 bg-background/50 backdrop-blur-sm p-8 dark:shadow-[0px_0px_27px_0px_#2D2D2D] text-center">
                        <Icons.sparkles className="size-6 text-primary mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          {t('chat.public.ctaHeadline')}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                          {t('chat.public.ctaDescription')}
                        </p>
                        <Button asChild>
                          <Link
                            href="/auth/sign-up?utm_source=public_chat&utm_medium=bottom_cta&utm_campaign=try_free"
                            className="flex items-center gap-2"
                          >
                            <span>{t('chat.public.getStartedFree')}</span>
                            <Icons.arrowRight className="size-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
        </div>
      </UnifiedErrorBoundary>
    </div>
  );
}
