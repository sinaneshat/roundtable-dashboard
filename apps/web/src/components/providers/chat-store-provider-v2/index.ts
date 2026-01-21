/**
 * Chat Store Provider V2 - Public API
 *
 * Simplified provider with flow state machine.
 * Replaces 14 hooks with 3 hooks.
 */

export { ChatStoreContext } from './context';
export type { ChatStoreProviderProps } from './provider';
export { ChatStoreProvider } from './provider';
export {
  useChatStore,
  useChatStoreApi,
  useChatStoreOptional,
  useShallow,
} from './use-chat-store';
