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

export function useChatStoreApi(): ChatStoreApi {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStoreApi must be used within ChatStoreProvider');
  }

  return context;
}

/**
 * Optional version of useChatStore that returns undefined when outside ChatStoreProvider.
 * Use this for components that render in both protected chat context and public/read-only views.
 *
 * NOTE: The conditional useStore call is safe because context availability never changes
 * during a component's lifecycle - protected routes always have the provider while
 * public routes never have it. This maintains stable hook call order.
 */
export function useChatStoreOptional<T>(selector: (store: ChatStore) => T): T | undefined {
  const context = use(ChatStoreContext);

  if (!context) {
    return undefined;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- Safe: context availability is constant per route
  return useStore(context, selector);
}
