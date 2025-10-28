'use client';

import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { Actions } from '@/components/ai-elements/actions';
import { ChatMessageList } from '@/components/chat/chat-message-list';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { RoundAnalysisCard } from '@/components/chat/moderator/round-analysis-card';
import { RoundFeedback } from '@/components/chat/round-feedback';
import { UnifiedErrorBoundary } from '@/components/chat/unified-error-boundary';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/constants';
import { usePublicThreadQuery } from '@/hooks/queries/chat';
import type { TimelineItem } from '@/hooks/utils';
import { useThreadTimeline } from '@/hooks/utils';
import { messageHasError, MessageMetadataSchema } from '@/lib/schemas/message-metadata';
import { chatMessagesToUIMessages } from '@/lib/utils/message-transforms';
import { getRoundNumberFromMetadata } from '@/lib/utils/round-utils';

export default function PublicChatThreadScreen({ slug }: { slug: string }) {
  const t = useTranslations();
  const tPublic = useTranslations('chat.public');

  const { data: threadData, isLoading: isLoadingThread, error: threadError } = usePublicThreadQuery(slug);
  const threadResponse = threadData?.success ? threadData.data : null;
  const thread = threadResponse?.thread || null;

  const serverMessages = useMemo(() => threadResponse?.messages || [], [threadResponse]);
  const changelog = useMemo(() => threadResponse?.changelog || [], [threadResponse]);
  const rawAnalyses = useMemo(() => threadResponse?.analyses || [], [threadResponse]);
  const rawFeedback = useMemo(() => threadResponse?.feedback || [], [threadResponse]);
  const user = useMemo(() => threadResponse?.user, [threadResponse]);
  const rawParticipants = useMemo(() => threadResponse?.participants || [], [threadResponse]);

  const messages = useMemo(() => chatMessagesToUIMessages(serverMessages), [serverMessages]);

  // Transform participants - convert string dates to Date objects
  const participants = useMemo(() => rawParticipants.map((p: any) => ({
    ...p,
    createdAt: new Date(p.createdAt),
    updatedAt: new Date(p.updatedAt),
  })), [rawParticipants]);

  // Use analyses as-is from backend (already has correct shape)
  const analyses = useMemo(() => rawAnalyses, [rawAnalyses]);

  // Build feedback map for quick lookup
  const feedbackByRound = useMemo(() => {
    const map = new Map<number, 'like' | 'dislike'>();
    rawFeedback.forEach((fb: any) => {
      if (fb.feedbackType) {
        map.set(fb.roundNumber, fb.feedbackType);
      }
    });
    return map;
  }, [rawFeedback]);

  // ✅ Timeline with analyses
  const timeline: TimelineItem[] = useThreadTimeline({
    messages,
    changelog,
    analyses,
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
    <div className="relative flex flex-1 flex-col min-h-0 h-full">
      <UnifiedErrorBoundary context="chat">
        <div className="flex flex-col min-h-screen relative">
          <div className="container max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-32 flex-1">
            {timeline.length === 0
              ? (
                  <div className="flex items-center justify-center min-h-[50vh]">
                    <div className="text-center space-y-4 max-w-md">
                      <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
                        <Sparkles className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold">{t('chat.public.noMessagesYet')}</h3>
                        <p className="text-sm text-muted-foreground">
                          {t('chat.public.noMessagesDescription')}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              : (
                  <>
                    {timeline.map((item, itemIndex) => {
                      if (!item)
                        return null;
                      const roundNumber = item.type === 'messages'
                        ? getRoundNumberFromMetadata(item.data[0]?.metadata, 1)
                        : item.type === 'analysis'
                          ? item.data.roundNumber
                          : item.type === 'changelog'
                            ? item.data[0]?.roundNumber ?? 1
                            : 1;
                      return (
                        <div key={item.key}>
                          {item.type === 'changelog' && item.data.length > 0 && (
                            <div className="mb-6">
                              <UnifiedErrorBoundary context="configuration">
                                <ConfigurationChangesGroup
                                  group={{
                                    timestamp: new Date(item.data[0]!.createdAt),
                                    changes: item.data,
                                  }}
                                />
                              </UnifiedErrorBoundary>
                            </div>
                          )}
                          {item.type === 'messages' && (
                            <div className="space-y-3 pb-2">
                              <UnifiedErrorBoundary context="message-list">
                                <ChatMessageList
                                  messages={item.data}
                                  user={user || { name: t('user.defaultName'), image: null }}
                                  participants={participants}
                                  isStreaming={false}
                                  currentParticipantIndex={0}
                                  currentStreamingParticipant={null}
                                />
                              </UnifiedErrorBoundary>
                              {(() => {
                                const hasRoundError = item.data.some((msg) => {
                                  const parseResult = MessageMetadataSchema.safeParse(msg.metadata);
                                  return parseResult.success && messageHasError(parseResult.data);
                                });

                                return (
                                  <Actions className="mt-3 mb-2">
                                    {!hasRoundError && (
                                      <RoundFeedback
                                        key={`feedback-${thread.id}-${roundNumber}`}
                                        threadId={thread.id}
                                        roundNumber={roundNumber}
                                        currentFeedback={feedbackByRound.get(roundNumber) ?? null}
                                        onFeedbackChange={() => {}} // View-only: no-op
                                        disabled={true} // Always disabled for public view
                                        isPending={false}
                                        pendingType={null}
                                      />
                                    )}
                                  </Actions>
                                );
                              })()}
                            </div>
                          )}
                          {item.type === 'analysis' && (
                            <div className="mt-6 mb-4">
                              <RoundAnalysisCard
                                analysis={item.data}
                                threadId={thread.id}
                                isLatest={itemIndex === timeline.length - 1}
                                streamingRoundNumber={null}
                                onStreamStart={() => {}} // View-only: no streaming
                                onStreamComplete={() => {}} // View-only: no streaming
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <div className="mt-16 mb-8">
                      <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-primary/3 to-background p-8 sm:p-10 text-center space-y-6">
                        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
                          <Sparkles className="w-7 h-7 text-primary" />
                        </div>
                        <div className="space-y-3">
                          <h3 className="text-2xl sm:text-3xl font-bold">
                            {tPublic('tryRoundtable')}
                          </h3>
                          <p className="text-muted-foreground max-w-xl mx-auto text-base">
                            {tPublic('experiencePower')}
                            {' '}
                            {BRAND.displayName}
                            {' '}
                            {tPublic('description')}
                          </p>
                        </div>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                          <Button
                            size="lg"
                            onClick={() => window.location.href = signUpUrl}
                            className="gap-2 w-full sm:w-auto text-base px-8"
                          >
                            {tPublic('tryRoundtable')}
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="lg"
                            onClick={() => window.location.href = '/?utm_source=public_chat&utm_medium=cta&utm_campaign=learn_more'}
                            className="w-full sm:w-auto text-base px-8"
                          >
                            {tPublic('learnMore')}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
          </div>
        </div>
      </UnifiedErrorBoundary>
    </div>
  );
}
