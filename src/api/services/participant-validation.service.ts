/**
 * Participant Validation Service - SINGLE SOURCE OF TRUTH
 *
 * ✅ THE ONLY PLACE for all participant validation logic:
 * - Participant uniqueness validation (duplicate model checks)
 * - Tier limit validation (max models per conversation)
 * - Model access validation (tier-based model permissions)
 *
 * ⚠️ DO NOT:
 * - Duplicate validation logic in handlers
 * - Create handler-specific validation variations
 * - Bypass tier limit enforcement
 *
 * @see /src/api/routes/chat/handlers/participant.handler.ts - Original validation (lines 69-85)
 * @see /src/api/routes/chat/handlers/streaming.handler.ts - Duplicate check (lines 392-401)
 */

import { and, eq } from 'drizzle-orm';

import { createError } from '@/api/common/error-handling';
import type { getDbAsync } from '@/db';
import * as tables from '@/db/schema';

import type { BaseModelResponse } from '../routes/models/schema';
import { getModelById } from './models-config.service';
import type { SubscriptionTier } from './product-logic.service';
import {
  canAccessModelByPricing,
  getRequiredTierForModel,
  MAX_MODELS_BY_TIER,
  SUBSCRIPTION_TIER_NAMES,
} from './product-logic.service';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Participant data for validation
 * Can be from database or frontend (with temporary IDs)
 */
export type ParticipantForValidation = {
  id: string;
  modelId: string;
  isEnabled?: boolean;
};

// ============================================================================
// UNIQUENESS VALIDATION
// ============================================================================

/**
 * Validate participant uniqueness - ensure no duplicate models in conversation
 *
 * Each AI model can only be added once per conversation.
 * This prevents duplicate participants with the same modelId.
 *
 * @throws BadRequestError if duplicate models are detected
 *
 * @example
 * ```ts
 * // Validate provided participants before persistence
 * validateParticipantUniqueness(providedParticipants);
 * ```
 */
export function validateParticipantUniqueness(
  participants: ParticipantForValidation[],
): void {
  // Filter to enabled participants only
  const enabledParticipants = participants.filter(p => p.isEnabled !== false);

  // Extract modelIds
  const modelIds = enabledParticipants.map(p => p.modelId);

  // Find duplicates
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
// TIER LIMIT VALIDATION
// ============================================================================

/**
 * Validate tier limits - ensure user doesn't exceed max models for their subscription
 *
 * Each subscription tier has a maximum number of AI models allowed per conversation.
 * This validation prevents users from exceeding their tier's limit.
 *
 * @throws BadRequestError if user exceeds their tier's max models
 *
 * @example
 * ```ts
 * // Check before adding a new participant
 * await validateTierLimits(threadId, userTier, db);
 * ```
 */
export async function validateTierLimits(
  threadId: string,
  userTier: SubscriptionTier,
  db: Awaited<ReturnType<typeof getDbAsync>>,
): Promise<void> {
  // Get current enabled participants
  const existingParticipants = await db.query.chatParticipant.findMany({
    where: and(
      eq(tables.chatParticipant.threadId, threadId),
      eq(tables.chatParticipant.isEnabled, true),
    ),
  });

  const currentModelCount = existingParticipants.length;
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
// MODEL ACCESS VALIDATION
// ============================================================================

/**
 * Validate model access - ensure user's tier allows access to the requested model
 *
 * Different subscription tiers have access to different models based on pricing.
 * This validation ensures users can only add models their tier allows.
 *
 * @throws BadRequestError if model not found
 * @throws UnauthorizedError if user's tier doesn't allow access to the model
 *
 * @example
 * ```ts
 * // Validate before adding participant
 * await validateModelAccess(modelId, userTier);
 * ```
 */
export async function validateModelAccess(
  modelId: string,
  userTier: SubscriptionTier,
): Promise<BaseModelResponse> {
  // Fetch model details
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

  // Check tier access
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
// COMBINED VALIDATION
// ============================================================================

/**
 * Validate participant models - combined validation for all model-related checks
 *
 * This is a convenience function that runs all model validations in sequence:
 * 1. Model access validation (tier permissions)
 * 2. Uniqueness validation (no duplicate models)
 *
 * Use this when you need to validate multiple models at once (e.g., during participant persistence).
 *
 * @throws BadRequestError if any model is invalid or duplicated
 * @throws UnauthorizedError if user's tier doesn't allow access to any model
 *
 * @example
 * ```ts
 * // Validate all models before batch persistence
 * await validateParticipantModels(providedParticipants, userTier);
 * ```
 */
export async function validateParticipantModels(
  participants: ParticipantForValidation[],
  userTier: SubscriptionTier,
): Promise<void> {
  // First, check uniqueness (no duplicates)
  validateParticipantUniqueness(participants);

  // Then, validate each enabled model's access permissions
  const enabledParticipants = participants.filter(p => p.isEnabled !== false);

  for (const participant of enabledParticipants) {
    await validateModelAccess(participant.modelId, userTier);
  }
}
