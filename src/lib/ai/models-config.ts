/**
 * AI Model Configurations - DYNAMIC FROM OPENROUTER API
 *
 * ✅ FULLY DYNAMIC: All models fetched from OpenRouter API
 * ✅ NO HARDCODED MODELS: Models determined by OpenRouter availability
 * ✅ PRICING-BASED ACCESS: User tiers based on model pricing
 * ✅ AUTOMATIC UPDATES: New models appear automatically
 *
 * This file provides only type definitions and utility functions.
 * Actual model data comes from OpenRouter API dynamically.
 */

import type { RoundtablePromptParams } from '@/api/routes/chat/schema';
import type { EnhancedModelResponse } from '@/api/routes/models/schema';
import {
  canAccessModelByPricing,
  getModelCostCategory,
  getModelPricingDisplay,
  getRequiredTierForModel,
  getTierUpgradeMessage,
  isModelFree,
} from '@/api/services/model-pricing-tiers.service';
import type { SubscriptionTier } from '@/db/tables/usage';

import { getProviderIcon } from './provider-icons';

// ============================================================================
// TYPE DEFINITIONS (For Legacy Compatibility)
// ============================================================================

/**
 * ⚠️ LEGACY TYPE: For backward compatibility only
 * New code should use EnhancedModelResponse from schema directly
 */
export type ModelProvider = 'openrouter';

export type ModelCapabilities = {
  streaming: boolean;
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ModelDefaultSettings = {
  temperature: number;
  maxTokens: number;
  maxOutputTokens?: number;
  topP: number;
};

export type ModelMetadata = {
  icon: string;
  color: string;
  category: string;
  contextWindow: number;
  strengths: string[];
  pricing?: {
    input: string;
    output: string;
  };
};

/**
 * ⚠️ LEGACY TYPE: For backward compatibility
 * Use EnhancedModelResponse from schema for new code
 */
export type AIModel = {
  id: string;
  provider: ModelProvider;
  modelId: string;
  name: string;
  description: string;
  capabilities: ModelCapabilities;
  defaultSettings: ModelDefaultSettings;
  isEnabled: boolean;
  order: number;
  metadata: ModelMetadata;
  minTier: SubscriptionTier;
};

// ============================================================================
// DYNAMIC MODEL ACCESS (Replaces Hardcoded Lists)
// ============================================================================

/**
 * ✅ DYNAMIC: Convert OpenRouter model to legacy AIModel format
 * Used for backward compatibility with existing UI components
 *
 * @param openRouterModel - Model from OpenRouter API
 * @returns Legacy AIModel format
 */
export function convertToAIModel(openRouterModel: EnhancedModelResponse): AIModel {
  const minTier = getRequiredTierForModel(openRouterModel);
  const provider = openRouterModel.id.split('/')[0] || 'unknown';

  return {
    id: openRouterModel.id,
    provider: 'openrouter',
    modelId: openRouterModel.id,
    name: openRouterModel.name,
    description: openRouterModel.description || '',
    capabilities: {
      streaming: openRouterModel.capabilities.streaming,
      tools: openRouterModel.capabilities.tools,
      vision: openRouterModel.capabilities.vision,
      reasoning: openRouterModel.capabilities.reasoning,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.9,
    },
    isEnabled: true,
    order: 0,
    metadata: {
      icon: `/static/icons/ai-models/${provider}.png`,
      color: '#10A37F',
      category: openRouterModel.category,
      contextWindow: openRouterModel.context_length,
      strengths: [],
      pricing: {
        input: openRouterModel.pricing_display.input,
        output: openRouterModel.pricing_display.output,
      },
    },
    minTier,
  };
}

/**
 * ✅ DYNAMIC MODEL ACCESS: Get model by ID with dynamic fallback
 * Searches by both full modelId and short id for backward compatibility
 *
 * IMPORTANT: For unknown model IDs (custom OpenRouter models),
 * creates a minimal AIModel object with defaults to support avatar display
 *
 * @param modelId - OpenRouter model ID
 * @returns AIModel object or undefined
 */
export function getModelById(modelId: string): AIModel | undefined {
  if (!modelId) {
    return undefined;
  }

  // For dynamic models, create a minimal model object for display
  // Extract provider from modelId (e.g., "anthropic/claude-4" -> "anthropic")
  const providerPart = modelId.includes('/') ? modelId.split('/')[0] : undefined;
  const provider = providerPart || 'openrouter';
  const displayName = modelId.split('/').pop() || modelId;

  // Return minimal model for dynamic rendering
  return {
    id: modelId,
    provider: 'openrouter' as const,
    modelId,
    name: displayName,
    description: `OpenRouter model: ${modelId}`,
    capabilities: {
      streaming: true,
      tools: true,
      vision: false,
      reasoning: false,
    },
    defaultSettings: {
      temperature: 0.7,
      maxTokens: 4096,
      topP: 0.9,
    },
    isEnabled: true,
    order: 999,
    minTier: 'pro', // Assume pro tier for unknown models
    metadata: {
      icon: getProviderIcon(provider), // ✅ Use provider icon utility with fallback
      color: '#10A37F',
      category: 'general',
      contextWindow: 128000,
      strengths: [],
      pricing: {
        input: 'See OpenRouter',
        output: 'See OpenRouter',
      },
    },
  };
}

// ============================================================================
// MODEL ACCESS CONTROL (Pricing-Based)
// ============================================================================

/**
 * ✅ DYNAMIC ACCESS CONTROL: Check if user can access model by pricing
 * Replaces hardcoded minTier checks with dynamic pricing-based logic
 *
 * @param userTier - User's subscription tier
 * @param modelIdOrModel - Model ID string or EnhancedModelResponse
 * @returns true if user can access the model
 */
export function canAccessModel(
  userTier: SubscriptionTier,
  modelIdOrModel: string | EnhancedModelResponse,
): boolean {
  // If it's just a model ID string (legacy usage), allow access
  // The actual access check happens in the UI when models are loaded
  if (typeof modelIdOrModel === 'string') {
    return true; // Legacy compatibility - actual check done with full model data
  }

  // Use pricing-based access control for EnhancedModelResponse
  return canAccessModelByPricing(userTier, modelIdOrModel);
}

/**
 * Get user-friendly tier display name
 */
export function getTierDisplayName(tier: SubscriptionTier): string {
  const names: Record<SubscriptionTier, string> = {
    free: 'Free',
    starter: 'Starter',
    pro: 'Pro',
    power: 'Power',
  };
  return names[tier];
}

// ============================================================================
// DEFAULT ROLES (Unchanged)
// ============================================================================

/**
 * Default role options for participants
 * These roles help guide model behavior in multi-model conversations
 */
export const DEFAULT_ROLES = [
  'The Ideator',
  'Devil\'s Advocate',
  'Builder',
  'Practical Evaluator',
  'Visionary Thinker',
  'Domain Expert',
  'User Advocate',
  'Implementation Strategist',
  'The Data Analyst',
] as const;

export type DefaultRole = typeof DEFAULT_ROLES[number];

// ============================================================================
// SUBSCRIPTION TIER CONFIGURATION
// ============================================================================

/**
 * 🚨 FALLBACK STATIC CONFIG - Database is Single Source of Truth
 *
 * Real quotas come from `subscriptionTierQuotas` table in database.
 * This config serves as:
 * 1. Fallback for client-side type checking
 * 2. Default values if DB query fails
 * 3. Type safety for quota structure
 *
 * ✅ Backend Services: Query `subscriptionTierQuotas` table directly (see usage-tracking.service.ts)
 * ✅ Frontend: Fetch via `useUsageStatsQuery()` hook
 *
 * IMPORTANT: Keep these values in sync with database seed data
 */
export const SUBSCRIPTION_TIER_CONFIG = {
  free: {
    maxModels: 2,
    maxOutputTokens: 2048,
    quotas: {
      threadsPerMonth: 10,
      messagesPerMonth: 100,
      memoriesPerMonth: 0,
      customRolesPerMonth: 0,
    },
  },
  starter: {
    maxModels: 3,
    maxOutputTokens: 4096,
    quotas: {
      threadsPerMonth: 50,
      messagesPerMonth: 500,
      memoriesPerMonth: 5,
      customRolesPerMonth: 3,
    },
  },
  pro: {
    maxModels: 5,
    maxOutputTokens: 8192,
    quotas: {
      threadsPerMonth: 200,
      messagesPerMonth: 2000,
      memoriesPerMonth: 20,
      customRolesPerMonth: 10,
    },
  },
  power: {
    maxModels: 10,
    maxOutputTokens: 16384,
    quotas: {
      threadsPerMonth: 1000,
      messagesPerMonth: 10000,
      memoriesPerMonth: 100,
      customRolesPerMonth: 50,
    },
  },
} as const;

// ============================================================================
// MODEL VALIDATION UTILITIES
// ============================================================================

/**
 * ✅ DYNAMIC: Validate if a model ID is valid
 * Accepts any string format model ID (dynamic from OpenRouter)
 */
export function isValidModelId(modelId: unknown): modelId is string {
  return typeof modelId === 'string' && modelId.length > 0;
}

/**
 * ✅ DYNAMIC: Validate if a model ID is a valid OpenRouter format
 * OpenRouter model IDs follow the pattern: provider/model-name
 */
export function isValidOpenRouterModelId(modelId: string): boolean {
  return typeof modelId === 'string' && modelId.includes('/');
}

// ============================================================================
// TIER LIMIT UTILITIES
// ============================================================================

/**
 * Check if user can add more models based on current count and tier
 */
export function canAddMoreModels(currentCount: number, tier: SubscriptionTier): boolean {
  const config = SUBSCRIPTION_TIER_CONFIG[tier];
  return currentCount < config.maxModels;
}

/**
 * Get error message when max models limit is reached
 */
export function getMaxModelsErrorMessage(tier: SubscriptionTier): string {
  const config = SUBSCRIPTION_TIER_CONFIG[tier];
  const tierName = getTierDisplayName(tier);
  return `You've reached the maximum of ${config.maxModels} models for the ${tierName} tier. Upgrade to add more models.`;
}

/**
 * Get maximum output tokens allowed for a tier
 */
export function getMaxOutputTokens(tier: SubscriptionTier): number {
  return SUBSCRIPTION_TIER_CONFIG[tier].maxOutputTokens;
}

// ============================================================================
// ROUNDTABLE SYSTEM PROMPT BUILDER
// ============================================================================

/**
 * Build system prompt for Roundtable mode
 * Constructs context-aware prompts for each AI participant
 * ✅ ZOD-FIRST: Uses type from RoundtablePromptParamsSchema (single source of truth)
 */
export function buildRoundtableSystemPrompt(params: RoundtablePromptParams): string {
  const { mode, participantIndex, participantRole, participants, otherParticipants, memories = [], customSystemPrompt } = params;

  // If custom system prompt provided, use it directly
  if (customSystemPrompt) {
    return customSystemPrompt;
  }

  // Base prompt structure
  let prompt = `You are participating in a ${mode} Roundtable discussion.\n\n`;

  // Add role if provided
  if (participantRole) {
    prompt += `Your role: ${participantRole}\n\n`;
  }

  // Add context about other participants
  const participantsToShow = otherParticipants || participants || [];
  if (participantsToShow.length > 0) {
    const filteredParticipants = otherParticipants
      ? participantsToShow
      : participantsToShow.filter((p, idx) => idx !== participantIndex);

    if (filteredParticipants.length > 0) {
      prompt += 'Other participants:\n';
      filteredParticipants.forEach((p) => {
        if (p.role) {
          prompt += `- ${p.role}\n`;
        }
      });
      prompt += '\n';
    }
  }

  // Add memories if available
  if (memories.length > 0) {
    prompt += 'Relevant context:\n';
    memories.forEach((memory) => {
      prompt += `- ${memory.title}: ${memory.content}\n`;
    });
    prompt += '\n';
  }

  // Mode-specific instructions
  if (mode === 'debating') {
    prompt += 'Engage in constructive debate. Challenge ideas while remaining respectful.';
  } else if (mode === 'analyzing') {
    prompt += 'Provide analytical insights from your perspective. Focus on evidence and reasoning.';
  } else if (mode === 'brainstorming') {
    prompt += 'Generate creative ideas. Build on others\' suggestions and explore possibilities.';
  } else {
    prompt += 'Contribute your unique perspective to the discussion.';
  }

  return prompt;
}

// ============================================================================
// RE-EXPORT PRICING UTILITIES
// ============================================================================

/**
 * Re-export pricing utilities for convenience
 * All pricing logic is in model-pricing-tiers.service.ts
 */
export {
  canAccessModelByPricing,
  getModelCostCategory,
  getModelPricingDisplay,
  getRequiredTierForModel,
  getTierUpgradeMessage,
  isModelFree,
};

// ============================================================================
// DEPRECATED - DO NOT USE
// ============================================================================

/**
 * ⚠️ DEPRECATED: Hardcoded model enum - DO NOT USE
 * Models are now fully dynamic from OpenRouter API
 * This exists only for type compatibility with old code
 */
export const AllowedModelId = {} as const;

/**
 * ⚠️ DEPRECATED: Hardcoded model array - DO NOT USE
 * All models now fetched dynamically from OpenRouter API
 * Use useModelsQuery() hook to get real-time model list
 */
export const AI_MODELS: AIModel[] = [];

/**
 * ⚠️ DEPRECATED: Do not use these functions
 * Use dynamic model fetching instead
 */
export function getModelsByProvider(): AIModel[] {
  return [];
}

export function getModelsByCategory(): AIModel[] {
  return [];
}

export function getEnabledModels(): AIModel[] {
  return [];
}
