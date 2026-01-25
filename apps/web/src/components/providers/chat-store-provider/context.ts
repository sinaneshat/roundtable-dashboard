/**
 * Chat Store Context and Hooks - Zustand v5 SSR Pattern for TanStack Start
 *
 * ✅ ZUSTAND V5 PATTERN:
 * - Context holds vanilla store instance (ChatStoreApi from createChatStore)
 * - useChatStore accesses context + zustand's useStore for subscriptions
 * - useStore handles React subscriptions with selector optimization
 * - ChatStoreProvider creates store via useState lazy initializer
 *
 * Usage:
 * ```tsx
 * // With selector (recommended - only re-renders when selected value changes)
 * const inputValue = useChatStore(s => s.inputValue);
 *
 * // With useShallow for object selectors (prevents re-renders on object identity change)
 * import { useShallow } from 'zustand/react/shallow';
 * const { inputValue, selectedMode } = useChatStore(useShallow(s => ({
 *   inputValue: s.inputValue,
 *   selectedMode: s.selectedMode,
 * })));
 *
 * // Access store API directly (for calling actions outside React components)
 * const store = useChatStoreApi();
 * store.getState().setInputValue('new value');
 * ```
 *
 * Reference: Official Zustand docs - "Consuming the store" + SSR section
 */
import { createContext, use } from 'react';
import { useStore } from 'zustand';

import type { ChatStore, ChatStoreApi } from '@/stores/chat';

export const ChatStoreContext = createContext<ChatStoreApi | undefined>(undefined);

/**
 * Primary hook for accessing chat store state and actions
 * Uses selector pattern for optimized re-renders
 *
 * @param selector - Function that selects specific state from store
 * @returns Selected state value
 * @throws Error if used outside ChatStoreProvider
 *
 * @example
 * ```tsx
 * const inputValue = useChatStore(s => s.inputValue);
 * const setInputValue = useChatStore(s => s.setInputValue);
 * ```
 */
export function useChatStore<T>(selector: (store: ChatStore) => T): T {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStore must be used within ChatStoreProvider');
  }

  return useStore(context, selector);
}

/**
 * Noop placeholder store for read-only contexts without ChatStoreProvider.
 * Satisfies Zustand's StoreApi interface but returns empty state.
 * This prevents "getState is not a function" errors when useStore is called.
 *
 * ✅ FRAMEWORK COMPATIBILITY CAST - Cannot be removed
 *
 * WHY THIS CAST IS NECESSARY:
 * 1. React's Rules of Hooks requires consistent hook calls across renders
 * 2. useChatStoreOptional must call useStore unconditionally
 * 3. When no context exists, we need a noop store that satisfies Zustand's StoreApi
 * 4. ChatStoreApi includes devtools middleware properties that cannot be represented statically
 * 5. The empty object cast is safe because this store is only used when context is undefined,
 *    and the function returns undefined in that case (the store value is never actually used)
 *
 * ALTERNATIVES CONSIDERED AND REJECTED:
 * - Conditional hook call: Violates Rules of Hooks
 * - Separate hook without store: Still needs compatible type for useStore overload
 * - Type-only solution: Zustand's middleware composition creates dynamic types
 */
const NOOP_STORE = {
  getState: () => ({}) as ChatStore,
  getInitialState: () => ({}) as ChatStore,
  setState: () => {},
  subscribe: () => () => {},
} as unknown as ChatStoreApi;

/**
 * Optional chat store hook for read-only contexts (e.g., public pages)
 * Returns undefined when outside ChatStoreProvider instead of throwing
 *
 * @param selector - Function that selects specific state from store
 * @returns Selected state value or undefined if outside provider
 *
 * @example
 * ```tsx
 * // In public pages where ChatStoreProvider might not be available
 * const inputValue = useChatStoreOptional(s => s.inputValue);
 * if (inputValue) {
 *   // Use the value
 * }
 * ```
 */
export function useChatStoreOptional<T>(selector: (store: ChatStore) => T): T | undefined {
  const context = use(ChatStoreContext);

  // Use NOOP_STORE when context is unavailable to avoid conditional hook calls
  // and satisfy Zustand's StoreApi interface requirements
  const storeToUse = context ?? NOOP_STORE;
  const value = useStore(storeToUse, selector);

  if (!context) {
    return undefined;
  }

  return value;
}

/**
 * Access the vanilla store API directly
 * Use this when you need to call actions imperatively (outside React render)
 *
 * @returns ChatStoreApi instance with getState, setState, subscribe
 * @throws Error if used outside ChatStoreProvider
 *
 * @example
 * ```tsx
 * // In event handlers or utilities where you need direct store access
 * const store = useChatStoreApi();
 * store.getState().setInputValue('new value');
 *
 * // Subscribe to changes outside React components
 * const unsubscribe = store.subscribe(
 *   state => state.inputValue,
 *   (inputValue) => console.log('Input changed:', inputValue)
 * );
 * ```
 */
export function useChatStoreApi(): ChatStoreApi {
  const context = use(ChatStoreContext);

  if (!context) {
    throw new Error('useChatStoreApi must be used within ChatStoreProvider');
  }

  return context;
}
