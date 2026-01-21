/**
 * Chat Store Testing Helpers
 *
 * Utilities for creating and testing chat store instances in isolation.
 */

import React, { useRef } from 'react';

import { ChatStoreContext } from '@/components/providers';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

export type PartialChatState = Partial<ReturnType<ChatStoreApi['getState']>>;

export function createTestChatStore(initialState: PartialChatState = {}): ChatStoreApi {
  const store = createChatStore();

  if (Object.keys(initialState).length > 0) {
    store.setState(initialState);
  }

  return store;
}

export function createStoreWrapper(store: ChatStoreApi) {
  return function StoreWrapper({ children }: { children: React.ReactNode }) {
    const storeRef = useRef(store);
    return <ChatStoreContext value={storeRef.current}>{children}</ChatStoreContext>;
  };
}

export function getStoreState(store: ChatStoreApi): ReturnType<ChatStoreApi['getState']> {
  return store.getState();
}

export function resetStoreToDefaults(store: ChatStoreApi): void {
  const defaultState = createChatStore().getState();
  store.setState(defaultState);
}
