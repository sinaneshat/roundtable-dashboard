/**
 * Participant Limits Configuration
 *
 * ✅ CLIENT-SAFE: No server-only dependencies
 * ✅ SINGLE SOURCE OF TRUTH: Shared between frontend and backend
 *
 * Defines participant count limits for chat threads.
 */

/**
 * Minimum participants required for a roundtable discussion
 * Used by quick-start suggestions and validation
 */
export const MIN_PARTICIPANTS_REQUIRED = 2;

/**
 * Maximum participants allowed per tier (absolute limit)
 * Derived from pro tier's maxModels limit
 */
export const MAX_PARTICIPANTS_LIMIT = 12;
