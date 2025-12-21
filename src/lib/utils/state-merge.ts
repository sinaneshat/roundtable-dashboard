/**
 * State Merge Utilities - Server/Client State Synchronization
 *
 * Generic utilities for merging server and client state by priority.
 * Used by orchestrators to sync server data with optimistic client updates.
 *
 * ✅ PATTERN: DRY - Single implementation for all orchestrators
 * ✅ TYPE-SAFE: Generic constraints ensure proper usage
 * ✅ PERFORMANCE: Shallow comparison (no JSON.stringify)
 *
 * Location: /src/lib/utils/state-merge.ts
 * Used by: moderator-orchestrator.ts, pre-search-orchestrator.ts
 */

/**
 * Merge server and client state by priority
 *
 * Groups items by key (e.g., roundNumber), compares server vs client priority,
 * and returns merged array with highest priority items.
 *
 * @template T - Item type with key property
 * @template K - Key type (string or number)
 * @param serverItems - Authoritative items from server
 * @param clientItems - Optimistic items from client
 * @param getKey - Extract key from item (e.g., item.roundNumber)
 * @param getPriority - Calculate priority for item (higher wins)
 * @returns Merged items and change detection flag
 *
 * @example
 * const { mergedItems, hasChanges } = mergeServerClientState(
 *   serverModerators,
 *   clientModerators,
 *   (item) => item.roundNumber,
 *   (item) => getStatusPriority(item.status)
 * );
 */
export function mergeServerClientState<T, K extends string | number>(
  serverItems: T[],
  clientItems: T[],
  getKey: (item: T) => K,
  getPriority: (item: T) => number,
): {
  mergedItems: T[];
  hasChanges: boolean;
} {
  // Build map of ALL client items first (including for keys that exist on server)
  // This ensures we can compare client vs server for SAME key
  const clientByKey = new Map<K, T>();
  clientItems.forEach((item) => {
    clientByKey.set(getKey(item), item);
  });

  // Merge server items with client items, preferring higher status priority
  // For same key: Compare priority and prefer higher one
  const byKey = new Map<K, T>();

  // First, add all server items (these are authoritative if they have higher/equal priority)
  serverItems.forEach((serverItem) => {
    const key = getKey(serverItem);
    const clientItem = clientByKey.get(key);

    if (!clientItem) {
      // No client item for this key - use server item
      byKey.set(key, serverItem);
      return;
    }

    // Both exist - compare priorities
    const serverPriority = getPriority(serverItem);
    const clientPriority = getPriority(clientItem);

    // Always prefer higher priority, regardless of source
    if (clientPriority > serverPriority) {
      byKey.set(key, clientItem);
    } else if (serverPriority > clientPriority) {
      byKey.set(key, serverItem);
    } else {
      // Same priority - prefer server item (has authoritative data from DB)
      byKey.set(key, serverItem);
    }
  });

  // Then, add client-only items (keys not on server yet)
  clientItems.forEach((clientItem) => {
    const key = getKey(clientItem);
    if (!byKey.has(key)) {
      byKey.set(key, clientItem);
    }
  });

  const mergedItems = Array.from(byKey.values()).sort(
    (a, b) => {
      const keyA = getKey(a);
      const keyB = getKey(b);
      // Sort by key (assuming numeric keys like roundNumber)
      return typeof keyA === 'number' && typeof keyB === 'number'
        ? keyA - keyB
        : String(keyA).localeCompare(String(keyB));
    },
  );

  return {
    mergedItems,
    hasChanges: true, // Always return true - caller will do shallow comparison
  };
}

/**
 * Shallow comparison for state change detection
 *
 * Compares two arrays by length and key properties to detect meaningful changes.
 * Much faster and more reliable than JSON.stringify.
 *
 * @template T - Item type
 * @param prev - Previous state array
 * @param next - Next state array
 * @param compareKeys - Properties to compare for each item
 * @returns True if arrays differ meaningfully
 *
 * @example
 * const changed = hasStateChanged(
 *   prevModerators,
 *   nextModerators,
 *   ['roundNumber', 'status', 'id', 'moderatorData']
 * );
 */
export function hasStateChanged<T>(
  prev: T[],
  next: T[],
  compareKeys: (keyof T)[],
): boolean {
  // Fast path: Length check
  if (prev.length !== next.length) {
    return true;
  }

  // Compare each item by specified keys
  return next.some((nextItem, index) => {
    const prevItem = prev[index];
    if (!prevItem) {
      return true; // New item added
    }

    // Compare key properties that indicate meaningful changes
    return compareKeys.some((key) => {
      const prevValue = prevItem[key];
      const nextValue = nextItem[key];

      // Handle boolean conversion for nullable fields (e.g., !!moderatorData)
      if (typeof prevValue === 'object' && typeof nextValue === 'object') {
        return Boolean(prevValue) !== Boolean(nextValue);
      }

      return prevValue !== nextValue;
    });
  });
}
