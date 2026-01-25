import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';

/** Valid D1 parameter types for prepared statements */
type D1Parameter = string | number | boolean | null | ArrayBuffer;

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
