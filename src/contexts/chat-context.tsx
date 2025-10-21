'use client';

/**
 * Chat Context - AI SDK v5 Shared State Pattern
 *
 * OFFICIAL AI SDK v5 PATTERN: Share chat state across components
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 *
 * This context follows the official pattern for sharing chat state between:
 * - ChatOverviewScreen: Initial prompt and streaming before navigation
 * - ChatThreadScreen: Continued conversation on thread page
 *
 * KEY BENEFITS:
 * - Single source of truth for chat state
 * - No duplicate hook instances
 * - Seamless navigation between screens without state loss
 * - Eliminates setTimeout hacks and empty message triggers
 *
 * PATTERN:
 * 1. Context wraps useMultiParticipantChat hook
 * 2. Components access shared state via useSharedChatContext()
 * 3. Thread initialization handled by initializeThread()
 * 4. Navigation happens after streaming completes (onComplete callback)
 */

import type { UIMessage } from 'ai';
import { createContext, use, useCallback, useMemo, useState } from 'react';

import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useMultiParticipantChat } from '@/hooks/use-multi-participant-chat';

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

  // Thread management
  initializeThread: (
    thread: ChatThread,
    participants: ChatParticipant[],
    initialMessages?: UIMessage[],
  ) => void;
  clearThread: () => void;
  updateParticipants: (participants: ChatParticipant[]) => void; // ✅ Update participants (local only, persisted on next message)

  // Callbacks
  onStreamComplete?: () => void;
  setOnStreamComplete: (callback: (() => void) | undefined) => void;
  onRoundComplete?: () => void;
  setOnRoundComplete: (callback: (() => void) | undefined) => void;
  onRetry?: (roundNumber: number) => void;
  setOnRetry: (callback: ((roundNumber: number) => void) | undefined) => void;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  // Thread state
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  // Completion callbacks (set by components for custom behavior)
  const [onStreamComplete, setOnStreamComplete] = useState<(() => void) | undefined>(undefined);
  const [onRoundComplete, setOnRoundComplete] = useState<(() => void) | undefined>(undefined);
  const [onRetry, setOnRetry] = useState<((roundNumber: number) => void) | undefined>(undefined);

  // Single chat instance shared across all screens
  // This is the core AI SDK v5 pattern - one hook instance for entire app
  const chat = useMultiParticipantChat({
    threadId: thread?.id || '',
    participants,
    messages: initialMessages,
    mode: thread?.mode, // ✅ Pass mode for changelog tracking
    onComplete: () => {
      // Call the completion callback if set
      if (onStreamComplete) {
        onStreamComplete();
      }
    },
    onRoundComplete: () => {
      // Call the round completion callback if set (for analysis triggers)
      if (onRoundComplete) {
        onRoundComplete();
      }
    },
    onRetry: (roundNumber) => {
      // Call the retry callback if set (for invalidating old analyses)
      if (onRetry) {
        onRetry(roundNumber);
      }
    },
  });

  /**
   * Initialize or update thread context
   * Called when navigating to a thread or creating a new one
   *
   * ✅ CRITICAL FIX: Must use setMessages from chat to sync AI SDK state
   * Setting initialMessages state alone doesn't update the AI SDK's internal message state
   * when navigating between screens. We need to explicitly call setMessages.
   */
  const initializeThread = useCallback(
    (
      newThread: ChatThread,
      newParticipants: ChatParticipant[],
      newMessages?: UIMessage[],
    ) => {
      console.warn('[ChatContext] 🔄 Initializing thread', {
        threadId: newThread.id,
        participantCount: newParticipants.length,
        messageCount: newMessages?.length || 0,
      });

      setThread(newThread);
      setParticipants(newParticipants);

      // ✅ CRITICAL FIX: Update AI SDK's message state using setMessages
      // This ensures retry() and other functions have access to the correct messages
      if (newMessages) {
        setInitialMessages(newMessages);
        chat.setMessages(newMessages); // ✅ Sync AI SDK state immediately
      } else {
        setInitialMessages([]);
        chat.setMessages([]); // ✅ Clear AI SDK state
      }
    },
    [chat],
  );

  /**
   * Clear thread context
   * Called when navigating away from chat
   */
  const clearThread = useCallback(() => {
    setThread(null);
    setParticipants([]);
    setInitialMessages([]);
    setOnStreamComplete(undefined);
    setOnRoundComplete(undefined);
    setOnRetry(undefined);
  }, []);

  /**
   * Update participants (staged changes - persisted on next message)
   * Called when user changes participant configuration in UI
   */
  const updateParticipants = useCallback((newParticipants: ChatParticipant[]) => {
    setParticipants(newParticipants);
  }, []);

  // ✅ Wrap setters to handle function state correctly
  // React treats function arguments as state updaters, so we need to wrap them
  const wrappedSetOnStreamComplete = useCallback((callback: (() => void) | undefined) => {
    setOnStreamComplete(() => callback);
  }, []);

  const wrappedSetOnRoundComplete = useCallback((callback: (() => void) | undefined) => {
    setOnRoundComplete(() => callback);
  }, []);

  const wrappedSetOnRetry = useCallback((callback: ((roundNumber: number) => void) | undefined) => {
    setOnRetry(() => callback);
  }, []);

  const value = useMemo(
    () => ({
      thread,
      participants,
      ...chat,
      initializeThread,
      clearThread,
      updateParticipants,
      onStreamComplete,
      setOnStreamComplete: wrappedSetOnStreamComplete,
      onRoundComplete,
      setOnRoundComplete: wrappedSetOnRoundComplete,
      onRetry,
      setOnRetry: wrappedSetOnRetry,
    }),
    [thread, participants, chat, initializeThread, clearThread, updateParticipants, onStreamComplete, onRoundComplete, onRetry, wrappedSetOnStreamComplete, wrappedSetOnRoundComplete, wrappedSetOnRetry],
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
