'use client';
import type { ReactNode } from 'react';
import { createContext, use, useMemo, useState } from 'react';

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
  const value = useMemo(
    () => ({
      threadActions,
      setThreadActions,
      threadTitle,
      setThreadTitle,
    }),
    [threadActions, threadTitle],
  );
  return (
    <ThreadHeaderContext
      value={value}
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
export function useThreadHeaderOptional(): ThreadHeaderContextValue {
  const context = use(ThreadHeaderContext);
  return context ?? {
    threadTitle: null,
    threadActions: null,
    setThreadTitle: () => {},
    setThreadActions: () => {},
  };
}
