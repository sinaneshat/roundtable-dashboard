import { useMemo } from 'react';

import type { OrderedModel } from '@/lib/schemas/model-schemas';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
import type { EnhancedModelResponse } from '@/types/api';

export type UseOrderedModelsOptions = {
  selectedParticipants: ParticipantConfig[];
  allEnabledModels: EnhancedModelResponse[];
  modelOrder: string[];
};

/**
 * Computes ordered models with participant mapping for model selection modal
 * Handles deduplication and appends newly available models not in the order
 *
 * Used by ChatOverviewScreen and ChatView for consistent model ordering
 */
export function useOrderedModels({
  selectedParticipants,
  allEnabledModels,
  modelOrder,
}: UseOrderedModelsOptions): OrderedModel[] {
  return useMemo((): OrderedModel[] => {
    if (allEnabledModels.length === 0)
      return [];

    const participantMap = new Map(
      selectedParticipants.map(p => [p.modelId, p]),
    );
    const modelMap = new Map(allEnabledModels.map(m => [m.id, m]));

    // Build ordered list from modelOrder, deduplicating as we go
    const seen = new Set<string>();
    const result: OrderedModel[] = [];

    // First, add models in the stored order
    for (const modelId of modelOrder) {
      if (seen.has(modelId))
        continue;
      const model = modelMap.get(modelId);
      if (!model)
        continue;
      seen.add(modelId);
      result.push({
        model,
        participant: participantMap.get(modelId) || null,
        order: result.length,
      });
    }

    // Then, append any models not yet in the order (newly available models)
    for (const model of allEnabledModels) {
      if (seen.has(model.id))
        continue;
      seen.add(model.id);
      result.push({
        model,
        participant: participantMap.get(model.id) || null,
        order: result.length,
      });
    }

    return result;
  }, [selectedParticipants, allEnabledModels, modelOrder]);
}
