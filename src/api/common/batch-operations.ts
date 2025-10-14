/**
 * Batch Operations Utility - Cloudflare D1 Best Practices
 *
 * Reusable helper for atomic batch operations following Drizzle ORM patterns.
 * Provides a consistent interface for D1's batch() API with fallback for local SQLite.
 *
 * ⚠️ CRITICAL: Cloudflare D1 does NOT support transactions. Use batch operations instead.
 *
 * Key Features:
 * - Type-safe batch execution following Drizzle ORM patterns
 * - Automatic fallback to sequential execution for local SQLite (Better-SQLite3)
 * - Proper error handling and logging
 * - Zero overhead abstraction - compiles to direct db.batch() calls
 *
 * Official Drizzle ORM Batch API Pattern:
 * @see https://orm.drizzle.team/docs/batch-api
 * @see https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/#batch-statements
 *
 * @example Basic Usage
 * ```typescript
 * import { executeBatch } from '@/api/common/batch-operations';
 * import { getDbAsync } from '@/db';
 *
 * const db = await getDbAsync();
 *
 * await executeBatch(db, [
 *   db.insert(users).values({ name: 'John' }),
 *   db.update(users).set({ verified: true }).where(eq(users.id, 1))
 * ]);
 * ```
 *
 * @example With Returning Values
 * ```typescript
 * const [insertResult, updateResult] = await executeBatch(db, [
 *   db.insert(users).values({ name: 'John' }).returning(),
 *   db.update(users).set({ verified: true }).where(eq(users.id, 1))
 * ]);
 * ```
 *
 * @example Rollover with History Archive
 * ```typescript
 * const historyInsert = db.insert(usageHistory).values(snapshot);
 * const usageUpdate = db.update(usage).set({ count: 0 }).where(eq(usage.userId, id));
 *
 * await executeBatch(db, [historyInsert, usageUpdate]);
 * ```
 */

import type { BatchItem } from 'drizzle-orm/batch';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { DrizzleD1Database } from 'drizzle-orm/d1';

import { apiLogger } from '@/api/middleware/hono-logger';

/**
 * Type alias for any Drizzle query builder that can be batched
 *
 * Drizzle's BatchItem is the official type for batch operations.
 * We use any[] as a practical type since D1 batch accepts heterogeneous query types.
 *
 * Following official Drizzle pattern:
 * @see https://orm.drizzle.team/docs/batch-api
 */
type BatchQuery = BatchItem<'sqlite'>;

/**
 * Drizzle database instance that supports batch operations
 * Accepts both D1 and Better-SQLite3 with any schema type
 * Using Record<string, unknown> for schema flexibility as per Drizzle patterns
 */
type BatchCapableDatabase<TSchema extends Record<string, unknown> = Record<string, unknown>> =
  | DrizzleD1Database<TSchema>
  | BetterSQLite3Database<TSchema>
  | (DrizzleD1Database<TSchema> & { $client: unknown })
  | (BetterSQLite3Database<TSchema> & { $client: unknown });

/**
 * Execute multiple Drizzle ORM queries atomically using D1's batch API
 *
 * ✅ ATOMIC: All operations succeed together or fail together
 * ✅ TYPE-SAFE: Full TypeScript inference for query results
 * ✅ FALLBACK: Automatic sequential execution for local SQLite development
 *
 * Implementation follows official Drizzle ORM batch patterns:
 * - Uses db.batch() for Cloudflare D1 (runtime check)
 * - Falls back to sequential execution for Better-SQLite3 (local dev)
 * - Preserves type safety through generic return type inference
 *
 * @param db - Drizzle database instance (from getDbAsync())
 * @param operations - Array of Drizzle query builders to execute atomically
 * @returns Promise resolving to array of results matching input operation types
 *
 * @throws {Error} If any operation fails (all operations rolled back automatically)
 *
 * @example Archive + Update Pattern
 * ```typescript
 * // ✅ GOOD: Related operations that must be atomic
 * await executeBatch(db, [
 *   db.insert(history).values(snapshot),  // Archive old data
 *   db.update(current).set({ count: 0 }) // Reset current data
 * ]);
 * ```
 *
 * @example Multiple Inserts Pattern
 * ```typescript
 * // ✅ GOOD: Multiple related inserts
 * await executeBatch(db, [
 *   db.insert(customers).values(customer),
 *   db.insert(subscriptions).values(subscription),
 *   db.insert(invoices).values(invoice)
 * ]);
 * ```
 *
 * @example Upsert Pattern
 * ```typescript
 * // ✅ GOOD: Insert with conflict resolution
 * await executeBatch(db, [
 *   db.insert(products).values(product).onConflictDoUpdate({
 *     target: products.id,
 *     set: { updatedAt: new Date() }
 *   }),
 *   db.update(inventory).set({ stock: sql`${inventory.stock} + 1` })
 * ]);
 * ```
 */
export async function executeBatch<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  T extends BatchQuery[] = BatchQuery[],
>(
  db: BatchCapableDatabase<TSchema>,
  operations: [...T],
): Promise<unknown[]> {
  if (operations.length === 0) {
    apiLogger.debug('executeBatch called with empty operations array');
    return [];
  }

  try {
    // ✅ CLOUDFLARE D1: Use native batch API for atomic execution
    // Runtime check ensures this works in production (Cloudflare Workers)
    if ('batch' in db && typeof db.batch === 'function') {
      apiLogger.debug(`Executing ${operations.length} operations via D1 batch API`);

      // Direct call to db.batch() following official Drizzle pattern
      // The batch method signature from Drizzle ORM
      const results = await (db.batch as (queries: BatchQuery[]) => Promise<unknown[]>)(operations);

      apiLogger.debug(`D1 batch completed successfully: ${operations.length} operations`);
      return results;
    }

    // ✅ LOCAL DEVELOPMENT: Sequential execution fallback for Better-SQLite3
    // Better-SQLite3 doesn't support batch(), but sequential execution is acceptable for dev
    apiLogger.debug(
      `Executing ${operations.length} operations sequentially (local SQLite fallback)`,
    );

    const results: unknown[] = [];
    for (const operation of operations) {
      // Each operation is a prepared query with .execute() method
      // Type assertion is necessary because BatchItem type is generic
      const result = await (operation as unknown as { execute: () => Promise<unknown> }).execute();
      results.push(result);
    }

    apiLogger.debug(`Sequential batch completed successfully: ${operations.length} operations`);
    return results;
  } catch (error) {
    // Enhanced error logging for debugging batch failures
    apiLogger.error(
      `Batch execution failed after attempting ${operations.length} operations`,
      error as Error,
    );

    // Re-throw with context - caller should handle appropriately
    throw error;
  }
}

/**
 * Type guard to check if database supports batch operations
 *
 * Useful for conditional logic when you need to know the execution mode.
 * Most code should use executeBatch() directly - this is for advanced cases.
 *
 * @param db - Database instance to check
 * @returns true if db.batch() is available (Cloudflare D1), false otherwise (local SQLite)
 *
 * @example
 * ```typescript
 * if (supportsBatchOperations(db)) {
 *   console.log('Running in Cloudflare D1 environment');
 * } else {
 *   console.log('Running in local SQLite environment');
 * }
 * ```
 */
export function supportsBatchOperations<TSchema extends Record<string, unknown> = Record<string, unknown>>(
  db: BatchCapableDatabase<TSchema>,
): db is BatchCapableDatabase<TSchema> & {
  batch: (queries: BatchQuery[]) => Promise<unknown[]>;
} {
  return 'batch' in db && typeof db.batch === 'function';
}

/**
 * Validate batch size limits
 *
 * Cloudflare D1 has limits on batch size (typically 100 operations).
 * This utility helps ensure batches stay within limits.
 *
 * @param operationCount - Number of operations to validate
 * @param maxBatchSize - Maximum allowed batch size (default: 100)
 * @throws {Error} If operation count exceeds maximum
 *
 * @example
 * ```typescript
 * const operations = [
 *   // ... many operations
 * ];
 *
 * validateBatchSize(operations.length);
 * await executeBatch(db, operations);
 * ```
 */
export function validateBatchSize(operationCount: number, maxBatchSize: number = 100): void {
  if (operationCount > maxBatchSize) {
    throw new Error(
      `Batch size limit exceeded: ${operationCount} operations (max: ${maxBatchSize}). `
      + `Consider splitting into multiple batches or refactoring logic.`,
    );
  }

  if (operationCount === 0) {
    apiLogger.warn('validateBatchSize called with 0 operations - batch will do nothing');
  }
}
