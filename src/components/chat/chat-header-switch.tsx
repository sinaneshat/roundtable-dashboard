'use client';
import { usePathname } from 'next/navigation';

import { useChatStore } from '@/components/providers/chat-store-provider';

import { MinimalHeader, NavigationHeader } from './chat-header';

export function ChatHeaderSwitch() {
  const pathname = usePathname();

  // Store state to detect active thread even when URL is still /chat
  const showInitialUI = useChatStore(s => s.showInitialUI);
  const createdThreadId = useChatStore(s => s.createdThreadId);
  const thread = useChatStore(s => s.thread);

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
