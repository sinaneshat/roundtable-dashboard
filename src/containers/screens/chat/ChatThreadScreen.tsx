'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { ArrowDown, Globe, Link2, Loader2, Lock, Star, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ulid } from 'ulid';

import type { ParticipantConfig } from '@/components/chat/chat-config-sheet';
import { ChatDeleteDialog } from '@/components/chat/chat-delete-dialog';
import { ChatEditDialog } from '@/components/chat/chat-edit-dialog';
import type { ChatMessageType } from '@/components/chat/chat-message';
import { ChatMessageList } from '@/components/chat/chat-message';
import { ChatShareDialog } from '@/components/chat/chat-share-dialog';
import { UnifiedChatInput } from '@/components/chat/unified-chat-input';
import { useBreadcrumb } from '@/components/chat/use-breadcrumb';
import { Button } from '@/components/ui/button';
// Removed ScrollArea - using native div with overflow for better scroll control
import { useToggleFavoriteMutation, useTogglePublicMutation } from '@/hooks/mutations/chat-mutations';
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

  // ✅ Conditionally fetch messages with session tracking data
  // Convert serverMessages to ChatMessageType format
  const initialMessages: ChatMessageType[] = serverMessages.map(msg => ({
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    participantId: msg.participantId,
    metadata: msg.metadata,
    createdAt: msg.createdAt,
    isStreaming: false,
  }));

  // Mutations
  const toggleFavoriteMutation = useToggleFavoriteMutation();
  const togglePublicMutation = useTogglePublicMutation();

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

  // ✅ AI SDK PATTERN: useChat for message state management and utilities
  // Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot
  // Note: We use streamParticipant directly for all participants to ensure consistent
  // metadata injection and config updates (not using useChat's sendMessage)
  const {
    messages,
    status,
    stop,
    regenerate,
    setMessages,
    error,
  } = useChat({
    id: thread.id,
    messages: initialMessages.map(msg => ({
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

  // Track which participants have been triggered to avoid duplicates
  const triggeredParticipantsRef = useRef<Set<string>>(new Set());

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

  // Track which rounds we've refetched session data for (prevents duplicate refetches)
  const refetchedRoundsRef = useRef<Set<string>>(new Set());

  // ✅ WATCHDOG: Track when manual streaming started to detect stuck states
  const streamingStartTimeRef = useRef<number | null>(null);

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

    // Get current participant config for metadata injection
    const currentParticipant = currentParticipants[nextParticipantIndex];

    // Trigger the participant
    (async () => {
      try {
        await streamParticipant({
          threadId: thread.id,
          messages,
          participantIndex: nextParticipantIndex,
          // ✅ CRITICAL: Update local state when backend sends new participant IDs
          // Subsequent participants typically won't have config updates, but handle them just in case
          onConfigUpdate: (config) => {
            if (config.participants) {
              setCurrentParticipants(config.participants);
            }
            if (config.threadMode) {
              setCurrentMode(config.threadMode as ChatModeId);
            }
          },
          // ✅ CRITICAL: Wrap onUpdate to inject participant metadata
          // Similar to ChatOverviewScreen pattern for consistent icon/name/role display
          onUpdate: (updater) => {
            if (typeof updater === 'function') {
              setMessages((prev) => {
                const updated = updater(prev);
                // Inject participantId and model metadata for new assistant messages
                return updated.map((msg) => {
                  if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                    const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                    return {
                      ...msg,
                      participantId: currentParticipant.id,
                      metadata: {
                        ...existingMetadata,
                        model: currentParticipant.modelId,
                        role: currentParticipant.role || undefined,
                      },
                    };
                  }
                  return msg;
                });
              });
            } else {
              // Direct array update
              setMessages(updater.map((msg) => {
                if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                  const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                  return {
                    ...msg,
                    participantId: currentParticipant.id,
                    metadata: {
                      ...existingMetadata,
                      model: currentParticipant.modelId,
                      role: currentParticipant.role || undefined,
                    },
                  };
                }
                return msg;
              }));
            }
          },
          signal: abortController.signal,
        });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

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
  }, [status, isStreamingManualParticipant, messages, currentParticipants, thread.id, setMessages, t]);

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

      // Get current participant config for metadata injection
      const currentParticipant = currentParticipants[0];

      // Auto-trigger participant 0 manually (similar to subsequent participants)
      (async () => {
        try {
          await streamParticipant({
            threadId: thread.id,
            messages,
            participantIndex: 0,
            // ✅ CRITICAL: Wrap onUpdate to inject participant metadata
            onUpdate: (updater) => {
              if (typeof updater === 'function') {
                setMessages((prev) => {
                  const updated = updater(prev);
                  return updated.map((msg) => {
                    if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                      const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                      return {
                        ...msg,
                        participantId: currentParticipant.id,
                        metadata: {
                          ...existingMetadata,
                          model: currentParticipant.modelId,
                          role: currentParticipant.role || undefined,
                        },
                      };
                    }
                    return msg;
                  });
                });
              } else {
                setMessages(updater.map((msg) => {
                  if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                    const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                    return {
                      ...msg,
                      participantId: currentParticipant.id,
                      metadata: {
                        ...existingMetadata,
                        model: currentParticipant.modelId,
                        role: currentParticipant.role || undefined,
                      },
                    };
                  }
                  return msg;
                }));
              }
            },
            signal: abortController.signal,
          });
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            return; // User cancelled - this is expected
          }

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
  }, [status, messages, thread.id, currentParticipants, isStreamingManualParticipant, setMessages, t, triggerNextParticipant]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (nextParticipantTimeoutRef.current) {
        clearTimeout(nextParticipantTimeoutRef.current);
        nextParticipantTimeoutRef.current = null;
      }
    };
  }, []);

  // ✅ DISABLED: This effect is no longer needed since we use streamParticipant directly in onSubmit
  // Previously triggered next participant after useChat completed, but now onSubmit handles all triggering
  // Keeping this disabled to prevent duplicate triggers and race conditions

  // ✅ ERROR RECOVERY: Trigger next participant even after errors
  // When a participant errors, we still need to advance to the next one
  useEffect(() => {
    // Only trigger if ready and not currently streaming
    if (status !== 'ready' || isStreamingManualParticipant) {
      return;
    }

    // Find the last user message
    const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
    if (lastUserMessageIndex === -1) {
      return;
    }

    // Count assistant messages (including error messages) after the last user message
    const assistantMessagesInCurrentRound = messages
      .slice(lastUserMessageIndex + 1)
      .filter(m => m.role === 'assistant');

    const nextParticipantIndex = assistantMessagesInCurrentRound.length;

    // If we have messages but haven't reached all participants yet, trigger next
    if (nextParticipantIndex > 0 && nextParticipantIndex < currentParticipants.length) {
      // Small delay to ensure state is settled
      const triggerTimer = setTimeout(() => {
        triggerNextParticipant();
      }, 200);

      return () => clearTimeout(triggerTimer);
    }

    return undefined;
  }, [status, isStreamingManualParticipant, messages, currentParticipants.length, triggerNextParticipant]);

  // ✅ WATCHDOG: Detect and recover from stuck streaming states
  // If isStreamingManualParticipant stays true for more than 60 seconds, force recovery
  useEffect(() => {
    if (isStreamingManualParticipant) {
      // Mark when streaming started
      if (streamingStartTimeRef.current === null) {
        streamingStartTimeRef.current = Date.now();
      }

      // Set watchdog timer to check after 60 seconds
      const watchdogTimer = setTimeout(() => {
        const elapsedTime = Date.now() - (streamingStartTimeRef.current || Date.now());

        // If still streaming after 60 seconds, force recovery
        if (elapsedTime >= 60000 && isStreamingManualParticipant) {
          console.warn('[ChatThreadScreen] Watchdog: Detected stuck streaming state, forcing recovery');

          // Force abort all streams
          abortControllersRef.current.forEach((controller) => {
            controller.abort();
          });
          abortControllersRef.current.clear();

          // Clear triggered participants to allow retry
          triggeredParticipantsRef.current.clear();

          // Reset streaming flag
          setIsStreamingManualParticipant(false);

          // Show error message
          toastManager.error(
            t('chat.streamingTimeout'),
            t('chat.streamingTimeoutDescription'),
          );
        }
      }, 60000); // 60 seconds

      return () => clearTimeout(watchdogTimer);
    }

    // Reset start time when streaming stops
    streamingStartTimeRef.current = null;
    return undefined;
  }, [isStreamingManualParticipant, t]);

  // ✅ REFETCH MESSAGES WITH SESSION DATA AFTER ALL PARTICIPANTS FINISH
  // When all participants complete streaming, refetch messages to get session metadata
  // This ensures session wrappers show correct configuration changes
  useEffect(() => {
    // Only refetch if we're ready and not currently streaming
    if (status !== 'ready' || isStreamingManualParticipant) {
      return;
    }

    // Find the last user message
    const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
    if (lastUserMessageIndex === -1) {
      return;
    }

    const lastUserMessage = messages[lastUserMessageIndex];
    if (!lastUserMessage) {
      return;
    }

    // Count assistant messages after the last user message
    const assistantMessagesInCurrentRound = messages
      .slice(lastUserMessageIndex + 1)
      .filter(m => m.role === 'assistant');

    // Check if all participants have responded
    const allParticipantsResponded = assistantMessagesInCurrentRound.length >= currentParticipants.length
      && currentParticipants.length > 0;

    // Create unique key for this round
    const roundKey = `${lastUserMessage.id}-${currentParticipants.length}`;

    if (allParticipantsResponded && !refetchedRoundsRef.current.has(roundKey)) {
      // Mark this round as refetched
      refetchedRoundsRef.current.add(roundKey);

      // Refetch messages to get session-enriched data
      // This happens after streaming completes, so it won't interfere with the stream
      // Messages are already complete from backend - no additional fetching needed
    }
  }, [status, isStreamingManualParticipant, messages, currentParticipants.length, setMessages]);

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

    // ✅ CRITICAL: Reset streaming state to re-enable input
    setIsStreamingManualParticipant(false);
    setCurrentParticipantIndex(0);
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
  // ✅ ENHANCED: Merge session data from initialMessages with streaming AI SDK messages
  const chatMessages: ChatMessageType[] = useMemo(() => {
    return messages.map((msg, index) => {
      // Extract participant info from metadata (backend provides this)
      const participantId = (msg.metadata?.participantId as string | undefined) ?? null;

      const content = msg.parts
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('');

      // Find corresponding message in initialMessages to get session data

      return {
        id: msg.id,
        role: msg.role as 'user' | 'assistant',
        content,
        participantId,
        // ✅ CRITICAL: Pass through ALL metadata including error fields
        // Backend saves error metadata (errorType, errorMessage, etc.) to database
        // ChatMessage component checks for these fields to display errors
        metadata: msg.metadata as ChatMessageType['metadata'],
        createdAt: new Date().toISOString(),
        isStreaming: isCurrentlyStreaming && index === messages.length - 1,
      };
    });
  }, [messages, isCurrentlyStreaming, initialMessages]);

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

    // ✅ DEFENSIVE FIX: If we have NO participants configured, don't wait
    if (currentParticipants.length === 0) {
      return false;
    }

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
      } catch {
        // Silently ignore polling errors - not critical to user experience
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

      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Tracking streaming progress
      setCurrentParticipantIndex(assistantCount > 0 ? assistantCount - 1 : 0);
    } else {
      // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Resetting streaming state
      setCurrentParticipantIndex(undefined);
    }
  }, [status, messages]);

  // ✅ DISABLED: Duplicate auto-trigger effect removed
  // The effect at lines 425-517 already handles new thread auto-triggering with metadata injection
  // This effect was causing duplicate triggers and race conditions

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
          <UnifiedChatInput
            mode={currentMode}
            participants={currentParticipants}
            memoryIds={currentMemoryIds}
            isStreaming={isWaitingForParticipants} // Use enhanced streaming state
            currentParticipantIndex={currentParticipantIndex}
            disabled={error != null} // Allow typing during streaming for interruption
            chatMessages={chatMessages} // Pass chat messages for participant state detection
            onModeChange={setCurrentMode}
            onParticipantsChange={setCurrentParticipants}
            onMemoryIdsChange={setCurrentMemoryIds}
            onSubmit={async (message) => {
              // ✅ CRITICAL FIX: Clear triggered participants ref for new message
              // This allows all participants to be triggered again for the new user message
              // Without this, continuing an existing conversation would fail to trigger participants
              triggeredParticipantsRef.current.clear();

              // ✅ ALWAYS use streamParticipant for participant 0 to ensure:
              // 1. Config updates (mode/participants/memories) are passed to backend
              // 2. Participant metadata (model, role, participantId) is injected consistently
              // 3. All participants follow the same code path (no dual useChat/streamParticipant logic)

              // Create new user message
              const newUserMessage = {
                id: ulid(),
                role: 'user' as const,
                parts: [{ type: 'text' as const, text: message }],
                metadata: null,
              };

              // Add user message to state
              setMessages(prev => [...prev, newUserMessage]);

              // Start streaming participant 0 with config
              setIsStreamingManualParticipant(true);
              const abortController = new AbortController();
              abortControllersRef.current.set(0, abortController);

              const currentParticipant = currentParticipants[0];

              try {
                await streamParticipant({
                  threadId: thread.id,
                  messages: [...messages, newUserMessage],
                  participantIndex: 0,
                  // ✅ Pass config updates to backend
                  mode: currentMode !== thread.mode ? currentMode : undefined,
                  participants: currentParticipants.map((p, idx) => ({
                    modelId: p.modelId,
                    role: p.role || null,
                    customRoleId: p.customRoleId || undefined,
                    order: p.order ?? idx,
                  })),
                  memoryIds: currentMemoryIds,
                  // ✅ CRITICAL: Update local state when backend sends new participant IDs
                  // Prevents "Invalid participantIndex" errors and "losing memory" issues
                  onConfigUpdate: (config) => {
                    if (config.participants) {
                      setCurrentParticipants(config.participants);
                    }
                    if (config.threadMode) {
                      setCurrentMode(config.threadMode as ChatModeId);
                    }
                  },
                  // ✅ Inject participant metadata
                  onUpdate: (updater) => {
                    if (typeof updater === 'function') {
                      setMessages((prev) => {
                        const updated = updater(prev);
                        return updated.map((msg) => {
                          if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                            const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                            return {
                              ...msg,
                              participantId: currentParticipant.id,
                              metadata: {
                                ...existingMetadata,
                                model: currentParticipant.modelId,
                                role: currentParticipant.role || undefined,
                              },
                            };
                          }
                          return msg;
                        });
                      });
                    } else {
                      setMessages(updater.map((msg) => {
                        if (msg.role === 'assistant' && !('participantId' in msg) && currentParticipant?.id) {
                          const existingMetadata = 'metadata' in msg ? (msg.metadata as Record<string, unknown> || {}) : {};
                          return {
                            ...msg,
                            participantId: currentParticipant.id,
                            metadata: {
                              ...existingMetadata,
                              model: currentParticipant.modelId,
                              role: currentParticipant.role || undefined,
                            },
                          };
                        }
                        return msg;
                      }));
                    }
                  },
                  signal: abortController.signal,
                });
              } catch (error) {
                if (error instanceof Error && error.name !== 'AbortError') {
                  toastManager.error(
                    t('chat.participantFailed'),
                    t('chat.participantFailedDescription'),
                  );
                }
              } finally {
                setIsStreamingManualParticipant(false);
                abortControllersRef.current.delete(0);

                // Trigger next participant after participant 0 completes
                setTimeout(() => {
                  triggerNextParticipant();
                }, 100);
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
