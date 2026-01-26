/**
 * ✅ MINIMAL LIMITS - Only Actually Used Values
 *
 * PRINCIPLES:
 * 1. Each unique number defined exactly ONCE
 * 2. Only include constants that are actually used
 * 3. Clean semantic names, no UI-specific naming
 *
 * USAGE:
 * ```ts
 * import { LIMITS } from '@/constants';
 *
 * const limit = LIMITS.STANDARD_PAGE; // 20
 * ```
 */

// ============================================================================
// BASE VALUES - Core numbers used throughout app
// ============================================================================

const VALUES = {
  LARGE: 50,
  MEDIUM: 20,
  // Counts
  SMALL: 10,
} as const;

// ============================================================================
// SEMANTIC CONSTANTS - Actually used in codebase
// ============================================================================

export const LIMITS = {
  // Pagination (used in: chat-threads.ts, chat-layout.tsx)
  INITIAL_PAGE: VALUES.LARGE, // 50 - First page load
  LARGE_SET: VALUES.LARGE, // 50 - Large multi-select
  OPTIONS_SET: VALUES.MEDIUM, // 20 - Standard dropdowns

  SEARCH_RESULTS: VALUES.SMALL, // 10 - Search results
  // Selection (used in: component dropdowns, autocomplete)
  SMALL_SET: VALUES.SMALL, // 10 - Small option sets
  STANDARD_PAGE: VALUES.MEDIUM, // 20 - Subsequent pages
} as const;

// ============================================================================
// TYPE EXPORT
// ============================================================================

export type Limits = typeof LIMITS;
