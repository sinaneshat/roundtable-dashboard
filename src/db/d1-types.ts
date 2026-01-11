/**
 * Cloudflare D1 Type Definitions - Batch-First Architecture
 *
 * These type definitions enforce batch-based patterns by making transaction
 * methods unavailable at the type level, preventing accidental usage.
 */

import type { DrizzleD1Database } from 'drizzle-orm/d1';

export type D1BatchDatabase<TSchema extends Record<string, unknown> = Record<string, never>>
  = Omit<DrizzleD1Database<TSchema>, 'transaction'> & {
    transaction: never;
  };

export type BatchableOperation<TSchema extends Record<string, unknown> = Record<string, never>>
  = | ReturnType<DrizzleD1Database<TSchema>['insert']>
    | ReturnType<DrizzleD1Database<TSchema>['update']>
    | ReturnType<DrizzleD1Database<TSchema>['delete']>
    | ReturnType<DrizzleD1Database<TSchema>['select']>;

export const D1BatchPatterns = {
  insertAndUpdate: `
await db.batch([
  db.insert(customers).values(newCustomer).returning(),
  db.update(users).set({ hasCustomer: true }).where(eq(users.id, userId))
]);`,

  multipleInserts: `
await db.batch([
  db.insert(subscriptions).values(newSub),
  db.insert(invoices).values(newInvoice),
  db.insert(webhookEvents).values(eventLog)
]);`,

  insertWithUpsert: `
await db.batch([
  db.insert(customers).values(customer).onConflictDoUpdate({
    target: customers.id,
    set: { email: customer.email, updatedAt: new Date() }
  }),
  db.insert(subscriptions).values(subscription)
]);`,

  conditionalBatch: `
const handler = createHandlerWithBatch({ auth: 'session' }, async (c, batch) => {
  await batch.db.insert(users).values(newUser);

  if (needsCustomer) {
    await batch.db.insert(customers).values(customer);
  }

  await batch.db.update(metadata).set({ synced: true });
});`,
} as const;

export const TransactionMigrationGuide = {
  transactionPattern: `
await db.transaction(async (tx) => {
  await tx.insert(users).values(newUser);
  await tx.update(users).set({ verified: true }).where(eq(users.id, userId));
  await tx.delete(users).where(eq(users.inactive, true));
});`,

  batchPattern: `
await db.batch([
  db.insert(users).values(newUser),
  db.update(users).set({ verified: true }).where(eq(users.id, userId)),
  db.delete(users).where(eq(users.inactive, true))
]);`,

  handlerPattern: `
export const handler = createHandlerWithBatch({ auth: 'session' }, async (c, batch) => {
  await batch.db.insert(users).values(newUser);
  await batch.db.update(users).set({ verified: true }).where(eq(users.id, userId));
  await batch.db.delete(users).where(eq(users.inactive, true));
});`,
} as const;

export type InferD1Schema<T> = T extends D1BatchDatabase<infer S> ? S : never;

export type BatchResults<T extends readonly unknown[]> = {
  [K in keyof T]: T[K] extends { execute: (...args: never[]) => unknown }
    ? Awaited<ReturnType<T[K]['execute']>>
    : unknown;
};
