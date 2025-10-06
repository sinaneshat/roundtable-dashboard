'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Globe, Link2, Loader2, Lock, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatEditDialog } from '@/components/chat/chat-edit-dialog';
import type { ChatMessageType } from '@/components/chat/chat-message';
import { ChatMessageList } from '@/components/chat/chat-message';
import { ChatShareDialog } from '@/components/chat/chat-share-dialog';
import { ChatThreadInput } from '@/components/chat/chat-thread-input';
import { ScrollToBottomButton } from '@/components/chat/scroll-to-bottom-button';
import { useBreadcrumb } from '@/components/chat/use-breadcrumb';
import { Button } from '@/components/ui/button';
// Removed ScrollArea - using native div with overflow for better scroll control
import { useToggleFavoriteMutation, useTogglePublicMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadBySlugQuery } from '@/hooks/queries/chat-threads';
import { useAutoScroll } from '@/hooks/utils/use-auto-scroll';
import { toastManager } from '@/lib/toast/toast-manager';
import { cn } from '@/lib/ui/cn';

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
 */
export default function ChatThreadScreen({ slug }: { slug: string }) {
  const t = useTranslations();
  const router = useRouter();
  const autoTriggeredRef = useRef<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const { setDynamicBreadcrumb } = useBreadcrumb();

  // Fetch thread details by slug to get thread ID and initial data
  const { data: threadData, isLoading: isLoadingThread, error: threadError } = useThreadBySlugQuery(slug);
  const threadResponse = threadData?.success ? threadData.data : null;
  const thread = threadResponse?.thread || null;
  const rawParticipants = threadResponse?.participants || [];
  const serverMessages = threadResponse?.messages || [];

  // Convert participants to match ThreadParticipant type
  const participants: ThreadParticipant[] = rawParticipants.map(p => ({
    id: p.id,
    threadId: p.threadId,
    modelId: p.modelId,
    role: p.role,
    customRoleId: null, // Backend doesn't return this yet
    priority: p.priority,
    createdAt: p.createdAt,
  }));

  // Mutations
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  // Mutation handlers - memoized to prevent infinite loops in useEffect
  const handleToggleFavorite = useCallback(() => {
    if (!thread)
      return;

    const newFavoriteStatus = !thread?.isFavorite;
    toggleFavoriteMutation.mutate(
      { threadId: thread.id, isFavorite: newFavoriteStatus, slug },
      {
        onSuccess: () => {
          toastManager.success(
            newFavoriteStatus
              ? t('chat.addedToFavorites')
              : t('chat.removedFromFavorites'),
            newFavoriteStatus
              ? t('chat.addedToFavoritesDescription')
              : t('chat.removedFromFavoritesDescription'),
          );
        },
        onError: () => {
          toastManager.error(
            t('chat.favoriteFailed'),
            t('chat.favoriteFailedDescription'),
          );
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, thread?.isFavorite, slug, t]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  const handleTogglePublic = useCallback(() => {
    if (!thread)
      return;

    const newPublicStatus = !thread?.isPublic;
    togglePublicMutation.mutate(
      { threadId: thread.id, isPublic: newPublicStatus, slug },
      {
        onSuccess: () => {
          toastManager.success(
            newPublicStatus
              ? t('chat.madePublic')
              : t('chat.madePrivate'),
            newPublicStatus
              ? t('chat.madePublicDescription')
              : t('chat.madePrivateDescription'),
          );
        },
        onError: () => {
          toastManager.error(
            t('chat.publicToggleFailed'),
            t('chat.publicToggleFailedDescription'),
          );
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, thread?.isPublic, slug, t]);

  const handleCopyLink = useCallback(async () => {
    if (!thread)
      return;

    const shareUrl = `${window.location.origin}/public/chat/${slug}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      toastManager.success(t('chat.linkCopied'), t('chat.linkCopiedDescription'));
    } catch {
      toastManager.error(t('chat.copyFailed'), t('chat.copyFailedDescription'));
    }
  }, [slug, t, thread]);

  // Set breadcrumb with action buttons when thread loads
  useEffect(() => {
    if (!thread)
      return;

    setDynamicBreadcrumb({
      title: thread.title,
      parent: '/chat',
      actions: (
        <>
          {/* Favorite Button - Star Icon */}
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

          {/* Public/Private Toggle Button */}
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

          {/* Copy Link Button - Only show when public */}
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

          {/* Delete Button */}
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

    // Cleanup: reset breadcrumb when component unmounts
    return () => {
      setDynamicBreadcrumb(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.title, thread?.isFavorite, thread?.isPublic, handleToggleFavorite, handleTogglePublic, handleCopyLink, handleDeleteClick]);

  // Dynamic configuration state
  const [currentMode, setCurrentMode] = useState<'brainstorming' | 'analyzing' | 'debating' | 'solving'>((thread?.mode as 'brainstorming' | 'analyzing' | 'debating' | 'solving') || 'brainstorming');
  const [currentParticipants, setCurrentParticipants] = useState<ParticipantConfig[]>(() =>
    // Sort by priority to ensure correct order from database
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
  const [currentParticipantIndex, setCurrentParticipantIndex] = useState<number | undefined>(undefined);

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageContent, setEditingMessageContent] = useState('');

  // Initialize useChat with streaming endpoint
  // AI SDK v5: Use DefaultChatTransport with custom body preparation
  const {
    messages,
    sendMessage,
    status,
    stop,
    regenerate,
    setMessages,
    error,
  } = useChat({
    // Stable ID for this chat session
    id: thread?.id || '',
    // Initial messages from server - include metadata for participant attribution
    messages: serverMessages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: msg.content }],
      metadata: msg.metadata, // Include participant and model info
    })),
    // Custom transport to send dynamic configuration with messages
    transport: new DefaultChatTransport({
      api: `/api/v1/chat/threads/${thread?.id || ''}/stream`,
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          messages,
          // Include dynamic configuration
          mode: currentMode,
          participants: currentParticipants.map(p => ({
            modelId: p.modelId,
            role: p.role || undefined,
            customRoleId: p.customRoleId,
            order: p.order,
          })),
          memoryIds: currentMemoryIds,
        },
      }),
    }),
  });

  // ============================================================================
  // Message Actions
  // ============================================================================

  // Copy message to clipboard
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    toastManager.success(
      t('chat.actions.messageCopied'),
      t('chat.actions.messageCopiedDescription'),
    );
  }, [t]);

  // Regenerate responses from the first user message
  // Following AI SDK v5 docs: simply call regenerate() without manual message manipulation
  const handleRegenerateMessage = useCallback(() => {
    regenerate();
  }, [regenerate]);

  // Open edit dialog for the first user message
  const handleEditMessage = useCallback((messageId: string, currentContent: string) => {
    setEditDialogOpen(true);
    setEditingMessageId(messageId);
    setEditingMessageContent(currentContent);
  }, []);

  // Save edited message and regenerate
  // Following AI SDK v5 docs: use setMessages to update content, then call regenerate()
  const handleSaveEditedMessage = useCallback((newContent: string) => {
    if (!editingMessageId)
      return;

    // Update the message content using setMessages
    setMessages((prevMessages) => {
      const messageIndex = prevMessages.findIndex(msg => msg.id === editingMessageId);
      if (messageIndex === -1)
        return prevMessages;

      // Update the specific message and remove all messages after it
      return prevMessages.slice(0, messageIndex + 1).map((msg, idx) => {
        if (idx === messageIndex) {
          return {
            ...msg,
            parts: [{ type: 'text' as const, text: newContent }],
          };
        }
        return msg;
      });
    });

    // Close dialog
    setEditDialogOpen(false);
    setEditingMessageId(null);
    setEditingMessageContent('');

    // Trigger regeneration (AI SDK will use the updated message)
    // Small delay to ensure state update completes
    setTimeout(() => {
      regenerate();
    }, 50);
  }, [editingMessageId, setMessages, regenerate]);

  // Convert AI SDK messages back to ChatMessage format for rendering
  // AI SDK v5: Messages update automatically as streaming happens - no manual state needed
  // Use status for rendering, but use isWaitingForParticipants for auto-scroll
  const isCurrentlyStreaming = status === 'streaming';

  // Memoize message transformation to prevent animation resets during streaming
  // Only recreate message objects when actual content changes, not on every render
  const chatMessages: ChatMessageType[] = useMemo(() => {
    return messages.map((msg, index) => {
      const isLastMessage = index === messages.length - 1;
      const isAssistantMessage = msg.role === 'assistant';

      // Extract participant info from message metadata (set by backend)
      const participantId = msg.metadata?.participantId ?? null;
      const model = msg.metadata?.model;
      const role = msg.metadata?.role;

      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content: msg.parts
          .filter(part => part.type === 'text')
          .map(part => part.text)
          .join(''),
        participantId,
        metadata: model
          ? {
              model,
              role,
            }
          : null,
        createdAt: new Date().toISOString(),
        // AI SDK v5: Mark last assistant message as streaming to show cursor
        // The text content streams in automatically via the messages array
        isStreaming: isCurrentlyStreaming && isLastMessage && isAssistantMessage,
      };
    });
  }, [messages, isCurrentlyStreaming]);

  // Track if we're waiting for multiple participant responses
  // This ensures input stays disabled until ALL participants have responded
  const isWaitingForParticipants = useMemo(() => {
    if (status === 'streaming' || status === 'submitted') {
      return true; // Always disabled when actively streaming
    }

    // Count user messages and assistant messages
    const userMessageCount = messages.filter(m => m.role === 'user').length;
    const assistantMessageCount = messages.filter(m => m.role === 'assistant').length;

    // Expected assistant messages = user messages × number of participants
    const expectedAssistantMessages = userMessageCount * currentParticipants.length;

    // Still waiting if we haven't received all expected responses
    return assistantMessageCount < expectedAssistantMessages;
  }, [status, messages, currentParticipants.length]);

  // ChatGPT-like auto-scroll behavior with user override detection
  // Use isWaitingForParticipants for auto-scroll to handle multi-participant streaming
  // This ensures auto-scroll continues between participant responses
  const { scrollRef, showScrollButton, scrollToBottom } = useAutoScroll({
    messages: chatMessages,
    isStreaming: isWaitingForParticipants, // ✅ Use waiting state instead of status for continuous auto-scroll
    threshold: 100, // Consider "at bottom" if within 100px
    smooth: true,
  });

  // Poll for title updates when thread has temporary title
  // Slug is now immutable, so no redirect needed - just refresh data
  useEffect(() => {
    if (!thread || thread?.title !== 'New Chat')
      return;

    // Poll every 2 seconds to check if title has been updated
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/v1/chat/threads/slug/${slug}`);
        if (response.ok) {
          const data = await response.json() as { success: boolean; data: { thread: { title: string; slug: string } } };
          const updatedThread = data.success ? data.data.thread : null;

          // If title changed from "New Chat", trigger a refetch to update UI
          // No redirect needed since slug is immutable
          if (updatedThread && updatedThread.title !== 'New Chat') {
            clearInterval(pollInterval);
            // React Query will automatically refetch on next stale check
          }
        }
      } catch (error) {
        console.error('Error polling for title update:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Cleanup on unmount or when title changes
    return () => clearInterval(pollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only tracking thread.id and thread.title to avoid unnecessary polling restarts
  }, [thread?.id, thread?.title, slug]);

  // Track streaming status and current participant
  useEffect(() => {
    if (status === 'streaming') {
      // Count how many assistant messages we have to determine which participant is streaming
      // During streaming, the last message is being built, so we count completed + current
      const assistantCount = messages.filter(m => m.role === 'assistant').length;
      // Current participant index is zero-based: 0 for first model, 1 for second, etc.
      // Since assistantCount includes the currently streaming message, subtract 1
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Tracking streaming progress
      setCurrentParticipantIndex(assistantCount > 0 ? assistantCount - 1 : 0);
    } else {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Resetting streaming state
      setCurrentParticipantIndex(undefined);
    }
  }, [status, messages]);

  // Auto-trigger streaming for newly created threads
  // ChatGPT-like experience: Automatically stream AI responses when thread is created
  // AI SDK v5 pattern: Use regenerate() to trigger streaming without sending a new message
  useEffect(() => {
    if (!thread)
      return;

    // Check if this is a new thread with only the initial user message
    const hasOnlyUserMessage = serverMessages.length === 1 && serverMessages[0]?.role === 'user';
    const hasNoAssistantMessages = messages.filter(m => m.role === 'assistant').length === 0;
    const isReady = status === 'ready';
    const hasThread = Boolean(thread);
    const notAlreadyTriggered = autoTriggeredRef.current !== thread?.id;

    // Auto-trigger condition: new thread + only user message + no AI responses yet + ready state + not already triggered
    if (hasThread && hasOnlyUserMessage && hasNoAssistantMessages && isReady && notAlreadyTriggered) {
      // Mark as triggered to prevent duplicate calls
      autoTriggeredRef.current = thread?.id || null;

      // Trigger streaming using regenerate() - this will use the last message without creating a new one
      // The backend will see the existing user message and start streaming
      regenerate();
    }
    // Only run when thread ID changes or when messages/status change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.id, serverMessages.length, status, messages.length]);

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
    <div className="relative h-full w-full">
      {/* Messages Area - Scrollable content with native overflow */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden"
      >
        <div className="mx-auto max-w-4xl px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 pt-3 sm:pt-4">
          <ChatMessageList
            messages={chatMessages}
            onRegenerate={handleRegenerateMessage}
            onCopy={handleCopyMessage}
            onEdit={handleEditMessage}
          />

          {/* Error Display - Following AI SDK v5 docs pattern */}
          {error && (
            <div className="mt-3 sm:mt-4 p-3 sm:p-4 rounded-lg border border-destructive/50 bg-destructive/10">
              <div className="flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
                <p className="text-xs sm:text-sm text-destructive">
                  {t('chat.error.generic')}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => regenerate()}
                  className="text-xs sm:text-sm"
                >
                  {t('actions.retry')}
                </Button>
              </div>
            </div>
          )}
          {/* Add spacing for fixed input area so content doesn't hide behind it */}
          <div className="h-48 sm:h-52 md:h-80" />
        </div>
      </div>

      {/* Scroll-to-Bottom Button - Fixed to right side of viewport */}
      {showScrollButton && (
        <div className="fixed right-6 bottom-32 z-40">
          <ScrollToBottomButton show onClick={scrollToBottom} />
        </div>
      )}

      {/* Input Area - Fixed to bottom of chat container with same centering as messages */}
      <div className="absolute bottom-0 left-0 right-0 w-full z-50">
        <div className="max-w-4xl mx-auto py-3 sm:py-4 px-3 sm:px-4 md:px-6">
          <ChatThreadInput
            mode={currentMode}
            participants={currentParticipants}
            memoryIds={currentMemoryIds}
            isStreaming={isWaitingForParticipants} // Use enhanced streaming state
            currentParticipantIndex={currentParticipantIndex}
            disabled={error != null || isWaitingForParticipants} // Disable until all participants respond
            chatMessages={chatMessages} // Pass chat messages for participant state detection
            onModeChange={setCurrentMode}
            onParticipantsChange={setCurrentParticipants}
            onMemoryIdsChange={setCurrentMemoryIds}
            onSubmit={(message) => {
              if (!thread)
                return;

              // AI SDK v5: Send message using correct format
              sendMessage({ text: message });

              // Update thread mode if changed
              if (currentMode !== thread.mode) {
                updateThreadMutation.mutate({
                  threadId: thread.id,
                  data: { json: { mode: currentMode } },
                });
              }
            }}
            onStop={stop}
          />
        </div>
      </div>

      {/* Reusable Dialogs */}
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

      {/* Edit Message Dialog */}
      <ChatEditDialog
        isOpen={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        initialContent={editingMessageContent}
        onSave={handleSaveEditedMessage}
        isLoading={status === 'submitted' || status === 'streaming'}
      />
    </div>
  );
}
