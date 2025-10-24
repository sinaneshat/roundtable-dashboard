/**
 * Participant Manipulation Utilities
 *
 * Pure utility functions for participant array manipulation.
 * Follows the established pattern of feature-specific utilities
 * (similar to message-transforms.ts, round-utils.ts).
 */

/**
 * CANONICAL PARTICIPANT DEDUPLICATION
 *
 * Deduplicates participants by modelId (semantic uniqueness).
 * When duplicates are found, the participant with lower priority wins
 * (appears earlier in the sorted list).
 *
 * @param participants - Array of participants to deduplicate
 * @returns Deduplicated and sorted array of participants
 */
export function deduplicateParticipants<T extends { modelId: string; priority: number }>(
  participants: T[],
): T[] {
  const modelMap = new Map<string, T>();

  // Sort by priority to ensure deterministic selection
  const sorted = [...participants].sort((a, b) => a.priority - b.priority);

  sorted.forEach((p) => {
    // Only add if modelId not seen before (first occurrence wins due to sorting)
    if (!modelMap.has(p.modelId)) {
      modelMap.set(p.modelId, p);
    }
  });

  // Return deduplicated participants sorted by priority
  return Array.from(modelMap.values()).sort((a, b) => a.priority - b.priority);
}

/**
 * Development-only assertion for data integrity.
 * Throws an error if duplicate participants are detected.
 *
 * @param participants - Array to check for duplicates
 * @param context - String describing where the check is happening
 */
export function assertNoDuplicateParticipants<T extends { modelId: string }>(
  participants: T[],
  context: string,
): void {
  if (process.env.NODE_ENV !== 'development')
    return;

  const modelIds = participants.map(p => p.modelId);
  const uniqueModelIds = new Set(modelIds);

  if (modelIds.length !== uniqueModelIds.size) {
    const duplicates = modelIds.filter((id, index) =>
      modelIds.indexOf(id) !== index,
    );

    console.error(`[Participant Deduplication] Duplicate participants detected in ${context}:`, {
      duplicates,
      participants,
    });

    throw new Error(
      `Duplicate participants detected in ${context}: ${duplicates.join(', ')}`,
    );
  }
}

/**
 * Checks if a participant with the given modelId already exists in the array.
 *
 * @param participants - Array to check
 * @param modelId - Model ID to look for
 * @returns True if a participant with this modelId exists
 */
export function hasParticipantByModelId<T extends { modelId: string }>(
  participants: T[],
  modelId: string,
): boolean {
  return participants.some(p => p.modelId === modelId);
}

/**
 * Reindexes participants' priorities to be sequential starting from 0.
 *
 * @param participants - Array of participants to reindex
 * @returns New array with updated priorities
 */
export function reindexParticipantPriorities<T extends { priority: number }>(
  participants: T[],
): T[] {
  return participants.map((p, index) => ({
    ...p,
    priority: index,
  }));
}
