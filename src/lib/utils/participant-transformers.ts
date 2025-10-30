/**
 * Participant Transformation Utilities
 *
 * **SINGLE SOURCE OF TRUTH**: Consolidates participant transformation patterns
 * used across form actions, thread actions, and overview actions.
 *
 * Prevents duplication of:
 * - Update payload transformation (form-actions.ts:193-200)
 * - Optimistic update transformation (form-actions.ts:202-212)
 * - Participant key generation (form-actions.ts:177-186, thread-actions.ts:124-128)
 *
 * Following backend-patterns.md: Type-safe transformations, single responsibility.
 *
 * @module lib/utils/participant-transformers
 */

import type { ChatParticipant } from '@/api/routes/chat/schema';
import type { ParticipantConfig } from '@/components/chat/chat-form-schemas';

/**
 * Update payload for participant changes
 *
 * Matches backend API expectations for participant updates.
 */
export type UpdateParticipantPayload = {
  id: string;
  modelId: string;
  role: string | null;
  customRoleId: string | null | undefined;
  priority: number;
  isEnabled: boolean;
};

/**
 * Transform ParticipantConfig to update payload
 *
 * **SINGLE SOURCE OF TRUTH**: Replaces pattern in form-actions.ts:193-200
 *
 * Handles temporary ID cleanup:
 * - IDs starting with 'participant-' are treated as new (set to empty string)
 * - Existing IDs are preserved
 *
 * @param participant - Participant configuration from form
 * @returns Payload for API update request
 *
 * @example
 * ```typescript
 * const payload = formState.selectedParticipants.map(
 *   participantConfigToUpdatePayload
 * );
 * await updateThread({ participants: payload });
 * ```
 */
export function participantConfigToUpdatePayload(
  participant: ParticipantConfig,
): UpdateParticipantPayload {
  return {
    id: participant.id.startsWith('participant-') ? '' : participant.id,
    modelId: participant.modelId,
    role: participant.role || null,
    customRoleId: participant.customRoleId || null,
    priority: participant.priority,
    isEnabled: true,
  };
}

/**
 * Transform ParticipantConfig to optimistic ChatParticipant
 *
 * **SINGLE SOURCE OF TRUTH**: Replaces pattern in form-actions.ts:202-212
 *
 * Used for optimistic UI updates before server confirmation.
 * Sets timestamps to current time for realistic rendering.
 *
 * @param participant - Participant configuration from form
 * @param threadId - Thread ID for the participant
 * @param index - Index/priority for the participant
 * @returns Complete ChatParticipant object for cache
 *
 * @example
 * ```typescript
 * const optimisticParticipants = formState.selectedParticipants.map((p, i) =>
 *   participantConfigToOptimistic(p, threadId, i)
 * );
 * // Update React Query cache optimistically
 * queryClient.setQueryData(['thread', threadId], (old) => ({
 *   ...old,
 *   participants: optimisticParticipants,
 * }));
 * ```
 */
export function participantConfigToOptimistic(
  participant: ParticipantConfig,
  threadId: string,
  index: number,
): ChatParticipant {
  const now = new Date();

  return {
    id: participant.id,
    threadId,
    modelId: participant.modelId,
    role: participant.role || null,
    customRoleId: participant.customRoleId || null,
    priority: index,
    isEnabled: true,
    settings: participant.settings || null,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Generate participant comparison key
 *
 * **SINGLE SOURCE OF TRUTH**: Consolidates key generation from:
 * - form-actions.ts:177-186 (change detection)
 * - thread-actions.ts:124-128 (sync comparison)
 *
 * Generates stable key for participant comparison based on enabled participants.
 * Keys include modelId, priority, and optionally role/customRoleId.
 *
 * @param participants - Participants to generate key from
 * @param includeRoles - Whether to include role/customRoleId in key (default: true)
 * @returns Stable comparison key string
 *
 * @example
 * ```typescript
 * // Detect participant changes
 * const currentKey = generateParticipantKey(threadState.participants);
 * const formKey = generateParticipantKey(
 *   formState.selectedParticipants.map(p => ({ ...p, isEnabled: true }))
 * );
 * const hasChanges = currentKey !== formKey;
 *
 * // Sync comparison (without roles)
 * const contextKey = generateParticipantKey(contextParticipants, false);
 * const storeKey = generateParticipantKey(storeParticipants, false);
 * ```
 */
export function generateParticipantKey(
  participants: Array<Pick<ChatParticipant, 'isEnabled' | 'priority' | 'modelId' | 'role' | 'customRoleId' | 'id'>>,
  includeRoles = true,
): string {
  return participants
    .filter(p => p.isEnabled)
    .sort((a, b) => a.priority - b.priority)
    .map((p) => {
      if (includeRoles) {
        return `${p.modelId}:${p.priority}:${p.role || 'null'}:${p.customRoleId || 'null'}`;
      }
      return `${p.id}:${p.modelId}:${p.priority}`;
    })
    .join('|');
}

/**
 * Validate participant model ID format
 *
 * **SINGLE SOURCE OF TRUTH**: Consolidates validation from:
 * - store.ts:353-361
 * - use-selected-participants.ts
 *
 * Valid format: `provider/model` (e.g., "openai/gpt-4")
 *
 * @param modelId - Model ID to validate
 * @returns True if format is valid
 *
 * @example
 * ```typescript
 * if (!validateParticipantModelId(modelId)) {
 *   throw new Error('Invalid model ID format. Expected: provider/model');
 * }
 * ```
 */
export function validateParticipantModelId(modelId: string): boolean {
  if (!modelId || typeof modelId !== 'string') {
    return false;
  }

  // Valid format: provider/model
  const parts = modelId.split('/');
  return parts.length === 2 && parts[0] !== undefined && parts[0].length > 0 && parts[1] !== undefined && parts[1].length > 0;
}

/**
 * Check if participant already exists in list
 *
 * **SINGLE SOURCE OF TRUTH**: Consolidates duplicate check from:
 * - store.ts:353-361
 * - use-selected-participants.ts:108
 *
 * Checks by modelId only (not by ID, as IDs can be temporary).
 *
 * @param participants - Existing participants
 * @param modelId - Model ID to check
 * @returns True if participant with modelId already exists
 *
 * @example
 * ```typescript
 * if (isParticipantDuplicate(state.selectedParticipants, newModelId)) {
 *   toast.error('This model is already added');
 *   return;
 * }
 * ```
 */
export function isParticipantDuplicate(
  participants: Array<Pick<ChatParticipant | ParticipantConfig, 'modelId'>>,
  modelId: string,
): boolean {
  return participants.some(p => p.modelId === modelId);
}

/**
 * Get next priority for new participant
 *
 * Calculates the next priority value based on existing participants.
 * Used when adding new participants to ensure proper ordering.
 *
 * @param participants - Existing participants
 * @returns Next available priority number
 *
 * @example
 * ```typescript
 * const newParticipant = {
 *   ...config,
 *   priority: getNextParticipantPriority(state.selectedParticipants),
 * };
 * ```
 */
export function getNextParticipantPriority(
  participants: Array<Pick<ChatParticipant | ParticipantConfig, 'priority'>>,
): number {
  if (participants.length === 0) {
    return 0;
  }

  const maxPriority = Math.max(...participants.map(p => p.priority));
  return maxPriority + 1;
}
