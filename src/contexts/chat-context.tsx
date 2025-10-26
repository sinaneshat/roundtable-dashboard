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
import { createContext, use, useCallback, useMemo, useRef, useState } from 'react';

import type { ChatParticipant, ChatThread } from '@/api/routes/chat/schema';
import { useMultiParticipantChat } from '@/hooks/utils';

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
  // Using refs for synchronous updates, avoiding race conditions
  setOnComplete: (callback: (() => void) | undefined) => void;
  setOnRetry: (callback: ((roundNumber: number) => void) | undefined) => void;
};

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  // Thread state
  const [thread, setThread] = useState<ChatThread | null>(null);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [messages, setMessages] = useState<UIMessage[]>([]);

  // ✅ Use refs for callbacks to avoid timing/race conditions
  // Refs update synchronously, unlike state which triggers async re-renders
  const onCompleteRef = useRef<(() => void) | undefined>(undefined);
  const onRetryRef = useRef<((roundNumber: number) => void) | undefined>(undefined);

  // ✅ Stable callback wrappers that read from refs
  // These never change, avoiding unnecessary re-renders and stale closures
  const handleComplete = useCallback(() => {
    if (onCompleteRef.current) {
      onCompleteRef.current();
    }
  }, []);

  const handleRetry = useCallback((roundNumber: number) => {
    if (onRetryRef.current) {
      onRetryRef.current(roundNumber);
    }
  }, []);

  // ✅ Stable setter functions that update refs synchronously
  const setOnComplete = useCallback((callback: (() => void) | undefined) => {
    onCompleteRef.current = callback;
  }, []);

  const setOnRetry = useCallback((callback: ((roundNumber: number) => void) | undefined) => {
    onRetryRef.current = callback;
  }, []);

  // Single chat instance shared across all screens
  // This is the core AI SDK v5 pattern - one hook instance for entire app
  const chat = useMultiParticipantChat({
    threadId: thread?.id || '',
    participants,
    messages,
    mode: thread?.mode,
    onComplete: handleComplete, // ✅ Stable callback that reads from ref
    onRetry: handleRetry, // ✅ Stable callback that reads from ref
  });

  // Error handling is managed by AI SDK v5 error boundaries

  /**
   * Initialize or update thread context
   * Called when navigating to a thread or creating a new one
   *
   * AI SDK v5 PATTERN:
   * 1. Set thread state
   * 2. Set participants (backend already deduplicates)
   * 3. Set messages (backend already deduplicates)
   * 4. Let useChat re-initialize naturally with new threadId
   *
   * NOTE: Backend handles deduplication (see backend-patterns.md)
   * Frontend trusts the backend as source of truth
   */
  const initializeThread = useCallback(
    (
      newThread: ChatThread,
      newParticipants: ChatParticipant[],
      newMessages?: UIMessage[],
    ) => {
      const isNewThread = thread?.id !== newThread.id;

      if (isNewThread) {
        chat.resetHookState();
      }

      setThread(newThread);
      setParticipants(newParticipants);

      if (newMessages) {
        setMessages(newMessages);
      } else {
        setMessages([]);
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
  }, [setOnComplete, setOnRetry]);

  /**
   * Update participants (staged changes - persisted on next message)
   * Called when user changes participant configuration in UI
   *
   * NOTE: No deduplication here - caller is responsible for data integrity
   * Backend will deduplicate on save (see backend-patterns.md)
   */
  const updateParticipants = useCallback((newParticipants: ChatParticipant[]) => {
    setParticipants(newParticipants);
  }, []);

  const value = useMemo(
    () => ({
      thread,
      participants,
      ...chat,
      initializeThread,
      clearThread,
      updateParticipants,
      setOnComplete,
      setOnRetry,
    }),
    [thread, participants, chat, initializeThread, clearThread, updateParticipants, setOnComplete, setOnRetry],
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
