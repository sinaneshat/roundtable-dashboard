import { ComponentVariants, ErrorBoundaryContexts } from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { usePublicThreadQuery } from '@/hooks/queries';
import type { TimelineItem } from '@/hooks/utils';
import { useChatScroll, useThreadTimeline } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { chatMessagesToUIMessages, transformChatParticipants, transformPreSearches } from '@/lib/utils';
import type { PublicThreadData, StoredPreSearch } from '@/services/api';

type PublicChatThreadScreenProps = {
  slug: string;
  initialData?: PublicThreadData | null;
};

export default function PublicChatThreadScreen({ slug, initialData }: PublicChatThreadScreenProps) {
  const t = useTranslations();

  // SSR HYDRATION: Data is prefetched in route loader, available immediately via React Query cache
  // The route's pendingComponent (PublicChatSkeleton) handles loading states
  // We rely on React Query's cache having data from the loader's prefetchQuery
  const { data: threadData } = usePublicThreadQuery(slug);
  const queryResponse = threadData?.success ? threadData.data : null;

  // Prefer SSR props (passed from route), fallback to React Query cached data
  const threadResponse = initialData || queryResponse;
  const thread = threadResponse?.thread || null;

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

  // Data is ready when we have messages from SSR or React Query cache
  const isStoreReady = messages.length > 0;

  useChatScroll({
    messages,
    enableNearBottomDetection: true,
  });

  // No inline skeleton needed - route's pendingComponent handles loading
  // If we reach here without thread data, show error state (not loading)
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
            <Link to="/">{t('actions.goHome')}</Link>
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
            <Link to="/">{t('chat.public.goHome')}</Link>
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
                    <div className="relative rounded-2xl border-2 border-border/30 p-2 shadow-lg">
                      <GlowingEffect
                        blur={0}
                        borderWidth={2}
                        spread={80}
                        glow={true}
                        disabled={false}
                        proximity={64}
                        inactiveZone={0.01}
                      />
                      <div className="relative rounded-xl border border-border/30 bg-background/50 backdrop-blur-sm p-8 dark:shadow-[0px_0px_27px_0px_#2D2D2D] text-center">
                        <Icons.sparkles className="size-6 text-primary mx-auto mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          {t('chat.public.ctaHeadline')}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                          {t('chat.public.ctaDescription')}
                        </p>
                        <Button asChild>
                          <Link
                            to="/auth/sign-up?utm_source=public_chat&utm_medium=bottom_cta&utm_campaign=try_free"
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
