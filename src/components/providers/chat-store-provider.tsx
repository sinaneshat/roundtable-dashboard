'use client';

/**
 * Chat Store Provider - Official Next.js + Zustand Pattern
 *
 * OFFICIAL PATTERN:
 * - Vanilla store factory
 * - React Context for distribution
 * - useStore hook for consumption
 * - Per-provider store instance
 *
 * BRIDGES:
 * - AI SDK hook (useMultiParticipantChat)
 * - Zustand store (vanilla pattern)
 *
 * OPTIMIZATIONS:
 * - Callbacks stored as refs (no reactivity needed)
 * - Consolidated sync effects (reduced re-renders)
 * - Error handling via callback (not store state)
 *
 * BENEFITS:
 * - Proper Next.js SSR compatibility
 * - Per-instance isolation (no singleton)
 * - Type-safe store consumption
 * - Minimal re-renders
 *
 */

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { createContext, use, useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';

import { useMultiParticipantChat } from '@/hooks/utils';
import { queryKeys } from '@/lib/data/query-keys';
import { showApiErrorToast } from '@/lib/toast';
import type { ChatStore, ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

// ============================================================================
// CONTEXT (Official Pattern)
// ============================================================================

const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

export type ChatStoreProviderProps = {
  children: ReactNode;
};

export function ChatStoreProvider({ children }: ChatStoreProviderProps) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const storeRef = useRef<ChatStoreApi | null>(null);
  const prevPathnameRef = useRef<string | null>(null);

  // Official Pattern: Initialize store once per provider
  if (storeRef.current === null) {
    storeRef.current = createChatStore();
  }

  // eslint-disable-next-line react-hooks/refs -- Official Zustand pattern: store ref accessed during render
  const store = storeRef.current;

  // ✅ OPTIMIZATION: Callbacks as refs (no reactivity needed, prevents re-renders)
  const onCompleteRef = useRef<(() => void) | undefined>(undefined);
  const onRetryRef = useRef<((roundNumber: number) => void) | undefined>(undefined);

  // Get current state for AI SDK hook initialization (minimal subscriptions)
  const thread = useStore(store, s => s.thread);
  const participants = useStore(store, s => s.participants);
  const messages = useStore(store, s => s.messages);

  // ✅ OPTIMIZATION: Error handling via callback (not store state)
  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  // Initialize AI SDK hook with store state
  const chat = useMultiParticipantChat({
    threadId: thread?.id || '',
    participants,
    messages,
    mode: thread?.mode,
    onComplete: () => onCompleteRef.current?.(),
    onRetry: (roundNumber: number) => onRetryRef.current?.(roundNumber),
    onError: handleError,
  });

  // ✅ QUOTA INVALIDATION: Use refs to capture latest functions and avoid circular deps
  const sendMessageRef = useRef(chat.sendMessage);
  const startRoundRef = useRef(chat.startRound);

  // Keep refs in sync
  useEffect(() => {
    sendMessageRef.current = chat.sendMessage;
    startRoundRef.current = chat.startRound;
  }, [chat.sendMessage, chat.startRound]);

  // ✅ QUOTA INVALIDATION: Wrap functions to invalidate quota immediately when streaming starts
  const sendMessageWithQuotaInvalidation = useCallback(async (content: string) => {
    // ✅ Invalidate usage quota immediately when message streaming starts
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.messageQuota() });

    return sendMessageRef.current(content);
  }, [queryClient]);

  const startRoundWithQuotaInvalidation = useCallback(() => {
    // ✅ Invalidate usage quota immediately when round starts
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.stats() });
    queryClient.invalidateQueries({ queryKey: queryKeys.usage.messageQuota() });

    return startRoundRef.current();
  }, [queryClient]);

  // ✅ OPTIMIZATION: Consolidated sync effect (single effect, batched updates)
  // React batches multiple setState calls in the same effect automatically
  // ✅ FIX: Sync chat.setMessages so refetch can update useChat state directly
  useEffect(() => {
    storeRef.current?.setState({
      sendMessage: sendMessageWithQuotaInvalidation,
      startRound: startRoundWithQuotaInvalidation,
      retry: chat.retry,
      stop: chat.stop,
      chatSetMessages: chat.setMessages, // ✅ Expose chat's setMessages
      messages: chat.messages,
      isStreaming: chat.isStreaming,
      currentParticipantIndex: chat.currentParticipantIndex,
    });
  }, [
    sendMessageWithQuotaInvalidation,
    startRoundWithQuotaInvalidation,
    chat.retry,
    chat.stop,
    chat.setMessages,
    chat.messages,
    chat.isStreaming,
    chat.currentParticipantIndex,
  ]);

  // ✅ CLEANUP: Only stop streaming on navigation, don't reset state
  // Screen components manage their own state via useScreenInitialization and thread.id changes
  useEffect(() => {
    const prevPath = prevPathnameRef.current;
    const currentPath = pathname;

    // Skip on initial mount
    if (prevPath === null) {
      prevPathnameRef.current = currentPath;
      return;
    }

    // Only cleanup if pathname actually changed (navigation between different pages)
    if (prevPath === currentPath) {
      return;
    }

    // Stop any ongoing streaming before navigation
    const currentState = storeRef.current?.getState();
    if (currentState?.isStreaming) {
      currentState.stop?.();
    }

    // Clear callbacks
    onCompleteRef.current = undefined;
    onRetryRef.current = undefined;

    // Update previous pathname
    prevPathnameRef.current = currentPath;
  }, [pathname]);

  return (
    <ChatStoreContext value={store}>
      <CallbackProvider onCompleteRef={onCompleteRef} onRetryRef={onRetryRef}>
        {children}
      </CallbackProvider>
    </ChatStoreContext>
  );
}

// ============================================================================
// CALLBACK CONTEXT (Refs-based, no re-renders)
// ============================================================================

type CallbackContextValue = {
  registerOnComplete: (callback: (() => void) | undefined) => void;
  registerOnRetry: (callback: ((roundNumber: number) => void) | undefined) => void;
};

const CallbackContext = createContext<CallbackContextValue | undefined>(undefined);

function CallbackProvider({
  children,
  onCompleteRef,
  onRetryRef,
}: {
  children: ReactNode;
  onCompleteRef: React.MutableRefObject<(() => void) | undefined>;
  onRetryRef: React.MutableRefObject<((roundNumber: number) => void) | undefined>;
}) {
  // ✅ Stable callbacks that update refs (no dependencies, never change)
  const registerOnComplete = useCallback((callback: (() => void) | undefined) => {
    onCompleteRef.current = callback;
  }, [onCompleteRef]);

  const registerOnRetry = useCallback((callback: ((roundNumber: number) => void) | undefined) => {
    onRetryRef.current = callback;
  }, [onRetryRef]);

  const value = useMemo(() => ({
    registerOnComplete,
    registerOnRetry,
  }), [registerOnComplete, registerOnRetry]);

  return (
    <CallbackContext value={value}>
      {children}
    </CallbackContext>
  );
}

/**
 * Hook to register callbacks (used by useChatInitialization)
 */
// eslint-disable-next-line react-refresh/only-export-components -- Utility hook export
export function useChatCallbacks() {
  const context = use(CallbackContext);

  if (!context) {
    throw new Error('useChatCallbacks must be used within ChatStoreProvider');
  }

  return context;
}

// ============================================================================
// CONSUMPTION HOOK (Official Pattern)
// ============================================================================

// eslint-disable-next-line react-refresh/only-export-components -- Store hook export
export function useChatStore<T>(selector: (store: ChatStore) => T): T {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStore must be used within ChatStoreProvider');
  }

  return useStore(context, selector);
}
