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
 * ✅ NOW USES API-PROVIDED TAGS: Models now include pre-computed tags from backend
 * Falls back to local derivation only if tags not present (backwards compatibility)
 */
export function getModelTags(model: Model | undefined): ModelCapabilityTag[] {
  if (!model)
    return [];

  // ✅ PREFER API-PROVIDED TAGS: Use pre-computed tags from backend if available
  // Backend computes tags in models-config.service.ts deriveModelTags()
  if (model.tags && Array.isArray(model.tags)) {
    return model.tags as ModelCapabilityTag[];
  }

  // ✅ FALLBACK: Derive locally if API doesn't provide tags (backwards compatibility)
  // This matches the backend logic in models-config.service.ts:84-105
  const tags: ModelCapabilityTag[] = [];

  // Fast: input price < $0.50/M (matches backend: inputPrice * 1_000_000 < 0.5)
  const inputPrice = Number.parseFloat(model.pricing.prompt) * 1_000_000;
  if (inputPrice < 0.5) {
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
