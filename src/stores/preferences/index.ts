/**
 * Preferences Store - Public API
 *
 * Cookie-persisted user preferences for model selection.
 *
 * ============================================================================
 * OFFICIAL ZUSTAND V5 + NEXT.JS PATTERN (from Context7 docs)
 * ============================================================================
 * Source: https://github.com/pmndrs/zustand/blob/main/docs/guides/nextjs.md
 *
 * EXPORTS:
 * - Types: State, Actions, Store, StoreApi
 * - Factory: createModelPreferencesStore(initState)
 * - Init: initPreferencesStore(serverState), defaultInitState
 * - SSR: parsePreferencesCookie(cookieValue), PREFERENCES_COOKIE_NAME
 * - Provider: PreferencesStoreProvider
 * - Hooks: useModelPreferencesStore, useModelPreferencesStoreApi, useModelPreferencesHydrated
 */

// ============================================================================
// TYPES (Official Pattern)
// ============================================================================

export type {
  ModelPreferencesActions,
  ModelPreferencesState,
  ModelPreferencesStore,
  ModelPreferencesStoreApi,
} from './store';

// ============================================================================
// STORE FACTORY + INIT (Official Pattern)
// ============================================================================

export {
  createModelPreferencesStore,
  defaultInitState,
  initPreferencesStore,
  MIN_MODELS,
} from './store';

// ============================================================================
// SSR HYDRATION UTILITIES
// ============================================================================

export {
  parsePreferencesCookie,
  PREFERENCES_COOKIE_NAME,
} from './store';

// ============================================================================
// PROVIDER + HOOKS (Official Pattern)
// ============================================================================

export {
  PreferencesStoreProvider,
  useModelPreferencesHydrated,
  useModelPreferencesStore,
  useModelPreferencesStoreApi,
} from '@/components/providers/preferences-store-provider';
