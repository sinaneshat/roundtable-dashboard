/**
 * Web Search Utilities
 *
 * **TYPE-SAFE**: No unsafe URL parsing or force casting
 * **ERROR-SAFE**: All URL operations wrapped in try-catch with fallbacks
 *
 * @module lib/utils/web-search-utils
 */

import type { WebSearchDepth } from '@/api/core/enums';
import { WebSearchDepths } from '@/api/core/enums';
import type { PreSearchDataPayload, StoredPreSearch } from '@/api/routes/chat/schema';

// ============================================================================
// DYNAMIC TIMEOUT CALCULATION
// ============================================================================

/**
 * Timeout configuration constants (in milliseconds)
 * These can be tuned based on actual performance metrics
 */
export const TIMEOUT_CONFIG = {
  /** Base timeout before any queries (initial overhead) */
  BASE_MS: 15_000, // 15 seconds

  /** Additional time per search query */
  PER_QUERY_BASIC_MS: 8_000, // 8 seconds for basic depth
  PER_QUERY_ADVANCED_MS: 15_000, // 15 seconds for advanced depth

  /** Additional time per expected website/result to scrape */
  PER_RESULT_MS: 1_500, // 1.5 seconds per result

  /** Minimum timeout (never go below this) */
  MIN_MS: 20_000, // 20 seconds

  /** Maximum timeout (never exceed this) */
  MAX_MS: 180_000, // 3 minutes

  /** Default timeout when no pre-search data available */
  DEFAULT_MS: 45_000, // 45 seconds

  /** Default expected results per query if not specified */
  DEFAULT_RESULTS_PER_QUERY: 5,
} as const;

/**
 * Input for calculating dynamic timeout
 * Can accept partial data at different stages of pre-search lifecycle
 */
export type PreSearchTimeoutInput = {
  /** Number of search queries to execute */
  queryCount?: number;
  /** Number of advanced depth queries (takes longer than basic) */
  advancedQueryCount?: number;
  /** Expected total number of results/websites to scrape */
  expectedResultCount?: number;
  /** Array of queries with depth info (alternative to queryCount/advancedQueryCount) */
  queries?: Array<{ searchDepth?: WebSearchDepth; sourceCount?: number | string }>;
};

/**
 * Calculates dynamic timeout based on pre-search configuration
 *
 * Formula:
 *   timeout = BASE + (basicQueries × PER_QUERY_BASIC) + (advancedQueries × PER_QUERY_ADVANCED) + (results × PER_RESULT)
 *
 * Clamped between MIN and MAX values.
 *
 * @param input - Pre-search configuration (query counts, result counts, etc.)
 * @returns Calculated timeout in milliseconds
 *
 * @example
 * ```ts
 * // From query/result counts
 * const timeout = calculatePreSearchTimeout({ queryCount: 3, advancedQueryCount: 1, expectedResultCount: 15 });
 *
 * // From queries array
 * const timeout = calculatePreSearchTimeout({
 *   queries: [
 *     { searchDepth: 'basic', sourceCount: 5 },
 *     { searchDepth: 'advanced', sourceCount: 10 },
 *   ]
 * });
 * ```
 */
export function calculatePreSearchTimeout(input?: PreSearchTimeoutInput): number {
  // No input = return default
  if (!input) {
    return TIMEOUT_CONFIG.DEFAULT_MS;
  }

  let basicQueryCount = 0;
  let advancedQueryCount = 0;
  let expectedResults = 0;

  // If queries array provided, extract counts from it
  if (input.queries && input.queries.length > 0) {
    for (const query of input.queries) {
      if (query.searchDepth === WebSearchDepths.ADVANCED) {
        advancedQueryCount++;
      } else {
        basicQueryCount++;
      }

      // Sum up expected results per query
      const sourceCount = typeof query.sourceCount === 'string'
        ? Number.parseInt(query.sourceCount, 10) || TIMEOUT_CONFIG.DEFAULT_RESULTS_PER_QUERY
        : query.sourceCount ?? TIMEOUT_CONFIG.DEFAULT_RESULTS_PER_QUERY;
      expectedResults += sourceCount;
    }
  } else {
    // Use explicit counts if provided
    const totalQueries = input.queryCount ?? 0;
    advancedQueryCount = input.advancedQueryCount ?? 0;
    basicQueryCount = Math.max(0, totalQueries - advancedQueryCount);
    expectedResults = input.expectedResultCount ?? (totalQueries * TIMEOUT_CONFIG.DEFAULT_RESULTS_PER_QUERY);
  }

  // Calculate timeout
  const timeout
    = TIMEOUT_CONFIG.BASE_MS
      + (basicQueryCount * TIMEOUT_CONFIG.PER_QUERY_BASIC_MS)
      + (advancedQueryCount * TIMEOUT_CONFIG.PER_QUERY_ADVANCED_MS)
      + (expectedResults * TIMEOUT_CONFIG.PER_RESULT_MS);

  // Clamp between min and max
  return Math.min(Math.max(timeout, TIMEOUT_CONFIG.MIN_MS), TIMEOUT_CONFIG.MAX_MS);
}

/**
 * Extracts timeout input from a StoredPreSearch object
 * Works at any stage of the pre-search lifecycle
 *
 * @param preSearch - Stored pre-search record (may have partial data)
 * @returns Timeout input extracted from available data
 */
export function extractTimeoutInputFromPreSearch(preSearch: StoredPreSearch | null | undefined): PreSearchTimeoutInput | undefined {
  if (!preSearch) {
    return undefined;
  }

  const searchData = preSearch.searchData as PreSearchDataPayload | null | undefined;

  if (searchData?.queries && searchData.queries.length > 0) {
    // Full data available - extract from queries
    return {
      queries: searchData.queries.map(q => ({
        searchDepth: q.searchDepth,
        sourceCount: TIMEOUT_CONFIG.DEFAULT_RESULTS_PER_QUERY, // Individual queries don't have sourceCount
      })),
      expectedResultCount: searchData.totalResults || searchData.queries.length * TIMEOUT_CONFIG.DEFAULT_RESULTS_PER_QUERY,
    };
  }

  // No detailed data yet - return undefined to use default
  return undefined;
}

/**
 * Calculates dynamic timeout for a pre-search operation
 * Convenience function that combines extraction and calculation
 *
 * @param preSearch - Stored pre-search record
 * @returns Calculated timeout in milliseconds
 */
export function getPreSearchTimeout(preSearch: StoredPreSearch | null | undefined): number {
  const input = extractTimeoutInputFromPreSearch(preSearch);
  return calculatePreSearchTimeout(input);
}

/**
 * Checks if a pre-search has exceeded its dynamic timeout
 *
 * @param preSearch - Stored pre-search record
 * @param now - Current timestamp (default: Date.now())
 * @returns True if pre-search has timed out
 */
export function isPreSearchTimedOut(preSearch: StoredPreSearch | null | undefined, now = Date.now()): boolean {
  if (!preSearch) {
    return false;
  }

  const createdTime = preSearch.createdAt instanceof Date
    ? preSearch.createdAt.getTime()
    : new Date(preSearch.createdAt).getTime();

  const timeout = getPreSearchTimeout(preSearch);
  return now - createdTime > timeout;
}

/**
 * Activity-based timeout threshold (in milliseconds)
 * If no SSE activity is received within this period, the pre-search is considered stalled
 * This is more generous than the total timeout because:
 * - SSE events should arrive regularly during active processing
 * - Large searches with many queries may take longer overall
 * - But they should ALWAYS have activity within this window
 */
export const ACTIVITY_TIMEOUT_MS = 60_000; // 60 seconds without activity = stalled

/**
 * Checks if a pre-search has stalled based on SSE activity
 * This is used alongside isPreSearchTimedOut for more robust timeout handling:
 * - isPreSearchTimedOut: Total elapsed time exceeded (based on query complexity)
 * - isPreSearchActivityStalled: No recent activity (data flow stopped)
 *
 * @param lastActivityTime - Last activity timestamp from store (or undefined if no tracking)
 * @param createdTime - Pre-search creation timestamp (fallback if no activity tracked)
 * @param now - Current timestamp (default: Date.now())
 * @returns True if pre-search has stalled (no recent activity)
 */
export function isPreSearchActivityStalled(
  lastActivityTime: number | undefined,
  createdTime: number,
  now = Date.now(),
): boolean {
  // Use last activity time if available, otherwise fall back to creation time
  const referenceTime = lastActivityTime ?? createdTime;
  return now - referenceTime > ACTIVITY_TIMEOUT_MS;
}

/**
 * Combined timeout check that considers both total time and activity
 * Returns true if EITHER condition is met:
 * 1. Total elapsed time exceeds dynamic timeout (based on query complexity)
 * 2. No SSE activity received within ACTIVITY_TIMEOUT_MS
 *
 * @param preSearch - Stored pre-search record
 * @param lastActivityTime - Last activity timestamp from store (or undefined)
 * @param now - Current timestamp (default: Date.now())
 * @returns True if pre-search should be considered timed out
 */
export function shouldPreSearchTimeout(
  preSearch: StoredPreSearch | null | undefined,
  lastActivityTime: number | undefined,
  now = Date.now(),
): boolean {
  if (!preSearch) {
    return false;
  }

  const createdTime = preSearch.createdAt instanceof Date
    ? preSearch.createdAt.getTime()
    : new Date(preSearch.createdAt).getTime();

  // Check total elapsed time timeout
  if (isPreSearchTimedOut(preSearch, now)) {
    return true;
  }

  // Check activity-based timeout (no recent SSE events)
  if (isPreSearchActivityStalled(lastActivityTime, createdTime, now)) {
    return true;
  }

  return false;
}

/**
 * Safely extracts domain/hostname from a URL string
 *
 * @param url - URL string to parse (may be malformed)
 * @param fallback - Fallback value if parsing fails (default: empty string)
 * @returns Extracted hostname or fallback
 *
 * @example
 * ```ts
 * const domain = safeExtractDomain('https://example.com/path');
 * // => 'example.com'
 *
 * const invalid = safeExtractDomain('not-a-url', 'unknown');
 * // => 'unknown'
 * ```
 */
export function safeExtractDomain(url: string, fallback = ''): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    // URL parsing failed - return fallback
    return fallback;
  }
}

/**
 * Validates if a string is a valid URL
 *
 * @param url - String to validate
 * @returns True if valid URL, false otherwise
 *
 * @example
 * ```ts
 * isValidUrl('https://example.com'); // => true
 * isValidUrl('not-a-url'); // => false
 * ```
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return Boolean(parsed);
  } catch {
    return false;
  }
}

/**
 * Builds a Google favicon URL for a domain
 *
 * @param domain - Domain name or full URL
 * @param size - Icon size in pixels (default: 64)
 * @returns Google favicon service URL
 *
 * @example
 * ```ts
 * const faviconUrl = buildGoogleFaviconUrl('example.com');
 * // => 'https://www.google.com/s2/favicons?domain=example.com&sz=64'
 * ```
 */
export function buildGoogleFaviconUrl(domain: string, size = 64): string {
  // Extract domain if full URL provided
  const cleanDomain = isValidUrl(domain) ? safeExtractDomain(domain, domain) : domain;
  return `https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=${size}`;
}

/**
 * Handles image load errors by suppressing console errors
 * and optionally triggering a fallback action
 *
 * @param event - Image error event
 * @param onFallback - Optional callback to trigger fallback behavior
 *
 * @example
 * ```tsx
 * <img
 *   src={imageUrl}
 *   onError={(e) => handleImageError(e, () => setImageFailed(true))}
 * />
 * ```
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  onFallback?: () => void,
): void {
  // Prevent default error propagation to console
  event.preventDefault();

  // Trigger fallback behavior if provided
  onFallback?.();
}
