import type { AnyColumn, SQL } from 'drizzle-orm';
import { and, asc, desc, gt, lt } from 'drizzle-orm';

/**
 * Cursor Pagination Direction
 * Determines whether we're paginating forward or backward
 */
export type CursorDirection = 'forward' | 'backward';

/**
 * Cursor Field Configuration
 * Defines which field to use as cursor and its sort direction
 */
export type CursorFieldConfig = {
  /** Field name to use as cursor (e.g., 'createdAt', 'id') */
  field: string;
  /** Sort direction for the cursor field */
  direction: 'asc' | 'desc';
};

/**
 * Apply cursor-based pagination to query results
 *
 * This is the main utility function for implementing cursor pagination.
 * It determines if there are more items and extracts the next cursor.
 *
 * @template T - The item type
 * @param items - Array of items from database query (should fetch limit + 1)
 * @param limit - Maximum number of items to return
 * @param getCursor - Function to extract cursor value from an item
 * @returns Cursor-paginated response with items and pagination metadata
 *
 * @example
 * ```typescript
 * const threads = await db.query.chatThread.findMany({
 *   where: buildCursorWhere(chatThread.createdAt, cursor, 'desc'),
 *   orderBy: desc(chatThread.createdAt),
 *   limit: limit + 1, // Fetch one extra to check hasMore
 * });
 *
 * return applyCursorPagination(
 *   threads,
 *   limit,
 *   (thread) => thread.createdAt.toISOString()
 * );
 * ```
 */
export function applyCursorPagination<T>(
  items: T[],
  limit: number,
  getCursor: (item: T) => string,
) {
  // Check if there are more items beyond the requested limit
  const hasMore = items.length > limit;

  // Take only the requested number of items
  const paginatedItems = hasMore ? items.slice(0, limit) : items;

  // Extract next cursor from the last item (if exists)
  const nextCursor = hasMore && paginatedItems.length > 0 ? getCursor(paginatedItems[paginatedItems.length - 1]!) : null;

  return {
    items: paginatedItems,
    pagination: {
      nextCursor,
      hasMore,
      count: paginatedItems.length,
    },
  };
}

/**
 * Build Drizzle ORM where clause for cursor-based pagination
 *
 * Creates a SQL condition for cursor pagination queries.
 * Handles both ascending and descending sort orders.
 *
 * @param cursorColumn - Drizzle column to use for cursor comparison
 * @param cursor - Current cursor value (optional)
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns SQL where clause for Drizzle query
 *
 * @example
 * ```typescript
 * // For descending order (newest first)
 * const whereClause = buildCursorWhere(
 *   chatThread.createdAt,
 *   query.cursor,
 *   'desc'
 * );
 *
 * // For ascending order (oldest first)
 * const whereClause = buildCursorWhere(
 *   chatMemory.createdAt,
 *   query.cursor,
 *   'asc'
 * );
 * ```
 */
export function buildCursorWhere(
  cursorColumn: AnyColumn,
  cursor: string | undefined,
  direction: 'asc' | 'desc',
): SQL | undefined {
  if (!cursor) {
    return undefined;
  }

  // Parse cursor string into Date for timestamp columns
  // Cursor is ISO timestamp string like "2025-10-06T19:43:09.000Z"
  const cursorDate = new Date(cursor);

  // For descending order: get items less than cursor (older items)
  // For ascending order: get items greater than cursor (newer items)
  return direction === 'desc' ? lt(cursorColumn, cursorDate) : gt(cursorColumn, cursorDate);
}

/**
 * Build complete Drizzle ORM where clause for cursor pagination with additional filters
 *
 * Combines cursor-based pagination with additional filter conditions.
 * Useful when you need to filter by user, status, etc. along with cursor pagination.
 *
 * @param cursorColumn - Drizzle column to use for cursor comparison
 * @param cursor - Current cursor value (optional)
 * @param direction - Sort direction ('asc' or 'desc')
 * @param additionalFilters - Additional SQL conditions to combine with cursor
 * @returns Combined SQL where clause for Drizzle query
 *
 * @example
 * ```typescript
 * const whereClause = buildCursorWhereWithFilters(
 *   chatThread.createdAt,
 *   query.cursor,
 *   'desc',
 *   [eq(chatThread.userId, userId)]
 * );
 * ```
 */
export function buildCursorWhereWithFilters(
  cursorColumn: AnyColumn,
  cursor: string | undefined,
  direction: 'asc' | 'desc',
  additionalFilters: SQL[] = [],
): SQL | undefined {
  const cursorWhere = buildCursorWhere(cursorColumn, cursor, direction);

  const allConditions = [...additionalFilters];
  if (cursorWhere) {
    allConditions.push(cursorWhere);
  }

  return allConditions.length > 0 ? and(...allConditions) : undefined;
}

/**
 * Get order by clause for cursor pagination
 *
 * Creates the appropriate Drizzle orderBy clause based on direction.
 * This ensures consistent ordering for cursor-based pagination.
 *
 * @param cursorColumn - Drizzle column to use for ordering
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns Drizzle orderBy clause
 *
 * @example
 * ```typescript
 * const orderBy = getCursorOrderBy(chatThread.createdAt, 'desc');
 * ```
 */
export function getCursorOrderBy(
  cursorColumn: AnyColumn,
  direction: 'asc' | 'desc',
): SQL {
  return direction === 'desc' ? desc(cursorColumn) : asc(cursorColumn);
}

/**
 * Helper to create cursor from timestamp
 *
 * Converts a Date object to ISO string for use as cursor.
 * This is the most common cursor format for timestamp-based pagination.
 *
 * @param date - Date object to convert
 * @returns ISO string cursor
 *
 * @example
 * ```typescript
 * const cursor = createTimestampCursor(thread.createdAt);
 * ```
 */
export function createTimestampCursor(date: Date): string {
  return date.toISOString();
}
