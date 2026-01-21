/**
 * Preferences Store - Public API
 *
 * Cookie-persisted user preferences for model selection.
 *
 * ============================================================================
 * OFFICIAL ZUSTAND V5 + TANSTACK START PATTERN (from Context7 docs)
 * ============================================================================
 * Source: https://github.com/pmndrs/zustand/blob/main/docs/guides/ssr-and-hydration.md
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

// ============================================================================
// REUSABLE SELECTORS
// ============================================================================
// Centralized selector hooks for optimal performance
export * from './hooks';

// ============================================================================
// STORE FACTORY + INIT (Official Pattern)
// ============================================================================

export type {
  ModelPreferencesActions,
  ModelPreferencesState,
  ModelPreferencesStore,
  ModelPreferencesStoreApi,
} from './store';

// ============================================================================
// SSR HYDRATION UTILITIES
// ============================================================================

export {
  createModelPreferencesStore,
  defaultInitState,
  initPreferencesStore,
} from './store';

// ============================================================================
// PROVIDER + HOOKS
// ============================================================================
// Import from @/components/providers directly - single source of truth

export {
  parsePreferencesCookie,
  PREFERENCES_COOKIE_NAME,
} from './store';
