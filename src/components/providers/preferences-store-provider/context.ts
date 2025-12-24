'use client';

import { createContext, use, useEffect, useState } from 'react';
import { useStore } from 'zustand';

import type {
  ModelPreferencesStore,
  ModelPreferencesStoreApi,
} from '@/stores/preferences/store';

export const PreferencesStoreContext = createContext<
  ModelPreferencesStoreApi | undefined
>(undefined);

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
