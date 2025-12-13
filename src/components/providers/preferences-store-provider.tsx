'use client';

/**
 * Preferences Store Provider - Zustand v5 Official Next.js Pattern
 *
 * ============================================================================
 * OFFICIAL ZUSTAND V5 + NEXT.JS PATTERN (from Context7 docs)
 * ============================================================================
 * Source: https://github.com/pmndrs/zustand/blob/main/docs/guides/nextjs.md
 * Source: https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md
 *
 * PATTERN:
 * 1. createContext with undefined default
 * 2. useRef to create store once per instance
 * 3. Accept initial state from server (SSR hydration)
 * 4. useEffect to trigger manual rehydration
 * 5. Custom hook with context check
 * 6. useHydration hook for hydration status
 */

import type { ReactNode } from 'react';
import { createContext, use, useEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';

import type {
  ModelPreferencesState,
  ModelPreferencesStore,
  ModelPreferencesStoreApi,
} from '@/stores/preferences/store';
import {
  createModelPreferencesStore,
  initPreferencesStore,
} from '@/stores/preferences/store';

// ============================================================================
// CONTEXT (Official Pattern)
// Source: nextjs.md - "createContext<CounterStoreApi | undefined>(undefined)"
// ============================================================================

const PreferencesStoreContext = createContext<ModelPreferencesStoreApi | undefined>(
  undefined,
);

// ============================================================================
// PROVIDER PROPS
// ============================================================================

export type PreferencesStoreProviderProps = {
  children: ReactNode;
  /**
   * Initial state from server-side cookie parsing
   * Enables instant hydration without flash of default state
   */
  initialState?: ModelPreferencesState | null;
};

// ============================================================================
// PROVIDER (Official Pattern)
// Source: nextjs.md - "CounterStoreProvider"
// ============================================================================

export function PreferencesStoreProvider({
  children,
  initialState,
}: PreferencesStoreProviderProps) {
  const storeRef = useRef<ModelPreferencesStoreApi | null>(null);

  // Official Pattern: Initialize store once per provider instance
  // Source: nextjs.md - "if (storeRef.current === null)"
  if (storeRef.current === null) {
    storeRef.current = createModelPreferencesStore(
      initPreferencesStore(initialState),
    );
  }

  // Official Pattern: Manual rehydration for persist + skipHydration
  // Source: persist.md - "useBoundStore.persist.rehydrate()"
  useEffect(() => {
    // Only rehydrate if no server state was provided
    // Server state means we already have the data - no need to read cookies again
    if (!initialState && storeRef.current) {
      storeRef.current.persist.rehydrate();
    }
  }, [initialState]);

  const store = storeRef.current;

  return (
    <PreferencesStoreContext value={store}>
      {children}
    </PreferencesStoreContext>
  );
}

// ============================================================================
// CONSUMPTION HOOK (Official Pattern)
// Source: nextjs.md - "useCounterStore"
// ============================================================================

/**
 * Hook to access model preferences store with selector
 *
 * @example
 * const selectedModelIds = useModelPreferencesStore(s => s.selectedModelIds);
 * const { toggleModel, isModelSelected } = useModelPreferencesStore(s => ({
 *   toggleModel: s.toggleModel,
 *   isModelSelected: s.isModelSelected,
 * }));
 */
// eslint-disable-next-line react-refresh/only-export-components -- Store hook export
export function useModelPreferencesStore<T>(
  selector: (store: ModelPreferencesStore) => T,
): T {
  const storeContext = use(PreferencesStoreContext);

  if (!storeContext) {
    throw new Error(
      'useModelPreferencesStore must be used within PreferencesStoreProvider',
    );
  }

  return useStore(storeContext, selector);
}

// ============================================================================
// HYDRATION HOOK (Official Zustand v5 Pattern)
// Source: https://github.com/pmndrs/zustand/blob/main/docs/integrations/persisting-store-data.md
// ============================================================================

/**
 * Hook to track store hydration status
 *
 * ✅ OFFICIAL ZUSTAND V5 PATTERN (from Context7 docs):
 * 1. Subscribe to onHydrate and onFinishHydration FIRST
 * 2. THEN check hasHydrated() synchronously to catch race condition
 * 3. Return boolean indicating if store is ready
 *
 * This pattern handles the case where rehydration completes before
 * the effect subscribes to the finish event.
 *
 * @example
 * const hydrated = useModelPreferencesHydrated();
 * if (!hydrated) return <Loading />;
 */
// eslint-disable-next-line react-refresh/only-export-components -- Store hook export
export function useModelPreferencesHydrated(): boolean {
  const storeContext = use(PreferencesStoreContext);
  // ✅ OFFICIAL PATTERN: Initialize with false, let effect handle hydration state
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!storeContext) {
      return;
    }

    // ✅ OFFICIAL PATTERN: Subscribe to hydration events FIRST
    // Source: persist.md - "onHydrate" and "onFinishHydration"
    // Note: onHydrate is for manual rehydration scenarios
    const unsubHydrate = storeContext.persist.onHydrate(() => {
      setHydrated(false);
    });

    const unsubFinishHydration = storeContext.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    // ✅ OFFICIAL PATTERN: THEN check if already hydrated (catches race condition)
    // This sync call is intentional - subscriptions are set up first, so any future
    // hydration events will still be captured even if this triggers a re-render
    // eslint-disable-next-line react-hooks-extra/no-direct-set-state-in-use-effect -- Official Zustand v5 pattern: sync setState after subscribing to catch completed hydration
    setHydrated(storeContext.persist.hasHydrated());

    return () => {
      unsubHydrate();
      unsubFinishHydration();
    };
  }, [storeContext]);

  return hydrated;
}
