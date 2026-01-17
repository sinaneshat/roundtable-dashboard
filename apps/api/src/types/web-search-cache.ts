/**
 * Web Search Cache Types
 *
 * Type definitions for KV caching layer in web search service.
 * SINGLE SOURCE OF TRUTH for cache-related types.
 *
 * Services using these types:
 * - web-search-cache.service.ts
 *
 * @see /docs/type-inference-patterns.md for type safety patterns
 */

import { z } from 'zod';

import { WebSearchResultSchema } from '@/routes/chat/schema';

// ============================================================================
// CACHE METADATA SCHEMAS
// ============================================================================

/**
 * Cache entry metadata schema
 * Tracks when cache entries were created and when they expire
 */
export const CacheMetadataSchema = z.object({
  cachedAt: z.string(),
  expiresAt: z.string(),
});

/** Cache entry metadata type */
export type CacheMetadata = z.infer<typeof CacheMetadataSchema>;

/**
 * Cached search result schema with metadata
 * Extends WebSearchResult with cache tracking info
 */
export const CachedSearchResultSchema = WebSearchResultSchema.extend({
  _cache: CacheMetadataSchema,
});

/** Cached search result type */
export type CachedSearchResult = z.infer<typeof CachedSearchResultSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard: Check if value is CacheMetadata
 */
export function isCacheMetadata(value: unknown): value is CacheMetadata {
  return CacheMetadataSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is CachedSearchResult
 */
export function isCachedSearchResult(value: unknown): value is CachedSearchResult {
  return CachedSearchResultSchema.safeParse(value).success;
}

// ============================================================================
// SAFE PARSERS FOR KV DATA
// ============================================================================

/**
 * Safely parse CachedSearchResult from KV data
 * @returns Parsed result or null if invalid
 */
export function parseCachedSearchResult(data: unknown): CachedSearchResult | null {
  const result = CachedSearchResultSchema.safeParse(data);
  return result.success ? result.data : null;
}
