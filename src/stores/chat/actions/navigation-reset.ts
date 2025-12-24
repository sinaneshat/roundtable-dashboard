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

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore, useModelPreferencesStore } from '@/components/providers';
import { queryKeys } from '@/lib/data/query-keys';

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
  const resetToNewChat = useChatStore(s => s.resetToNewChat);
  const thread = useChatStore(s => s.thread);
  const createdThreadId = useChatStore(s => s.createdThreadId);
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const queryClient = useQueryClient();

  // Read from cookie-persisted model preferences store
  const preferences = useModelPreferencesStore(useShallow(s => ({
    selectedModelIds: s.selectedModelIds,
    modelOrder: s.modelOrder,
    selectedMode: s.selectedMode,
    enableWebSearch: s.enableWebSearch,
  })));

  // Shared reset logic - invalidate queries and reset store
  // ✅ TEXT STREAMING: Summaries are now moderator messages in chatMessage
  // No separate summaries query to invalidate
  const doReset = useCallback(() => {
    const effectiveThreadId = thread?.id || createdThreadId;
    if (effectiveThreadId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.messages(effectiveThreadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.preSearches(effectiveThreadId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.threads.feedback(effectiveThreadId) });
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
