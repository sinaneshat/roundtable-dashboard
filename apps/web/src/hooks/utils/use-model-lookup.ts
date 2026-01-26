/**
 * Model Lookup Utility Hook
 *
 * Consolidated model lookup pattern used across all chat screens.
 * Replaces duplicated useModelsQuery + find logic in 3 screens + ChatMessageList.
 *
 * Single source of truth for model resolution with memoized lookup function.
 *
 * Used by:
 * - ChatOverviewScreen (default model for new threads)
 * - ChatThreadScreen (participant model resolution)
 * - PublicChatThreadScreen (model display in read-only view)
 * - ChatMessageList (participant model cards)
 */

import { useMemo } from 'react';

import { useModelsQuery } from '@/hooks/queries';
import type { Model } from '@/services/api';

type UseModelLookupOptions = {
  /** Whether to enable the models query (default: true). Set false for read-only/public pages. */
  enabled?: boolean;
};

/**
 * Return value from useModelLookup hook
 */
export type UseModelLookupReturn = {
  /** All available models (100 top models from OpenRouter) */
  allModels: Model[];
  /** Memoized function to find model by ID (O(1) after first lookup) */
  findModel: (modelId: string | undefined) => Model | undefined;
  /** Default model ID from server configuration */
  defaultModelId: string | undefined;
  /** Whether models are currently loading */
  isLoading: boolean;
};

/**
 * Consolidated model lookup hook with memoized find function
 *
 * Provides efficient model resolution for all chat screens.
 * Uses TanStack Query cache (models have Infinity staleTime - never refetch).
 *
 * Performance:
 * - Models cached indefinitely (24h server cache)
 * - Find function memoized per model list
 * - No re-renders unless model list changes
 *
 * @returns Model lookup utilities and state
 *
 * @example
 * ```typescript
 * // Get default model for new threads
 * const { defaultModelId } = useModelLookup();
 *
 * // Find specific model for participant
 * const { findModel } = useModelLookup();
 * const model = findModel(participant.modelId);
 *
 * // Access all models for dropdown
 * const { allModels, isLoading } = useModelLookup();
 * ```
 */
export function useModelLookup(options?: UseModelLookupOptions): UseModelLookupReturn {
  const { data: modelsData, isLoading } = useModelsQuery({ enabled: options?.enabled ?? true });

  const allModels = useMemo(() => {
    if (!modelsData?.success || !modelsData.data) {
      return [];
    }
    return modelsData.data.items ?? [];
  }, [modelsData]);

  const defaultModelId = useMemo(() => {
    if (!modelsData?.success || !modelsData.data) {
      return undefined;
    }
    return modelsData.data.default_model_id;
  }, [modelsData]);

  const findModel = useMemo(() => {
    return (modelId: string | undefined): Model | undefined => {
      if (!modelId) {
        return undefined;
      }
      return allModels.find((m: Model) => m.id === modelId);
    };
  }, [allModels]);

  return {
    allModels,
    defaultModelId,
    findModel,
    isLoading,
  };
}
