/**
 * Model Presets Configuration
 *
 * Pre-configured model combinations for different use cases.
 * Presets are dynamically populated based on available models and user tier.
 */

import type { LucideIcon } from 'lucide-react';
import {
  Brain,
  Code,
  Crown,
  Eye,
  FileSearch,
  Globe,
  Lightbulb,
  Scale,
  ScrollText,
  Zap,
} from 'lucide-react';

import type { ChatMode, SubscriptionTier } from '@/api/core/enums';
import type { BaseModelResponse } from '@/api/routes/models/schema';
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
    | 'premium'
    | 'file-research'
    | 'vision-experts'
    | 'long-context'
    | 'web-research';

export type ModelPreset = {
  id: ModelPresetId;
  name: string;
  description: string;
  icon: LucideIcon;
  requiredTier: SubscriptionTier;
  order: number;
  selectModels: (
    models: BaseModelResponse[],
    userTier: SubscriptionTier,
  ) => BaseModelResponse[];
  maxModels: number;
  recommendedMode?: ChatMode;
  recommendWebSearch?: boolean;
  requiresVision?: boolean;
};

// ============================================================================
// Helper Functions for Model Selection
// ============================================================================

function getAccessibleModels(
  models: BaseModelResponse[],
  userTier: SubscriptionTier,
): BaseModelResponse[] {
  return models.filter(m => canAccessModelByPricing(userTier, m));
}

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

function getHighContextModels(
  models: BaseModelResponse[],
  minContext: number = 100000,
): BaseModelResponse[] {
  return models
    .filter(m => m.context_length >= minContext)
    .sort((a, b) => b.context_length - a.context_length);
}

function getVisionModels(models: BaseModelResponse[]): BaseModelResponse[] {
  return models.filter(m => m.capabilities.vision);
}

function getPremiumModels(
  models: BaseModelResponse[],
  count: number,
): BaseModelResponse[] {
  return [...models]
    .sort((a, b) => {
      const priceA = Number.parseFloat(a.pricing.prompt) * 1_000_000;
      const priceB = Number.parseFloat(b.pricing.prompt) * 1_000_000;
      return priceB - priceA;
    })
    .slice(0, count);
}

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
    recommendedMode: 'debating',
    recommendWebSearch: false,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const diverse = diversifyByProvider(accessible, 1);
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
    recommendedMode: 'brainstorming',
    recommendWebSearch: false,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
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
    recommendedMode: 'brainstorming',
    recommendWebSearch: false,
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
    recommendedMode: 'solving',
    recommendWebSearch: false,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const withTools = getModelsWithCapabilities(accessible, ['tools']);
      const diverse = diversifyByProvider(
        withTools.length >= 4 ? withTools : accessible,
        1,
      );
      return diverse.slice(0, 4);
    },
  },
  {
    id: 'web-research',
    name: 'Web Researchers',
    description: 'Research team with web search enabled for current info',
    icon: Globe,
    requiredTier: 'starter',
    order: 5,
    maxModels: 3,
    recommendedMode: 'analyzing',
    recommendWebSearch: true,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const withReasoning = getModelsWithCapabilities(accessible, ['reasoning']);
      const sorted = withReasoning.length >= 3
        ? withReasoning
        : accessible;
      return diversifyByProvider(sorted, 1).slice(0, 3);
    },
  },
  {
    id: 'deep-thinkers',
    name: 'Deep Thinkers',
    description: 'Maximum reasoning depth for complex problems',
    icon: Brain,
    requiredTier: 'pro',
    order: 6,
    maxModels: 4,
    recommendedMode: 'analyzing',
    recommendWebSearch: false,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const withReasoning = getModelsWithCapabilities(accessible, ['reasoning']);
      const highContext = getHighContextModels(
        withReasoning.length >= 4 ? withReasoning : accessible,
        64000,
      );
      return diversifyByProvider(highContext, 1).slice(0, 4);
    },
  },
  {
    id: 'file-research',
    name: 'File Analysts',
    description: 'Vision-capable models for analyzing images, PDFs, documents',
    icon: FileSearch,
    requiredTier: 'pro',
    order: 7,
    maxModels: 4,
    recommendedMode: 'analyzing',
    recommendWebSearch: false,
    requiresVision: true,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const visionModels = getVisionModels(accessible);
      const sorted = [...visionModels].sort(
        (a, b) => b.context_length - a.context_length,
      );
      return diversifyByProvider(sorted, 1).slice(0, 4);
    },
  },
  {
    id: 'vision-experts',
    name: 'Vision Experts',
    description: 'Top multimodal models for image understanding and analysis',
    icon: Eye,
    requiredTier: 'pro',
    order: 8,
    maxModels: 4,
    recommendedMode: 'analyzing',
    recommendWebSearch: false,
    requiresVision: true,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const visionModels = getVisionModels(accessible);
      const premium = getPremiumModels(visionModels, 8);
      return diversifyByProvider(premium, 1).slice(0, 4);
    },
  },
  {
    id: 'long-context',
    name: 'Long Context Team',
    description: 'Models with 500K+ context for analyzing large documents',
    icon: ScrollText,
    requiredTier: 'pro',
    order: 9,
    maxModels: 4,
    recommendedMode: 'analyzing',
    recommendWebSearch: false,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const highContext = getHighContextModels(accessible, 500000);
      return diversifyByProvider(highContext, 1).slice(0, 4);
    },
  },
  {
    id: 'premium',
    name: 'Premium Think Tank',
    description: 'High-power strategic and analytical thinking',
    icon: Crown,
    requiredTier: 'power',
    order: 10,
    maxModels: 5,
    recommendedMode: 'debating',
    recommendWebSearch: true,
    selectModels: (models, userTier) => {
      const accessible = getAccessibleModels(models, userTier);
      const premium = getPremiumModels(accessible, 10);
      return diversifyByProvider(premium, 1).slice(0, 5);
    },
  },
];

// ============================================================================
// Utility Functions
// ============================================================================

export function getPresetById(id: ModelPresetId): ModelPreset | undefined {
  return MODEL_PRESETS.find(p => p.id === id);
}

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

export function canAccessPreset(
  preset: ModelPreset,
  userTier: SubscriptionTier,
): boolean {
  const userTierIndex = SUBSCRIPTION_TIERS.indexOf(userTier);
  const requiredIndex = SUBSCRIPTION_TIERS.indexOf(preset.requiredTier);
  return userTierIndex >= requiredIndex;
}

export function getModelsForPreset(
  preset: ModelPreset,
  allModels: BaseModelResponse[],
  userTier: SubscriptionTier,
): BaseModelResponse[] {
  return preset.selectModels(allModels, userTier);
}

export function getPresetMinimumTier(
  preset: ModelPreset,
  allModels: BaseModelResponse[],
): SubscriptionTier {
  let highestTier = preset.requiredTier;
  const highestTierIndex = SUBSCRIPTION_TIERS.indexOf(highestTier);

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
