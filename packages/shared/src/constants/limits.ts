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
 * import { LIMITS } from '@roundtable/shared';
 *
 * const limit = LIMITS.STANDARD_PAGE; // 20
 * ```
 */

// ============================================================================
// BASE VALUES - Core numbers used throughout app
// ============================================================================

const VALUES = {
  // Counts
  SMALL: 10,
  MEDIUM: 20,
  LARGE: 50,
} as const;

// ============================================================================
// SEMANTIC CONSTANTS - Actually used in codebase
// ============================================================================

export const LIMITS = {
  // Pagination (used in: chat-threads.ts, chat-layout.tsx)
  INITIAL_PAGE: VALUES.LARGE, // 50 - First page load
  STANDARD_PAGE: VALUES.MEDIUM, // 20 - Subsequent pages
  SEARCH_RESULTS: VALUES.SMALL, // 10 - Search results

  // Selection (used in: component dropdowns, autocomplete)
  SMALL_SET: VALUES.SMALL, // 10 - Small option sets
  OPTIONS_SET: VALUES.MEDIUM, // 20 - Standard dropdowns
  LARGE_SET: VALUES.LARGE, // 50 - Large multi-select
} as const;

// ============================================================================
// PROJECT LIMITS - PRO-only feature constraints
// ============================================================================

export const PROJECT_LIMITS = {
  MAX_PROJECTS_PER_USER: 5,
  MAX_THREADS_PER_PROJECT: 10,
} as const;

// ============================================================================
// TYPE EXPORT
// ============================================================================

export type Limits = typeof LIMITS;
export type ProjectLimits = typeof PROJECT_LIMITS;
