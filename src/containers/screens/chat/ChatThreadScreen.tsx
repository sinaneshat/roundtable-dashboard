'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { CopyIcon, Globe, Link2, Loader2, Lock, RefreshCcwIcon, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { Action, Actions } from '@/components/ai-elements/actions';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Loader } from '@/components/ai-elements/loader';
import { Message, MessageContent } from '@/components/ai-elements/message';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input';
import { Response } from '@/components/ai-elements/response';
import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatMemoriesList } from '@/components/chat/chat-memories-list';
import { ChatParticipantsList, ParticipantsPreview } from '@/components/chat/chat-participants-list';
import { ChatShareDialog } from '@/components/chat/chat-share-dialog';
import { useBreadcrumb } from '@/components/chat/use-breadcrumb';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadBySlugQuery } from '@/hooks/queries/chat-threads';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getChatModeOptions, getDefaultChatMode } from '@/lib/config/chat-modes';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';
import { chatGlass } from '@/lib/ui/glassmorphism';

// ============================================================================
// Types
// ============================================================================

export type ThreadParticipant = {
  id: string;
  threadId: string;
  modelId: string;
  role: string | null;
  customRoleId: string | null;
  priority: number;
  createdAt: string;
};

/**
 * Chat Thread Screen - Client Component
 * Main screen for displaying and interacting with a chat thread
 * Now using AI Elements components from Vercel AI SDK
 */
export default function ChatThreadScreen({ slug }: { slug: string }) {
  const t = useTranslations();
  const router = useRouter();

  // Fetch thread details by slug
  const { data: threadData, isLoading: isLoadingThread, error: threadError } = useThreadBySlugQuery(slug);
  const threadResponse = threadData?.success ? threadData.data : null;
  const thread = threadResponse?.thread || null;
  const rawParticipants = threadResponse?.participants || [];
  const serverMessages = threadResponse?.messages || [];

  // Convert participants
  const participants: ThreadParticipant[] = rawParticipants.map(p => ({
    id: p.id,
    threadId: p.threadId,
    modelId: p.modelId,
    role: p.role,
    customRoleId: null,
    priority: p.priority,
    createdAt: p.createdAt,
  }));

  // Loading state
  if (isLoadingThread) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-2">
          <div className="size-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-muted-foreground text-sm">{t('actions.loading')}</div>
        </div>
      </div>
    );
  }

  // Error state
  if (threadError || !thread) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4 max-w-md px-6">
          <div className="text-destructive">
            <svg
              className="size-16 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold">{t('chat.threadNotFound')}</h2>
          <p className="text-muted-foreground">{t('chat.threadNotFoundDescription')}</p>
          <Button onClick={() => router.push('/chat')}>
            {t('actions.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <ChatThreadContent
      key={slug}
      thread={thread}
      participants={participants}
      serverMessages={serverMessages}
      slug={slug}
    />
  );
}

// ============================================================================
// Chat Thread Content Component
// ============================================================================

function ChatThreadContent({
  thread,
  participants,
  serverMessages,
  slug,
}: {
  thread: NonNullable<ReturnType<typeof useThreadBySlugQuery>['data']>['data']['thread'];
  participants: ThreadParticipant[];
  serverMessages: NonNullable<ReturnType<typeof useThreadBySlugQuery>['data']>['data']['messages'];
  slug: string;
}) {
  const t = useTranslations();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const { setDynamicBreadcrumb } = useBreadcrumb();

  // Convert serverMessages to AI SDK format
  const initialMessages = serverMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }],
    metadata: msg.metadata,
  }));

  // Mutations
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();

  // Configuration state
  const [currentMode, setCurrentMode] = useState<ChatModeId>(() => (thread?.mode as ChatModeId) || getDefaultChatMode());
  const [currentParticipants, setCurrentParticipants] = useState<ParticipantConfig[]>(() =>
    participants
      .sort((a, b) => a.priority - b.priority)
      .map(p => ({
        id: p.id,
        modelId: p.modelId,
        role: p.role || '',
        customRoleId: p.customRoleId || undefined,
        order: p.priority,
      })),
  );
  const [currentMemoryIds, setCurrentMemoryIds] = useState<string[]>([]);

  // Edit dialog state

  // AI SDK useChat hook
  const {
    messages,
    status,
    regenerate,
    sendMessage,
  } = useChat({
    id: thread.id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/v1/chat/threads/${thread.id}/stream`,
    }),
  });

  // Mutation handlers
  const handleToggleFavorite = useCallback(() => {
    const newFavoriteStatus = !thread?.isFavorite;
    toggleFavoriteMutation.mutate(
      { threadId: thread.id, isFavorite: newFavoriteStatus, slug },
      {
        onSuccess: () => {},
        onError: () => {
          toastManager.error(
            t('chat.favoriteFailed'),
            t('chat.favoriteFailedDescription'),
          );
        },
      },
    );
  }, [thread.id, thread.isFavorite, slug, t, toggleFavoriteMutation]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  const handleTogglePublic = useCallback(() => {
    const newPublicStatus = !thread?.isPublic;
    togglePublicMutation.mutate(
      { threadId: thread.id, isPublic: newPublicStatus, slug },
      {
        onSuccess: () => {},
        onError: () => {
          toastManager.error(
            t('chat.publicToggleFailed'),
            t('chat.publicToggleFailedDescription'),
          );
        },
      },
    );
  }, [thread.id, thread.isPublic, slug, t, togglePublicMutation]);

  const handleCopyLink = useCallback(async () => {
    const shareUrl = `${window.location.origin}/public/chat/${slug}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      toastManager.error(t('chat.copyFailed'), t('chat.copyFailedDescription'));
    }
  }, [slug, t]);

  // Message actions
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
  }, []);

  const handleRegenerateMessage = useCallback(() => {
    regenerate();
  }, [regenerate]);

  // Submit handler for AI Elements PromptInput
  const handleSubmit = useCallback((message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    sendMessage(
      {
        text: message.text || 'Sent with attachments',
        files: message.files,
      },
      {
        body: {
          mode: currentMode,
          participants: currentParticipants.map((p, idx) => ({
            modelId: p.modelId,
            role: p.role || null,
            customRoleId: p.customRoleId || undefined,
            order: p.order ?? idx,
          })),
          memoryIds: currentMemoryIds,
          participantIndex: 0,
        },
      },
    );
  }, [sendMessage, currentMode, currentParticipants, currentMemoryIds]);

  const chatModeOptions = getChatModeOptions();

  // Set breadcrumb
  useEffect(() => {
    setDynamicBreadcrumb({
      title: thread.title,
      parent: '/chat',
      actions: (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleToggleFavorite}
            disabled={toggleFavoriteMutation.isPending}
            className="size-8"
            title={thread.isFavorite ? t('chat.removeFromFavorites') : t('chat.addToFavorites')}
          >
            {toggleFavoriteMutation.isPending
              ? (
                  <Loader2 className="size-4 animate-spin" />
                )
              : (
                  <Star
                    className={cn(
                      'size-4 transition-colors',
                      thread.isFavorite && 'fill-yellow-500 text-yellow-500',
                    )}
                  />
                )}
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleTogglePublic}
            disabled={togglePublicMutation.isPending}
            className="size-8"
            title={thread.isPublic ? t('chat.makePrivate') : t('chat.makePublic')}
          >
            {togglePublicMutation.isPending
              ? (
                  <Loader2 className="size-4 animate-spin" />
                )
              : thread.isPublic
                ? (
                    <Lock className="size-4" />
                  )
                : (
                    <Globe className="size-4" />
                  )}
          </Button>

          {thread.isPublic && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopyLink}
              className="size-8 text-muted-foreground hover:text-foreground"
              title={t('chat.copyLink')}
            >
              <Link2 className="size-4" />
            </Button>
          )}

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDeleteClick}
            className="size-8 text-muted-foreground hover:text-destructive"
            title={t('chat.deleteThread')}
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      ),
    });

    return () => {
      setDynamicBreadcrumb(null);
    };
  }, [thread.title, thread.isFavorite, thread.isPublic, handleToggleFavorite, handleTogglePublic, handleCopyLink, handleDeleteClick, setDynamicBreadcrumb, t, toggleFavoriteMutation.isPending, togglePublicMutation.isPending]);

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full h-screen">
      <div className="flex flex-col h-full">
        <Conversation className="h-full">
          <ConversationContent>
            {messages.map(message => (
              <div key={message.id}>
                <Message from={message.role}>
                  <MessageContent>
                    {message.parts.map((part, i) => {
                      if (part.type === 'text') {
                        return (
                          <Response key={`${message.id}-${i}`}>
                            {part.text}
                          </Response>
                        );
                      }
                      return null;
                    })}
                  </MessageContent>
                </Message>
                {message.role === 'assistant' && (
                  <Actions className="mt-2">
                    <Action
                      onClick={() => handleRegenerateMessage()}
                      label="Retry"
                    >
                      <RefreshCcwIcon className="size-3" />
                    </Action>
                    <Action
                      onClick={() => {
                        const textPart = message.parts.find(p => p.type === 'text');
                        if (textPart && 'text' in textPart) {
                          handleCopyMessage(textPart.text);
                        }
                      }}
                      label="Copy"
                    >
                      <CopyIcon className="size-3" />
                    </Action>
                  </Actions>
                )}
              </div>
            ))}
            {status === 'submitted' && <Loader />}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="space-y-3 mt-4">
          {/* Participants Preview */}
          {currentParticipants.length > 0 && (
            <ParticipantsPreview
              participants={currentParticipants}
              isStreaming={status === 'streaming'}
              currentParticipantIndex={0}
              chatMessages={messages}
              className="mb-2"
            />
          )}

          {/* AI Elements Prompt Input */}
          <div className="space-y-2">
            <PromptInput onSubmit={handleSubmit} globalDrop multiple className={chatGlass.inputBox}>
              <PromptInputBody>
                <PromptInputAttachments>
                  {attachment => <PromptInputAttachment data={attachment} />}
                </PromptInputAttachments>
                <PromptInputTextarea
                  placeholder={t('chat.input.placeholder')}
                />
              </PromptInputBody>
              <PromptInputToolbar>
                <PromptInputTools>
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger className="rounded-lg" />
                    <PromptInputActionMenuContent>
                      <PromptInputActionAddAttachments />
                    </PromptInputActionMenuContent>
                  </PromptInputActionMenu>

                  {/* Participants Button */}
                  <ChatParticipantsList
                    participants={currentParticipants}
                    onParticipantsChange={setCurrentParticipants}
                    isStreaming={status === 'streaming'}
                  />

                  {/* Memories Button */}
                  <ChatMemoriesList
                    selectedMemoryIds={currentMemoryIds}
                    onMemoryIdsChange={setCurrentMemoryIds}
                    isStreaming={status === 'streaming'}
                  />

                  {/* Mode Selector */}
                  <Select value={currentMode} onValueChange={value => setCurrentMode(value as ChatModeId)}>
                    <SelectTrigger
                      size="sm"
                      className="h-8 sm:h-9 w-fit gap-1.5 sm:gap-2 rounded-lg border px-3 sm:px-4 text-xs"
                    >
                      <SelectValue>
                        <div className="flex items-center gap-1.5 sm:gap-2">
                          {(() => {
                            const ModeIcon = chatModeOptions.find(m => m.value === currentMode)?.icon;
                            return ModeIcon ? <ModeIcon className="size-3 sm:size-3.5" /> : null;
                          })()}
                          <span className="text-xs font-medium hidden xs:inline sm:inline">
                            {chatModeOptions.find(m => m.value === currentMode)?.label}
                          </span>
                        </div>
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {chatModeOptions.map((chatMode) => {
                        const ModeIcon = chatMode.icon;
                        return (
                          <SelectItem key={chatMode.value} value={chatMode.value}>
                            <div className="flex items-center gap-2">
                              <ModeIcon className="size-4" />
                              <span className="text-sm">{chatMode.label}</span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </PromptInputTools>
                <PromptInputSubmit
                  disabled={currentParticipants.length === 0 || status === 'streaming'}
                  status={status}
                  className="rounded-lg"
                />
              </PromptInputToolbar>
            </PromptInput>
            <p className="text-xs text-center text-muted-foreground">
              {t('chat.input.helpText', { defaultValue: 'Press Enter to send, Shift + Enter for new line' })}
            </p>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {thread && (
        <>
          <ChatDeleteDialog
            isOpen={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            threadId={thread.id}
            threadSlug={slug}
            redirectIfCurrent
          />

          <ChatShareDialog
            isOpen={isShareDialogOpen}
            onOpenChange={setIsShareDialogOpen}
            threadId={thread.id}
            threadSlug={slug}
            isPublic={thread.isPublic}
          />
        </>
      )}

    </div>
  );
}
