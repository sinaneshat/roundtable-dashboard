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

  // ✅ RENDER OPTIMIZATION FIX: Remove setState functions from useMemo deps
  // setState functions from useState are STABLE and never change
  // Including them in deps causes useMemo to re-run on every render
  // This triggers unnecessary re-renders of all consumers
  const value = useMemo(
    () => ({
      threadActions,
      setThreadActions,
      threadTitle,
      setThreadTitle,
    }),
    [threadActions, threadTitle], // Only state values, NOT setters
  );
  return (
    <ThreadHeaderContext
      value={value}
    >
      {children}
    </ThreadHeaderContext>
  );
}
// eslint-disable-next-line react-refresh/only-export-components -- Hook closely related to ThreadHeaderProvider component
export function useThreadHeader() {
  const context = use(ThreadHeaderContext);
  if (context === undefined) {
    throw new Error('useThreadHeader must be used within ThreadHeaderProvider');
  }
  return context;
}
// eslint-disable-next-line react-refresh/only-export-components -- Hook closely related to ThreadHeaderProvider component
export function useThreadHeaderOptional(): ThreadHeaderContextValue {
  const context = use(ThreadHeaderContext);
  return context ?? {
    threadTitle: null,
    threadActions: null,
    setThreadTitle: () => {},
    setThreadActions: () => {},
  };
}
