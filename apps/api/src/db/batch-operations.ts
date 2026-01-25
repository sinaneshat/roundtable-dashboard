import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';

/** Valid D1 parameter types for prepared statements */
type D1Parameter = string | number | boolean | null | ArrayBuffer;

/** D1 has a hard limit of 100 bound parameters per query */
const D1_MAX_PARAMETERS = 100;

/**
 * Execute multiple D1 operations atomically using batch.
 * D1 batch operations are more efficient than individual queries.
 *
 * @typeParam TResult - The expected row type. Must be explicitly provided
 *   or inferred from context. No default is provided to enforce type safety.
 * @see https://developers.cloudflare.com/d1/build-with-d1/batch-operations/
 *
 * @example
 * interface User { id: string; name: string; }
 * const results = await executeBatch<User>(db, [stmt1, stmt2]);
 */
export async function executeBatch<TResult>(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<D1Result<TResult>[]> {
  if (statements.length === 0) {
    return [];
  }
  const results = await db.batch<TResult>(statements);
  return results;
}

/**
 * Helper to create a prepared statement
 */
export function prepareStatement(
  db: D1Database,
  query: string,
  ...params: D1Parameter[]
): D1PreparedStatement {
  return db.prepare(query).bind(...params);
}

/**
 * Calculate safe chunk size for D1 bulk inserts.
 * D1 has 100-parameter limit; chunk size = floor(100 / columns).
 *
 * @param columnCount - Number of columns in the insert
 * @returns Max rows per insert to stay under 100 params
 *
 * @example
 * const chunkSize = getD1ChunkSize(13); // 7 rows for 13-column table
 */
export function getD1ChunkSize(columnCount: number): number {
  if (columnCount <= 0)
    return 1;
  return Math.max(1, Math.floor(D1_MAX_PARAMETERS / columnCount));
}

/**
 * Chunk array for D1 bulk inserts to avoid 100-parameter limit.
 * Use with Drizzle: for (const chunk of chunkForD1Insert(items, 13)) { await db.insert(table).values(chunk); }
 *
 * @param items - Array of items to insert
 * @param columnCount - Number of columns in the table
 * @returns Generator yielding safe-sized chunks
 *
 * @example
 * // projectMemory has 13 columns, yields chunks of 7 rows max
 * for (const chunk of chunkForD1Insert(memories, 13)) {
 *   await db.insert(tables.projectMemory).values(chunk);
 * }
 */
export function* chunkForD1Insert<T>(items: T[], columnCount: number): Generator<T[]> {
  if (items.length === 0)
    return;

  const chunkSize = getD1ChunkSize(columnCount);
  for (let i = 0; i < items.length; i += chunkSize) {
    yield items.slice(i, i + chunkSize);
  }
}
