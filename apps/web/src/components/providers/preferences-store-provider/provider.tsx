import { useEffect, useState } from 'react';

import {
  createModelPreferencesStore,
  initPreferencesStore,
} from '@/stores/preferences/store';

import { PreferencesStoreContext } from './context';
import type { PreferencesStoreProviderProps } from './types';

/**
 * Preferences Store Provider - Zustand v5 SSR Pattern for TanStack Start
 *
 * ✅ ZUSTAND V5 BEST PRACTICES:
 * 1. Factory Pattern: createModelPreferencesStore() returns vanilla store
 * 2. useState Lazy Init: Store created once per provider instance (SSR isolation)
 * 3. Context Distribution: PreferencesStoreContext provides store to useModelPreferencesStore hook
 * 4. Persist Middleware: Cookie-based persistence with SSR hydration support
 * 5. Initialization: initPreferencesStore() allows server-passed initial state
 *
 * ⚠️ CRITICAL SSR PATTERNS:
 * - Store created via useState lazy initializer (once per component instance)
 * - Supports server-passed initialState for SSR hydration
 * - Automatic rehydration when no initialState provided (client-only navigation)
 * - Cookie storage for preferences persistence across requests
 *
 * Note: useState with lazy initializer is preferred over useRef for store creation
 * because it ensures the store is created during the initial render phase.
 *
 * Reference: Official Zustand docs - "Persisting store data" SSR section
 */
export function PreferencesStoreProvider({
  children,
  initialState,
}: PreferencesStoreProviderProps) {
  // ✅ ZUSTAND V5 SSR: Create store via useState lazy initializer for per-request isolation
  // Factory pattern with initPreferencesStore allows server-passed initial state
  const [store] = useState(() =>
    createModelPreferencesStore(initPreferencesStore(initialState)),
  );

  useEffect(() => {
    if (!initialState && store) {
      store.persist.rehydrate();
    }
  }, [initialState, store]);

  return (
    <PreferencesStoreContext value={store}>
      {children}
    </PreferencesStoreContext>
  );
}
