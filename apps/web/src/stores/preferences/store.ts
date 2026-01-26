/**
 * Model Preferences Store - Zustand v5 Official TanStack Start Pattern
 *
 * ============================================================================
 * OFFICIAL ZUSTAND V5 + TANSTACK START PATTERN (from Context7 docs)
 * ============================================================================
 * Source: https://github.com/pmndrs/zustand/blob/main/docs/guides/ssr-and-hydration.md
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

import type { Draft } from 'immer';
import { z } from 'zod';
import { devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { createStore } from 'zustand/vanilla';

import { MIN_PARTICIPANTS_REQUIRED } from '@/lib/config';

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
        } catch (error) {
          console.error('[cookieStorage.getItem] Failed to decode cookie value:', error);
          return null;
        }
      }
    }
    return null;
  },

  removeItem: (name: string): void => {
    if (typeof document === 'undefined') {
      return;
    }
    document.cookie = `${name}=; path=/; max-age=0`;
  },

  setItem: (name: string, value: string): void => {
    if (typeof document === 'undefined') {
      return;
    }
    const encodedValue = encodeURIComponent(value);
    document.cookie = `${name}=${encodedValue}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  },
};

// ============================================================================
// STATE TYPES (Zod-First Pattern for Runtime Validation)
// ============================================================================
// Following chat store pattern: schemas define state, types inferred

/**
 * State shape for model preferences - Zod schema
 * Source: nextjs.md - "CounterState" pattern + Zod-first
 */
const ModelPreferencesStateSchema = z.object({
  /** Hydration tracking for SSR */
  _hasHydrated: z.boolean(),
  /** Web search enabled preference */
  enableWebSearch: z.boolean(),
  /** Model order for display (drag-and-drop order) */
  modelOrder: z.array(z.string()),
  /** Selected chat mode (analyzing/brainstorming/etc) */
  selectedMode: z.string().nullable(),
  /** Selected model IDs (user's selection) */
  selectedModelIds: z.array(z.string()),
});

/**
 * Actions for model preferences - Zod schema with z.custom<> for functions
 * Source: nextjs.md - "CounterActions" pattern + Zod-first
 */
const ModelPreferencesActionsSchema = z.object({
  getInitialModelIds: z.custom<(accessibleModelIds: string[]) => string[]>(),
  setEnableWebSearch: z.custom<(enabled: boolean) => void>(),
  setHasHydrated: z.custom<(state: boolean) => void>(),
  setModelOrder: z.custom<(order: string[]) => void>(),
  setSelectedMode: z.custom<(mode: string | null) => void>(),
  setSelectedModelIds: z.custom<(ids: string[]) => void>(),
  syncWithAccessibleModels: z.custom<(accessibleModelIds: string[]) => void>(),
  toggleModel: z.custom<(modelId: string) => boolean>(),
});

/**
 * Complete store schema
 * Source: nextjs.md - "CounterStore = CounterState & CounterActions" + Zod-first
 */
const _ModelPreferencesStoreSchema = z.intersection(
  ModelPreferencesStateSchema,
  ModelPreferencesActionsSchema,
);

/**
 * Inferred types from Zod schemas (single source of truth)
 */
export type ModelPreferencesState = z.infer<typeof ModelPreferencesStateSchema>;
export type ModelPreferencesActions = z.infer<typeof ModelPreferencesActionsSchema>;
export type ModelPreferencesStore = z.infer<typeof _ModelPreferencesStoreSchema>;

/**
 * Persisted state schema (what gets saved to cookie)
 * Source: persist.md - "partialize" pattern
 *
 * Zod-first pattern: Schema defines the type, z.infer extracts it
 */
const PersistedModelPreferencesSchema = z.object({
  enableWebSearch: z.boolean(),
  modelOrder: z.array(z.string()),
  selectedMode: z.string().nullable(),
  selectedModelIds: z.array(z.string()),
});

export type PersistedModelPreferences = z.infer<typeof PersistedModelPreferencesSchema>;

// ============================================================================
// DEFAULT STATE (Official Pattern)
// Source: nextjs.md - "defaultInitState"
// ============================================================================

export const defaultInitState: ModelPreferencesState = {
  _hasHydrated: false,
  enableWebSearch: false,
  modelOrder: [],
  selectedMode: null, // null = use default mode
  selectedModelIds: [],
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
// COOKIE DATA VALIDATION SCHEMA
// ============================================================================

/**
 * Zod schema for validating cookie data structure
 * Zustand persist wraps state in { state: {...}, version: number }
 */
const CookieDataSchema = z.object({
  state: z.object({
    enableWebSearch: z.boolean().optional(),
    modelOrder: z.array(z.string()).optional(),
    selectedMode: z.string().nullable().optional(),
    selectedModelIds: z.array(z.string()).optional(),
  }).optional(),
  version: z.number().optional(),
});

// ============================================================================
// SERVER-SIDE COOKIE PARSER (For SSR Hydration)
// ============================================================================

/**
 * Parse preferences from raw cookie value (server-side)
 *
 * ✅ TYPE-SAFE: Uses Zod validation instead of type assertion
 * ✅ RUNTIME VALIDATION: Ensures cookie data matches expected structure
 *
 * @example
 * // In TanStack Start server function:
 * const cookies = parseCookies();
 * const prefsCookie = cookies[PREFERENCES_COOKIE_NAME];
 * const serverState = parsePreferencesCookie(prefsCookie);
 */
export function parsePreferencesCookie(
  cookieValue: string | undefined,
): ModelPreferencesState | null {
  if (!cookieValue) {
    return null;
  }

  try {
    const decoded = decodeURIComponent(cookieValue);
    const parsed = JSON.parse(decoded);

    // ✅ Validate with Zod instead of type assertion
    const result = CookieDataSchema.safeParse(parsed);

    if (!result.success) {
      console.error('[parsePreferencesCookie] Invalid cookie structure:', result.error);
      return null;
    }

    const { data } = result;

    // Zustand persist wraps state in { state: {...}, version: number }
    if (data?.state) {
      return {
        _hasHydrated: true,
        enableWebSearch: data.state.enableWebSearch ?? false,
        modelOrder: data.state.modelOrder ?? [],
        selectedMode: data.state.selectedMode ?? null,
        selectedModelIds: data.state.selectedModelIds ?? [],
      };
    }

    return null;
  } catch (error) {
    console.error('[parsePreferencesCookie] Failed to parse preferences cookie:', error);
    return null;
  }
}

// ============================================================================
// STORE FACTORY (Official Pattern)
// Source: ssr-and-hydration.md - "createStore(initState)"
// ============================================================================

/**
 * Factory function to create model preferences store
 *
 * Official Zustand v5 + TanStack Start SSR pattern:
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

          getInitialModelIds: (accessibleModelIds: string[]): string[] => {
            const state = get();

            // PRIORITY 1: Use persisted selection if valid models exist
            if (state.selectedModelIds.length > 0) {
              const validPersistedIds = state.selectedModelIds.filter((id: string) =>
                accessibleModelIds.includes(id),
              );
              if (validPersistedIds.length > 0) {
                // ✅ FIX: Persist cleaned-up selection (removes invalid models)
                // This ensures stale/invalid models don't stay in persistence
                if (validPersistedIds.length !== state.selectedModelIds.length) {
                  set(
                    (draft: Draft<ModelPreferencesState>) => {
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
            const defaultIds = accessibleModelIds.slice(0, MIN_PARTICIPANTS_REQUIRED);
            if (defaultIds.length > 0) {
              set(
                (draft: Draft<ModelPreferencesState>) => {
                  draft.selectedModelIds = defaultIds;
                },
                false,
                'preferences/setDefaultModelIds',
              );
            }
            return defaultIds;
          },

          setEnableWebSearch: (enabled: boolean) =>
            set(
              (draft: Draft<ModelPreferencesState>) => {
                draft.enableWebSearch = enabled;
              },
              false,
              'preferences/setEnableWebSearch',
            ),

          setHasHydrated: (hydrated: boolean) =>
            set(
              (draft: Draft<ModelPreferencesState>) => {
                draft._hasHydrated = hydrated;
              },
              false,
              'preferences/setHasHydrated',
            ),

          setModelOrder: (order: string[]) =>
            set(
              (draft: Draft<ModelPreferencesState>) => {
                draft.modelOrder = order;
              },
              false,
              'preferences/setModelOrder',
            ),

          setSelectedMode: (mode: string | null) =>
            set(
              (draft: Draft<ModelPreferencesState>) => {
                draft.selectedMode = mode;
              },
              false,
              'preferences/setSelectedMode',
            ),

          setSelectedModelIds: (ids: string[]) => {
            // Don't persist empty selection
            if (ids.length === 0) {
              return;
            }
            set(
              (draft: Draft<ModelPreferencesState>) => {
                draft.selectedModelIds = ids;
              },
              false,
              'preferences/setSelectedModelIds',
            );
          },

          syncWithAccessibleModels: (accessibleModelIds: string[]): void => {
            const state = get();
            const accessibleSet = new Set(accessibleModelIds);

            // Filter out invalid models from selection
            const validSelectedIds = state.selectedModelIds.filter((id: string) =>
              accessibleSet.has(id),
            );

            // Filter out invalid models from order
            const validOrder = state.modelOrder.filter((id: string) =>
              accessibleSet.has(id),
            );

            // ✅ PERF FIX: Use Set for O(1) lookup instead of O(n) .includes()
            const validOrderSet = new Set(validOrder);
            const newModels = accessibleModelIds.filter(id =>
              !validOrderSet.has(id),
            );
            const updatedOrder = [...validOrder, ...newModels];

            // Only update if something changed
            const selectionChanged = validSelectedIds.length !== state.selectedModelIds.length;
            const orderChanged = updatedOrder.length !== state.modelOrder.length
              || !updatedOrder.every((id, i) => state.modelOrder[i] === id);

            if (selectionChanged || orderChanged) {
              set(
                (draft: Draft<ModelPreferencesState>) => {
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

          toggleModel: (modelId: string): boolean => {
            const state = get();
            const idx = state.selectedModelIds.indexOf(modelId);

            if (idx !== -1) {
              // Don't allow removing if it would leave 0 models
              if (state.selectedModelIds.length <= 1) {
                return false;
              }
              set(
                (draft: Draft<ModelPreferencesState>) => {
                  draft.selectedModelIds.splice(idx, 1);
                },
                false,
                'preferences/toggleModel/remove',
              );
            } else {
              set(
                (draft: Draft<ModelPreferencesState>) => {
                  draft.selectedModelIds.push(modelId);
                },
                false,
                'preferences/toggleModel/add',
              );
            }
            return true;
          },
        })),
        {
          // Merge persisted partial state with full state
          // @see https://docs.pmnd.rs/zustand/integrations/persisting-store-data#merge
          merge: (persistedState, currentState) => {
            // ✅ TYPE-SAFE: Validate persisted state with Zod instead of `as any`
            const result = PersistedModelPreferencesSchema.safeParse(persistedState);
            if (!result.success) {
              return currentState;
            }
            return {
              ...currentState,
              ...result.data,
            };
          },
          name: PREFERENCES_COOKIE_NAME,
          // ✅ OFFICIAL PATTERN: onRehydrateStorage callback
          // Source: persist.md - tracks hydration completion
          onRehydrateStorage: () => (state) => {
            state?.setHasHydrated(true);
          },
          // Partialize: Only persist user preferences (subset of state)
          // @see https://docs.pmnd.rs/zustand/integrations/persisting-store-data#partialize
          partialize: (state): PersistedModelPreferences => ({
            enableWebSearch: state.enableWebSearch,
            modelOrder: state.modelOrder,
            selectedMode: state.selectedMode,
            selectedModelIds: state.selectedModelIds,
          }),
          // ✅ OFFICIAL PATTERN: skipHydration for SSR
          // Source: persist.md - prevents automatic hydration
          skipHydration: true,
          storage: {
            getItem: (name) => {
              const value = cookieStorage.getItem(name);
              if (!value) {
                return null;
              }
              // Zod-based validation: parse and validate persisted state
              const parsed = JSON.parse(value);
              const result = PersistedModelPreferencesSchema.safeParse(parsed?.state);
              if (!result.success) {
                console.error('[preferences/storage] Invalid persisted state:', result.error);
                return null;
              }
              return { state: result.data, version: parsed?.version ?? 0 };
            },
            removeItem: (name) => {
              cookieStorage.removeItem(name);
            },
            setItem: (name, value) => {
              cookieStorage.setItem(name, JSON.stringify(value));
            },
          },
        },
      ),
      { enabled: import.meta.env.MODE === 'development', name: 'ModelPreferencesStore' },
    ),
  );
}

// ============================================================================
// STORE API TYPE (Official Pattern)
// Source: nextjs.md - "CounterStoreApi = ReturnType<typeof createCounterStore>"
// ============================================================================

export type ModelPreferencesStoreApi = ReturnType<typeof createModelPreferencesStore>;
