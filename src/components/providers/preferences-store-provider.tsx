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

  // eslint-disable-next-line react-hooks/refs -- Official Zustand v5 pattern for SSR-safe store initialization
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
// STORE API HOOK (For imperative access)
// ============================================================================

/**
 * Get the store API for imperative access (getState)
 *
 * REACT BEST PRACTICE: Use this for reading current state inside callbacks/effects
 * without causing re-renders or infinite loops from dependency arrays.
 */
// eslint-disable-next-line react-refresh/only-export-components -- Store API hook export
export function useModelPreferencesStoreApi(): ModelPreferencesStoreApi {
  const storeContext = use(PreferencesStoreContext);

  if (!storeContext) {
    throw new Error(
      'useModelPreferencesStoreApi must be used within PreferencesStoreProvider',
    );
  }

  return storeContext;
}

// ============================================================================
// HYDRATION HOOK (Official Pattern)
// Source: persist.md - "useHydration" pattern
// ============================================================================

/**
 * Hook to track store hydration status
 *
 * Official Zustand pattern for handling hydration in SSR apps:
 * - Uses persist API events (onHydrate, onFinishHydration)
 * - Handles both initial and manual rehydration
 * - Returns boolean indicating if store is ready
 *
 * @example
 * const hydrated = useModelPreferencesHydrated();
 * if (!hydrated) return <Loading />;
 */
// eslint-disable-next-line react-refresh/only-export-components -- Store hook export
export function useModelPreferencesHydrated(): boolean {
  const storeContext = use(PreferencesStoreContext);
  const [hydrated, setHydrated] = useState(() => {
    // Initialize with current hydration state to avoid flash
    return storeContext?.persist.hasHydrated() ?? false;
  });

  useEffect(() => {
    if (!storeContext) {
      return;
    }

    // Official Pattern: Subscribe to hydration events
    // Source: persist.md - "onHydrate" and "onFinishHydration"
    const unsubHydrate = storeContext.persist.onHydrate(() => {
      setHydrated(false);
    });

    const unsubFinishHydration = storeContext.persist.onFinishHydration(() => {
      setHydrated(true);
    });

    return () => {
      unsubHydrate();
      unsubFinishHydration();
    };
  }, [storeContext]);

  return hydrated;
}
