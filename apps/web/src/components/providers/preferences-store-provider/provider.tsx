import { useEffect, useRef } from 'react';

import {
  createModelPreferencesStore,
  initPreferencesStore,
} from '@/stores/preferences/store';

import { PreferencesStoreContext } from './context';
import type { PreferencesStoreProviderProps } from './types';

export function PreferencesStoreProvider({
  children,
  initialState,
}: PreferencesStoreProviderProps) {
  const storeRef = useRef(
    createModelPreferencesStore(initPreferencesStore(initialState)),
  );

  useEffect(() => {
    if (!initialState && storeRef.current) {
      storeRef.current.persist.rehydrate();
    }
  }, [initialState]);

  return (
    <PreferencesStoreContext value={storeRef.current}>
      {children}
    </PreferencesStoreContext>
  );
}
