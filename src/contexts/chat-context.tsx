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
 * KEY SIMPLIFICATIONS:
 * - Removed initialMessages state (use chat.setMessages() directly)
 * - Merged onStreamComplete + onRoundComplete into single onComplete callback
 * - Simplified callback wrapper functions (removed triple-wrapping)
 *
 * KEY BENEFITS:
 * - Single source of truth for chat state
 * - No duplicate hook instances
 * - Seamless navigation between screens without state loss
 * - Eliminates setTimeout hacks and empty message triggers
 * - ~30 lines of code removed
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
import { useMultiParticipantChat } from '@/hooks/utils';
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

  // Completion callbacks (set by components for custom behavior) - SIMPLIFIED
  const [onComplete, setOnComplete] = useState<(() => void) | undefined>(undefined);
  const [onRetry, setOnRetry] = useState<((roundNumber: number) => void) | undefined>(undefined);

  // Single chat instance shared across all screens
  // This is the core AI SDK v5 pattern - one hook instance for entire app
  const chat = useMultiParticipantChat({
    threadId: thread?.id || '',
    participants,
    mode: thread?.mode, // ✅ Pass mode for changelog tracking
    onComplete: () => {
      // ✅ SIMPLIFIED: Single callback for both stream and round completion
      if (onComplete) {
        onComplete();
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
   * ✅ SIMPLIFIED: Removed initialMessages state, use chat.setMessages() directly
   * ✅ PHASE 1 DEDUPLICATION: Deduplicate both participants AND messages by ID before setting state
   * This is the PRIMARY deduplication point for messages entering the context
   *
   * MIGRATION NOTE (2025-01-24):
   * - Removed setInitialMessages() → Use chat.setMessages() directly
   * - Eliminated intermediate state → Simpler data flow
   */
  const initializeThread = useCallback(
    (
      newThread: ChatThread,
      newParticipants: ChatParticipant[],
      newMessages?: UIMessage[],
    ) => {
      setThread(newThread);

      // ✅ Use canonical deduplication function
      // Each model should only appear once in the participant list
      const deduplicated = deduplicateParticipants(newParticipants);
      setParticipants(deduplicated);

      // ✅ SIMPLIFIED: Set messages directly on chat (no intermediate state)
      // This ensures AI SDK state is immediately in sync
      if (newMessages) {
        const deduplicatedMessages = deduplicateMessages(newMessages);
        chat.setMessages(deduplicatedMessages);
      } else {
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
    setOnComplete(undefined);
    setOnRetry(undefined);
  }, []);

  /**
   * Update participants (staged changes - persisted on next message)
   * Called when user changes participant configuration in UI
   *
   * ✅ DEDUPLICATION: Deduplicate participants by both ID and modelId
   * This prevents duplicate participants from ever entering the state,
   * ensuring each model appears only once in the participant list.
   */
  const updateParticipants = useCallback((newParticipants: ChatParticipant[]) => {
    // Use canonical deduplication function
    const deduplicated = deduplicateParticipants(newParticipants);
    setParticipants(deduplicated);
  }, []);

  // ✅ SIMPLIFIED: Direct callback setters (no triple-wrapping)
  // React treats function arguments as state updaters, so we wrap them once
  const wrappedSetOnComplete = useCallback((callback: (() => void) | undefined) => {
    setOnComplete(() => callback);
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
      onComplete,
      setOnComplete: wrappedSetOnComplete,
      onRetry,
      setOnRetry: wrappedSetOnRetry,
    }),
    [thread, participants, chat, initializeThread, clearThread, updateParticipants, onComplete, onRetry, wrappedSetOnComplete, wrappedSetOnRetry],
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
