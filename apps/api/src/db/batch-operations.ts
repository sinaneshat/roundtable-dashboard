import type { D1Database, D1PreparedStatement, D1Result } from '@cloudflare/workers-types';

/**
 * Execute multiple D1 operations atomically using batch
 * D1 batch operations are more efficient than individual queries
 * @see https://developers.cloudflare.com/d1/build-with-d1/batch-operations/
 */
export async function executeBatch<T extends D1Result<unknown>[]>(
  db: D1Database,
  statements: D1PreparedStatement[],
): Promise<T> {
  if (statements.length === 0) {
    return [] as unknown as T;
  }
  const results = await db.batch(statements);
  return results as T;
}

/**
 * Helper to create a prepared statement
 */
export function prepareStatement(
  db: D1Database,
  query: string,
  ...params: unknown[]
): D1PreparedStatement {
  return db.prepare(query).bind(...params);
}
