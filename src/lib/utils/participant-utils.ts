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
