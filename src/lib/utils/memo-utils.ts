/**
 * Memoization Utilities
 *
 * Performance optimization utilities for expensive computations
 * Caches function results to avoid redundant calculations
 *
 * Use when:
 * - Function has expensive computation (>5ms)
 * - Function called repeatedly with same inputs
 * - Result is deterministic (same input = same output)
 *
 * Location: /src/lib/utils/memo-utils.ts
 */

import type React from 'react';
import { useMemo } from 'react';

// ============================================================================
// MEMOIZATION HELPERS
// ============================================================================

/**
 * Simple memoization for functions with single primitive argument
 *
 * **Performance**: O(1) cache lookup vs recomputing
 * **Memory**: Unbounded cache (use with caution for large datasets)
 *
 * @param fn - Function to memoize
 * @returns Memoized version of function
 *
 * @example
 * ```typescript
 * const expensiveCalc = (n: number) => {
 *   // Heavy computation
 *   return result;
 * };
 *
 * const memoized = memoize(expensiveCalc);
 * memoized(5); // Computes
 * memoized(5); // Returns cached result
 * ```
 */
export function memoize<TArg extends string | number, TResult>(
  fn: (arg: TArg) => TResult,
): (arg: TArg) => TResult {
  const cache = new Map<TArg, TResult>();

  return (arg: TArg): TResult => {
    if (cache.has(arg)) {
      return cache.get(arg)!;
    }

    const result = fn(arg);
    cache.set(arg, result);
    return result;
  };
}

/**
 * Memoization with custom key function for complex arguments
 *
 * **Use**: When argument is object/array that needs custom equality
 *
 * @param fn - Function to memoize
 * @param keyFn - Function to generate cache key from arguments
 * @returns Memoized version of function
 *
 * @example
 * ```typescript
 * const compareParticipants = (a: Participant[], b: Participant[]) => {
 *   // Heavy comparison logic
 * };
 *
 * const memoized = memoizeWithKey(
 *   compareParticipants,
 *   (a, b) => `${a.map(p => p.id).join(',')}-${b.map(p => p.id).join(',')}`
 * );
 * ```
 */
export function memoizeWithKey<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  keyFn: (...args: TArgs) => string,
): (...args: TArgs) => TResult {
  const cache = new Map<string, TResult>();

  return (...args: TArgs): TResult => {
    const key = keyFn(...args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Memoization with LRU (Least Recently Used) eviction policy
 *
 * **Use**: When cache might grow large and needs bounds
 * **Performance**: O(1) get/set with automatic size limit
 *
 * @param fn - Function to memoize
 * @param maxSize - Maximum cache size (default: 100)
 * @returns Memoized version with LRU eviction
 *
 * @example
 * ```typescript
 * const processMessage = (id: string) => {
 *   // Expensive processing
 * };
 *
 * // Keep only 50 most recent results
 * const memoized = memoizeLRU(processMessage, 50);
 * ```
 */
export function memoizeLRU<TArg extends string | number, TResult>(
  fn: (arg: TArg) => TResult,
  maxSize: number = 100,
): (arg: TArg) => TResult {
  const cache = new Map<TArg, TResult>();

  return (arg: TArg): TResult => {
    if (cache.has(arg)) {
      // Move to end (most recently used)
      const value = cache.get(arg)!;
      cache.delete(arg);
      cache.set(arg, value);
      return value;
    }

    const result = fn(arg);

    // Evict oldest entry if cache full
    if (cache.size >= maxSize) {
      const firstEntry = cache.keys().next();
      if (!firstEntry.done) {
        cache.delete(firstEntry.value);
      }
    }

    cache.set(arg, result);
    return result;
  };
}

// ============================================================================
// SPECIALIZED MEMOIZATION FOR CHAT OPERATIONS
// ============================================================================

/**
 * Memoize participant comparison operations
 *
 * **Use Case**: Detecting participant changes in form submissions
 * **Performance**: Avoids expensive array comparisons
 *
 * @example
 * ```typescript
 * import { hasParticipantsChanged } from '@/lib/utils';
 *
 * const memoizedComparison = memoizeParticipantComparison(hasParticipantsChanged);
 *
 * // Fast comparison with cache
 * const changed = memoizedComparison(currentParticipants, selectedParticipants);
 * ```
 */
export function memoizeParticipantComparison<
  TArgs extends unknown[],
  TFn extends (...args: TArgs) => boolean,
>(
  fn: TFn,
): (...args: TArgs) => boolean {
  return memoizeWithKey(
    fn,
    (...args: TArgs) => {
      // Generate stable key from participant arrays
      return args
        .map((arg) => {
          if (Array.isArray(arg)) {
            return arg
              .map((item: unknown) => {
                // Type-safe: Narrow type with proper type guard
                if (
                  typeof item === 'object'
                  && item !== null
                  && 'id' in item
                  && 'modelId' in item
                  && typeof item.id === 'string'
                  && typeof item.modelId === 'string'
                ) {
                  return `${item.id}:${item.modelId}`;
                }
                return JSON.stringify(item);
              })
              .join(',');
          }
          return String(arg);
        })
        .join('|');
    },
  );
}

/**
 * Memoize round number calculations
 *
 * **Use Case**: Frequently accessed round numbers in timeline/moderator
 * **Performance**: Avoids re-computing from message metadata
 *
 * @example
 * ```typescript
 * const getRound = memoizeRoundCalculation((messages) => getCurrentRoundNumber(messages));
 *
 * // Cached based on message array reference
 * const round = getRound(messages);
 * ```
 */
export function memoizeRoundCalculation<TMessage, TResult>(
  fn: (messages: readonly TMessage[]) => TResult,
): (messages: readonly TMessage[]) => TResult {
  // WeakMap key must be object type - arrays are objects at runtime
  const cache = new WeakMap<readonly TMessage[], TResult>();

  return (messages: readonly TMessage[]): TResult => {
    if (cache.has(messages)) {
      return cache.get(messages)!;
    }

    const result = fn(messages);
    cache.set(messages, result);
    return result;
  };
}

/**
 * Memoize moderator state calculations
 *
 * **Use Case**: Checking moderator completion status
 * **Performance**: Avoids re-iterating moderator arrays
 *
 * @example
 * ```typescript
 * const checkComplete = memoizeModeratorCheck((moderators) => {
 *   return moderators.every(s => s.status === 'complete');
 * });
 * ```
 */
export function memoizeModeratorCheck<TModerator, TResult>(
  fn: (moderators: readonly TModerator[]) => TResult,
): (moderators: readonly TModerator[]) => TResult {
  // WeakMap key must be object type - arrays are objects at runtime
  const cache = new WeakMap<readonly TModerator[], TResult>();

  return (moderators: readonly TModerator[]): TResult => {
    if (cache.has(moderators)) {
      return cache.get(moderators)!;
    }

    const result = fn(moderators);
    cache.set(moderators, result);
    return result;
  };
}

// ============================================================================
// REACT HOOK RETURN MEMOIZATION
// ============================================================================

/**
 * Memoize custom hook return object
 *
 * **Use Case**: Prevent unnecessary re-renders by memoizing hook return objects
 * **Pattern**: Common pattern in Zustand action hooks where callbacks are memoized
 *             but the object literal itself creates new references
 *
 * @param returnObject - Object to memoize (typically containing memoized callbacks)
 * @param deps - Dependency array (should include all callback dependencies)
 * @returns Memoized version of the return object
 *
 * @example
 * ```typescript
 * export function useChatFormActions() {
 *   const handleCreate = useCallback(() => { ... }, [deps]);
 *   const handleUpdate = useCallback(() => { ... }, [deps]);
 *
 *   // Before: Creates new object reference on every render
 *   return useMemo(() => ({
 *     handleCreate,
 *     handleUpdate,
 *   }), [handleCreate, handleUpdate]);
 *
 *   // After: More concise with same behavior
 *   return useMemoizedReturn({
 *     handleCreate,
 *     handleUpdate,
 *   }, [handleCreate, handleUpdate]);
 * }
 * ```
 */
export function useMemoizedReturn<T extends object>(
  returnObject: T,
  deps: React.DependencyList,
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => returnObject, deps);
}

// ============================================================================
// CACHE INVALIDATION HELPERS
// ============================================================================
