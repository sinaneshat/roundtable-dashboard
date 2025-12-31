/**
 * Memoization Utilities
 *
 * Performance optimization utilities for React hook return objects
 *
 * Location: /src/lib/utils/memo-utils.ts
 */

import type React from 'react';
import { useMemo } from 'react';

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
