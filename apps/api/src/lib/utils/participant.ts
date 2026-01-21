/**
 * Participant Utilities
 *
 * **CONSOLIDATED MODULE**: Single source of truth for all participant operations
 * Merged from participant-comparison.ts, participant-transformers.ts, participant-utils.ts
 *
 * Provides:
 * - Comparison and equality checks
 * - Format transformation
 * - Validation and deduplication
 * - Priority-based sorting (SINGLE SOURCE OF TRUTH)
 *
 * @module lib/utils/participant
 */

import type { ParticipantComparisonMode } from '@roundtable/shared/enums';
import { ParticipantComparisonModes } from '@roundtable/shared/enums';

import type { ChatParticipant } from '@/db/validation/chat';
import type { ParticipantConfig } from '@/lib/schemas/participant-schemas';

// ============================================================================
// Priority Sorting (SINGLE SOURCE OF TRUTH)
// ============================================================================

/**
 * Type for any object with a priority field
 */
export type WithPriority = { priority: number };

/**
 * Sort participants by priority (ascending order)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this function everywhere instead of inline sorting.
 * Eliminates 25+ duplicates of `[...arr].sort((a, b) => a.priority - b.priority)`
 *
 * @param participants - Array of objects with priority field
 * @returns New array sorted by priority (original unchanged)
 *
 * @example
 * ```typescript
 * // Instead of: [...participants].sort((a, b) => a.priority - b.priority)
 * const sorted = sortByPriority(participants);
 * ```
 */
export function sortByPriority<T extends WithPriority>(participants: T[]): T[] {
  return [...participants].sort((a, b) => a.priority - b.priority);
}

/**
 * Reindex participant priorities to be contiguous (0, 1, 2, ...)
 *
 * **SINGLE SOURCE OF TRUTH**: Use this function everywhere instead of inline mapping.
 * Eliminates 15+ duplicates of `.map((p, index) => ({ ...p, priority: index }))`
 *
 * @param participants - Array of participants to reindex
 * @returns New array with priority field updated to match array index
 *
 * @example
 * ```typescript
 * // Instead of: participants.map((p, index) => ({ ...p, priority: index }))
 * const reindexed = reindexParticipantPriorities(participants);
 * ```
 */
export function reindexParticipantPriorities<T extends WithPriority>(participants: T[]): T[] {
  return participants.map((p, index) => ({ ...p, priority: index }));
}

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Comparable participant type (common fields between ChatParticipant and ParticipantConfig)
 */
export type ComparableParticipant = Pick<
  ChatParticipant | ParticipantConfig,
  'modelId' | 'role' | 'priority'
> & {
  customRoleId?: string | null;
  isEnabled?: boolean;
};

/**
 * Update payload for participant changes
 */
export type UpdateParticipantPayload = {
  id: string;
  modelId: string;
  role: string | null;
  customRoleId: string | null | undefined;
  priority: number;
  isEnabled: boolean;
};

// ============================================================================
// Comparison Functions
// ============================================================================

/**
 * Generate comparison key for a participant
 *
 * @param participant - Participant to generate key for
 * @param mode - Comparison mode ('modelIds' | 'strict')
 * @returns Stable comparison key
 */
export function getParticipantKey(
  participant: ComparableParticipant,
  mode: ParticipantComparisonMode = ParticipantComparisonModes.STRICT,
): string {
  if (mode === ParticipantComparisonModes.MODEL_IDS) {
    return participant.modelId;
  }

  return `${participant.modelId}:${participant.priority}:${participant.role || 'null'}:${participant.customRoleId || 'null'}`;
}

/**
 * Generate sorted comparison key for participant array
 *
 * @param participants - Array of participants
 * @param mode - Comparison mode
 * @param filterEnabled - Filter out disabled participants
 * @returns Sorted, delimited comparison key
 */
export function getParticipantsKey(
  participants: ComparableParticipant[],
  mode: ParticipantComparisonMode = ParticipantComparisonModes.STRICT,
  filterEnabled = true,
): string {
  const filtered = filterEnabled
    ? participants.filter(p => p.isEnabled !== false)
    : participants;

  return sortByPriority(filtered)
    .map(p => getParticipantKey(p, mode))
    .join('|');
}

/**
 * Compare two participant arrays for equality
 *
 * @param a - First array
 * @param b - Second array
 * @param mode - Comparison mode
 * @param options - Additional options
 * @param options.filterEnabled - Whether to filter out disabled participants (default: true)
 * @returns True if equal
 */
export function compareParticipants(
  a: ComparableParticipant[],
  b: ComparableParticipant[],
  mode: ParticipantComparisonMode = ParticipantComparisonModes.STRICT,
  options?: { filterEnabled?: boolean },
): boolean {
  const { filterEnabled = true } = options || {};
  const keyA = getParticipantsKey(a, mode, filterEnabled);
  const keyB = getParticipantsKey(b, mode, filterEnabled);
  return keyA === keyB;
}

/**
 * Check if participant configuration changed
 *
 * @param current - Current participants
 * @param updated - Updated participants
 * @param mode - Comparison mode
 * @returns True if changed
 */
export function hasParticipantsChanged(
  current: ComparableParticipant[],
  updated: ComparableParticipant[],
  mode: ParticipantComparisonMode = ParticipantComparisonModes.STRICT,
): boolean {
  return !compareParticipants(current, updated, mode);
}

// ============================================================================
// Enabled Participant Utilities (SINGLE SOURCE OF TRUTH)
// Eliminates 30+ duplicate `.filter(p => p.isEnabled)` patterns
// ============================================================================

/**
 * Type for participants with optional isEnabled field
 */
export type WithEnabled = { isEnabled?: boolean | null };

/**
 * Filter to enabled participants only
 *
 * **SINGLE SOURCE OF TRUTH**: Use instead of `.filter(p => p.isEnabled)`
 * Handles both `isEnabled: true` and `isEnabled !== false` (for API compatibility)
 *
 * @param participants - Array of participants
 * @returns Only enabled participants
 *
 * @example
 * ```typescript
 * // Instead of: participants.filter(p => p.isEnabled)
 * const enabled = getEnabledParticipants(participants);
 * ```
 */
export function getEnabledParticipants<T extends WithEnabled>(
  participants: T[],
): T[] {
  return participants.filter(p => p.isEnabled !== false);
}

/**
 * Filter to enabled participants and sort by priority
 *
 * **SINGLE SOURCE OF TRUTH**: Combines the two most common operations.
 * Eliminates 20+ duplicates of `sortByPriority(participants.filter(p => p.isEnabled))`
 *
 * @param participants - Array of participants with priority and isEnabled
 * @returns Enabled participants sorted by priority
 *
 * @example
 * ```typescript
 * // Instead of: sortByPriority(participants.filter(p => p.isEnabled))
 * const enabledSorted = getEnabledSortedParticipants(participants);
 * ```
 */
export function getEnabledSortedParticipants<T extends WithEnabled & WithPriority>(
  participants: T[],
): T[] {
  return sortByPriority(participants.filter(p => p.isEnabled !== false));
}

/**
 * Extract model IDs from participants as array
 *
 * **SINGLE SOURCE OF TRUTH**: Use instead of `.map(p => p.modelId)`
 * Eliminates 20+ duplicate modelId extractions
 *
 * @param participants - Array of participants
 * @returns Array of model IDs (preserves order)
 *
 * @example
 * ```typescript
 * // Instead of: participants.map(p => p.modelId)
 * const modelIds = getParticipantModelIds(participants);
 * ```
 */
export function getParticipantModelIds<T extends { modelId: string }>(
  participants: T[],
): string[] {
  return participants.map(p => p.modelId);
}

/**
 * Extract model IDs from enabled participants
 *
 * **SINGLE SOURCE OF TRUTH**: Combined filter + map operation
 * Eliminates patterns like `participants.filter(p => p.isEnabled).map(p => p.modelId)`
 *
 * @param participants - Array of participants
 * @returns Array of model IDs from enabled participants only
 *
 * @example
 * ```typescript
 * // Instead of: participants.filter(p => p.isEnabled).map(p => p.modelId)
 * const enabledModelIds = getEnabledParticipantModelIds(participants);
 * ```
 */
export function getEnabledParticipantModelIds<T extends WithEnabled & { modelId: string }>(
  participants: T[],
): string[] {
  return participants
    .filter(p => p.isEnabled !== false)
    .map(p => p.modelId);
}

/**
 * Create a Set of model IDs from enabled participants
 *
 * **SINGLE SOURCE OF TRUTH**: For O(1) membership checks
 * Eliminates: `new Set(participants.filter(p => p.isEnabled).map(p => p.modelId))`
 *
 * @param participants - Array of participants
 * @returns Set of model IDs for fast lookup
 *
 * @example
 * ```typescript
 * // Instead of: new Set(enabledParticipants.map(p => p.modelId))
 * const modelIdSet = getEnabledParticipantModelIdSet(participants);
 * if (modelIdSet.has(someModelId)) { ... }
 * ```
 */
export function getEnabledParticipantModelIdSet<T extends WithEnabled & { modelId: string }>(
  participants: T[],
): Set<string> {
  return new Set(getEnabledParticipantModelIds(participants));
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Transform ParticipantConfig to API update payload
 *
 * @param participant - Participant configuration from form
 * @returns API update payload
 */
export function participantConfigToUpdatePayload(
  participant: ParticipantConfig,
): UpdateParticipantPayload {
  // ✅ FIX: Detect if this is a new participant (id === modelId) vs existing (id is ULID)
  // - New participants use modelId as their ID (e.g., 'openai/gpt-4')
  // - Existing participants have database-assigned IDs (ULIDs)
  // - Backend uses empty string to trigger "find by modelId" logic for new participants
  const isNewParticipant = participant.id === participant.modelId;
  return {
    id: isNewParticipant ? '' : participant.id,
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
 * @param participant - Participant configuration
 * @param threadId - Thread ID
 * @param index - Priority index
 * @returns Complete ChatParticipant for optimistic update
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
 * Convert ChatParticipant array to ParticipantConfig array
 *
 * Used to sync selectedParticipants (form state) from participants (DB state)
 * after thread creation or update.
 *
 * @param participants - Database participants to convert
 * @returns ParticipantConfig array for form state
 *
 * @example
 * ```typescript
 * const participantConfigs = chatParticipantsToConfig(dbParticipants);
 * actions.setSelectedParticipants(participantConfigs);
 * ```
 */
export function chatParticipantsToConfig(
  participants: ChatParticipant[],
): ParticipantConfig[] {
  return getEnabledSortedParticipants(participants)
    .map((p, index) => ({
      id: p.id,
      modelId: p.modelId,
      role: p.role,
      customRoleId: p.customRoleId || undefined,
      priority: index,
    }));
}

// ============================================================================
// Validation Functions
// ============================================================================

/**
 * Check if participant already exists in list
 *
 * @param participants - Existing participants
 * @param modelId - Model ID to check
 * @returns True if duplicate
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
 * @param participants - Existing participants
 * @returns Next priority number
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

/**
 * Deduplicate participants by modelId
 *
 * When duplicates found, keeps participant with lower priority.
 *
 * @param participants - Array to deduplicate
 * @returns Deduplicated and sorted array
 */
export function deduplicateParticipants<T extends { modelId: string; priority: number }>(
  participants: T[],
): T[] {
  const modelMap = new Map<string, T>();

  // Sort by priority for deterministic selection
  sortByPriority(participants).forEach((p) => {
    if (!modelMap.has(p.modelId)) {
      modelMap.set(p.modelId, p);
    }
  });

  return sortByPriority(Array.from(modelMap.values()));
}

// ============================================================================
// Update Detection & Preparation
// ============================================================================
// Extracted from participant-updates.ts for consolidation

/**
 * Result of participant change detection
 */
export type ParticipantUpdateResult = {
  /** Whether any changes were detected */
  hasChanges: boolean;
  /** Whether any participants have temporary IDs (not yet persisted) */
  hasTemporaryIds: boolean;
  /** Whether participant list or configuration changed */
  participantsChanged: boolean;
};

/**
 * Prepared data for participant update
 */
export type PreparedParticipantUpdate = {
  /** Update result with change flags */
  updateResult: ParticipantUpdateResult;
  /** Payloads for API PATCH request */
  updatePayloads: UpdateParticipantPayload[];
  /** Optimistic participant data for immediate UI update */
  optimisticParticipants: ChatParticipant[];
};

/**
 * Detect if participant configuration has changed
 *
 * Compares current participants with selected participants to determine
 * if an API update is needed. Checks for:
 * - Temporary IDs (new participants not yet persisted)
 * - Participant list changes (additions/removals)
 * - Configuration changes (priority, role, modelId)
 *
 * @param currentParticipants - Current persisted participants
 * @param selectedParticipants - New participant configuration from form
 * @returns Change detection result
 *
 * @example
 * const result = detectParticipantChanges(
 *   thread.participants,
 *   formState.selectedParticipants
 * )
 *
 * if (result.hasChanges) {
 *   // Trigger update
 * }
 */
export function detectParticipantChanges(
  currentParticipants: ChatParticipant[],
  selectedParticipants: ParticipantConfig[],
): ParticipantUpdateResult {
  // ✅ FIX: Detect new participants by checking if id === modelId (not persisted yet)
  // New participants use modelId as their ID, existing use database-assigned ULIDs
  const hasTemporaryIds = selectedParticipants.some(p =>
    p.id === p.modelId,
  );

  // Compare participant configurations using strict mode
  // Strict mode compares: modelId, priority, role, customRoleId
  const participantsChanged = hasParticipantsChanged(
    currentParticipants,
    selectedParticipants,
    ParticipantComparisonModes.STRICT,
  );

  const hasChanges = hasTemporaryIds || participantsChanged;

  return {
    hasChanges,
    hasTemporaryIds,
    participantsChanged,
  };
}

/**
 * Determine if participant config update should be triggered
 *
 * @param updateResult - Result from detectParticipantChanges
 * @returns True if update should be executed
 */
export function shouldUpdateParticipantConfig(
  updateResult: ParticipantUpdateResult,
): boolean {
  return updateResult.hasChanges;
}

/**
 * Prepare all data needed for participant update
 *
 * Generates:
 * - Change detection flags
 * - API update payloads (temporary IDs converted to empty strings)
 * - Optimistic participant data for immediate UI update
 *
 * @param currentParticipants - Current persisted participants
 * @param selectedParticipants - New participant configuration
 * @param threadId - Thread ID for optimistic participants
 * @returns Prepared update data ready for mutation
 *
 * @example
 * const prepared = prepareParticipantUpdate(
 *   threadState.participants,
 *   formState.selectedParticipants,
 *   threadId
 * )
 *
 * if (shouldUpdateParticipantConfig(prepared.updateResult)) {
 *   await updateThreadMutation.mutateAsync({
 *     json: { participants: prepared.updatePayloads }
 *   })
 *   store.updateParticipants(prepared.optimisticParticipants)
 * }
 */
export function prepareParticipantUpdate(
  currentParticipants: ChatParticipant[],
  selectedParticipants: ParticipantConfig[],
  threadId: string,
): PreparedParticipantUpdate {
  // Detect changes
  const updateResult = detectParticipantChanges(
    currentParticipants,
    selectedParticipants,
  );

  // Prepare update payloads for API
  const updatePayloads = selectedParticipants.map(p =>
    participantConfigToUpdatePayload(p),
  );

  // Prepare optimistic participant data
  const optimisticParticipants = selectedParticipants.map((p, index) =>
    participantConfigToOptimistic(p, threadId, index),
  );

  return {
    updateResult,
    updatePayloads,
    optimisticParticipants,
  };
}
