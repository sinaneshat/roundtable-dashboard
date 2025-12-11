import type { ReactNode } from 'react';

import type { useCreatePreSearchMutation } from '@/hooks/mutations';
import type { useMultiParticipantChat } from '@/hooks/utils';

/**
 * Chat method returned by useMultiParticipantChat hook
 */
export type ChatHook = ReturnType<typeof useMultiParticipantChat>;

/**
 * Pre-search mutation returned by useCreatePreSearchMutation hook
 */
export type CreatePreSearchMutation = ReturnType<typeof useCreatePreSearchMutation>;

/**
 * Props for ChatStoreProvider
 */
export type ChatStoreProviderProps = {
  children: ReactNode;
};
