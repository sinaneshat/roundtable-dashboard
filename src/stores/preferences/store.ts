/**
 * Model Preferences Store - Cookie-Persisted State
 *
 * Zustand v5 store with persist middleware for model selection preferences.
 * Uses cookie storage for persistence across sessions.
 *
 * ✅ PATTERN: Zustand v5 persist middleware + custom cookie storage
 * ✅ PERSISTENCE: Selected model IDs and order saved to cookies
 * ✅ MINIMUM MODELS: Enforces minimum 3 models selection
 */

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createJSONStorage, persist } from 'zustand/middleware';

import { MIN_MODELS_REQUIRED } from '@/api/services/product-logic.service';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Minimum number of models required - re-export from backend for convenience */
export const MIN_MODELS = MIN_MODELS_REQUIRED;

/** Cookie name for preferences */
const COOKIE_NAME = 'model-preferences';

/** Cookie max age in seconds (30 days) */
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60;

// ============================================================================
// COOKIE STORAGE ADAPTER
// ============================================================================

/**
 * Custom cookie storage adapter for Zustand persist middleware
 * Implements StateStorage interface for cookie-based persistence
 */
const cookieStorage: StateStorage = {
  getItem: (name: string): string | null => {
    if (typeof document === 'undefined')
      return null;

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
    if (typeof document === 'undefined')
      return;

    const encodedValue = encodeURIComponent(value);
    document.cookie = `${name}=${encodedValue}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  },

  removeItem: (name: string): void => {
    if (typeof document === 'undefined')
      return;

    document.cookie = `${name}=; path=/; max-age=0`;
  },
};

// ============================================================================
// STORE TYPES
// ============================================================================

type ModelPreferencesState = {
  /** Selected model IDs (minimum 3 required) */
  selectedModelIds: string[];
  /** Model order for display (drag-and-drop order) */
  modelOrder: string[];
  /** Whether preferences have been hydrated from storage */
  _hasHydrated: boolean;
};

type ModelPreferencesActions = {
  /** Set selected model IDs */
  setSelectedModelIds: (ids: string[]) => void;
  /** Toggle a model selection (add/remove) */
  toggleModel: (modelId: string) => boolean;
  /** Set model display order */
  setModelOrder: (order: string[]) => void;
  /**
   * Get initial model IDs based on persisted preferences or defaults
   * - Returns persisted selection if any valid models exist (user's choice takes priority)
   * - Falls back to first 3 accessible models if no persisted selection
   * - Persists defaults if used
   * @param accessibleModelIds - Model IDs the user can access based on tier
   * @returns Array of model IDs to use as initial selection
   */
  getInitialModelIds: (accessibleModelIds: string[]) => string[];
  /** Check if model is selected */
  isModelSelected: (modelId: string) => boolean;
  /** Get count of selected models */
  getSelectedCount: () => number;
  /** Mark hydration complete */
  setHasHydrated: (state: boolean) => void;
};

export type ModelPreferencesStore = ModelPreferencesState & ModelPreferencesActions;

// ============================================================================
// DEFAULT STATE
// ============================================================================

const DEFAULT_STATE: ModelPreferencesState = {
  selectedModelIds: [],
  modelOrder: [],
  _hasHydrated: false,
};

// ============================================================================
// STORE CREATION
// ============================================================================

/**
 * Model preferences store with cookie persistence
 *
 * Stores user's model selection preferences in cookies for cross-session persistence.
 * Enforces minimum 3 models selection.
 *
 * @example
 * ```tsx
 * // In component
 * const { selectedModelIds, toggleModel } = useModelPreferencesStore();
 *
 * // Toggle model (returns false if would go below minimum)
 * const success = toggleModel('openai/gpt-4');
 * ```
 */
export const useModelPreferencesStore = create<ModelPreferencesStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,

      setSelectedModelIds: (ids: string[]) => {
        set({ selectedModelIds: ids }, false);
      },

      toggleModel: (modelId: string): boolean => {
        const state = get();
        const isSelected = state.selectedModelIds.includes(modelId);

        if (isSelected) {
          // Allow removing - user can select 1+ models freely
          set({
            selectedModelIds: state.selectedModelIds.filter(id => id !== modelId),
          }, false);
        } else {
          set({
            selectedModelIds: [...state.selectedModelIds, modelId],
          }, false);
        }
        return true;
      },

      setModelOrder: (order: string[]) => {
        set({ modelOrder: order }, false);
      },

      getInitialModelIds: (accessibleModelIds: string[]): string[] => {
        const state = get();

        // PRIORITY 1: Use persisted selection if any valid models exist
        if (state.selectedModelIds.length > 0) {
          const validPersistedIds = state.selectedModelIds.filter(id =>
            accessibleModelIds.includes(id),
          );
          if (validPersistedIds.length > 0) {
            return validPersistedIds;
          }
        }

        // PRIORITY 2: No valid persisted selection - use first 3 accessible models
        const defaultIds = accessibleModelIds.slice(0, MIN_MODELS);
        if (defaultIds.length > 0) {
          // Persist these defaults for next time
          set({ selectedModelIds: defaultIds }, false);
        }
        return defaultIds;
      },

      isModelSelected: (modelId: string): boolean => {
        return get().selectedModelIds.includes(modelId);
      },

      getSelectedCount: (): number => {
        return get().selectedModelIds.length;
      },

      setHasHydrated: (state: boolean) => {
        set({ _hasHydrated: state }, false);
      },
    }),
    {
      name: COOKIE_NAME,
      storage: createJSONStorage(() => cookieStorage),
      partialize: state => ({
        selectedModelIds: state.selectedModelIds,
        modelOrder: state.modelOrder,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);

/**
 * Hook to wait for hydration before using persisted state
 * Returns true when store has been hydrated from cookies
 */
export function useModelPreferencesHydrated() {
  return useModelPreferencesStore(state => state._hasHydrated);
}
