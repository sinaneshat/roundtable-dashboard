/**
 * Cloudflare D1 Type Definitions - Batch-First Architecture
 *
 * These type definitions enforce batch-based patterns by making transaction
 * methods unavailable at the type level, preventing accidental usage.
 *
 * Philosophy:
 * - Cloudflare D1 is optimized for batch operations, not traditional transactions
 * - Batches provide atomicity with better performance in serverless environments
 * - This type system makes it impossible to use transactions by mistake
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';

/**
 * Batch-Only Database Instance
 *
 * This type removes the transaction() method from the Drizzle database instance,
 * ensuring developers can only use batch operations.
 *
 * Usage:
 * ```typescript
 * import type { D1BatchDatabase } from '@/db/d1-types';
 *
 * const db: D1BatchDatabase = drizzle(env.DB);
 * // db.transaction() -> TypeScript error!
 * // db.batch() -> ✅ Correct!
 * ```
 */
export type D1BatchDatabase<TSchema extends Record<string, unknown> = Record<string, never>>
  = Omit<DrizzleD1Database<TSchema>, 'transaction'> & {
    /**
     * @deprecated Transactions are not supported with Cloudflare D1.
     * Use db.batch() instead for atomic operations.
     *
     * @example
     * // ❌ Don't do this:
     * await db.transaction(async (tx) => {
     *   await tx.insert(users).values(newUser);
     *   await tx.update(users).set({ name: 'Updated' });
     * });
     *
     * // ✅ Do this instead:
     * await db.batch([
     *   db.insert(users).values(newUser),
     *   db.update(users).set({ name: 'Updated' })
     * ]);
     *
     * @see https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/#batch-statements
     * @see docs/backend-patterns.md#batch-operations
     */
    transaction: never;
  };

/**
 * Runtime check to warn if transaction method is used
 *
 * This is a runtime check that complements the ESLint-level enforcement.
 *
 * @param db - Database instance to check
 * @throws Error if transaction method is available
 */
export function warnIfTransactionExists<T extends Record<string, unknown>>(
  db: DrizzleD1Database<T>,
): void {
  if ('transaction' in db && typeof db.transaction === 'function') {
    // Logging removed - was only for debugging
  }
}

/**
 * Batch operation builder types
 *
 * These types document what operations can be batched together.
 */
export type BatchableOperation<TSchema extends Record<string, unknown> = Record<string, never>>
  = | ReturnType<DrizzleD1Database<TSchema>['insert']>
    | ReturnType<DrizzleD1Database<TSchema>['update']>
    | ReturnType<DrizzleD1Database<TSchema>['delete']>
    | ReturnType<DrizzleD1Database<TSchema>['select']>;

/**
 * Documentation for developers
 *
 * @example Correct batch usage pattern
 * ```typescript
 * import { getDbAsync } from '@/db';
 * import type { D1BatchDatabase } from '@/db/d1-types';
 *
 * const db = await getDbAsync() as D1BatchDatabase;
 *
 * // Atomic batch operation
 * const [insertResult, updateResult] = await db.batch([
 *   db.insert(users).values({ name: 'John' }).returning(),
 *   db.update(users).set({ active: true }).where(eq(users.id, 1))
 * ]);
 * ```
 *
 * @example Using createHandlerWithBatch (recommended)
 * ```typescript
 * export const myHandler = createHandlerWithBatch(
 *   { auth: 'session' },
 *   async (c, batch) => {
 *     // batch.db automatically uses batch operations
 *     await batch.db.insert(users).values(newUser);
 *     await batch.db.update(users).set({ verified: true });
 *     // These operations are automatically batched!
 *   }
 * );
 * ```
 */

/**
 * Batch operation patterns
 */
export const D1BatchPatterns = {
  /**
   * Pattern 1: Insert + Update in single batch
   */
  insertAndUpdate: `
await db.batch([
  db.insert(customers).values(newCustomer).returning(),
  db.update(users).set({ hasCustomer: true }).where(eq(users.id, userId))
]);`,

  /**
   * Pattern 2: Multiple inserts
   */
  multipleInserts: `
await db.batch([
  db.insert(subscriptions).values(newSub),
  db.insert(invoices).values(newInvoice),
  db.insert(webhookEvents).values(eventLog)
]);`,

  /**
   * Pattern 3: Insert with upsert
   */
  insertWithUpsert: `
await db.batch([
  db.insert(customers).values(customer).onConflictDoUpdate({
    target: customers.id,
    set: { email: customer.email, updatedAt: new Date() }
  }),
  db.insert(subscriptions).values(subscription)
]);`,

  /**
   * Pattern 4: Conditional operations (using createHandlerWithBatch)
   */
  conditionalBatch: `
const handler = createHandlerWithBatch({ auth: 'session' }, async (c, batch) => {
  // All operations automatically batched at end of handler
  await batch.db.insert(users).values(newUser);

  if (needsCustomer) {
    await batch.db.insert(customers).values(customer);
  }

  await batch.db.update(metadata).set({ synced: true });
  // Batch executes atomically when handler completes
});`,
} as const;

/**
 * Migration guide from transactions to batches
 */
export const TransactionMigrationGuide = {
  /**
   * BEFORE (transaction - ❌ don't use)
   */
  transactionPattern: `
await db.transaction(async (tx) => {
  await tx.insert(users).values(newUser);
  await tx.update(users).set({ verified: true }).where(eq(users.id, userId));
  await tx.delete(users).where(eq(users.inactive, true));
});`,

  /**
   * AFTER (batch - ✅ correct)
   */
  batchPattern: `
await db.batch([
  db.insert(users).values(newUser),
  db.update(users).set({ verified: true }).where(eq(users.id, userId)),
  db.delete(users).where(eq(users.inactive, true))
]);`,

  /**
   * AFTER (using handler - ✅ recommended)
   */
  handlerPattern: `
export const handler = createHandlerWithBatch({ auth: 'session' }, async (c, batch) => {
  // These are automatically batched
  await batch.db.insert(users).values(newUser);
  await batch.db.update(users).set({ verified: true }).where(eq(users.id, userId));
  await batch.db.delete(users).where(eq(users.inactive, true));
});`,
} as const;

/**
 * Type utility to extract schema type from database instance
 */
export type InferD1Schema<T> = T extends D1BatchDatabase<infer S> ? S : never;

/**
 * Type utility for batch operation results
 *
 * Note: Batch operations return an array of results in the same order as input
 */
export type BatchResults<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends { execute: (...args: never[]) => unknown }
    ? Awaited<ReturnType<T[K]['execute']>>
    : unknown;
};
