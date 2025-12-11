/**
 * Chat Store Provider
 *
 * Official Zustand v5 + Next.js pattern for chat state management.
 * Bridges AI SDK with Zustand store for the multi-participant chat feature.
 */

// Context and hooks (public API)
export { ChatStoreContext, useChatStore, useChatStoreApi } from './context';

// Provider component
export { ChatStoreProvider } from './provider';

// Types
export type { ChatStoreProviderProps } from './types';
