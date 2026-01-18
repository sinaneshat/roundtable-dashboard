/**
 * Reusable Preferences Store Selectors
 *
 * Centralized selector hooks following Zustand v5 best practices.
 * All multi-value selectors use useShallow to prevent unnecessary re-renders.
 *
 * PATTERNS:
 * - Atomic selectors for primitives (no useShallow needed)
 * - useShallow for object/array selections (prevents re-renders)
 * - Named exports for easy tree-shaking
 *
 * Location: /src/stores/preferences/hooks/use-preferences-selectors.ts
 */

import { useShallow } from 'zustand/react/shallow';

import { useModelPreferencesStore } from '@/components/providers/preferences-store-provider/context';

// ============================================================================
// ATOMIC SELECTORS (Single primitive values - no useShallow needed)
// ============================================================================

/** Get selected model IDs */
export function useSelectedModelIds() {
  return useModelPreferencesStore(s => s.selectedModelIds);
}

/** Get model order */
export function useModelOrder() {
  return useModelPreferencesStore(s => s.modelOrder);
}

/** Get selected mode */
export function useSelectedMode() {
  return useModelPreferencesStore(s => s.selectedMode);
}

/** Get web search preference (user's persisted preference) */
export function useEnableWebSearch() {
  return useModelPreferencesStore(s => s.enableWebSearch);
}

/** Get hydration state */
export function useHasHydrated() {
  return useModelPreferencesStore(s => s._hasHydrated);
}

// ============================================================================
// BATCH SELECTORS (Multiple values - useShallow for performance)
// ============================================================================

/** Get all preference state */
export function useAllPreferences() {
  return useModelPreferencesStore(
    useShallow(s => ({
      selectedModelIds: s.selectedModelIds,
      modelOrder: s.modelOrder,
      selectedMode: s.selectedMode,
      enableWebSearch: s.enableWebSearch,
    })),
  );
}

/** Get preference actions */
export function usePreferenceActions() {
  return useModelPreferencesStore(
    useShallow(s => ({
      setSelectedModelIds: s.setSelectedModelIds,
      toggleModel: s.toggleModel,
      setModelOrder: s.setModelOrder,
      setSelectedMode: s.setSelectedMode,
      setEnableWebSearch: s.setEnableWebSearch,
      syncWithAccessibleModels: s.syncWithAccessibleModels,
    })),
  );
}

/** Get model selection state and actions */
export function useModelSelection() {
  return useModelPreferencesStore(
    useShallow(s => ({
      selectedModelIds: s.selectedModelIds,
      modelOrder: s.modelOrder,
      setSelectedModelIds: s.setSelectedModelIds,
      toggleModel: s.toggleModel,
      setModelOrder: s.setModelOrder,
    })),
  );
}

/** Get chat mode preferences */
export function useModePreferences() {
  return useModelPreferencesStore(
    useShallow(s => ({
      selectedMode: s.selectedMode,
      enableWebSearch: s.enableWebSearch,
      setSelectedMode: s.setSelectedMode,
      setEnableWebSearch: s.setEnableWebSearch,
    })),
  );
}
