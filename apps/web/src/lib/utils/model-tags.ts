/**
 * Model Tag Utilities
 *
 * Frontend utilities for checking model capability tags.
 * Extracted from apps/api/src/services/models/models-config.service.ts
 */

import type { ModelCapabilityTag } from '@roundtable/shared';

import type { EnhancedModelResponse } from '@/types/api';

/**
 * Get model capability tags for a given model
 */
export function getModelTags(model: EnhancedModelResponse | undefined): ModelCapabilityTag[] {
  return (model?.tags ?? []) as ModelCapabilityTag[];
}

/**
 * Check if a model has a specific capability tag
 */
export function modelHasTag(model: EnhancedModelResponse | undefined, tag: ModelCapabilityTag): boolean {
  return getModelTags(model).includes(tag);
}

/**
 * Check if a model has all specified tags
 */
export function modelHasAllTags(model: EnhancedModelResponse | undefined, tags: ModelCapabilityTag[]): boolean {
  const modelTags = getModelTags(model);
  return tags.every(tag => modelTags.includes(tag));
}

/**
 * Filter models by tags - return only models that have all specified tags
 */
export function filterModelsByTags(
  models: EnhancedModelResponse[],
  tags: ModelCapabilityTag[],
): EnhancedModelResponse[] {
  if (tags.length === 0) {
    return models;
  }
  return models.filter(model => modelHasAllTags(model, tags));
}
