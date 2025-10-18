'use client';

import type { UIMessage } from 'ai';
import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { ConfigurationChangesGroup } from '@/components/chat/configuration-changes-group';
import { ModelMessageCard } from '@/components/chat/model-message-card';
import { Button } from '@/components/ui/button';
import { BRAND } from '@/constants';
import { usePublicThreadQuery } from '@/hooks/queries/chat-threads';
import { useModelsQuery } from '@/hooks/queries/models';
import { getAvatarPropsFromModelId } from '@/lib/utils/ai-display';
import { chatMessagesToUIMessages, getMessageMetadata } from '@/lib/utils/message-transforms';
import type { GetPublicThreadResponse } from '@/services/api/chat-threads';

// ✅ RPC-INFERRED TYPE: Extract Changelog from public thread response
type Changelog = NonNullable<Extract<GetPublicThreadResponse, { success: true }>['data']>['changelog'][number];

/**
 * Public Chat Thread Screen - Client Component
 * Read-only view of publicly shared chat threads (no authentication required)
 * Reuses the exact same components as ChatThreadScreen for consistency
 * Does not show sidebar, chat input, memories, or editing capabilities
 */
export default function PublicChatThreadScreen({ slug }: { slug: string }) {
  const t = useTranslations();
  const tPublic = useTranslations('chat.public');

  // Fetch public thread details by slug (no authentication required)
  const { data: threadData, isLoading: isLoadingThread, error: threadError } = usePublicThreadQuery(slug);
  const threadResponse = threadData?.success ? threadData.data : null;
  const thread = threadResponse?.thread || null;

  // ✅ SINGLE SOURCE OF TRUTH: Fetch models from backend
  const { data: modelsData } = useModelsQuery();
  const allModels = modelsData?.data?.items || [];

  // Memoize derived data to prevent unnecessary re-renders
  const serverMessages = useMemo(() => threadResponse?.messages || [], [threadResponse]);
  const changelog = useMemo(() => threadResponse?.changelog || [], [threadResponse]);

  // Thread owner information (available for future use, e.g., displaying author credits)
  const user = useMemo(() => threadResponse?.user, [threadResponse]);

  // Convert server messages to AI SDK format using the same helper as ChatThreadScreen
  // API returns dates as strings, chatMessagesToUIMessages handles both Date and string
  const messages: UIMessage[] = useMemo(() => chatMessagesToUIMessages(serverMessages), [serverMessages]);

  // ✅ EVENT-BASED ROUND TRACKING: Group by roundNumber (same as ChatThreadScreen)
  // Display order for each round:
  // 1. Changelog (if exists) - shows what changed BEFORE this round
  // 2. Messages - user message + participant responses
  const timeline = useMemo(() => {
    const items: Array<
      | { type: 'messages'; data: UIMessage[]; key: string; roundNumber: number }
      | { type: 'changelog'; data: Changelog[]; key: string; roundNumber: number }
    > = [];

    // Group messages by roundNumber
    const messagesByRound = new Map<number, UIMessage[]>();
    messages.forEach((message) => {
      const metadata = getMessageMetadata(message.metadata);
      const roundNumber = metadata?.roundNumber || 1;

      if (!messagesByRound.has(roundNumber)) {
        messagesByRound.set(roundNumber, []);
      }
      messagesByRound.get(roundNumber)!.push(message);
    });

    // Group changelog by roundNumber
    const changelogByRound = new Map<number, Changelog[]>();
    changelog.forEach((change) => {
      const roundNumber = change.roundNumber || 1;

      if (!changelogByRound.has(roundNumber)) {
        changelogByRound.set(roundNumber, []);
      }
      changelogByRound.get(roundNumber)!.push(change);
    });

    // Get all unique round numbers from messages
    const sortedRounds = Array.from(messagesByRound.keys()).sort((a, b) => a - b);

    sortedRounds.forEach((roundNumber) => {
      const roundMessages = messagesByRound.get(roundNumber)!;
      const roundChangelog = changelogByRound.get(roundNumber);

      // 1. Add changelog BEFORE round messages (shows what changed)
      if (roundChangelog && roundChangelog.length > 0) {
        items.push({
          type: 'changelog',
          data: roundChangelog,
          key: `round-${roundNumber}-changelog`,
          roundNumber,
        });
      }

      // 2. Add messages for this round
      items.push({
        type: 'messages',
        data: roundMessages,
        key: `round-${roundNumber}-messages`,
        roundNumber,
      });
    });

    return items;
  }, [messages, changelog]);

  // Show loading state
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

  // Show error state
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

  // Check if thread is actually public
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

  // UTM tracking for sign-up conversions
  const signUpUrl = `/auth/sign-up?utm_source=public_chat&utm_medium=cta&utm_campaign=thread_${thread.slug}&utm_content=inline`;

  return (
    <div className="relative flex flex-1 flex-col min-h-0 h-full">
      {/* ✅ AI Elements Conversation - Same pattern as ChatThreadScreen */}
      <Conversation className="flex-1">
        <ConversationContent className="w-full max-w-full sm:max-w-3xl lg:max-w-4xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 pt-20 pb-32 space-y-4">
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
                  {/* ✅ ROUND-BASED RENDERING: Changelog → Messages (same as ChatThreadScreen) */}
                  {timeline.map((item) => {
                    // Render changelog before round
                    if (item.type === 'changelog') {
                      return (
                        <div key={item.key} className="mb-6 space-y-4">
                          {item.data.map(change => (
                            <ConfigurationChangesGroup
                              key={change.id}
                              group={{
                                timestamp: new Date(change.createdAt),
                                changes: [change],
                              }}
                            />
                          ))}
                        </div>
                      );
                    }

                    // Render messages for this round
                    return (
                      <div key={item.key} className="space-y-4">
                        {item.data.map((message) => {
                          if (message.role === 'user') {
                            // ✅ User message with proper name and avatar from backend
                            return (
                              <Message from="user" key={message.id}>
                                <MessageContent>
                                  {message.parts.map((part, partIndex) => {
                                    if (part.type === 'text') {
                                      return (
                                        <Response key={`${message.id}-${partIndex}`}>
                                          {part.text}
                                        </Response>
                                      );
                                    }
                                    return null;
                                  })}
                                </MessageContent>
                                <MessageAvatar
                                  src={user?.image || ''}
                                  name={user?.name || t('user.defaultName')}
                                />
                              </Message>
                            );
                          }
                          // ✅ Assistant message: Extract participant data from message metadata (same as ChatThreadScreen)
                          // CRITICAL: Use stored model/role from metadata (NOT current participants)
                          const metadata = getMessageMetadata(message.metadata);
                          const participantIndex = metadata?.participantIndex;
                          const storedModelId = metadata?.model; // ✅ Matches DB schema
                          const storedRole = metadata?.role; // ✅ Matches DB schema

                          // ✅ CRITICAL: Use stored modelId directly for avatar (independent of current participants)
                          const avatarProps = getAvatarPropsFromModelId(
                            message.role === 'system' ? 'assistant' : message.role,
                            storedModelId,
                          );

                          // Use stored modelId from metadata, not current participants array
                          const model = storedModelId ? allModels.find(m => m.id === storedModelId) : undefined;

                          // ✅ IMPROVED ERROR HANDLING: Continue rendering even if model not found
                          // ModelMessageCard now handles undefined models with fallbacks
                          if (!model) {
                            console.warn('[PublicChatThreadScreen] Rendering message with missing model:', {
                              messageId: message.id,
                              storedModelId,
                              participantIndex,
                            });
                            // Continue rendering with placeholder - don't skip the message
                          }

                          const hasError = message.metadata && typeof message.metadata === 'object' && 'error' in message.metadata;

                          const messageStatus: 'thinking' | 'streaming' | 'completed' | 'error' = hasError
                            ? 'error'
                            : 'completed'; // Public threads only show completed messages

                          // Filter message parts to only text and reasoning (ModelMessageCard types)
                          const filteredParts = message.parts.filter(
                            (p): p is { type: 'text'; text: string } | { type: 'reasoning'; text: string } =>
                              p.type === 'text' || p.type === 'reasoning',
                          );

                          return (
                            <ModelMessageCard
                              key={message.id}
                              messageId={message.id}
                              model={model}
                              role={storedRole || ''} // ✅ Use stored role from metadata
                              participantIndex={participantIndex ?? 0}
                              status={messageStatus}
                              parts={filteredParts}
                              avatarSrc={avatarProps.src}
                              avatarName={avatarProps.name}
                            />
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Inline CTA Card */}
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
        </ConversationContent>
        <ConversationScrollButton aria-label={t('chat.actions.scrollToBottom')} />
      </Conversation>
    </div>
  );
}
