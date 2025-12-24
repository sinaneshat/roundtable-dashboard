'use client';

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

import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import { useModelsQuery } from '@/hooks/queries';

/**
 * Return value from useModelLookup hook
 */
export type UseModelLookupReturn = {
  /** All available models (100 top models from OpenRouter) */
  allModels: EnhancedModelResponse[];
  /** Memoized function to find model by ID (O(1) after first lookup) */
  findModel: (modelId: string | undefined) => EnhancedModelResponse | undefined;
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
export function useModelLookup(): UseModelLookupReturn {
  // Query models with Infinity staleTime (never refetch)
  // Models are cached 24h on server, so client can cache indefinitely
  const { data: modelsData, isLoading } = useModelsQuery();

  // Extract model list and default ID from response
  // Memoize allModels to prevent new array creation on every render
  const allModels = useMemo(
    () => modelsData?.data?.items || [],
    [modelsData?.data?.items],
  );
  const defaultModelId = modelsData?.data?.default_model_id;

  // Memoized find function (only recreates when model list changes)
  // This prevents creating new function references on every render
  const findModel = useMemo(() => {
    return (modelId: string | undefined): EnhancedModelResponse | undefined => {
      if (!modelId) {
        return undefined;
      }
      return allModels.find(m => m.id === modelId);
    };
  }, [allModels]);

  return {
    allModels,
    findModel,
    defaultModelId,
    isLoading,
  };
}
