'use client';

/**
 * Chat Store Context and Consumption Hooks
 *
 * Official Zustand v5 + Next.js pattern:
 * - Context with undefined default
 * - Custom hooks with context check
 */

import { createContext, use } from 'react';
import { useStore } from 'zustand';

import type { ChatStore, ChatStoreApi } from '@/stores/chat';

// ============================================================================
// CONTEXT (Official Pattern)
// ============================================================================

export const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

// ============================================================================
// CONSUMPTION HOOKS (Official Pattern)
// ============================================================================

/**
 * Hook to access chat store with selector
 *
 * @example
 * const messages = useChatStore(s => s.messages);
 * const { sendMessage, isStreaming } = useChatStore(s => ({
 *   sendMessage: s.sendMessage,
 *   isStreaming: s.isStreaming,
 * }));
 */
export function useChatStore<T>(selector: (store: ChatStore) => T): T {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStore must be used within ChatStoreProvider');
  }

  return useStore(context, selector);
}

/**
 * Get the store API for imperative access (getState)
 *
 * REACT BEST PRACTICE: Use this for reading current state inside callbacks/effects
 * without causing re-renders or infinite loops from dependency arrays.
 *
 * @example
 * const storeApi = useChatStoreApi();
 * useEffect(() => {
 *   const { messages, participants } = storeApi.getState();
 * }, [storeApi]);
 */
export function useChatStoreApi(): ChatStoreApi {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStoreApi must be used within ChatStoreProvider');
  }

  return context;
}
