/**
 * Thread Header Context - UI-Only State
 *
 * ✅ ZUSTAND PATTERN: Thread title comes from store (store.thread.title)
 * ✅ REACT PATTERN: Thread actions (ReactNode) stay in React context
 *
 * ReactNode should NOT be stored in Zustand because:
 * - Breaks serialization/persistence patterns
 * - DevTools can't display React elements
 * - Mixes UI concerns with state management
 */
import type { ReactNode } from 'react';
import { createContext, use, useMemo, useState } from 'react';

type ThreadHeaderContextValue = {
  /** UI components for thread header actions (ReactNode stays in React context) */
  threadActions: ReactNode | null;
  setThreadActions: (actions: ReactNode | null) => void;
};

const ThreadHeaderContext = createContext<ThreadHeaderContextValue | undefined>(undefined);

export function ThreadHeaderProvider({ children }: { children: ReactNode }) {
  const [threadActions, setThreadActions] = useState<ReactNode | null>(null);

  // ✅ RENDER OPTIMIZATION: setState is stable, only include state values
  const value = useMemo(
    () => ({
      setThreadActions,
      threadActions,
    }),
    [threadActions],
  );

  return (
    <ThreadHeaderContext value={value}>
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
    setThreadActions: () => {},
    threadActions: null,
  };
}
