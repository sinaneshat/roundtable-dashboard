/**
 * Chat Store Context - V2
 *
 * React Context for distributing the Zustand store to consumers.
 * Uses the new React 19 context pattern with default null.
 */

import { createContext } from 'react';

import type { ChatStoreApi } from '@/stores/chat-v2';

/**
 * Context for accessing the chat store.
 * Must be accessed within ChatStoreProvider.
 */
export const ChatStoreContext = createContext<ChatStoreApi | null>(null);
