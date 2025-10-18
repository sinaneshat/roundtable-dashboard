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
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

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

  // Thread management
  initializeThread: (
    thread: ChatThread,
    participants: ChatParticipant[],
    initialMessages?: UIMessage[]
  ) => void;
  clearThread: () => void;
  updateParticipants: (participants: ChatParticipant[]) => void; // ✅ Update participants (local only, persisted on next message)

  // Callbacks
  onStreamComplete?: () => void;
  setOnStreamComplete: (callback: (() => void) | undefined) => void;
  onRoundComplete?: () => void;
  setOnRoundComplete: (callback: (() => void) | undefined) => void;
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

  // Single chat instance shared across all screens
  // This is the core AI SDK v5 pattern - one hook instance for entire app
  const chat = useMultiParticipantChat({
    threadId: thread?.id || '',
    participants,
    messages: initialMessages,
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
  });

  /**
   * Initialize or update thread context
   * Called when navigating to a thread or creating a new one
   */
  const initializeThread = useCallback(
    (
      newThread: ChatThread,
      newParticipants: ChatParticipant[],
      newMessages?: UIMessage[],
    ) => {
      setThread(newThread);
      setParticipants(newParticipants);

      // Convert and set initial messages if provided
      if (newMessages) {
        setInitialMessages(newMessages);
      } else {
        setInitialMessages([]);
      }
    },
    [],
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
  }, []);

  /**
   * Update participants (staged changes - persisted on next message)
   * Called when user changes participant configuration in UI
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
      onStreamComplete,
      setOnStreamComplete: (callback: (() => void) | undefined) =>
        setOnStreamComplete(() => callback),
      onRoundComplete,
      setOnRoundComplete: (callback: (() => void) | undefined) =>
        setOnRoundComplete(() => callback),
    }),
    [thread, participants, chat, initializeThread, clearThread, updateParticipants, onStreamComplete, onRoundComplete],
  );

  return <ChatContext value={value}>{children}</ChatContext>;
}

/**
 * Hook to access shared chat context
 * Must be used within ChatProvider
 *
 * IMPORTANT: Uses useContext (not React 19's 'use' hook) to match AI SDK v5 documentation
 * pattern and ensure SSR compatibility with Next.js 15.
 *
 * @example
 * ```tsx
 * const { messages, sendMessage, isStreaming } = useSharedChatContext();
 * ```
 */
export function useSharedChatContext() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useSharedChatContext must be used within a ChatProvider');
  }
  return context;
}
