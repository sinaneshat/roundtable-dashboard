'use client';

/**
 * useSyncedRefs Hook - Generic Ref Synchronization
 *
 * React 19.2 Pattern: Synchronize any values into refs with useLayoutEffect
 *
 * Prevents stale closures in async callbacks by keeping refs in sync with reactive values.
 * Uses useLayoutEffect for synchronous updates before browser paint, ensuring refs are
 * current when callbacks execute.
 *
 * Pattern Benefits:
 * - Reduces boilerplate when multiple callbacks/values need ref synchronization
 * - Prevents stale closures in async callbacks by maintaining up-to-date refs
 * - Single useRef with object avoids hooks in loops or conditionals
 * - One useLayoutEffect syncs all values efficiently
 *
 * Used by:
 * - useMultiParticipantChat: Sync callbacks and state values to prevent stale closures
 * - ChatOverviewScreen: Sync messages, participants for onComplete callback
 * - ChatThreadScreen: Sync messages, participants, createPendingSummary
 *
 * @module hooks/utils/use-synced-refs
 */

import { useLayoutEffect, useMemo } from 'react';

/**
 * Ref values type - constrained to valid ref value types
 * ✅ TYPE-SAFE: Uses object index signature without `unknown`
 * Excludes null/undefined from base constraint while allowing them as specific values
 * Callback type properly constrained with specific parameter types
 */
type RefValues = { [key: string]: NonNullable<object> | string | number | boolean | null | undefined | ((...args: never[]) => unknown) };

/**
 * Generic hook to sync any values into refs with useLayoutEffect
 *
 * Creates a stable object of refs that are synchronized with provided values using
 * useLayoutEffect. This prevents stale closures in callbacks while maintaining a
 * stable ref object identity across renders.
 *
 * React Pattern:
 * - useMemo creates stable refs object on first render (empty deps)
 * - useLayoutEffect syncs all refs before browser paint
 * - Callbacks can read current values via refs without closure issues
 *
 * Performance:
 * - O(1) ref object creation (only once)
 * - O(n) sync operation where n = number of values
 * - No re-renders: refs are not state, reading them doesn't trigger updates
 *
 * @template T - Object type with string keys and typed values
 * @param values - Object of values to sync into refs
 * @returns Object of refs with same keys, each synced to corresponding value
 *
 * @example
 * ```typescript
 * const refs = useSyncedRefs({
 *   onComplete,
 *   onRetry,
 *   onError,
 *   messages,
 *   participants
 * });
 *
 * // Use in callbacks: refs.onComplete.current, refs.messages.current, etc.
 * // Refs are updated synchronously before browser paint
 * ```
 */
export function useSyncedRefs<T extends RefValues>(
  values: T,
): { [K in keyof T]: React.RefObject<T[K]> } {
  // Create stable refs object - only initialize once
  const refs = useMemo(() => {
    const result: { [K in keyof T]?: React.RefObject<T[K]> } = {};
    for (const key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key)) {
        // ✅ TYPE-SAFE: No force casting - typed properly via mapped type
        const typedKey = key as keyof T;
        result[typedKey] = { current: values[typedKey] };
      }
    }
    // Type assertion is safe here - we've initialized all keys from values
    return result as { [K in keyof T]: React.RefObject<T[K]> };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only create once

  // Sync all refs with current values using one useLayoutEffect
  useLayoutEffect(() => {
    for (const key in values) {
      if (Object.prototype.hasOwnProperty.call(values, key) && Object.prototype.hasOwnProperty.call(refs, key)) {
        refs[key as keyof T].current = values[key];
      }
    }
  }, [values, refs]);

  return refs;
}
