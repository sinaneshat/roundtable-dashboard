/**
 * Recommended Action Application Logic
 *
 * Extracted from store.ts applyRecommendedAction to reduce store file size.
 * Contains business logic for applying moderator-suggested actions to form state.
 *
 * ✅ PATTERN: Extract large functions from store to action modules
 * ✅ MAINTAINS: All validation, tier checks, and error handling
 * ✅ TYPE-SAFE: Full type inference with Zod validation
 *
 * Location: /src/stores/chat/actions/recommended-action-application.ts
 * Used by: store.ts applyRecommendedAction (thin wrapper)
 */

import { ChatModeSchema } from '@/api/core/enums';
import type { Recommendation } from '@/api/routes/chat/schema';
import type { BaseModelResponse } from '@/api/routes/models/schema';
import type { SubscriptionTier } from '@/api/services/product-logic.service';
import { canAccessModelByPricing } from '@/api/services/product-logic.service';
import type { ChatModeId } from '@/lib/config/chat-modes';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

export type ApplyRecommendedActionOptions = {
  maxModels?: number;
  tierName?: string;
  userTier?: SubscriptionTier;
  allModels?: BaseModelResponse[];
  /**
   * When true, preserve thread state (stay on thread screen, keep messages)
   * Used when clicking recommendations from thread screen to update chatbox
   * without navigating back to overview.
   * Default: false (resets thread state for new conversation)
   */
  preserveThreadState?: boolean;
};

export type ApplyRecommendedActionResult = {
  success: boolean;
  error?: string;
  modelsAdded?: number;
  modelsSkipped?: number;
  updates: {
    inputValue?: string;
    selectedMode?: ChatModeId;
    selectedParticipants?: ParticipantConfig[];
  };
};

/**
 * Applies a recommended action from moderator analysis to form state
 *
 * Handles:
 * - Input value update from suggestion
 * - Mode validation and application
 * - Participant model updates with tier restrictions
 * - Model access validation based on subscription tier
 * - Model count limits enforcement
 *
 * @param action - Recommended action from moderator analysis
 * @param options - User tier info and available models
 * @returns Result with success status, updates object, and validation feedback
 */
export function applyRecommendedAction(
  action: Recommendation,
  options: ApplyRecommendedActionOptions = {},
): ApplyRecommendedActionResult {
  const { maxModels, tierName, userTier, allModels } = options;

  // Track results for validation feedback
  let modelsAdded = 0;
  let modelsSkipped = 0;
  let error: string | undefined;

  // Build updates object
  const updates: ApplyRecommendedActionResult['updates'] = {};

  // 1. Set input from suggestion (use suggestedPrompt if available, fallback to title)
  updates.inputValue = action.suggestedPrompt || action.title;

  // 2. Apply mode suggestion if provided (validate with schema)
  if (action.suggestedMode) {
    const modeResult = ChatModeSchema.safeParse(action.suggestedMode);
    if (modeResult.success) {
      updates.selectedMode = modeResult.data;
    }
  }

  // 3. Apply participant suggestions if provided - ONLY reset participants if models are suggested
  if (action.suggestedModels && action.suggestedModels.length > 0) {
    // Reset participants when new models are suggested
    updates.selectedParticipants = [];

    // Filter to only valid model IDs (format: provider/model)
    const validModelIds = action.suggestedModels.filter(modelId => modelId.includes('/'));

    // Filter by tier access if tier and models data provided
    let accessibleModels = validModelIds;
    if (userTier && allModels && allModels.length > 0) {
      accessibleModels = validModelIds.filter((modelId) => {
        const modelData = allModels.find(m => m.id === modelId);
        if (!modelData) {
          // Model not found in available models list, skip it
          return false;
        }
        // Check if user can access this model based on their tier
        return canAccessModelByPricing(userTier, modelData);
      });

      // Track skipped models due to tier restrictions
      const tierRestrictedCount = validModelIds.length - accessibleModels.length;
      if (tierRestrictedCount > 0) {
        modelsSkipped += tierRestrictedCount;
      }
    }

    // Check tier limits if provided
    if (maxModels !== undefined) {
      const availableSlots = maxModels; // All slots available when replacing participants

      if (availableSlots === 0) {
        error = `Your ${tierName || 'current'} plan allows up to ${maxModels} models per conversation. Remove a model to add another, or upgrade your plan.`;
        modelsSkipped = accessibleModels.length;
      } else if (accessibleModels.length > availableSlots) {
        // Partial add: only add models that fit
        const modelsToAdd = accessibleModels.slice(0, availableSlots);
        modelsSkipped += accessibleModels.length - availableSlots;

        const newParticipants = modelsToAdd.map((modelId, index) => {
          const originalIndex = action.suggestedModels!.indexOf(modelId);
          return {
            id: `participant-${Date.now()}-${index}`,
            modelId,
            role: action.suggestedRoles?.[originalIndex] || null,
            customRoleId: undefined,
            priority: index,
          } satisfies ParticipantConfig;
        });

        updates.selectedParticipants = newParticipants;
        modelsAdded = modelsToAdd.length;
        error = `Only ${modelsAdded} of ${accessibleModels.length} suggested models were added. Your ${tierName || 'current'} plan allows up to ${maxModels} models. Upgrade to add more.`;
      } else {
        // All accessible models fit within limit
        const newParticipants = accessibleModels.map((modelId, index) => {
          const originalIndex = action.suggestedModels!.indexOf(modelId);
          return {
            id: `participant-${Date.now()}-${index}`,
            modelId,
            role: action.suggestedRoles?.[originalIndex] || null,
            customRoleId: undefined,
            priority: index,
          } satisfies ParticipantConfig;
        });

        updates.selectedParticipants = newParticipants;
        modelsAdded = accessibleModels.length;
      }
    } else {
      // No tier limit provided, add all accessible models
      if (accessibleModels.length > 0) {
        const newParticipants = accessibleModels.map((modelId, index) => {
          const originalIndex = action.suggestedModels!.indexOf(modelId);
          return {
            id: `participant-${Date.now()}-${index}`,
            modelId,
            role: action.suggestedRoles?.[originalIndex] || null,
            customRoleId: undefined,
            priority: index,
          } satisfies ParticipantConfig;
        });

        updates.selectedParticipants = newParticipants;
        modelsAdded = accessibleModels.length;
      }
    }
  }

  // Return result object
  return {
    success: error === undefined || modelsAdded > 0,
    error,
    modelsAdded,
    modelsSkipped,
    updates,
  };
}
