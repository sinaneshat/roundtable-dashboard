'use client';

/**
 * Chat Context - AI SDK v5 Shared State Pattern - SIMPLIFIED
 *
 * OFFICIAL AI SDK v5 PATTERN: Share chat state across components
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 *
 * This context follows the official pattern for sharing chat state between:
 * - ChatOverviewScreen: Initial prompt and streaming before navigation
 * - ChatThreadScreen: Continued conversation on thread page
 *
 * AI SDK v5 SIMPLIFICATIONS:
 * - Single messages state - passed directly to useMultiParticipantChat
 * - Let AI SDK manage all message state transitions
 * - Minimal manual state management
 * - Clean separation of concerns
 *
 * PATTERN:
 * 1. Context wraps useMultiParticipantChat hook
 * 2. Components access shared state via useSharedChatContext()
 * 3. Thread initialization updates messages state
 * 4. useChat re-initializes naturally when threadId changes
 */

import type { UIMessage } from 'ai';
import { createContext, use, useCallback, useEffect, useMemo, useState } from 'react';

import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useMultiParticipantChat } from '@/hooks/utils';
import { chatContextLogger } from '@/lib/utils/chat-error-logger';
import { deduplicateMessages } from '@/lib/utils/message-transforms';
import { deduplicateParticipants } from '@/lib/utils/participant-utils';

type ChatContextValue = {
  // Thread state
  thread: ChatThread | null;
  participants: ChatParticipant[];

  // Chat instance from useMultiParticipantChat (AI SDK v5 pattern)
  messages: UIMessage[];
  sendMessage: (content: string) => Promise<void>;
  startRound: () => void; // ✅ Start participant round without sending user message
  isStreaming: boolean;
  currentParticipantIndex: number;
  error: Error | null;
  retry: () => void;
  stop: () => void; // ✅ Stop streaming
  resetHookState: () => void; // ✅ Reset all internal hook state

  // Thread management
  initializeThread: (
    thread: ChatThread,
    participants: ChatParticipant[],
    initialMessages?: UIMessage[],
  ) => void;
  clearThread: () => void;
  updateParticipants: (participants: ChatParticipant[]) => void; // ✅ Update participants (local only, persisted on next message)

  // Callbacks - SIMPLIFIED (2 callbacks instead of 3)
  onComplete?: () => void; // ✅ MERGED: Combines onStreamComplete + onRoundComplete
  setOnComplete: (callback: (() => void) | undefined) => void;
  onRetry?: (roundNumber: number) => void;
  setOnRetry: (callback: ((roundNumber: number) => void) | undefined) => void;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  // Thread state
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [messages, setMessages] = useState<UIMessage[]>([]);

  // Completion callbacks (set by components for custom behavior) - SIMPLIFIED
  const [onComplete, setOnComplete] = useState<(() => void) | undefined>(undefined);
  const [onRetry, setOnRetry] = useState<((roundNumber: number) => void) | undefined>(undefined);

  // Single chat instance shared across all screens
  // This is the core AI SDK v5 pattern - one hook instance for entire app
  const chat = useMultiParticipantChat({
    threadId: thread?.id || '',
    participants,
    messages,
    mode: thread?.mode,
    onComplete: () => {
      if (onComplete) {
        onComplete();
      }
    },
    onRetry: (roundNumber) => {
      if (onRetry) {
        onRetry(roundNumber);
      }
    },
  });

  // Log errors from AI SDK
  useEffect(() => {
    if (chat.error) {
      chatContextLogger.error('STREAM_FAILED', chat.error, {
        threadId: thread?.id,
        participantCount: participants.length,
        messageCount: chat.messages.length,
        isStreaming: chat.isStreaming,
      });
    }
  }, [chat.error, thread?.id, participants.length, chat.messages.length, chat.isStreaming]);

  /**
   * Initialize or update thread context
   * Called when navigating to a thread or creating a new one
   *
   * AI SDK v5 PATTERN:
   * 1. Set thread state
   * 2. Set deduplicated participants
   * 3. Set deduplicated messages
   * 4. Let useChat re-initialize naturally with new threadId
   */
  const initializeThread = useCallback(
    (
      newThread: ChatThread,
      newParticipants: ChatParticipant[],
      newMessages?: UIMessage[],
    ) => {
      try {
        const isNewThread = thread?.id !== newThread.id;

        if (isNewThread) {
          chat.resetHookState();
        }

        chatContextLogger.threadInit(newThread.id, {
          participantCount: newParticipants.length,
          messageCount: newMessages?.length || 0,
          mode: newThread.mode,
        });

        setThread(newThread);

        const deduplicated = deduplicateParticipants(newParticipants);
        setParticipants(deduplicated);

        if (newMessages) {
          const deduplicatedMessages = deduplicateMessages(newMessages);
          setMessages(deduplicatedMessages);
        } else {
          setMessages([]);
        }
      } catch (error) {
        chatContextLogger.error('THREAD_INIT_FAILED', error, {
          threadId: newThread.id,
          participantCount: newParticipants.length,
          messageCount: newMessages?.length || 0,
        });
        throw error;
      }
    },
    [chat, thread],
  );

  /**
   * Clear thread context
   * Called when navigating away from chat
   */
  const clearThread = useCallback(() => {
    setThread(null);
    setParticipants([]);
    setMessages([]);
    setOnComplete(undefined);
    setOnRetry(undefined);
  }, []);

  /**
   * Update participants (staged changes - persisted on next message)
   * Called when user changes participant configuration in UI
   */
  const updateParticipants = useCallback((newParticipants: ChatParticipant[]) => {
    const deduplicated = deduplicateParticipants(newParticipants);
    setParticipants(deduplicated);
  }, []);

  const value = useMemo(
    () => ({
      thread,
      participants,
      ...chat,
      initializeThread,
      clearThread,
      updateParticipants,
      onComplete,
      setOnComplete,
      onRetry,
      setOnRetry,
    }),
    [thread, participants, chat, initializeThread, clearThread, updateParticipants, onComplete, onRetry],
  );

  return <ChatContext value={value}>{children}</ChatContext>;
}

/**
 * Hook to access shared chat context
 * Must be used within ChatProvider
 *
 * ✅ REFACTORED: Uses useContext() for SSR compatibility (frontend-patterns.md:395-433)
 * Official AI SDK v5 pattern uses useContext() to ensure Next.js 15 SSR compatibility.
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isStreaming } = useSharedChatContext();
 * ```
 */
export function useSharedChatContext() {
  const context = use(ChatContext);
  if (!context) {
    throw new Error('useSharedChatContext must be used within a ChatProvider');
  }
  return context;
}
