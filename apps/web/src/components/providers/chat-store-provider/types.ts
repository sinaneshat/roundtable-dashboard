import type { ReactNode } from 'react';

import type { useMultiParticipantChat } from '@/hooks/utils';

/**
 * Chat method returned by useMultiParticipantChat hook
 */
export type ChatHook = ReturnType<typeof useMultiParticipantChat>;

/**
 * Props for ChatStoreProvider
 */
export type ChatStoreProviderProps = {
  children: ReactNode;
};
