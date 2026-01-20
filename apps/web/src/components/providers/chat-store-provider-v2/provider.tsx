/**
 * Chat Store Provider - V2
 *
 * Simplified provider with 5 hooks replacing 14 hooks from v1.
 * Uses flow state machine for explicit phase management.
 *
 * ZUSTAND V5 SSR PATTERNS:
 * 1. Factory Pattern: createChatStore() returns vanilla store
 * 2. useState Lazy Init: Store created once per provider instance
 * 3. Context Distribution: ChatStoreContext provides store to consumers
 *
 * NO COMPLEX RESUMPTION:
 * - Backend queue completes rounds independently
 * - Page refresh = poll for completion instead of resume mid-stream
 * - useRoundPolling handles incomplete round detection
 */

import type { ReactNode } from 'react';
import { useCallback, useState, useSyncExternalStore } from 'react';

import { showApiErrorToast } from '@/lib/toast';
import { createChatStore } from '@/stores/chat-v2';

import { ChatStoreContext } from './context';
import {
  useChangelogSync,
  useFlowOrchestrator,
  usePreSearchModerator,
  useRoundPolling,
  useStreaming,
} from './hooks';

export type ChatStoreProviderProps = {
  children: ReactNode;
  /** Thread slug for URL handling and backend sync */
  slug?: string;
};

/**
 * Chat Store Provider - V2
 *
 * Provides simplified chat state management to the component tree.
 * Uses flow state machine for explicit phase transitions.
 */
export function ChatStoreProvider({ children, slug }: ChatStoreProviderProps) {
  // Create store via useState lazy initializer for SSR isolation
  const [store] = useState(() => createChatStore());

  // Subscribe to thread ID changes reactively
  const effectiveThreadId = useSyncExternalStore(
    store.subscribe,
    () => store.getState().thread?.id || store.getState().createdThreadId || '',
    () => '', // Server snapshot
  );

  // Subscribe to created slug for URL handling
  const createdSlug = useSyncExternalStore(
    store.subscribe,
    () => store.getState().createdSlug,
    () => null,
  );

  // Effective slug - prop or created
  const effectiveSlug = slug ?? createdSlug ?? undefined;

  // Error handler for streaming
  const handleError = useCallback((error: Error) => {
    showApiErrorToast('Chat error', error);
  }, []);

  // Initialize hooks
  const streaming = useStreaming({
    store,
    threadId: effectiveThreadId,
    onError: handleError,
  });

  const preSearchModerator = usePreSearchModerator({
    store,
  });

  // Changelog sync for follow-up rounds with config changes
  useChangelogSync({
    store,
    effectiveThreadId,
  });

  // Orchestrate flow based on state changes
  useFlowOrchestrator({
    store,
    streaming,
    preSearchModerator,
    slug: effectiveSlug,
  });

  // Poll for incomplete rounds (page refresh scenario)
  useRoundPolling({
    store,
    slug: effectiveSlug,
    pollInterval: 2000,
    maxPollDuration: 60000, // 1 minute timeout
  });

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}
