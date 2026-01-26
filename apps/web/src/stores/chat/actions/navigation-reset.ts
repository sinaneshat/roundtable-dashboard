/**
 * Navigation Reset Hook
 *
 * Zustand v5 Pattern: Store-specific action hook co-located with store
 * Automatically resets chat store when navigating to new chat.
 *
 * Handles cleanup for:
 * - Logo clicks
 * - "New Chat" button clicks
 * - Direct /chat route navigation
 *
 * Ensures:
 * - Ongoing streams are cancelled
 * - Query cache is invalidated for thread-specific data
 * - Store state is reset with preserved user preferences
 * - No memory leaks from lingering state
 *
 * Location: /src/stores/chat/actions/navigation-reset.ts
 * Used by: ChatNav component
 */
import { useQueryClient } from '@tanstack/react-query';
import { useLocation } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers/chat-store-provider/context';
import { useModelPreferencesStore } from '@/components/providers/preferences-store-provider/context';
import { invalidationPatterns } from '@/lib/data/query-keys';

/**
 * Hook that provides a callback to reset store when navigating to new chat
 *
 * @returns Callback function to call before navigating to /chat
 *
 * @example
 * ```tsx
 * const handleNewChat = useNavigationReset();
 *
 * <Link href="/chat" onClick={handleNewChat}>
 *   <Plus /> New Chat
 * </Link>
 * ```
 */
export function useNavigationReset() {
  // Batch store state and actions with useShallow for performance
  const { createdThreadId, resetToNewChat, thread } = useChatStore(useShallow(s => ({
    createdThreadId: s.createdThreadId,
    resetToNewChat: s.resetToNewChat,
    thread: s.thread,
  })));
  const { pathname } = useLocation();
  const previousPathnameRef = useRef(pathname);
  const queryClient = useQueryClient();

  // Read from cookie-persisted model preferences store
  const preferences = useModelPreferencesStore(useShallow(s => ({
    enableWebSearch: s.enableWebSearch,
    modelOrder: s.modelOrder,
    selectedMode: s.selectedMode,
    selectedModelIds: s.selectedModelIds,
  })));

  // Shared reset logic - invalidate queries and reset store
  const doReset = useCallback(() => {
    const effectiveThreadId = thread?.id || createdThreadId;
    if (effectiveThreadId) {
      invalidationPatterns.leaveThread(effectiveThreadId).forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });
    }
    resetToNewChat(preferences);
  }, [thread, createdThreadId, queryClient, resetToNewChat, preferences]);

  // Reset store when navigating FROM thread screen TO /chat
  useEffect(() => {
    const isNavigatingToChat = pathname === '/chat' && previousPathnameRef.current !== '/chat';
    if (isNavigatingToChat) {
      doReset();
    }
    previousPathnameRef.current = pathname;
  }, [pathname, doReset]);

  return doReset;
}
