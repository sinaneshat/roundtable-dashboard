'use client';

import { useSyncExternalStore } from 'react';

/**
 * Returns true only on the client after hydration.
 * Uses useSyncExternalStore to avoid hydration mismatch and lint warnings.
 *
 * React 19 pattern for client-only rendering without useEffect.
 */

function subscribe(_onStoreChange: () => void): () => void {
  // No subscriptions needed - value never changes after initial render
  return () => {};
}

function getSnapshot(): boolean {
  return true;
}

function getServerSnapshot(): boolean {
  return false;
}

export function useIsMounted(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
