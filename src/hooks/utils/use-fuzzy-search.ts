import type { IFuseOptions } from 'fuse.js';
import Fuse from 'fuse.js';
import { useMemo } from 'react';

/**
 * Reusable fuzzy search hook using Fuse.js
 *
 * @template T - Type of items to search through
 * @param items - Array of items to search
 * @param searchQuery - Search query string
 * @param options - Fuse.js configuration options
 * @returns Filtered array of items based on fuzzy search
 *
 * @example
 * ```tsx
 * const filtered = useFuzzySearch(
 *   models,
 *   searchQuery,
 *   {
 *     keys: ['name', 'description'],
 *     threshold: 0.3, // 0.0 = perfect match, 1.0 = match anything
 *   }
 * );
 * ```
 */
export function useFuzzySearch<T>(
  items: T[],
  searchQuery: string,
  options: IFuseOptions<T>,
): T[] {
  // Create Fuse instance with items and options
  // Note: options object may change reference but that's acceptable for this use case
  // Callers should useMemo their options if they want to prevent recreation
  const fuse = useMemo(() => new Fuse(items, {
    // Default options - can be overridden
    threshold: 0.3, // 0.0 = perfect match, 1.0 = match anything
    ignoreLocation: true, // Search entire string, not just beginning
    includeScore: false,
    minMatchCharLength: 1,
    ...options,
  }), [items, options]);

  // Perform fuzzy search
  const results = useMemo(() => {
    // If no search query, return all items
    if (!searchQuery.trim()) {
      return items;
    }

    // Perform fuzzy search and extract items from results
    const searchResults = fuse.search(searchQuery);
    return searchResults.map(result => result.item);
  }, [fuse, searchQuery, items]);

  return results;
}
