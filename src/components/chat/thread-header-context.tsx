'use client';

import type { ReactNode } from 'react';
import { createContext, use, useState } from 'react';

/**
 * Thread Header Context
 *
 * Provides a way for child components (like ChatThreadScreen) to pass
 * thread-specific actions up to the layout's NavigationHeader.
 *
 * This solves the Next.js limitation where layouts can't receive props from pages.
 */

type ThreadHeaderContextValue = {
  threadActions: ReactNode | null;
  setThreadActions: (actions: ReactNode | null) => void;
  threadTitle: string | null;
  setThreadTitle: (title: string | null) => void;
};

const ThreadHeaderContext = createContext<ThreadHeaderContextValue | undefined>(undefined);

export function ThreadHeaderProvider({ children }: { children: ReactNode }) {
  const [threadActions, setThreadActions] = useState<ReactNode | null>(null);
  const [threadTitle, setThreadTitle] = useState<string | null>(null);

  return (
    <ThreadHeaderContext
      value={{
        threadActions,
        setThreadActions,
        threadTitle,
        setThreadTitle,
      }}
    >
      {children}
    </ThreadHeaderContext>
  );
}

export function useThreadHeader() {
  const context = use(ThreadHeaderContext);
  if (context === undefined) {
    throw new Error('useThreadHeader must be used within ThreadHeaderProvider');
  }
  return context;
}

/**
 * Optional version of useThreadHeader that returns default values if not within provider
 * Use this for components that might be rendered outside of ThreadHeaderProvider (e.g., public pages)
 */
export function useThreadHeaderOptional(): ThreadHeaderContextValue {
  const context = use(ThreadHeaderContext);
  return context ?? {
    threadTitle: null,
    threadActions: null,
    setThreadTitle: () => {},
    setThreadActions: () => {},
  };
}
