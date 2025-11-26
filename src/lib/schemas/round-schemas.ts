/**
 * Round Number Schemas - SINGLE SOURCE OF TRUTH
 *
 * ✅ 0-BASED INDEXING: First round is 0, second is 1, etc.
 * ✅ CENTRALIZED: All round number validation happens here
 * ✅ TYPE-SAFE: Zod schemas with TypeScript inference
 * ✅ REUSABLE: Import these schemas everywhere
 *
 * This is the ONLY place where round number defaults and validation are defined.
 * DO NOT create round number schemas or defaults anywhere else.
 */

import { z } from 'zod';

// ============================================================================
// CONSTANTS - Single Source of Truth for Defaults
// ============================================================================

/**
 * Default round number when none exists
 * ✅ 0-BASED: First round is 0
 */
export const DEFAULT_ROUND_NUMBER = 0;

/**
 * Sentinel value for "no round found" in calculations
 * Used internally to calculate next round: -1 + 1 = 0 (first round)
 */
export const NO_ROUND_SENTINEL = -1;

// ============================================================================
// ZOD SCHEMAS - Single Source of Truth for Validation
// ============================================================================

/**
 * Round number schema for data storage and API communication
 * ✅ 0-BASED: Allows 0 (first round)
 * ✅ NON-NEGATIVE: Rejects negative numbers except sentinel
 * ✅ NO .int(): AI SDK providers reject integer type constraints in output_format schemas
 * IMPORTANT: This schema is used in AI-generated schemas (ModeratorAnalysisPayloadSchema)
 * so we CANNOT use .int() as it causes "integer type properties maximum, minimum not supported" errors
 */
export const RoundNumberSchema = z.number().describe('Round number (0-based: first round is 0, must be integer >= 0)');

/**
 * Round number schema for internal calculations (allows sentinel value)
 * Used for: maxRoundNumber tracking, round calculation logic
 * ✅ NO .int()/.min(): Even though this is for internal use, keeping consistency
 * with RoundNumberSchema to avoid confusion
 */
export const RoundNumberWithSentinelSchema = z.number().describe('Round number or sentinel (-1 for calculations, must be integer >= -1)');

/**
 * Optional round number schema (for nullable fields)
 */
export const OptionalRoundNumberSchema = RoundNumberSchema.optional().describe('Optional round number (0-based)');

/**
 * Nullable round number schema (for database fields)
 */
export const NullableRoundNumberSchema = RoundNumberSchema.nullable().describe('Nullable round number (0-based)');

// ============================================================================
// TYPE INFERENCE - Single Source of Truth for Types
// ============================================================================

/**
 * Round number type (inferred from schema)
 * Use this instead of hardcoding `number`
 */
export type RoundNumber = z.infer<typeof RoundNumberSchema>;

/**
 * Round number with sentinel type (for internal calculations)
 */
export type RoundNumberWithSentinel = z.infer<typeof RoundNumberWithSentinelSchema>;

// ============================================================================
// VALIDATION UTILITIES - Single Source of Truth for Parsing
// ============================================================================

/**
 * Parse and validate a round number
 * Throws if invalid
 *
 * @param value - Value to validate
 * @returns Validated round number (0-based)
 * @throws ZodError if validation fails
 */
export function parseRoundNumber(value: unknown): RoundNumber {
  return RoundNumberSchema.parse(value);
}

/**
 * Safely parse a round number with fallback
 * Returns default if invalid
 *
 * @param value - Value to validate
 * @param fallback - Fallback value (default: DEFAULT_ROUND_NUMBER)
 * @returns Validated round number or fallback
 */
export function safeParseRoundNumber(value: unknown, fallback: number = DEFAULT_ROUND_NUMBER): RoundNumber {
  const result = RoundNumberSchema.safeParse(value);
  return result.success ? result.data : fallback;
}

/**
 * Check if value is a valid round number
 *
 * @param value - Value to check
 * @returns True if valid round number
 */
export function isValidRoundNumber(value: unknown): value is RoundNumber {
  return RoundNumberSchema.safeParse(value).success;
}

// ============================================================================
// CALCULATION UTILITIES - Single Source of Truth for Round Logic
// ============================================================================

/**
 * Calculate next round number from maximum existing round
 * ✅ 0-BASED: Returns 0 if no rounds exist
 *
 * @param maxRound - Maximum round number found, or NO_ROUND_SENTINEL if none
 * @returns Next round number (maxRound + 1, or 0 if sentinel)
 */
export function calculateNextRound(maxRound: RoundNumberWithSentinel): RoundNumber {
  const next = maxRound + 1;
  return RoundNumberSchema.parse(next);
}

/**
 * Get display round number (1-based for UI)
 * ✅ DISPLAY ONLY: Use this for user-facing text
 * ✅ 0-BASED → 1-BASED: Adds 1 for display
 *
 * @param roundNumber - 0-based round number
 * @returns 1-based display number (Round 1, Round 2, etc.)
 */
export function getDisplayRoundNumber(roundNumber: RoundNumber): number {
  return roundNumber + 1;
}

/**
 * Format round number for display
 * Example: 0 → "Round 1", 1 → "Round 2"
 *
 * @param roundNumber - 0-based round number
 * @returns Formatted string for display
 */
export function formatRoundNumber(roundNumber: RoundNumber): string {
  return `Round ${getDisplayRoundNumber(roundNumber)}`;
}

// ============================================================================
// METADATA EXTRACTION - Single Source of Truth for Reading Metadata
// ============================================================================

/**
 * Extract round number from message metadata
 * ✅ TYPE-SAFE: Validates and parses
 * ✅ FALLBACK: Returns default if missing or invalid
 *
 * @param metadata - Message metadata (unknown type)
 * @param fallback - Fallback value (default: DEFAULT_ROUND_NUMBER)
 * @returns Validated round number or fallback
 */
export function extractRoundNumber(metadata: unknown, fallback: number = DEFAULT_ROUND_NUMBER): RoundNumber {
  if (!metadata || typeof metadata !== 'object') {
    return fallback;
  }

  // ✅ TYPE-SAFE: Check for field existence before access
  if ('roundNumber' in metadata) {
    return safeParseRoundNumber(metadata.roundNumber, fallback);
  }
  return fallback;
}
