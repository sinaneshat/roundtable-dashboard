/**
 * Recommended Action Application Logic
 *
 * Applies recommended actions from moderator analysis to form state.
 * Updates input value, selected participants (models), and roles.
 *
 * Location: /src/stores/chat/actions/recommended-action-application.ts
 * Used by: store.ts applyRecommendedAction (thin wrapper)
 */

import type { ArticleRecommendation } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

/**
 * Options for applying a recommended action
 */
export type ApplyRecommendedActionOptions = {
  /**
   * When true, preserve thread state (stay on thread screen, keep messages)
   * Used when clicking recommendations from thread screen to update chatbox
   * without navigating back to overview.
   * Default: false (resets thread state for new conversation)
   */
  preserveThreadState?: boolean;

  /**
   * Current selected participants - used to preserve existing config when updating
   * If provided, will merge with suggested models/roles
   */
  currentParticipants?: ParticipantConfig[];
};

/**
 * Internal result type for applyRecommendedAction logic
 * Includes `updates` object for store to apply via set()
 */
export type ApplyRecommendedActionInternalResult = {
  success: boolean;
  error?: string;
  updates: {
    inputValue?: string;
    selectedParticipants?: ParticipantConfig[];
  };
};

/**
 * Creates participant configs from suggested models and roles
 * Matches models with roles by index (first model gets first role, etc.)
 */
function createParticipantsFromSuggestions(
  suggestedModels: string[],
  suggestedRoles?: string[],
  currentParticipants?: ParticipantConfig[],
): ParticipantConfig[] {
  // If we have current participants and suggested models match by modelId,
  // preserve the existing config and just update roles
  if (currentParticipants?.length) {
    const currentModelIds = new Set(currentParticipants.map(p => p.modelId));

    // If suggested models are a subset or match current, just update roles
    const allSuggestedInCurrent = suggestedModels.every(m => currentModelIds.has(m));

    if (allSuggestedInCurrent) {
      // Filter to ONLY suggested models, preserving existing config + applying roles
      const suggestedModelSet = new Set(suggestedModels);
      return currentParticipants
        .filter(p => suggestedModelSet.has(p.modelId))
        .map((participant, index) => ({
          ...participant,
          role: suggestedRoles?.[suggestedModels.indexOf(participant.modelId)] ?? participant.role,
          priority: index,
        }));
    }

    // If suggested has models not in current, create new participant list
    if (!allSuggestedInCurrent) {
      return suggestedModels.map((modelId, index) => {
        // Try to find existing participant with this model
        const existing = currentParticipants.find(p => p.modelId === modelId);
        if (existing) {
          return {
            ...existing,
            role: suggestedRoles?.[index] ?? existing.role,
            priority: index,
          };
        }
        // Create new participant
        return {
          id: crypto.randomUUID(),
          modelId,
          role: suggestedRoles?.[index] ?? null,
          priority: index,
        };
      });
    }
  }

  // No current participants or no overlap - create fresh
  return suggestedModels.map((modelId, index) => ({
    id: crypto.randomUUID(),
    modelId,
    role: suggestedRoles?.[index] ?? null,
    priority: index,
  }));
}

/**
 * Applies a recommended action from moderator analysis to form state
 *
 * Updates:
 * - inputValue: from suggestedPrompt (fallback to title)
 * - selectedParticipants: from suggestedModels + suggestedRoles
 *
 * @param action - Recommended action from moderator analysis (ArticleRecommendation)
 * @param options - Options including currentParticipants for merging
 * @returns Result with success status and updates object
 */
export function applyRecommendedAction(
  action: ArticleRecommendation,
  options: ApplyRecommendedActionOptions = {},
): ApplyRecommendedActionInternalResult {
  const updates: ApplyRecommendedActionInternalResult['updates'] = {};

  // Use suggestedPrompt if available, otherwise fall back to title
  updates.inputValue = action.suggestedPrompt || action.title;

  // Apply suggested models and roles if provided
  if (action.suggestedModels?.length) {
    updates.selectedParticipants = createParticipantsFromSuggestions(
      action.suggestedModels,
      action.suggestedRoles,
      options.currentParticipants,
    );
  } else if (action.suggestedRoles?.length && options.currentParticipants?.length) {
    // Only roles suggested (no models) - apply roles to current participants
    updates.selectedParticipants = options.currentParticipants.map((participant, index) => ({
      ...participant,
      role: action.suggestedRoles?.[index] ?? participant.role,
    }));
  }

  return {
    success: true,
    updates,
  };
}
