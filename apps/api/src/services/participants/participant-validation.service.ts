import { SUBSCRIPTION_TIER_NAMES } from '@roundtable/shared';
import type { SubscriptionTier } from '@roundtable/shared/enums';

import { createError } from '@/common/error-handling';
import type { ModelForPricing } from '@/common/schemas/model-pricing';
import type { getDbAsync } from '@/db';
import type {
  ParticipantForValidation,
  ValidateModelAccessOptions,
} from '@/lib/schemas/participant-schemas';
import {
  canAccessModelByPricing,
  getRequiredTierForModel,
  MAX_MODELS_BY_TIER,
} from '@/services/billing';
import { getModelById } from '@/services/models';

import { getEnabledParticipantCount } from './participant-query.service';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Adapter to convert getModelById to ModelForPricing type expected by billing functions
 * Strips Zod .openapi() index signatures from model types
 */
function getModelForPricing(modelId: string): ModelForPricing | undefined {
  const model = getModelById(modelId);
  if (!model) {
    return undefined;
  }

  return {
    capabilities: model.capabilities,
    context_length: model.context_length,
    created: model.created,
    id: model.id,
    name: model.name,
    pricing: model.pricing,
    pricing_display: model.pricing_display,
    provider: model.provider,
  };
}

// ============================================================================
// VALIDATION - UNIQUENESS
// ============================================================================

export function validateParticipantUniqueness(
  participants: ParticipantForValidation[],
): void {
  const enabledParticipants = participants.filter(p => p.isEnabled !== false);
  const modelIds = enabledParticipants.map(p => p.modelId);
  const duplicateModelIds = modelIds.filter((id, index) => modelIds.indexOf(id) !== index);

  if (duplicateModelIds.length > 0) {
    const uniqueDuplicates = [...new Set(duplicateModelIds)];
    throw createError.badRequest(
      `Duplicate AI models detected: ${uniqueDuplicates.join(', ')}. Each AI model can only be added once per conversation.`,
      { errorType: 'validation', field: 'modelId' },
    );
  }
}

// ============================================================================
// VALIDATION - TIER LIMITS
// ============================================================================

export async function validateTierLimits(
  threadId: string,
  userTier: SubscriptionTier,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<void> {
  const currentModelCount = await getEnabledParticipantCount(threadId, db);
  const maxModels = MAX_MODELS_BY_TIER[userTier] ?? 1;

  if (currentModelCount >= maxModels) {
    throw createError.badRequest(
      `Your ${SUBSCRIPTION_TIER_NAMES[userTier]} plan allows up to ${maxModels} AI models per conversation. You already have ${currentModelCount} models. Remove a model or upgrade your plan to add more.`,
      {
        errorType: 'validation',
        field: 'modelId',
      },
    );
  }
}

// ============================================================================
// VALIDATION - MODEL ACCESS
// ============================================================================

export async function validateModelAccess(
  modelId: string,
  userTier: SubscriptionTier,
  options?: ValidateModelAccessOptions,
): Promise<ModelForPricing> {
  const model = getModelForPricing(modelId);

  if (!model) {
    throw createError.badRequest(
      `Model "${modelId}" not found`,
      {
        errorType: 'validation',
        field: 'modelId',
      },
    );
  }

  if (options?.skipPricingCheck) {
    return model;
  }

  const canAccess = canAccessModelByPricing(userTier, model);

  if (!canAccess) {
    const requiredTier = getRequiredTierForModel(model);
    throw createError.unauthorized(
      `Your ${SUBSCRIPTION_TIER_NAMES[userTier]} plan does not include access to ${model.name}. Upgrade to ${SUBSCRIPTION_TIER_NAMES[requiredTier]} or higher to use this model.`,
      {
        errorType: 'authorization',
        resource: 'model',
        resourceId: modelId,
      },
    );
  }

  return model;
}

// ============================================================================
// VALIDATION - COMBINED
// ============================================================================

export async function validateParticipantModels(
  participants: ParticipantForValidation[],
  userTier: SubscriptionTier,
): Promise<void> {
  validateParticipantUniqueness(participants);

  const enabledParticipants = participants.filter(p => p.isEnabled !== false);

  for (const participant of enabledParticipants) {
    await validateModelAccess(participant.modelId, userTier);
  }
}
