/**
 * Chat Store Testing Helpers
 *
 * Utilities for creating and testing chat store instances in isolation.
 * Provides simplified helpers for testing store reset behavior.
 */

import React, { useRef } from 'react';

import { ChatStoreContext } from '@/components/providers/chat-store-provider';
import type { ChatStoreApi } from '@/stores/chat';
import { createChatStore } from '@/stores/chat';

/**
 * Simplified initial state for testing
 * Allows providing only the fields you care about for the test
 */
export type PartialChatState = Partial<ReturnType<ChatStoreApi['getState']>>;

/**
 * Create a chat store with specific initial state for testing
 *
 * This helper creates a fully functional store with custom initial state.
 * Much simpler approach - just override the defaults after creation.
 *
 * @example
 * ```typescript
 * const store = createTestChatStore({
 *   thread: { id: 'test-123', slug: 'test' },
 *   isStreaming: true,
 * });
 *
 * // Use in tests
 * const state = store.getState();
 * expect(state.isStreaming).toBe(true);
 * ```
 */
export function createTestChatStore(initialState: PartialChatState = {}): ChatStoreApi {
  const store = createChatStore();

  // Override with initial state
  if (Object.keys(initialState).length > 0) {
    store.setState(initialState as Partial<ReturnType<ChatStoreApi['getState']>>);
  }

  return store;
}

/**
 * Create a React wrapper component for providing chat store in tests
 *
 * @example
 * ```typescript
 * const store = createTestChatStore({ ... });
 * const wrapper = createStoreWrapper(store);
 *
 * render(<Component />, { wrapper });
 * ```
 */
export function createStoreWrapper(store: ChatStoreApi) {
  return function StoreWrapper({ children }: { children: React.ReactNode }) {
    const storeRef = useRef(store);
    return (
      <ChatStoreContext value={storeRef.current}>
        {children}
      </ChatStoreContext>
    );
  };
}

/**
 * Get current state from store (useful for assertions)
 *
 * @example
 * ```typescript
 * const store = createTestChatStore({ ... });
 * const state = getStoreState(store);
 * expect(state.isStreaming).toBe(false);
 * ```
 */
export function getStoreState(store: ChatStoreApi): ReturnType<ChatStoreApi['getState']> {
  return store.getState();
}

/**
 * Reset store to defaults for testing cleanup
 *
 * @example
 * ```typescript
 * const store = createTestChatStore({ isStreaming: true });
 * resetStoreToDefaults(store);
 * expect(store.getState().isStreaming).toBe(false);
 * ```
 */
export function resetStoreToDefaults(store: ChatStoreApi): void {
  const defaultState = createChatStore().getState();
  store.setState(defaultState);
}
