/**
 * Database Timestamp Utilities
 *
 * Clean, type-safe timestamp handling for Drizzle + Cloudflare D1.
 *
 * **STANDARD**: All timestamps use milliseconds (timestamp_ms mode)
 * - More precise than seconds
 * - Native JavaScript Date.now() compatibility
 * - Consistent across all tables
 *
 * @module db/utils/timestamps
 */

/**
 * Get current timestamp in milliseconds
 *
 * Used for createdAt fields in database inserts.
 * Matches Drizzle's .defaultNow() behavior for timestamp_ms mode.
 *
 * @returns Current timestamp in milliseconds since Unix epoch
 *
 * @example
 * ```ts
 * await db.insert(tables.chatThread).values({
 *   id: generateId(),
 *   createdAt: getCurrentTimestamp(),
 *   // ...
 * });
 * ```
 */
export function getCurrentTimestamp(): Date {
  return new Date();
}

/**
 * Calculate age in milliseconds from a timestamp
 *
 * Used for timeout detection and conflict resolution.
 * Assumes timestamp is already in milliseconds (Drizzle timestamp_ms mode).
 *
 * @param timestamp - Database timestamp (Date object from Drizzle)
 * @returns Age in milliseconds
 * @throws Error if timestamp is invalid or in the future
 *
 * @example
 * ```ts
 * const ageMs = getTimestampAge(record.createdAt);
 * if (ageMs > TIMEOUT_MS) {
 *   // Mark as failed
 * }
 * ```
 */
export function getTimestampAge(timestamp: Date): number {
  if (!(timestamp instanceof Date)) {
    throw new TypeError(`Invalid timestamp: expected Date object, got ${typeof timestamp}`);
  }

  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError('Invalid timestamp: Date object is invalid (NaN)');
  }

  const ageMs = Date.now() - timestamp.getTime();

  // Sanity check: age should not be negative (future timestamp = data corruption)
  if (ageMs < 0) {
    throw new Error(`Invalid timestamp: age is negative (${ageMs}ms). Timestamp is in the future.`);
  }

  // Sanity check: age should be reasonable (< 30 days for most operations)
  const MAX_REASONABLE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
  if (ageMs > MAX_REASONABLE_AGE) {
    throw new Error(`Invalid timestamp: age is excessive (${Math.round(ageMs / 1000)}s > 30 days)`);
  }

  return ageMs;
}

/**
 * Check if a timestamp has exceeded a timeout threshold
 *
 * Safe wrapper around getTimestampAge that returns false if timestamp is invalid.
 * Used for stream timeout detection.
 *
 * @param timestamp - Database timestamp
 * @param timeoutMs - Timeout threshold in milliseconds
 * @returns true if timestamp has exceeded timeout, false if invalid or within timeout
 *
 * @example
 * ```ts
 * if (hasTimestampExceededTimeout(record.createdAt, STREAM_TIMEOUT_MS)) {
 *   // Mark stream as failed - exceeded timeout
 *   await markStreamAsFailed(record.id);
 * }
 * ```
 */
export function hasTimestampExceededTimeout(
  timestamp: Date,
  timeoutMs: number,
): boolean {
  try {
    const age = getTimestampAge(timestamp);
    return age > timeoutMs;
  } catch {
    // Invalid timestamp = treat as exceeded (will trigger cleanup)
    return true;
  }
}

/**
 * Format age in milliseconds to human-readable string
 *
 * Used for error messages and logging.
 *
 * @param ageMs - Age in milliseconds
 * @returns Human-readable age string
 *
 * @example
 * ```ts
 * const age = getTimestampAge(record.createdAt);
 * console.log(`Record age: ${formatAgeMs(age)}`);
 * // Output: "Record age: 45s"
 * ```
 */
export function formatAgeMs(ageMs: number): string {
  if (ageMs < 1000) {
    return `${Math.round(ageMs)}ms`;
  }
  if (ageMs < 60000) {
    return `${Math.round(ageMs / 1000)}s`;
  }
  if (ageMs < 3600000) {
    return `${Math.round(ageMs / 60000)}m`;
  }
  return `${Math.round(ageMs / 3600000)}h`;
}

/**
 * Validate that a timestamp is within reasonable bounds
 *
 * Used for data integrity checks and migration validation.
 * Throws descriptive errors for debugging.
 *
 * @param timestamp - Timestamp to validate
 * @param fieldName - Field name for error messages
 * @throws Error with detailed message if timestamp is invalid
 *
 * @example
 * ```ts
 * try {
 *   validateTimestamp(record.createdAt, 'createdAt');
 *   // Timestamp is valid
 * } catch (error) {
 *   console.error('Data corruption:', error.message);
 * }
 * ```
 */
export function validateTimestamp(timestamp: Date, fieldName = 'timestamp'): void {
  if (!(timestamp instanceof Date)) {
    throw new TypeError(
      `${fieldName}: expected Date object, got ${typeof timestamp}`,
    );
  }

  if (Number.isNaN(timestamp.getTime())) {
    throw new TypeError(`${fieldName}: invalid Date object (NaN)`);
  }

  const now = Date.now();
  const timestampMs = timestamp.getTime();

  // Check for future timestamps (data corruption or timezone issues)
  if (timestampMs > now) {
    throw new Error(
      `${fieldName}: timestamp is in the future by ${Math.round((timestampMs - now) / 1000)}s`,
    );
  }

  // Check for unreasonably old timestamps (before year 2020)
  const year2020 = new Date('2020-01-01').getTime();
  if (timestampMs < year2020) {
    throw new Error(
      `${fieldName}: timestamp is before 2020 (${new Date(timestampMs).toISOString()})`,
    );
  }
}
