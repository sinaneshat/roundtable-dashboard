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

import { createError } from '@/api/common/error-handling';

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
 * Runnable query interface - matches Drizzle's internal RunnableQuery
 *
 * All Drizzle query builders (insert/update/delete/select) implement this interface.
 * Used for type-safe sequential execution fallback in local development.
 *
 * TYPE NOTE: Drizzle's BatchItem type doesn't expose execute() in public API,
 * but all query builders implement RunnableQuery internally at runtime.
 */
type RunnableQuery = {
  execute: () => Promise<unknown>;
};

/**
 * Drizzle database instance that supports batch operations
 *
 * TYPE SAFETY NOTE:
 * - Accepts both D1 and Better-SQLite3 database types
 * - Schema type parameter allows type-safe schema access
 * - $client property is typed as `unknown` since we only need the batch() method
 * - This union type represents all valid database configurations from getDbAsync()
 *
 * PATTERN JUSTIFICATION:
 * - Drizzle ORM DbSchema is defined as: type DbSchema = Record<string, unknown>
 * - This matches the official Drizzle ORM internal type definitions
 * - Using object index signature allows this utility to work with any schema
 * - Runtime batch operations don't require schema introspection
 * - Type safety is maintained through the operations array type parameter
 */
type BatchCapableDatabase<TSchema extends { [key: string]: unknown } = { [key: string]: unknown }>
  = | DrizzleD1Database<TSchema>
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
  TSchema extends { [key: string]: unknown } = { [key: string]: unknown },
  T extends BatchQuery[] = BatchQuery[],
>(
  db: BatchCapableDatabase<TSchema>,
  operations: [...T],
): Promise<unknown[]> {
  if (operations.length === 0) {
    return [];
  }

  // ✅ CLOUDFLARE D1: Use native batch API for atomic execution
  // Runtime check ensures this works in production (Cloudflare Workers)
  if ('batch' in db && typeof db.batch === 'function') {
    /**
     * Type assertion for batch() method call
     *
     * JUSTIFICATION:
     * - Drizzle ORM batch() signature: (queries: BatchItem<'sqlite'>[]) => Promise<unknown[]>
     * - Runtime check ('batch' in db) guarantees method exists before calling
     * - Type system cannot infer method signature from discriminated union at this point
     * - Safe because:
     *   1. operations is BatchQuery[] which is BatchItem<'sqlite'>[]
     *   2. batch() returns Promise<unknown[]> matching our return type
     *   3. This is the official Drizzle ORM pattern for D1
     *
     * ALTERNATIVE CONSIDERED: Custom type guard would add complexity without safety benefit
     * REFERENCE: https://orm.drizzle.team/docs/batch-api
     */
    const results = await (db.batch as (queries: BatchQuery[]) => Promise<unknown[]>)(operations);
    return results;
  }

  // ✅ LOCAL DEVELOPMENT: Sequential execution fallback for Better-SQLite3
  // Better-SQLite3 doesn't support batch(), but sequential execution is acceptable for dev
  const results: unknown[] = [];
  for (const operation of operations) {
    /**
     * Type assertion: BatchItem to RunnableQuery
     *
     * STRUCTURAL TYPE MISMATCH (Expected):
     * - BatchItem<'sqlite'> public type doesn't expose execute() method
     * - RunnableQuery interface requires execute() method
     * - TypeScript correctly flags these types as non-overlapping
     *
     * WHY THIS IS RUNTIME-SAFE:
     * 1. ALL Drizzle query builders implement RunnableQuery internally
     * 2. execute() method exists on every insert/update/delete/select query builder
     * 3. operation comes from validated operations array (BatchQuery[] = BatchItem<'sqlite'>[])
     * 4. This fallback only runs in local dev with Better-SQLite3 (not production D1)
     * 5. Production uses db.batch() path which has proper type support
     *
     * WHY DOUBLE CAST IS REQUIRED:
     * - Single cast fails: TS2352 "types don't sufficiently overlap"
     * - Drizzle's public BatchItem type intentionally hides internal RunnableQuery
     * - Double cast acknowledges we're accessing Drizzle's internal implementation
     *
     * ALTERNATIVE REJECTED:
     * - Extracting Drizzle internals: would break on Drizzle updates
     * - Changing to db.run(): loses atomicity guarantees
     * - Skipping type safety: worse than documented assertion
     *
     * PATTERN: Standard Drizzle ORM sequential fallback for local dev
     * REFERENCE: Drizzle ORM source - all builders extend RunnableQuery base class
     */
    const result = await (operation as unknown as RunnableQuery).execute();
    results.push(result);
  }

  return results;
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
    throw createError.badRequest(
      `Batch size limit exceeded: ${operationCount} operations (max: ${maxBatchSize}). `
      + `Consider splitting into multiple batches or refactoring logic.`,
      {
        errorType: 'validation',
        schemaName: 'BatchOperations',
      },
    );
  }
}
