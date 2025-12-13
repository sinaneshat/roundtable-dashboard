/**
 * Model Presets Configuration
 *
 * Pre-configured model combinations for different use cases.
 * Presets are dynamically populated based on available models and user tier.
 *
 * ✅ TIER-BASED ACCESS: Some presets require higher subscription tiers
 * ✅ DYNAMIC MODELS: Model selection based on capabilities and pricing
 * ✅ USE CASE FOCUSED: Each preset optimized for specific tasks
 */

import type { LucideIcon } from 'lucide-react';
import {
  Brain,
  Code,
  Crown,
  Lightbulb,
  Scale,
  Zap,
} from 'lucide-react';

import type { BaseModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import {
  canAccessModelByPricing,
  getRequiredTierForModel,
  SUBSCRIPTION_TIERS,
} from '@/api/services/product-logic.service';

// ============================================================================
// Preset Types
// ============================================================================

export type ModelPresetId
  = | 'balanced'
    | 'creative'
    | 'budget'
    | 'technical'
    | 'deep-thinkers'
    | 'premium';

export type ModelPreset = {
  id: ModelPresetId;
  name: string;
  description: string;
  icon: LucideIcon;
  requiredTier: SubscriptionTier;
  order: number;
  /** Model selection criteria - function that filters/sorts models for this preset */
  selectModels: (
    models: BaseModelResponse[],
    userTier: SubscriptionTier,
  ) => BaseModelResponse[];
  /** Maximum models for this preset */
  maxModels: number;
};

// ============================================================================
// Helper Functions for Model Selection
// ============================================================================

/**
 * Filter models accessible to user's tier
 */
function getAccessibleModels(
  models: BaseModelResponse[],
  userTier: SubscriptionTier,
): BaseModelResponse[] {
  return models.filter(m => canAccessModelByPricing(userTier, m));
}

/**
 * Get cheapest models (sorted by input pricing)
 */
function getCheapestModels(
  models: BaseModelResponse[],
  count: number,
): BaseModelResponse[] {
  return [...models]
    .sort((a, b) => {
      const priceA = Number.parseFloat(a.pricing.prompt) * 1_000_000;
      const priceB = Number.parseFloat(b.pricing.prompt) * 1_000_000;
      return priceA - priceB;
    })
    .slice(0, count);
}

/**
 * Get models with specific capabilities
 */
function getModelsWithCapabilities(
  models: BaseModelResponse[],
  capabilities: Array<'reasoning' | 'vision' | 'tools'>,
): BaseModelResponse[] {
  return models.filter((m) => {
    return capabilities.every((cap) => {
      if (cap === 'reasoning')
        return m.capabilities.reasoning;
      if (cap === 'vision')
        return m.capabilities.vision;
      if (cap === 'tools')
        return m.capabilities.tools;
      return false;
    });
  });
}

/**
 * Get highest context models
 */
function getHighContextModels(
  models: BaseModelResponse[],
  minContext: number = 100000,
): BaseModelResponse[] {
  return models
    .filter(m => m.context_length >= minContext)
    .sort((a, b) => b.context_length - a.context_length);
}

/**
 * Get premium/flagship models (highest pricing)
 */
function getPremiumModels(
  models: BaseModelResponse[],
  count: number,
): BaseModelResponse[] {
  return [...models]
    .sort((a, b) => {
      const priceA = Number.parseFloat(a.pricing.prompt) * 1_000_000;
      const priceB = Number.parseFloat(b.pricing.prompt) * 1_000_000;
      return priceB - priceA; // Descending
    })
    .slice(0, count);
}

/**
 * Diversify models by provider (max N per provider)
 */
function diversifyByProvider(
  models: BaseModelResponse[],
  maxPerProvider: number = 2,
): BaseModelResponse[] {
  const result: BaseModelResponse[] = [];
  const providerCounts = new Map<string, number>();

  for (const model of models) {
    const count = providerCounts.get(model.provider) || 0;
    if (count < maxPerProvider) {
      result.push(model);
      providerCounts.set(model.provider, count + 1);
    }
  }

  return result;
}

// ============================================================================
// Preset Configurations
// ============================================================================

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'balanced',
    name: 'Balanced Panel',
    description: 'Well-rounded thinking with balanced creativity and reasoning',
    icon: Scale,
    requiredTier: 'free',
    order: 1,
    maxModels: 3,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      // Mix of providers for diverse perspectives
      const diverse = diversifyByProvider(accessible, 1);
      // Prefer models with reasoning capability
      const withReasoning = diverse.filter(m => m.capabilities.reasoning);
      const withoutReasoning = diverse.filter(m => !m.capabilities.reasoning);
      return [...withReasoning, ...withoutReasoning].slice(0, 3);
    },
  },
  {
    id: 'creative',
    name: 'Creative Workshop',
    description: 'Fast ideas, creative concepts, expressive writing',
    icon: Lightbulb,
    requiredTier: 'free',
    order: 2,
    maxModels: 3,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      // Prefer fast models (lower context = usually faster)
      const sorted = [...accessible].sort(
        (a, b) => a.context_length - b.context_length,
      );
      return diversifyByProvider(sorted, 1).slice(0, 3);
    },
  },
  {
    id: 'budget',
    name: 'Budget Panel',
    description: 'Fast and inexpensive brainstorming',
    icon: Zap,
    requiredTier: 'free',
    order: 3,
    maxModels: 3,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const cheapest = getCheapestModels(accessible, 10);
      return diversifyByProvider(cheapest, 1).slice(0, 3);
    },
  },
  {
    id: 'technical',
    name: 'Technical Team',
    description: 'Strong coding, analysis, and truth-seeking voices',
    icon: Code,
    requiredTier: 'starter',
    order: 4,
    maxModels: 4,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      // Prefer models with tools capability (good for coding)
      const withTools = getModelsWithCapabilities(accessible, ['tools']);
      const diverse = diversifyByProvider(
        withTools.length >= 4 ? withTools : accessible,
        1,
      );
      return diverse.slice(0, 4);
    },
  },
  {
    id: 'deep-thinkers',
    name: 'Deep Thinkers',
    description: 'Maximum reasoning depth for complex problems',
    icon: Brain,
    requiredTier: 'pro',
    order: 5,
    maxModels: 4,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      // Prioritize reasoning models with high context
      const withReasoning = getModelsWithCapabilities(accessible, ['reasoning']);
      const highContext = getHighContextModels(
        withReasoning.length >= 4 ? withReasoning : accessible,
        64000,
      );
      return diversifyByProvider(highContext, 1).slice(0, 4);
    },
  },
  {
    id: 'premium',
    name: 'Premium Think Tank',
    description: 'High-power strategic and analytical thinking',
    icon: Crown,
    requiredTier: 'power',
    order: 6,
    maxModels: 5,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      // Get the most premium models
      const premium = getPremiumModels(accessible, 10);
      return diversifyByProvider(premium, 1).slice(0, 5);
    },
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get preset by ID
 */
export function getPresetById(id: ModelPresetId): ModelPreset | undefined {
  return MODEL_PRESETS.find(p => p.id === id);
}

/**
 * Get presets available to user's tier
 */
export function getPresetsForTier(userTier: SubscriptionTier): ModelPreset[] {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);

  return MODEL_PRESETS.map((preset) => {
    const requiredIndex = SUBSCRIPTION_TIERS.indexOf(preset.requiredTier);
    return {
      ...preset,
      isLocked: userTierIndex < requiredIndex,
    };
  }).sort((a, b) => a.order - b.order);
}

/**
 * Check if user can access a preset
 */
export function canAccessPreset(
  preset: ModelPreset,
  userTier: SubscriptionTier,
): boolean {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);
  const requiredIndex = SUBSCRIPTION_TIERS.indexOf(preset.requiredTier);
  return userTierIndex >= requiredIndex;
}

/**
 * Get models for a preset based on available models and user tier
 */
export function getModelsForPreset(
  preset: ModelPreset,
  allModels: BaseModelResponse[],
  userTier: SubscriptionTier,
): BaseModelResponse[] {
  return preset.selectModels(allModels, userTier);
}

/**
 * Get the minimum tier required to unlock a preset's models
 * Returns the highest tier required among all models in the preset
 */
export function getPresetMinimumTier(
  preset: ModelPreset,
  allModels: BaseModelResponse[],
): SubscriptionTier {
  // The preset itself has a required tier
  let highestTier = preset.requiredTier;
  const highestTierIndex = SUBSCRIPTION_TIERS.indexOf(highestTier);

  // Check if any models in the preset require a higher tier
  // Use 'power' tier to get all possible models for the preset
  const presetModels = preset.selectModels(allModels, 'power');

  for (const model of presetModels) {
    const modelTier = getRequiredTierForModel(model);
    const modelTierIndex = SUBSCRIPTION_TIERS.indexOf(modelTier);
    if (modelTierIndex > highestTierIndex) {
      highestTier = modelTier;
    }
  }

  return highestTier;
}
