import type { SubscriptionTier } from '@roundtable/shared/enums';
import { z } from 'zod';

import { createError } from '@/common/error-handling';
import type { getDbAsync } from '@/db';
import { SUBSCRIPTION_TIER_NAMES } from '@/lib/config';
import type { ModelForPricing } from '@/services/billing';
import {
  canAccessModelByPricing,
  getRequiredTierForModel,
  MAX_MODELS_BY_TIER,
} from '@/services/billing';
import { getModelById } from '@/services/models';

import { getEnabledParticipantCount } from './participant-query.service';

// ============================================================================
// SCHEMAS
// ============================================================================

const _ParticipantForValidationSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  isEnabled: z.boolean().optional(),
});

export type ParticipantForValidation = z.infer<typeof _ParticipantForValidationSchema>;

const _ValidateModelAccessOptionsSchema = z.object({
  skipPricingCheck: z.boolean().optional(),
});

export type ValidateModelAccessOptions = z.infer<typeof _ValidateModelAccessOptionsSchema>;

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
  const maxModels = MAX_MODELS_BY_TIER[userTier];

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
  const model = getModelById(modelId);

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
