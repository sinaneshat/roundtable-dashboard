/**
 * List Pagination Operation
 *
 * Higher-level wrapper around cursor pagination utilities.
 * Reduces boilerplate in list handlers.
 */

import type { SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';

import {
  applyCursorPagination,
  buildCursorWhereWithFilters,
  createTimestampCursor,
  getCursorOrderBy,
} from '@/core';

type AnyColumn = PgColumn | SQLiteColumn;

export type PaginationParams = {
  cursor?: string;
  limit: number;
};

export type PaginatedResult<T> = {
  items: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
  };
};

/**
 * Build paginated query options
 *
 * Returns where clause, orderBy, and limit for use with Drizzle query API.
 *
 * @example
 * ```ts
 * const { where, orderBy, limit } = buildPaginatedQueryOptions({
 *   timestampColumn: tables.chatProject.createdAt,
 *   cursor: query.cursor,
 *   limit: query.limit,
 *   filters: [eq(tables.chatProject.userId, user.id)],
 * });
 *
 * const items = await db.query.chatProject.findMany({
 *   where,
 *   orderBy,
 *   limit,
 * });
 * ```
 */
export function buildPaginatedQueryOptions<TColumn extends AnyColumn>(options: {
  timestampColumn: TColumn;
  cursor?: string;
  limit: number;
  direction?: 'asc' | 'desc';
  filters?: SQL[];
}): {
  where: SQL | undefined;
  orderBy: ReturnType<typeof getCursorOrderBy>;
  limit: number;
} {
  const { timestampColumn, cursor, limit, direction = 'desc', filters = [] } = options;

  return {
    where: buildCursorWhereWithFilters(timestampColumn, cursor, direction, filters),
    orderBy: getCursorOrderBy(timestampColumn, direction),
    limit: limit + 1,
  };
}

/**
 * Process paginated results with timestamp cursor
 *
 * @example
 * ```ts
 * const items = await db.query.chatProject.findMany({ ... });
 * const result = processPaginatedResults(items, query.limit, p => p.createdAt);
 * return Responses.cursorPaginated(c, result.items, result.pagination);
 * ```
 */
export function processPaginatedResults<T>(
  items: T[],
  limit: number,
  getTimestamp: (item: T) => Date,
): PaginatedResult<T> {
  return applyCursorPagination(
    items,
    limit,
    item => createTimestampCursor(getTimestamp(item)),
  );
}
