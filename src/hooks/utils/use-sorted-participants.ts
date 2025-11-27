/**
 * useSortedParticipants Hook
 *
 * **SINGLE SOURCE OF TRUTH** for memoized priority-sorted participants.
 * Eliminates 25+ duplicates of:
 * `useMemo(() => [...participants].sort((a, b) => a.priority - b.priority), [participants])`
 *
 * @module hooks/utils/use-sorted-participants
 */

'use client';

import { useMemo } from 'react';

import type { WithPriority } from '@/lib/utils/participant';
import { sortByPriority } from '@/lib/utils/participant';

/**
 * Returns participants sorted by priority (ascending)
 *
 * @param participants - Array of objects with priority field
 * @returns Memoized sorted array (stable reference if participants unchanged)
 *
 * @example
 * ```typescript
 * // Instead of:
 * // const sortedParticipants = useMemo(
 * //   () => [...contextParticipants].sort((a, b) => a.priority - b.priority),
 * //   [contextParticipants]
 * // );
 *
 * const sortedParticipants = useSortedParticipants(contextParticipants);
 * ```
 */
export function useSortedParticipants<T extends WithPriority>(
  participants: T[],
): T[] {
  return useMemo(() => sortByPriority(participants), [participants]);
}
