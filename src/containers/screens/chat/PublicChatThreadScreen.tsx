'use client';

import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { FeedbackType } from '@/api/core/enums';
import type { ChatParticipant, RoundFeedbackData, StoredPreSearch } from '@/api/routes/chat/schema';
import { ThreadTimeline } from '@/components/chat/thread-timeline';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/constants';
import { usePublicThreadQuery } from '@/hooks/queries';
import type { TimelineItem } from '@/hooks/utils';
import { useChatScroll, useThreadTimeline } from '@/hooks/utils';
import { chatMessagesToUIMessages, transformPreSearches } from '@/lib/utils';

export default function PublicChatThreadScreen({ slug }: { slug: string }) {
  const t = useTranslations();
  const tPublic = useTranslations('chat.public');

  const { data: threadData, isLoading: isLoadingThread, error: threadError } = usePublicThreadQuery(slug);
  const threadResponse = threadData?.success ? threadData.data : null;
  const thread = threadResponse?.thread || null;

  const serverMessages = useMemo(() => threadResponse?.messages || [], [threadResponse]);
  const changelog = useMemo(() => threadResponse?.changelog || [], [threadResponse]);
  const rawFeedback = useMemo(() => threadResponse?.feedback || [], [threadResponse]);
  const user = useMemo(() => threadResponse?.user, [threadResponse]);
  const rawParticipants = useMemo(() => threadResponse?.participants || [], [threadResponse]);

  const messages = useMemo(() => chatMessagesToUIMessages(serverMessages), [serverMessages]);

  // Transform participants - convert string dates to Date objects
  const participants = useMemo(() => rawParticipants.map((p: Omit<ChatParticipant, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt: string }) => ({
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  })), [rawParticipants]);

  // ✅ TEXT STREAMING: Moderator messages stored as chatMessage entries with metadata.isModerator: true
  // Moderator messages appear in messages array and are rendered inline by ChatMessageList

  // ✅ PUBLIC PAGE FIX: Include pre-searches for web search display
  // ✅ SINGLE SOURCE OF TRUTH: Use transformPreSearches for type-safe date conversion
  const preSearches: StoredPreSearch[] = useMemo(
    () => transformPreSearches(threadResponse?.preSearches || []),
    [threadResponse],
  );

  // Build feedback map for quick lookup - transform dates
  const feedbackByRound = useMemo(() => {
    const map = new Map<number, FeedbackType>();
    rawFeedback?.forEach((fb: RoundFeedbackData) => {
      if (fb.feedbackType) {
        map.set(fb.roundNumber, fb.feedbackType);
      }
    });
    return map;
  }, [rawFeedback]);

  const timeline: TimelineItem[] = useThreadTimeline({
    messages,
    changelog,
    preSearches,
  });

  // Scroll management - minimal hook for tracking scroll position
  // Initial scroll and virtualization handled by useVirtualizedTimeline
  const isStoreReady = !isLoadingThread && messages.length > 0;

  useChatScroll({
    messages,
    enableNearBottomDetection: true,
  });

  if (isLoadingThread) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">{tPublic('loadingPublicChat')}</p>
        </div>
      </div>
    );
  }

  if (threadError || !thread) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4 max-w-md mx-auto px-4">
          <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <Lock className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{t('chat.public.threadNotFound')}</h2>
            <p className="text-muted-foreground">
              {t('chat.public.threadNotFoundDescription')}
            </p>
          </div>
          <Button variant="default" onClick={() => window.location.href = '/'}>
            {t('actions.goHome')}
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
            <Lock className="w-8 h-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">{tPublic('privateChat')}</h2>
            <p className="text-muted-foreground">
              {tPublic('privateChatDescription')}
            </p>
          </div>
          <Button variant="default" onClick={() => window.location.href = '/'}>
            {tPublic('goHome')}
          </Button>
        </div>
      </div>
    );
  }

  const signUpUrl = `/auth/sign-up?utm_source=public_chat&utm_medium=cta&utm_campaign=thread_${thread.slug}&utm_content=inline`;

  return (
    <div className="flex flex-col min-h-dvh relative">
      <UnifiedErrorBoundary context="chat">
        <div
          id="public-chat-scroll-container"
          className="container max-w-3xl mx-auto px-3 sm:px-4 md:px-6 pt-16 sm:pt-20 pb-24 sm:pb-32"
        >
          {timeline.length === 0
            ? (
                <div className="flex items-center justify-center min-h-[50vh]">
                  <div className="text-center space-y-4 max-w-md px-4">
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                      <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
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
                    feedbackByRound={feedbackByRound}
                    isReadOnly={true}
                    preSearches={preSearches}
                    isDataReady={isStoreReady}
                  />

                  <div className="mt-12 sm:mt-16 mb-6 sm:mb-8">
                    <div className="rounded-2xl sm:rounded-xl border bg-gradient-to-br from-primary/5 via-primary/3 to-background p-6 sm:p-8 md:p-10 text-center space-y-4 sm:space-y-6">
                      <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-primary/10 mb-1 sm:mb-2">
                        <Sparkles className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                      </div>
                      <div className="space-y-2 sm:space-y-3">
                        <h3 className="text-xl sm:text-2xl md:text-3xl font-bold">
                          {tPublic('tryRoundtable')}
                        </h3>
                        <p className="text-sm sm:text-base text-muted-foreground max-w-xl mx-auto">
                          {tPublic('experiencePower')}
                          {' '}
                          {BRAND.displayName}
                          {' '}
                          {tPublic('description')}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2 sm:pt-4">
                        <Button
                          size="lg"
                          onClick={() => window.location.href = signUpUrl}
                          className="gap-2 w-full sm:w-auto text-sm sm:text-base px-6 sm:px-8 touch-manipulation active:scale-95"
                        >
                          {tPublic('tryRoundtable')}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => window.location.href = '/?utm_source=public_chat&utm_medium=cta&utm_campaign=learn_more'}
                          className="w-full sm:w-auto text-sm sm:text-base px-6 sm:px-8 touch-manipulation active:scale-95"
                        >
                          {tPublic('learnMore')}
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
