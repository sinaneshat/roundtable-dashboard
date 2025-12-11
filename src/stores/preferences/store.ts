/**
 * Model Preferences Store - Zustand v5 Official Next.js Pattern
 *
 * ============================================================================
 * OFFICIAL ZUSTAND V5 + NEXT.JS PATTERN (from Context7 docs)
 * ============================================================================
 * Source: https://github.com/pmndrs/zustand/blob/main/docs/guides/nextjs.md
 *
 * PATTERN:
 * 1. Separate State and Actions types
 * 2. Export defaultInitState for static defaults
 * 3. Export initPreferencesStore() for dynamic initialization
 * 4. Export createModelPreferencesStore(initState) factory
 * 5. Use createStore from zustand/vanilla
 * 6. skipHydration: true for SSR
 * 7. onRehydrateStorage callback for hydration tracking
 *
 * MIDDLEWARE ORDER: devtools(persist(immer(...)))
 */

import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';

import { MIN_MODELS_REQUIRED } from '@/api/services/product-logic.service';

// ============================================================================
// CONSTANTS (Official Pattern)
// ============================================================================

/** Cookie name for preferences storage */
export const PREFERENCES_COOKIE_NAME = 'model-preferences';

/** Cookie max age: 30 days */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

// ============================================================================
// COOKIE STORAGE ADAPTER (Official Pattern)
// ============================================================================

const cookieStorage = {
  getItem: (name: string): string | null => {
    if (typeof document === 'undefined') {
      return null;
    }
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [key, value] = cookie.trim().split('=');
      if (key === name && value) {
        try {
          return decodeURIComponent(value);
        } catch {
          return null;
        }
      }
    }
    return null;
  },

  setItem: (name: string, value: string): void => {
    if (typeof document === 'undefined') {
      return;
    }
    const encodedValue = encodeURIComponent(value);
    document.cookie = `${name}=${encodedValue}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  },

  removeItem: (name: string): void => {
    if (typeof document === 'undefined') {
      return;
    }
    document.cookie = `${name}=; path=/; max-age=0`;
  },
};

// ============================================================================
// STATE TYPES (Official Pattern: Separate State from Actions)
// ============================================================================

/**
 * State shape for model preferences
 * Source: nextjs.md - "CounterState" pattern
 */
export type ModelPreferencesState = {
  /** Selected model IDs (user's selection) */
  selectedModelIds: string[];
  /** Model order for display (drag-and-drop order) */
  modelOrder: string[];
  /** Selected chat mode (analyzing/brainstorming/etc) */
  selectedMode: string | null;
  /** Web search enabled preference */
  enableWebSearch: boolean;
  /** Hydration tracking for SSR */
  _hasHydrated: boolean;
};

/**
 * Actions for model preferences
 * Source: nextjs.md - "CounterActions" pattern
 */
export type ModelPreferencesActions = {
  setSelectedModelIds: (ids: string[]) => void;
  toggleModel: (modelId: string) => boolean;
  setModelOrder: (order: string[]) => void;
  setSelectedMode: (mode: string | null) => void;
  setEnableWebSearch: (enabled: boolean) => void;
  getInitialModelIds: (accessibleModelIds: string[]) => string[];
  /**
   * Sync persisted preferences with currently accessible models
   * Removes invalid models from persistence and updates order
   * Call this when accessible models change (tier change, models disabled)
   */
  syncWithAccessibleModels: (accessibleModelIds: string[]) => void;
  isModelSelected: (modelId: string) => boolean;
  getSelectedCount: () => number;
  setHasHydrated: (state: boolean) => void;
};

/**
 * Complete store type
 * Source: nextjs.md - "CounterStore = CounterState & CounterActions"
 */
export type ModelPreferencesStore = ModelPreferencesState & ModelPreferencesActions;

/**
 * Persisted state subset (what gets saved to cookie)
 * Source: persist.md - "partialize" pattern
 */
export type PersistedModelPreferences = Pick<ModelPreferencesState, 'selectedModelIds' | 'modelOrder' | 'selectedMode' | 'enableWebSearch'>;

// ============================================================================
// DEFAULT STATE (Official Pattern)
// Source: nextjs.md - "defaultInitState"
// ============================================================================

export const defaultInitState: ModelPreferencesState = {
  selectedModelIds: [],
  modelOrder: [],
  selectedMode: null, // null = use default mode
  enableWebSearch: false,
  _hasHydrated: false,
};

// ============================================================================
// INIT FUNCTION (Official Pattern)
// Source: nextjs.md - "initCounterStore()"
// ============================================================================

/**
 * Initialize preferences state dynamically
 * Called by provider to get initial state
 *
 * For SSR: parses cookie server-side and returns state
 * For CSR: returns defaults (hydration fills in persisted data)
 */
export function initPreferencesStore(
  serverState?: ModelPreferencesState | null,
): ModelPreferencesState {
  if (serverState) {
    return {
      ...defaultInitState,
      ...serverState,
      _hasHydrated: true, // Server state means already hydrated
    };
  }
  return defaultInitState;
}

// ============================================================================
// SERVER-SIDE COOKIE PARSER (For SSR Hydration)
// ============================================================================

/**
 * Parse preferences from raw cookie value (server-side)
 *
 * @example
 * // In Server Component (layout.tsx):
 * import { cookies } from 'next/headers';
 * const cookieStore = await cookies();
 * const prefsCookie = cookieStore.get(PREFERENCES_COOKIE_NAME);
 * const serverState = parsePreferencesCookie(prefsCookie?.value);
 */
export function parsePreferencesCookie(
  cookieValue: string | undefined,
): ModelPreferencesState | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded) as {
      state?: {
        selectedModelIds?: string[];
        modelOrder?: string[];
        selectedMode?: string | null;
        enableWebSearch?: boolean;
      };
    };

    // Zustand persist wraps state in { state: {...}, version: number }
    if (parsed?.state) {
      return {
        selectedModelIds: Array.isArray(parsed.state.selectedModelIds)
          ? parsed.state.selectedModelIds
          : [],
        modelOrder: Array.isArray(parsed.state.modelOrder)
          ? parsed.state.modelOrder
          : [],
        selectedMode: typeof parsed.state.selectedMode === 'string'
          ? parsed.state.selectedMode
          : null,
        enableWebSearch: typeof parsed.state.enableWebSearch === 'boolean'
          ? parsed.state.enableWebSearch
          : false,
        _hasHydrated: true,
      };
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================================================
// STORE FACTORY (Official Pattern)
// Source: nextjs.md - "createCounterStore(initState)"
// ============================================================================

/**
 * Factory function to create model preferences store
 *
 * Official Zustand v5 + Next.js pattern:
 * - createStore from zustand/vanilla for SSR isolation
 * - Factory accepts initial state for server-side hydration
 * - skipHydration: true prevents automatic client hydration
 * - onRehydrateStorage tracks hydration completion
 *
 * @param initState - Initial state (from server or defaults)
 */
export function createModelPreferencesStore(
  initState: ModelPreferencesState = defaultInitState,
) {
  return createStore<ModelPreferencesStore>()(
    devtools(
      persist(
        immer((set, get) => ({
          ...initState,

          setSelectedModelIds: (ids: string[]) => {
            // Don't persist empty selection
            if (ids.length === 0) {
              return;
            }
            set(
              (draft) => {
                draft.selectedModelIds = ids;
              },
              false,
              'preferences/setSelectedModelIds',
            );
          },

          toggleModel: (modelId: string): boolean => {
            const state = get();
            const idx = state.selectedModelIds.indexOf(modelId);

            if (idx !== -1) {
              // Don't allow removing if it would leave 0 models
              if (state.selectedModelIds.length <= 1) {
                return false;
              }
              set(
                (draft) => {
                  draft.selectedModelIds.splice(idx, 1);
                },
                false,
                'preferences/toggleModel/remove',
              );
            } else {
              set(
                (draft) => {
                  draft.selectedModelIds.push(modelId);
                },
                false,
                'preferences/toggleModel/add',
              );
            }
            return true;
          },

          setModelOrder: (order: string[]) =>
            set(
              (draft) => {
                draft.modelOrder = order;
              },
              false,
              'preferences/setModelOrder',
            ),

          setSelectedMode: (mode: string | null) =>
            set(
              (draft) => {
                draft.selectedMode = mode;
              },
              false,
              'preferences/setSelectedMode',
            ),

          setEnableWebSearch: (enabled: boolean) =>
            set(
              (draft) => {
                draft.enableWebSearch = enabled;
              },
              false,
              'preferences/setEnableWebSearch',
            ),

          getInitialModelIds: (accessibleModelIds: string[]): string[] => {
            const state = get();

            // PRIORITY 1: Use persisted selection if valid models exist
            if (state.selectedModelIds.length > 0) {
              const validPersistedIds = state.selectedModelIds.filter(id =>
                accessibleModelIds.includes(id),
              );
              if (validPersistedIds.length > 0) {
                // ✅ FIX: Persist cleaned-up selection (removes invalid models)
                // This ensures stale/invalid models don't stay in persistence
                if (validPersistedIds.length !== state.selectedModelIds.length) {
                  set(
                    (draft) => {
                      draft.selectedModelIds = validPersistedIds;
                    },
                    false,
                    'preferences/cleanupInvalidModels',
                  );
                }
                return validPersistedIds;
              }
            }

            // PRIORITY 2: Use first N accessible models as defaults
            const defaultIds = accessibleModelIds.slice(0, MIN_MODELS_REQUIRED);
            if (defaultIds.length > 0) {
              set(
                (draft) => {
                  draft.selectedModelIds = defaultIds;
                },
                false,
                'preferences/setDefaultModelIds',
              );
            }
            return defaultIds;
          },

          syncWithAccessibleModels: (accessibleModelIds: string[]): void => {
            const state = get();
            const accessibleSet = new Set(accessibleModelIds);

            // Filter out invalid models from selection
            const validSelectedIds = state.selectedModelIds.filter(id =>
              accessibleSet.has(id),
            );

            // Filter out invalid models from order
            const validOrder = state.modelOrder.filter(id =>
              accessibleSet.has(id),
            );

            // Add any new accessible models not in order
            const newModels = accessibleModelIds.filter(id =>
              !validOrder.includes(id),
            );
            const updatedOrder = [...validOrder, ...newModels];

            // Only update if something changed
            const selectionChanged = validSelectedIds.length !== state.selectedModelIds.length;
            const orderChanged = updatedOrder.length !== state.modelOrder.length
              || !updatedOrder.every((id, i) => state.modelOrder[i] === id);

            if (selectionChanged || orderChanged) {
              set(
                (draft) => {
                  if (selectionChanged) {
                    draft.selectedModelIds = validSelectedIds;
                  }
                  if (orderChanged) {
                    draft.modelOrder = updatedOrder;
                  }
                },
                false,
                'preferences/syncWithAccessibleModels',
              );
            }
          },

          isModelSelected: (modelId: string): boolean => {
            return get().selectedModelIds.includes(modelId);
          },

          getSelectedCount: (): number => {
            return get().selectedModelIds.length;
          },

          setHasHydrated: (hydrated: boolean) =>
            set(
              (draft) => {
                draft._hasHydrated = hydrated;
              },
              false,
              'preferences/setHasHydrated',
            ),
        })),
        {
          name: PREFERENCES_COOKIE_NAME,
          storage: {
            getItem: (name) => {
              const value = cookieStorage.getItem(name);
              return value ? JSON.parse(value) : null;
            },
            setItem: (name, value) => {
              cookieStorage.setItem(name, JSON.stringify(value));
            },
            removeItem: (name) => {
              cookieStorage.removeItem(name);
            },
          },
          partialize: state => ({
            selectedModelIds: state.selectedModelIds,
            modelOrder: state.modelOrder,
            selectedMode: state.selectedMode,
            enableWebSearch: state.enableWebSearch,
          }) as unknown as ModelPreferencesStore,
          // ✅ OFFICIAL PATTERN: skipHydration for SSR
          // Source: persist.md - prevents automatic hydration
          skipHydration: true,
          // ✅ OFFICIAL PATTERN: onRehydrateStorage callback
          // Source: persist.md - tracks hydration completion
          onRehydrateStorage: () => (state) => {
            state?.setHasHydrated(true);
          },
        },
      ),
      { name: 'ModelPreferencesStore', enabled: process.env.NODE_ENV === 'development' },
    ),
  );
}

// ============================================================================
// STORE API TYPE (Official Pattern)
// Source: nextjs.md - "CounterStoreApi = ReturnType<typeof createCounterStore>"
// ============================================================================

export type ModelPreferencesStoreApi = ReturnType<typeof createModelPreferencesStore>;
