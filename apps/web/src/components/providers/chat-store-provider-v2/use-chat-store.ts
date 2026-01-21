/**
 * useChatStore Hook - V2
 *
 * Hook for accessing the chat store from components.
 * Must be used within ChatStoreProvider.
 */

import { use } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

import type { ChatStore } from '@/stores/chat-v2';

import { ChatStoreContext } from './context';

/**
 * Access the chat store with a selector
 *
 * @param selector - Function to select state from the store
 * @returns Selected state value
 * @throws Error if used outside ChatStoreProvider
 *
 * @example
 * // Select single value
 * const thread = useChatStore(s => s.thread);
 *
 * @example
 * // Select multiple values with useShallow (prevents unnecessary re-renders)
 * const { thread, messages } = useChatStore(useShallow(s => ({
 *   thread: s.thread,
 *   messages: s.messages,
 * })));
 *
 * @example
 * // Select actions (stable references, no useShallow needed)
 * const dispatch = useChatStore(s => s.dispatch);
 */
export function useChatStore<T>(selector: (state: ChatStore) => T): T {
  const store = use(ChatStoreContext);

  if (!store) {
    throw new Error('useChatStore must be used within ChatStoreProvider');
  }

  return useStore(store, selector);
}

/**
 * Access the raw store API (for advanced use cases)
 *
 * @returns The store API with getState, setState, subscribe
 * @throws Error if used outside ChatStoreProvider
 */
export function useChatStoreApi() {
  const store = use(ChatStoreContext);

  if (!store) {
    throw new Error('useChatStoreApi must be used within ChatStoreProvider');
  }

  return store;
}

/**
 * Optional chat store access - returns undefined when not in ChatStoreProvider
 *
 * Use this for components that may render outside the provider (e.g., public pages).
 *
 * @param selector - Function to select state from the store
 * @returns Selected state value or undefined if outside provider
 */
export function useChatStoreOptional<T>(
  selector: (state: ChatStore) => T,
): T | undefined {
  const store = use(ChatStoreContext);

  // Early return undefined if no store (outside provider)
  if (!store) {
    return undefined;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStore(store, selector);
}

// Re-export useShallow for convenience
export { useShallow };
