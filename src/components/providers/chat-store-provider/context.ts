'use client';

import { createContext, use } from 'react';
import { useStore } from 'zustand';

import type { ChatStore, ChatStoreApi } from '@/stores/chat';

export const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

export function useChatStore<T>(selector: (store: ChatStore) => T): T {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStore must be used within ChatStoreProvider');
  }

  return useStore(context, selector);
}

/**
 * Safe version of useChatStore that returns undefined when outside provider.
 * Use for components that may render in demo/standalone contexts.
 */
export function useChatStoreSafe<T>(selector: (store: ChatStore) => T): T | undefined {
  const context = use(ChatStoreContext);

  if (!context) {
    return undefined;
  }

  return useStore(context, selector);
}

export function useChatStoreApi(): ChatStoreApi {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStoreApi must be used within ChatStoreProvider');
  }

  return context;
}
