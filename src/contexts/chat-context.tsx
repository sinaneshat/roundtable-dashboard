'use client';

/**
 * Chat Context - AI SDK v5 Shared State Pattern - FIXED
 *
 * OFFICIAL AI SDK v5 PATTERN: Share chat state across components
 * Reference: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#share-useChat-state-across-components
 *
 * This context follows the official pattern for sharing chat state between:
 * - ChatOverviewScreen: Initial prompt and streaming before navigation
 * - ChatThreadScreen: Continued conversation on thread page
 *
 * KEY FIX (2025-01-25):
 * - Store initialMessages in local state before passing to useMultiParticipantChat
 * - This prevents message loss when threadId changes and useChat re-initializes
 * - Removed chat.setMessages() call - let useChat initialize naturally with messages prop
 *
 * ROOT CAUSE OF BUG:
 * When threadId changes from '' to actual ID, useChat re-initializes and needs
 * initialMessages prop to contain messages. Calling setMessages() AFTER initialization
 * doesn't work because useChat has already initialized with empty messages.
 *
 * KEY BENEFITS:
 * - Single source of truth for chat state
 * - No duplicate hook instances
 * - Seamless navigation between screens without state loss
 * - Eliminates setTimeout hacks and empty message triggers
 * - Messages persist correctly when threadId changes
 *
 * PATTERN:
 * 1. Context wraps useMultiParticipantChat hook
 * 2. Components access shared state via useSharedChatContext()
 * 3. Thread initialization handled by initializeThread() with local state
 * 4. Navigation happens after streaming completes (onComplete callback)
 */

import type { UIMessage } from 'ai';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

  // ✅ CRITICAL FIX: Initial messages state for proper hook initialization
  // Messages must be passed to useChat during initialization, not via setMessages() later
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  // Completion callbacks (set by components for custom behavior) - SIMPLIFIED
  const [onComplete, setOnComplete] = useState<(() => void) | undefined>(undefined);
  const [onRetry, setOnRetry] = useState<((roundNumber: number) => void) | undefined>(undefined);

  // ✅ ERROR TRACKING: Track previous threadId to detect reinitialization
  const prevThreadIdRef = useRef<string | null>(null);

  // Single chat instance shared across all screens
  // This is the core AI SDK v5 pattern - one hook instance for entire app
  const chat = useMultiParticipantChat({
    threadId: thread?.id || '',
    participants,
    messages: initialMessages, // ✅ Pass initialMessages here, not via setMessages()
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

  // ✅ ERROR TRACKING: Monitor threadId changes to detect hook reinitialization
  useEffect(() => {
    const currentThreadId = thread?.id || null;
    const prevThreadId = prevThreadIdRef.current;

    if (prevThreadId !== null && currentThreadId !== prevThreadId) {
      // ThreadId changed - useChat hook will reinitialize
      chatContextLogger.threadReinit(prevThreadId, currentThreadId || 'null', {
        messageCount: initialMessages.length,
        participantCount: participants.length,
      });
    }

    prevThreadIdRef.current = currentThreadId;
  }, [thread?.id, initialMessages.length, participants.length]);

  // ✅ ERROR TRACKING: Log when chat.messages changes (from AI SDK)
  const prevMessagesCountRef = useRef<number>(0);
  useEffect(() => {
    const currentCount = chat.messages.length;
    const prevCount = prevMessagesCountRef.current;

    if (currentCount !== prevCount) {
      chatContextLogger.messagesChanged({
        before: prevCount,
        after: currentCount,
        reason: 'AI SDK state update',
        messages: chat.messages.map(m => ({
          id: m.id,
          role: m.role,
          content: m.parts?.map(p => (p.type === 'text' ? p.text.substring(0, 50) : p.type)).join(', '),
        })),
      });

      prevMessagesCountRef.current = currentCount;
    }
  }, [chat.messages]);

  // ✅ ERROR TRACKING: Log errors from AI SDK
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
   * ✅ CRITICAL FIX: Reset hook state FIRST to prevent contamination
   * Old hook state (participant queue, round tracking, error tracking) must be cleared
   * before setting new thread data to prevent state contamination between threads
   *
   * ✅ CRITICAL FIX: Use initialMessages state pattern (AI SDK v5 best practice)
   * Messages are passed to useChat during initialization via the messages prop
   * This triggers a hook re-render with the new messages, avoiding state conflicts
   *
   * ✅ PHASE 1 DEDUPLICATION: Deduplicate both participants AND messages by ID before setting state
   * This is the PRIMARY deduplication point for messages entering the context
   *
   * PATTERN:
   * 1. Reset all hook state (participant queue, round tracking, error tracking, streaming flags)
   * 2. Set thread state
   * 3. Set participants (with deduplication)
   * 4. Set initialMessages state (triggers useMultiParticipantChat re-render)
   * 5. Hook reinitializes with new messages
   */
  const initializeThread = useCallback(
    (
      newThread: ChatThread,
      newParticipants: ChatParticipant[],
      newMessages?: UIMessage[],
    ) => {
      try {
        // ✅ CRITICAL FIX: Reset hook state FIRST before any state updates
        // This prevents old participant queue, round tracking, and error state from contaminating new thread
        console.log('[ChatContext][initializeThread] Resetting hook state before initialization', {
          threadId: newThread.id,
          participantCount: newParticipants.length,
          messageCount: newMessages?.length || 0,
        });
        chat.resetHookState();

        // ✅ ERROR TRACKING: Log thread initialization
        chatContextLogger.threadInit(newThread.id, {
          participantCount: newParticipants.length,
          messageCount: newMessages?.length || 0,
          mode: newThread.mode,
        });

        setThread(newThread);

        // ✅ Use canonical deduplication function
        // Each model should only appear once in the participant list
        const deduplicated = deduplicateParticipants(newParticipants);

        if (deduplicated.length !== newParticipants.length) {
          chatContextLogger.participantsChanged({
            before: newParticipants.length,
            after: deduplicated.length,
            reason: 'deduplication in initializeThread',
          });
        }

        setParticipants(deduplicated);

        // ✅ CRITICAL FIX: Set initialMessages state to trigger hook re-render
        // This passes messages to useChat during initialization (not via setMessages after)
        if (newMessages) {
          const deduplicatedMessages = deduplicateMessages(newMessages);

          if (deduplicatedMessages.length !== newMessages.length) {
            chatContextLogger.messagesChanged({
              before: newMessages.length,
              after: deduplicatedMessages.length,
              reason: 'deduplication in initializeThread',
            });
          }

          chatContextLogger.setMessages(deduplicatedMessages.length, 'initializeThread', {
            threadId: newThread.id,
          });

          setInitialMessages(deduplicatedMessages);
        } else {
          chatContextLogger.setMessages(0, 'clearMessages in initializeThread', {
            threadId: newThread.id,
          });
          setInitialMessages([]); // ✅ Clear messages
        }
      } catch (error) {
        // ✅ ERROR TRACKING: Log initialization errors
        chatContextLogger.error('THREAD_INIT_FAILED', error, {
          threadId: newThread.id,
          participantCount: newParticipants.length,
          messageCount: newMessages?.length || 0,
        });

        // Re-throw so calling code can handle
        throw error;
      }
    },
    [chat], // ✅ CRITICAL: Include chat dependency to access resetHookState
  );

  /**
   * Clear thread context
   * Called when navigating away from chat
   */
  const clearThread = useCallback(() => {
    setThread(null);
    setParticipants([]);
    setInitialMessages([]); // ✅ Clear initial messages
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
