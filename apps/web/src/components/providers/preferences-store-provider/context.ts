/**
 * Preferences Store Context and Hooks - Zustand v5 SSR Pattern for TanStack Start
 *
 * ✅ ZUSTAND V5 PATTERN:
 * - Context holds vanilla store instance (ModelPreferencesStoreApi from createModelPreferencesStore)
 * - useModelPreferencesStore accesses context + zustand's useStore for subscriptions
 * - useStore handles React subscriptions with selector optimization
 * - PreferencesStoreProvider creates store via useState lazy initializer
 * - Persist middleware with cookie storage for SSR compatibility
 *
 * Usage:
 * ```tsx
 * // With selector (recommended - only re-renders when selected value changes)
 * const selectedModelIds = useModelPreferencesStore(s => s.selectedModelIds);
 *
 * // Check if store has hydrated (useful for SSR)
 * const isHydrated = useModelPreferencesHydrated();
 *
 * // Access actions
 * const toggleModel = useModelPreferencesStore(s => s.toggleModel);
 * toggleModel('model-id');
 * ```
 *
 * Reference: Official Zustand docs - "Persisting store data" + SSR section
 */
import { createContext, use, useEffect, useState } from 'react';
import { useStore } from 'zustand';

import type {
  ModelPreferencesStore,
  ModelPreferencesStoreApi,
} from '@/stores/preferences/store';

export const PreferencesStoreContext = createContext<
  ModelPreferencesStoreApi | undefined
>(undefined);

/**
 * Primary hook for accessing preferences store state and actions
 * Uses selector pattern for optimized re-renders
 *
 * @param selector - Function that selects specific state from store
 * @returns Selected state value
 * @throws Error if used outside PreferencesStoreProvider
 *
 * @example
 * ```tsx
 * const selectedModelIds = useModelPreferencesStore(s => s.selectedModelIds);
 * const setSelectedModelIds = useModelPreferencesStore(s => s.setSelectedModelIds);
 * ```
 */
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

/**
 * Hook to check if preferences store has finished hydrating from persistence
 * Useful for preventing hydration mismatches in SSR scenarios
 *
 * @returns true if store has finished hydrating, false otherwise
 *
 * @example
 * ```tsx
 * const isHydrated = useModelPreferencesHydrated();
 * if (!isHydrated) {
 *   return <Skeleton />; // Show loading state during hydration
 * }
 * return <PreferencesUI />;
 * ```
 */
export function useModelPreferencesHydrated(): boolean {
  const storeContext = use(PreferencesStoreContext);
  const [hydrated, setHydrated] = useState(() =>
    storeContext?.persist.hasHydrated() ?? false,
  );

  useEffect(() => {
    if (!storeContext) {
      return;
    }

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
