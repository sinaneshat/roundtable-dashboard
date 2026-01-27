import type { ReactNode } from 'react';

import type { useMultiParticipantChat } from '@/hooks/utils';
import type { ChatStoreInitialState } from '@/stores/chat';

/**
 * Chat method returned by useMultiParticipantChat hook
 */
export type ChatHook = ReturnType<typeof useMultiParticipantChat>;

/**
 * Props for ChatStoreProvider
 */
export type ChatStoreProviderProps = {
  children: ReactNode;
  /**
   * Initial state for SSR hydration.
   * When provided, the store is created with data already populated,
   * preventing the flash that occurs when hydrating an empty store.
   */
  initialState?: ChatStoreInitialState;
};
