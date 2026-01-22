import { ComponentVariants, ErrorBoundaryContexts } from '@roundtable/shared';
import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';

import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { Icons } from '@/components/icons';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GlowingEffect } from '@/components/ui/glowing-effect';
import { usePublicThreadQuery } from '@/hooks/queries';
import type { TimelineItem } from '@/hooks/utils';
import { useChatScroll, useThreadTimeline } from '@/hooks/utils';
import { useTranslations } from '@/lib/i18n';
import { chatMessagesToUIMessages, transformChatParticipants, transformPreSearches } from '@/lib/utils';
import type { PublicThreadData, StoredPreSearch } from '@/services/api';

// ============================================================================
// NO LONGER PUBLIC VIEW - Blurred mock chat with overlay message
// ============================================================================

function NoLongerPublicView() {
  const t = useTranslations();

  return (
    <div className="flex flex-col min-h-dvh relative">
      <div className="container max-w-4xl mx-auto px-5 md:px-6 pt-16 sm:pt-20 pb-16 relative">
        {/* Blurred mock chat background */}
        <div className="blur-sm pointer-events-none select-none" aria-hidden="true">
          {/* Mock user message */}
          <div className="flex gap-3 mb-6">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-primary/10 text-primary text-xs">U</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="text-sm font-medium text-foreground/80">User</div>
              <Card className="p-4 bg-muted/30">
                <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </Card>
            </div>
          </div>

          {/* Mock AI response 1 */}
          <div className="flex gap-3 mb-6">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-blue-500/10 text-blue-500 text-xs">AI</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="text-sm font-medium text-foreground/80">Claude</div>
              <Card className="p-4 bg-card">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </Card>
            </div>
          </div>

          {/* Mock AI response 2 */}
          <div className="flex gap-3 mb-6">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-green-500/10 text-green-500 text-xs">AI</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="text-sm font-medium text-foreground/80">GPT-4</div>
              <Card className="p-4 bg-card">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                  <div className="h-4 bg-muted rounded w-3/4" />
                </div>
              </Card>
            </div>
          </div>

          {/* Mock moderator summary */}
          <div className="flex gap-3">
            <Avatar className="size-8 shrink-0">
              <AvatarFallback className="bg-purple-500/10 text-purple-500 text-xs">M</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <div className="text-sm font-medium text-foreground/80">Moderator</div>
              <Card className="p-4 bg-purple-500/5 border-purple-500/20">
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                </div>
              </Card>
            </div>
          </div>
        </div>

        {/* Overlay message */}
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
          <div className="text-center space-y-4 max-w-md mx-auto px-4">
            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto">
              <Icons.eyeOff className="w-8 h-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold">{t('chat.public.noLongerPublic')}</h1>
              <p className="text-muted-foreground">
                {t('chat.public.noLongerPublicDescription')}
              </p>
            </div>
            <Button asChild variant={ComponentVariants.DEFAULT}>
              <Link to="/">{t('actions.goHome')}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Error states for public thread loading */
type PublicThreadErrorState = 'not_found' | 'no_longer_public' | null;

type PublicChatThreadScreenProps = {
  slug: string;
  initialData?: PublicThreadData | null;
  errorState?: PublicThreadErrorState;
};

export default function PublicChatThreadScreen({ slug, initialData, errorState }: PublicChatThreadScreenProps) {
  const t = useTranslations();

  // ✅ HOOKS MUST BE CALLED UNCONDITIONALLY - before any early returns
  // This follows React's rules of hooks
  const hasLoaderData = Boolean(initialData);
  const { data: queryData } = usePublicThreadQuery(slug, {
    initialData: hasLoaderData && initialData
      ? { success: true as const, data: initialData }
      : undefined,
    staleTime: hasLoaderData ? 10_000 : undefined,
    // Disable query when we already know it's an error state
    enabled: errorState !== 'no_longer_public',
  });

  // Prefer query data (which includes initialData), fall back to loader data
  const threadResponse = queryData?.success ? queryData.data : initialData;
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

  // ✅ NOW we can do early returns AFTER all hooks have been called
  // GRACEFUL ERROR: Thread was made private - show blurred mock chat
  if (errorState === 'no_longer_public') {
    return <NoLongerPublicView />;
  }

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
            <h1 className="text-2xl font-bold">{t('chat.public.threadNotFound')}</h1>
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
            <h1 className="text-2xl font-bold">{t('chat.public.privateChat')}</h1>
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
          <h1 className="sr-only">{thread.title || t('chat.public.sharedConversation')}</h1>
          {timeline.length === 0
            ? (
                <div className="flex items-center justify-center min-h-[50vh]">
                  <div className="text-center space-y-4 max-w-md px-4">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                      <Icons.sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-base sm:text-lg font-semibold">{t('chat.public.noMessagesYet')}</h2>
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
                            to="/auth/sign-in"
                            search={{ utm_source: 'public_chat', utm_medium: 'bottom_cta', utm_campaign: 'try_free' }}
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
