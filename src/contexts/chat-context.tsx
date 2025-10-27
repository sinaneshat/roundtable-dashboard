'use client';

/**
 * Chat Context - AI SDK v5 Shared State Pattern + React 19.2
 *
 * OFFICIAL AI SDK v5 PATTERN: Share chat state across components
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 *
 * React 19.2 PATTERNS APPLIED:
 * - Callback refs for non-reactive callbacks (preventing unnecessary re-renders)
 * - Proper event listener management (separate from useEffect dependencies)
 * - Refs for synchronous updates (avoiding race conditions)
 * - Clean separation of reactive and non-reactive logic
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
  setMessages: (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void; // ✅ Manually set messages (for optimistic updates)
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

  // Use ref to track current thread ID without causing re-renders
  const currentThreadIdRef = useRef<string | null>(null);

  /**
   * Initialize or update thread context
   * Called when navigating to a thread or creating a new one
   *
   * AI SDK v5 PATTERN (from crash course Exercise 01.07, 04.02, 04.03):
   * 1. Set thread state (triggers useChat re-initialization via id change)
   * 2. Set participants (backend source of truth)
   * 3. Set initial messages (useChat reads these when threadId changes)
   * 4. Let useChat manage message state from there
   *
   * CRITICAL: When threadId changes, useChat automatically resets and uses
   * the messages state as initialMessages. We ALWAYS set state to ensure
   * proper hydration on page refresh and navigation.
   *
   * CRITICAL FIX: When threadId stays the same (e.g., navigating from overview to thread screen),
   * useChat doesn't re-initialize, so we must explicitly update its internal messages state
   * via chat.setMessages. This prevents message loss during navigation.
   *
   * NOTE: Backend handles deduplication (see backend-patterns.md)
   */
  const initializeThread = useCallback(
    (
      newThread: ChatThread,
      newParticipants: ChatParticipant[],
      newMessages?: UIMessage[],
    ) => {
      const messagesToSet = newMessages || [];

      // Check if this is a new thread to decide whether to reset hook state
      const isNewThread = currentThreadIdRef.current !== newThread.id;

      if (isNewThread) {
        // Reset error tracking state for new thread
        chat.resetHookState();
        currentThreadIdRef.current = newThread.id;
      }

      // ALWAYS set state - required for proper hydration
      // useChat reads the messages state when threadId changes
      // This ensures server-side data is properly loaded on page refresh
      setThread(newThread);
      setParticipants(newParticipants);
      setMessages(messagesToSet);

      // CRITICAL FIX: Update useChat's internal messages state
      // This is essential when threadId stays the same but messages have changed
      // (e.g., navigating from overview screen to thread screen with same thread ID)
      // AI SDK v5 Pattern: setMessages updates useChat's internal state directly
      chat.setMessages(messagesToSet);
    },
    [chat], // ✅ Only depend on chat, not thread (prevents infinite loop)
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
// eslint-disable-next-line react-refresh/only-export-components -- Standard React pattern: export context provider and hook from same file
export function useSharedChatContext() {
  const context = use(ChatContext);
  if (!context) {
    throw new Error('useSharedChatContext must be used within a ChatProvider');
  }
  return context;
}
