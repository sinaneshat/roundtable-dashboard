'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ArrowDown, Globe, Link2, Loader2, Lock, Star, Trash2 } from 'lucide-react';
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
import { useBreadcrumb } from '@/components/chat/use-breadcrumb';
import { Button } from '@/components/ui/button';
// Removed ScrollArea - using native div with overflow for better scroll control
import { useToggleFavoriteMutation, useTogglePublicMutation, useUpdateThreadMutation } from '@/hooks/mutations/chat-mutations';
import { useThreadBySlugQuery } from '@/hooks/queries/chat-threads';
import { useAutoScroll } from '@/hooks/utils/use-auto-scroll';
import { streamParticipant } from '@/lib/ai/stream-participant';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';
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

  // ✅ CRITICAL FIX: Only render chat content after data loads
  // This ensures useChat initializes with correct initialMessages from server
  // Key by slug (not thread.id) to force complete remount when navigating between threads
  // This prevents AI SDK's useChat from showing cached messages from previous thread
  return (
    <ChatThreadContent
      key={slug} // Force remount when slug changes (prevents cache leaking between threads)
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
// Separate component to ensure useChat hook initializes AFTER data loads
// This fixes the "No messages" bug where useChat initialized with empty array

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

  // Mutations
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();
  const updateThreadMutation = useUpdateThreadMutation();

  // Mutation handlers - memoized to prevent infinite loops in useEffect
  const handleToggleFavorite = useCallback(() => {
    const newFavoriteStatus = !thread?.isFavorite;
    toggleFavoriteMutation.mutate(
      { threadId: thread.id, isFavorite: newFavoriteStatus, slug },
      {
        onSuccess: () => {
          // Favorite status updated silently
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
  }, [thread.id, thread.isFavorite, slug, t]);

  const handleDeleteClick = useCallback(() => {
    setIsDeleteDialogOpen(true);
  }, []);

  const handleTogglePublic = useCallback(() => {
    const newPublicStatus = !thread?.isPublic;
    togglePublicMutation.mutate(
      { threadId: thread.id, isPublic: newPublicStatus, slug },
      {
        onSuccess: () => {
          // Public/private status updated silently
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
  }, [thread.id, thread.isPublic, slug, t]);

  const handleCopyLink = useCallback(async () => {
    const shareUrl = `${window.location.origin}/public/chat/${slug}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      // Link copied silently
    } catch {
      toastManager.error(t('chat.copyFailed'), t('chat.copyFailedDescription'));
    }
  }, [slug, t]);

  // Dynamic configuration state
  const [currentMode, setCurrentMode] = useState<ChatModeId>(() => (thread?.mode as ChatModeId) || getDefaultChatMode());
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

  // ✅ 100% OFFICIAL AI SDK PATTERN: useChat for first participant only
  // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
  const {
    messages,
    sendMessage: originalSendMessage,
    status,
    stop,
    regenerate,
    setMessages,
    error,
  } = useChat({
    id: thread.id,
    messages: serverMessages.map(msg => ({
      id: msg.id,
      role: msg.role as 'user' | 'assistant',
      parts: [{ type: 'text' as const, text: msg.content }],
      metadata: msg.metadata,
    })),
    transport: new DefaultChatTransport({
      api: `/api/v1/chat/threads/${thread.id}/stream`,
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          id,
          messages,
          // ✅ CRITICAL: Only send participantIndex for normal streaming
          // Don't send mode/participants/memoryIds - they cause backend to recreate participants!
          // Config updates should be handled separately (e.g., config dialog)
          participantIndex: 0, // Always first participant via useChat
        },
      }),
    }),
  });

  // ✅ OFFICIAL PATTERN: sendMessage triggers first participant
  const sendMessage = originalSendMessage;

  // Track which participants have been triggered to avoid duplicates
  const triggeredParticipantsRef = useRef<Set<string>>(new Set());

  // Track if we've already triggered the new thread auto-trigger for this thread
  const newThreadTriggeredRef = useRef<string | null>(null);

  // Track if we're currently streaming a manual participant (participants 1+)
  const [isStreamingManualParticipant, setIsStreamingManualParticipant] = useState(false);

  // Track if we've auto-triggered participant 0 for this thread
  const participant0TriggeredRef = useRef<string | null>(null);

  // ✅ AI SDK v5 OFFICIAL PATTERN: Track abort controllers for manual participant streams
  // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
  // Allows canceling streams when user clicks stop
  const abortControllersRef = useRef<Map<number, AbortController>>(new Map());

  // Track pending next participant trigger timeouts for cleanup
  const nextParticipantTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ✅ SEQUENTIAL PARTICIPANT TRIGGER: Helper function to trigger next participant
  // Called after each participant finishes to ensure sequential execution
  const triggerNextParticipant = useCallback(() => {
    // Only trigger if ready and not already streaming
    if (status !== 'ready' || isStreamingManualParticipant) {
      return;
    }

    // Find the last user message to determine current round
    const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
    if (lastUserMessageIndex === -1) {
      return; // No user messages yet
    }

    const lastUserMessage = messages[lastUserMessageIndex];
    if (!lastUserMessage) {
      return;
    }

    // Count assistant messages AFTER the last user message (current round only)
    const assistantMessagesInCurrentRound = messages
      .slice(lastUserMessageIndex + 1)
      .filter(m => m.role === 'assistant');

    const nextParticipantIndex = assistantMessagesInCurrentRound.length;

    // Check if all participants have responded
    if (nextParticipantIndex >= currentParticipants.length) {
      return; // All participants responded
    }

    // Prevent duplicate triggers
    const triggerKey = `${lastUserMessage.id}-${nextParticipantIndex}`;
    if (triggeredParticipantsRef.current.has(triggerKey)) {
      return;
    }

    // Mark as triggered
    triggeredParticipantsRef.current.add(triggerKey);
    setIsStreamingManualParticipant(true);

    // Create abort controller
    const abortController = new AbortController();
    abortControllersRef.current.set(nextParticipantIndex, abortController);

    // Trigger the participant
    (async () => {
      try {
        await streamParticipant({
          threadId: thread.id,
          messages,
          participantIndex: nextParticipantIndex,
          onUpdate: setMessages,
          signal: abortController.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        console.error(`Failed to trigger participant ${nextParticipantIndex}:`, error);
        toastManager.error(
          t('chat.participantFailed'),
          t('chat.participantFailedDescription'),
        );
      } finally {
        setIsStreamingManualParticipant(false);
        abortControllersRef.current.delete(nextParticipantIndex);

        // ✅ CRITICAL: Trigger next participant AFTER this one finishes
        // This ensures sequential execution without race conditions
        nextParticipantTimeoutRef.current = setTimeout(() => {
          nextParticipantTimeoutRef.current = null;
          triggerNextParticipant();
        }, 100);
      }
    })();
  }, [status, isStreamingManualParticipant, messages, currentParticipants.length, thread.id, setMessages, t]);

  // ✅ AUTO-TRIGGER FIRST PARTICIPANT FOR NEW THREADS
  // When a new thread is created, the first user message is saved but no assistant response exists
  // This effect detects that scenario and auto-triggers participant 0
  useEffect(() => {
    // Only trigger if ready and not already triggered for this thread
    if (status !== 'ready' || participant0TriggeredRef.current === thread.id || isStreamingManualParticipant) {
      return;
    }

    // Check if this is a new thread: only user messages, no assistant messages
    const hasUserMessages = messages.some(m => m.role === 'user');
    const hasAssistantMessages = messages.some(m => m.role === 'assistant');

    if (hasUserMessages && !hasAssistantMessages && currentParticipants.length > 0) {
      // Mark as triggered for this thread
      participant0TriggeredRef.current = thread.id;
      setIsStreamingManualParticipant(true);

      // Create abort controller for participant 0
      const abortController = new AbortController();
      abortControllersRef.current.set(0, abortController);

      // Auto-trigger participant 0 manually (similar to subsequent participants)
      (async () => {
        try {
          await streamParticipant({
            threadId: thread.id,
            messages,
            participantIndex: 0,
            onUpdate: setMessages,
            signal: abortController.signal,
          });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return; // User cancelled - this is expected
          }

          console.error('Failed to trigger first participant:', error);
          toastManager.error(
            t('chat.participantFailed'),
            t('chat.participantFailedDescription'),
          );
        } finally {
          setIsStreamingManualParticipant(false);
          abortControllersRef.current.delete(0);

          // ✅ CRITICAL: Trigger next participant AFTER participant 0 finishes
          // This ensures sequential execution without race conditions
          nextParticipantTimeoutRef.current = setTimeout(() => {
            nextParticipantTimeoutRef.current = null;
            triggerNextParticipant();
          }, 100);
        }
      })();
    }
  }, [status, messages, thread.id, currentParticipants.length, isStreamingManualParticipant, setMessages, t, triggerNextParticipant]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (nextParticipantTimeoutRef.current) {
        clearTimeout(nextParticipantTimeoutRef.current);
        nextParticipantTimeoutRef.current = null;
      }
    };
  }, []);

  // ============================================================================
  // Stream Control
  // ============================================================================

  // ✅ AI SDK v5 OFFICIAL PATTERN: Stop handler that aborts all participant streams
  // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
  const handleStop = useCallback(() => {
    // Stop useChat stream (participant 0 when using useChat)
    stop();

    // ✅ Abort all manual participant streams (participants 1+)
    abortControllersRef.current.forEach((controller) => {
      controller.abort();
    });

    // Cleanup: Clear all abort controllers
    abortControllersRef.current.clear();

    // Clear any pending next participant trigger
    if (nextParticipantTimeoutRef.current) {
      clearTimeout(nextParticipantTimeoutRef.current);
      nextParticipantTimeoutRef.current = null;
    }
  }, [stop]);

  // ============================================================================
  // Message Actions
  // ============================================================================

  // Copy message to clipboard
  const handleCopyMessage = useCallback((content: string) => {
    navigator.clipboard.writeText(content);
    // Message copied silently
  }, []);

  // Regenerate responses from the first user message
  // ✅ FIX: Multi-participant regeneration - clear ALL assistant messages from all participants
  // AI SDK's regenerate() only handles participant 0, so we need to clear all manually
  const handleRegenerateMessage = useCallback(() => {
    // Find first user message index
    const firstUserMessageIndex = messages.findIndex(m => m.role === 'user');
    if (firstUserMessageIndex === -1)
      return;

    // ✅ CRITICAL FIX: Remove ALL assistant messages (all participants)
    // This ensures all participants regenerate, not just participant 0
    setMessages(prev => prev.slice(0, firstUserMessageIndex + 1));

    // ✅ CRITICAL FIX: Reset triggered participants
    // This allows all participants to be triggered again
    triggeredParticipantsRef.current.clear();
    participant0TriggeredRef.current = null;

    // Trigger regeneration with a small delay to ensure state is updated
    setTimeout(() => {
      regenerate(); // AI SDK handles participant 0
      // triggerNextParticipant useEffect will auto-handle participants 1+
    }, 50);
  }, [messages, setMessages, regenerate]);

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
  const isCurrentlyStreaming = status === 'streaming';

  // ✅ SIMPLIFIED: Each participant is a separate message (no splitting needed)
  // Backend sends one message per HTTP request - one participant per message
  const chatMessages: ChatMessageType[] = useMemo(() => {
    return messages.map((msg, index) => {
      // Extract participant info from metadata (backend provides this)
      const participantId = msg.metadata?.participantId ?? null;
      const model = msg.metadata?.model;
      const role = msg.metadata?.role;

      const content = msg.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');

      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content,
        participantId,
        metadata: model ? { model, role } : null,
        createdAt: new Date().toISOString(),
        isStreaming: isCurrentlyStreaming && index === messages.length - 1,
      };
    });
  }, [messages, isCurrentlyStreaming]);

  // ✅ Check if waiting for any participant (useChat, manual, or not all responded yet)
  const isWaitingForParticipants = useMemo(() => {
    // Streaming via useChat or manual participant
    if (status === 'streaming' || status === 'submitted' || isStreamingManualParticipant) {
      return true;
    }

    // Check if all participants have responded to the last user message
    const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
    if (lastUserMessageIndex === -1) {
      return false; // No user messages yet
    }

    // Count assistant messages after the last user message
    const assistantMessagesInCurrentRound = messages
      .slice(lastUserMessageIndex + 1)
      .filter(m => m.role === 'assistant')
      .length;

    // Still waiting if not all participants have responded
    return assistantMessagesInCurrentRound < currentParticipants.length;
  }, [status, isStreamingManualParticipant, messages, currentParticipants.length]);

  // ChatGPT-like auto-scroll behavior with user override detection
  // Use isWaitingForParticipants for auto-scroll to handle multi-participant streaming
  // This ensures auto-scroll continues between participant responses
  const { scrollRef, showScrollButton, scrollToBottom } = useAutoScroll({
    messages: chatMessages,
    isStreaming: isWaitingForParticipants, // ✅ Use waiting state instead of status for continuous auto-scroll
    threshold: 100, // Consider "at bottom" if within 100px
    smooth: true,
  });

  // Set breadcrumb with action buttons when thread loads
  useEffect(() => {
    setDynamicBreadcrumb({
      title: thread.title,
      parent: '/chat',
      actions: (
        <>
          {/* Scroll to Bottom Button - Only show when not at bottom */}
          {showScrollButton && (
            <Button
              variant="ghost"
              size="icon"
              onClick={scrollToBottom}
              className="size-8 text-muted-foreground hover:text-foreground"
              title={t('chat.scrollToBottom')}
            >
              <ArrowDown className="size-4" />
            </Button>
          )}

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
  }, [thread.title, thread.isFavorite, thread.isPublic, showScrollButton, handleToggleFavorite, handleTogglePublic, handleCopyLink, handleDeleteClick, scrollToBottom]);

  // Poll for title updates when thread has temporary title
  // Slug is now immutable, so no redirect needed - just refresh data
  useEffect(() => {
    if (thread.title !== 'New Chat')
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
  }, [thread.id, thread.title, slug]);

  // Track streaming status and current participant
  // CRITICAL: Monitor message changes to detect when new participants start streaming
  useEffect(() => {
    if (status === 'streaming') {
      // Count how many assistant messages we have to determine which participant is streaming
      // During streaming, the last message is being built, so we count completed + current
      const assistantCount = messages.filter(m => m.role === 'assistant').length;
      // Current participant index is zero-based: 0 for first model, 1 for second, etc.
      // Since assistantCount includes the currently streaming message, subtract 1

      // DEBUG: Log message state during streaming to detect issues
      if (process.env.NODE_ENV === 'development') {
        const lastMessage = messages[messages.length - 1];
        // eslint-disable-next-line no-console -- Debug logging for development
        console.debug('[ChatThread] Streaming state:', {
          totalMessages: messages.length,
          assistantCount,
          currentParticipantIndex: assistantCount > 0 ? assistantCount - 1 : 0,
          lastMessage: lastMessage
            ? {
                id: lastMessage.id,
                metadata: lastMessage.metadata,
                contentLength: lastMessage.parts
                  .filter(p => p.type === 'text')
                  .reduce((sum, p) => sum + p.text.length, 0),
              }
            : null,
        });
      }

      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Tracking streaming progress
      setCurrentParticipantIndex(assistantCount > 0 ? assistantCount - 1 : 0);
    } else {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Resetting streaming state
      setCurrentParticipantIndex(undefined);
    }
  }, [status, messages]);

  // ✅ Auto-trigger for newly created threads
  // useChat doesn't auto-trigger on page load with existing messages
  // So we need to manually trigger participant 0 for threads with only 1 user message
  useEffect(() => {
    // Only trigger for new threads (1 user message, 0 assistant messages from DB)
    const hasOnlyUserMessageInDB = serverMessages.length === 1 && serverMessages[0]?.role === 'user';
    const hasAssistantMessagesInDB = serverMessages.some(m => m.role === 'assistant');
    const isReady = status === 'ready';

    if (hasOnlyUserMessageInDB && !hasAssistantMessagesInDB && isReady) {
      // ✅ CRITICAL: Prevent duplicate triggers for the same thread
      if (newThreadTriggeredRef.current === thread.id) {
        return; // Already triggered for this thread
      }

      // Mark as triggered for this thread
      newThreadTriggeredRef.current = thread.id;

      // ✅ AI SDK v5 OFFICIAL PATTERN: Use streamParticipant utility with abort signal
      // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/stream-protocol
      setIsStreamingManualParticipant(true);

      // Create abort controller for participant 0
      const abortController = new AbortController();
      abortControllersRef.current.set(0, abortController);

      // Trigger participant 0 for new thread using official AI SDK pattern
      (async () => {
        try {
          await streamParticipant({
            threadId: thread.id,
            messages,
            participantIndex: 0, // First participant
            onUpdate: setMessages,
            signal: abortController.signal, // ✅ Pass abort signal for cancellation support
          });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return; // User cancelled - this is expected
          }

          console.error('Failed to trigger participant 0 for new thread:', error);
          toastManager.error(
            t('chat.participantFailed'),
            t('chat.participantFailedDescription'),
          );
        } finally {
          setIsStreamingManualParticipant(false);
          // Cleanup: Remove abort controller after stream completes
          abortControllersRef.current.delete(0);
        }
      })();
    }
    // Only run once when thread loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, serverMessages.length, status]);

  return (
    <div className="relative h-full w-full">
      {/* Messages Area - Scrollable content with native overflow */}
      <div
        ref={scrollRef}
        className="absolute inset-0 overflow-y-auto overflow-x-hidden"
      >
        <div className="mx-auto w-full max-w-4xl px-3 sm:px-4 md:px-6 pb-3 sm:pb-4 pt-3 sm:pt-4">
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

      {/* Input Area - Fixed to bottom with same container width and padding as messages */}
      <div className="absolute bottom-0 left-0 right-0 z-50">
        <div className="mx-auto w-full max-w-4xl px-3 sm:px-4 md:px-6 py-3 sm:py-4">
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
            onStop={handleStop}
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
