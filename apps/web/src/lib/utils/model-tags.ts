/**
 * Model Tag Utilities
 *
 * Frontend utilities for checking model capability tags.
 * Derives tags from model capabilities since API doesn't return tags directly.
 */

import type { ModelCapabilityTag } from '@roundtable/shared';
import { ModelCapabilityTags } from '@roundtable/shared';

import type { Model } from '@/services/api';

/**
 * Derive capability tags from model properties
 * Matches backend logic in models-config.service.ts deriveModelTags()
 */
export function getModelTags(model: Model | undefined): ModelCapabilityTag[] {
  if (!model)
    return [];

  const tags: ModelCapabilityTag[] = [];

  // Fast models: context length >= 128k and cheap pricing (< $3/M input tokens)
  const inputPrice = Number.parseFloat(model.pricing.prompt);
  if (model.context_length >= 128000 && inputPrice < 0.000003) {
    tags.push(ModelCapabilityTags.FAST);
  }

  // Vision capability
  if (model.supports_vision) {
    tags.push(ModelCapabilityTags.VISION);
  }

  // Reasoning models
  if (model.is_reasoning_model) {
    tags.push(ModelCapabilityTags.REASONING);
  }

  // PDF/File support
  if (model.supports_file) {
    tags.push(ModelCapabilityTags.PDF);
  }

  return tags;
}

/**
 * Check if a model has a specific capability tag
 */
export function modelHasTag(model: Model | undefined, tag: ModelCapabilityTag): boolean {
  return getModelTags(model).includes(tag);
}

/**
 * Check if a model has all specified tags
 */
export function modelHasAllTags(model: Model | undefined, tags: ModelCapabilityTag[]): boolean {
  const modelTags = getModelTags(model);
  return tags.every(tag => modelTags.includes(tag));
}

/**
 * Filter models by tags - return only models that have all specified tags
 */
export function filterModelsByTags(
  models: Model[],
  tags: ModelCapabilityTag[],
): Model[] {
  if (tags.length === 0) {
    return models;
  }
  return models.filter(model => modelHasAllTags(model, tags));
}
