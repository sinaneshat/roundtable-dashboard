'use client';

import { ArrowRight, Lock, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import {
  Conversation,
  ConversationContent,
} from '@/components/ai-elements/conversation';
import { Message, MessageAvatar, MessageContent } from '@/components/ai-elements/message';
import { Response } from '@/components/ai-elements/response';
import { Logo } from '@/components/logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { BRAND } from '@/constants';
import { usePublicThreadQuery } from '@/hooks/queries/chat-threads';
import { serverMessagesToUIMessages } from '@/lib/ai/message-helpers';
import { getModelById } from '@/lib/ai/models-config';
import { cn } from '@/lib/ui/cn';
import { glassBadge } from '@/lib/ui/glassmorphism';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get avatar props for a participant based on model configuration
 * Falls back to user avatar for user messages
 */
function getAvatarProps(role: 'user' | 'assistant', participants: Array<{ id: string; modelId: string }>, participantId?: string | null) {
  if (role === 'user') {
    return {
      src: '/static/icons/user-avatar.png',
      name: 'User',
    };
  }

  // For assistant messages, find the participant by ID and get model info
  if (participantId) {
    const participant = participants.find(p => p.id === participantId);
    if (participant) {
      const model = getModelById(participant.modelId);
      if (model) {
        return {
          src: model.metadata.icon || '/static/icons/ai-models/default.png',
          name: model.name,
        };
      }
    }
  }

  // Fallback for assistant messages without participant info
  return {
    src: '/static/icons/ai-models/default.png',
    name: 'AI',
  };
}

/**
 * Public Chat Thread Screen - Client Component
 * Read-only view of publicly shared chat threads (no authentication required)
 * Now using AI Elements components
 * Does not show sidebar, chat input, or editing capabilities
 */
export default function PublicChatThreadScreen({ slug }: { slug: string }) {
  const t = useTranslations();

  // Fetch public thread details by slug (no authentication required)
  const { data: threadData, isLoading: isLoadingThread, error: threadError } = usePublicThreadQuery(slug);
  const threadResponse = threadData?.success ? threadData.data : null;
  const thread = threadResponse?.thread || null;

  // Memoize derived data to prevent unnecessary re-renders
  const rawParticipants = useMemo(() => threadResponse?.participants || [], [threadResponse]);
  const serverMessages = useMemo(() => threadResponse?.messages || [], [threadResponse]);

  // Convert server messages to AI SDK format using helper, preserving participantId
  const messages = useMemo(() => serverMessagesToUIMessages(serverMessages).map((msg, index) => ({
    ...msg,
    participantId: serverMessages[index]?.participantId,
  })), [serverMessages]);

  // Show loading state
  if (isLoadingThread) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Loading public chat...</p>
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
            <h2 className="text-2xl font-bold">Private Chat</h2>
            <p className="text-muted-foreground">
              This chat is private and cannot be viewed publicly.
            </p>
          </div>
          <Button variant="default" onClick={() => window.location.href = '/'}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  // UTM tracking for sign-up conversions
  const signUpUrl = `/auth/sign-up?utm_source=public_chat&utm_medium=cta&utm_campaign=thread_${thread.slug}&utm_content=inline`;

  return (
    <div className="relative h-full w-full bg-background">
      {/* Elegant Header with Glass Participant Chips */}
      <div className="sticky top-0 left-0 right-0 z-40 border-b bg-background/95 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-3 sm:px-4 md:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            {/* Title */}
            <h1 className="text-base sm:text-lg font-semibold leading-tight line-clamp-2 flex-1">
              {thread.title}
            </h1>

            {/* Logo - Clickable */}
            <button
              type="button"
              onClick={() => window.location.href = signUpUrl}
              className="flex-shrink-0 hover:opacity-80 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
              aria-label="Try Roundtable"
            >
              <Logo size="sm" variant="icon" />
            </button>
          </div>

          {/* AI Participants - Horizontal Scroll with shadcn ScrollArea */}
          <ScrollArea className="w-full">
            <div className="flex items-center gap-2 pb-2">
              {rawParticipants
                .sort((a, b) => a.priority - b.priority)
                .map((participant) => {
                  const model = getModelById(participant.modelId);
                  if (!model)
                    return null;

                  return (
                    <div
                      key={participant.id}
                      className={cn(
                        glassBadge,
                        'flex items-center gap-1.5 rounded-full px-2.5 py-1 flex-shrink-0',
                      )}
                    >
                      <Avatar className="size-4">
                        <AvatarImage src={model.metadata.icon} alt={model.name} />
                        <AvatarFallback className="text-[8px]">
                          {model.name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-[10px] font-medium text-foreground/90 whitespace-nowrap">
                        {model.name.split(' ').slice(0, 2).join(' ')}
                      </span>
                      {participant.role && (
                        <>
                          <span className="text-[8px] text-foreground/50">•</span>
                          <span className="text-[10px] text-foreground/70 whitespace-nowrap">
                            {participant.role}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}

              {/* Mode Badge */}
              <div className={cn(
                glassBadge,
                'flex items-center gap-1 rounded-full px-2.5 py-1 flex-shrink-0',
              )}
              >
                <Sparkles className="w-3 h-3 text-foreground/70" />
                <span className="text-[10px] font-medium text-foreground/80 capitalize whitespace-nowrap">
                  {thread.mode}
                </span>
              </div>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </div>
      </div>

      {/* Messages Area using AI Elements */}
      <ScrollArea className="h-[calc(100vh-140px)]">
        <div className="mx-auto max-w-4xl px-3 sm:px-4 md:px-6 py-6 sm:py-8">
          {messages.length === 0
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
                  <Conversation>
                    <ConversationContent>
                      {messages.map((message) => {
                        // Get avatar props based on role and participant info
                        const avatarProps = getAvatarProps(message.role, rawParticipants, message.participantId);

                        return (
                          <Message key={message.id} from={message.role}>
                            <MessageContent>
                              {message.parts.map((part, partIndex) => {
                                if (part.type === 'text') {
                                  return (
                                    <Response key={`${message.id}-part-${partIndex}`}>
                                      {part.text}
                                    </Response>
                                  );
                                }
                                return null;
                              })}
                            </MessageContent>
                            <MessageAvatar src={avatarProps.src} name={avatarProps.name} />
                          </Message>
                        );
                      })}
                    </ConversationContent>
                  </Conversation>

                  {/* Inline CTA Card */}
                  <div className="mt-16 mb-8">
                    <div className="rounded-xl border bg-gradient-to-br from-primary/5 via-primary/3 to-background p-8 sm:p-10 text-center space-y-6">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
                        <Sparkles className="w-7 h-7 text-primary" />
                      </div>
                      <div className="space-y-3">
                        <h3 className="text-2xl sm:text-3xl font-bold">
                          {t('chat.public.tryRoundtable')}
                        </h3>
                        <p className="text-muted-foreground max-w-xl mx-auto text-base">
                          Experience the power of multi-AI collaboration.
                          {' '}
                          {BRAND.name}
                          {' '}
                          {t('chat.public.description')}
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                        <Button
                          size="lg"
                          onClick={() => window.location.href = signUpUrl}
                          className="gap-2 w-full sm:w-auto text-base px-8"
                        >
                          {t('chat.public.tryRoundtable')}
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="lg"
                          onClick={() => window.location.href = '/?utm_source=public_chat&utm_medium=cta&utm_campaign=learn_more'}
                          className="w-full sm:w-auto text-base px-8"
                        >
                          {t('chat.public.learnMore')}
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
        </div>
      </ScrollArea>
    </div>
  );
}
