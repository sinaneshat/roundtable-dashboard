import type { ReactNode } from 'react';
import { useState } from 'react';

import { createChatStore } from '@/stores/chat';

import { ChatStoreContext } from './context';

/**
 * Minimal Chat Store Provider for demo/test contexts.
 *
 * Following official Zustand v5 + Next.js pattern:
 * - Uses useState(() => createStore()) for single initialization
 * - Provides store via Context without sync hooks
 * - Used for LiveChatDemo and test scenarios
 *
 * @see https://github.com/pmndrs/zustand/blob/main/docs/guides/nextjs.md
 * @see https://github.com/pmndrs/zustand/blob/main/docs/guides/testing.md
 */
export function ChatStoreDemoProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => createChatStore());

  return (
    <ChatStoreContext value={store}>
      {children}
    </ChatStoreContext>
  );
}
