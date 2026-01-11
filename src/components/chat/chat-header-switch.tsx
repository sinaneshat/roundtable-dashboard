'use client';
import { useShallow } from 'zustand/react/shallow';

import { useChatStore } from '@/components/providers';
import { useCurrentPathname } from '@/hooks/utils';

import { MinimalHeader, NavigationHeader } from './chat-header';

export function ChatHeaderSwitch() {
  const pathname = useCurrentPathname();

  // Store state to detect active thread even when URL is still /chat
  // ✅ OPTIMIZATION: Batch all selectors with useShallow to prevent multiple re-renders
  const { showInitialUI, createdThreadId, thread } = useChatStore(
    useShallow(s => ({
      showInitialUI: s.showInitialUI,
      createdThreadId: s.createdThreadId,
      thread: s.thread,
    })),
  );

  // Thread is active when created from overview (URL stays /chat but store has thread)
  const hasActiveThread = !showInitialUI && (createdThreadId || thread);

  // Show NavigationHeader when:
  // 1. On a thread page (/chat/[slug]) - pathname check
  // 2. On /chat with active thread - store state check (thread created, streaming started)
  if (pathname === '/chat' && !hasActiveThread) {
    return <MinimalHeader />;
  }

  return <NavigationHeader />;
}
