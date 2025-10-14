/**
 * Pagination Utilities for Drizzle ORM
 *
 * This module provides pagination helpers that work with Drizzle ORM's built-in capabilities.
 *
 * ## Philosophy
 * - **Leverage Drizzle First**: Use Drizzle's `.limit()`, `.offset()`, `.orderBy()` methods directly
 * - **Convenience Wrappers**: Helpers here provide convenience for common patterns (e.g., timestamp cursors)
 * - **Official Patterns**: `withPagination()` follows Drizzle's recommended `.$dynamic()` approach
 *
 * ## Drizzle ORM Built-in Features
 * Drizzle provides these pagination primitives out-of-the-box:
 * - `.limit(n)` - Limit number of results
 * - `.offset(n)` - Skip first n results
 * - `.orderBy(column)` - Order results
 * - `.$dynamic()` - Enable method chaining for reusable queries
 * - `gt()`, `lt()`, `gte()`, `lte()` - Comparison operators for cursors
 *
 * @see https://orm.drizzle.team/docs/guides/limit-offset-pagination
 * @see https://orm.drizzle.team/docs/guides/cursor-based-pagination
 * @see https://orm.drizzle.team/docs/dynamic-query-building
 */

import type { AnyColumn, SQL } from 'drizzle-orm';
import { and, asc, desc, gt, lt } from 'drizzle-orm';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

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
 * Page-based pagination parameters
 */
export type PagePaginationParams = {
  page: number;
  limit: number;
};

/**
 * Page-based pagination metadata
 */
export type PagePaginationMetadata = {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

/**
 * Cursor-based pagination metadata
 */
export type CursorPaginationMetadata = {
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
};

// ============================================================================
// CURSOR-BASED PAGINATION UTILITIES
// ============================================================================

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
 * Convenience wrapper around Drizzle's `gt`/`lt` operators for cursor pagination.
 * Handles timestamp parsing and direction logic.
 *
 * NOTE: You can also use Drizzle's operators directly for more control:
 * ```typescript
 * import { gt, lt } from 'drizzle-orm';
 *
 * // Direct Drizzle approach (recommended for simple cases)
 * .where(cursor ? gt(users.id, cursor) : undefined)
 * ```
 *
 * @param cursorColumn - Drizzle column to use for cursor comparison
 * @param cursor - Current cursor value (optional, ISO timestamp string for dates)
 * @param direction - Sort direction ('asc' or 'desc')
 * @returns SQL where clause for Drizzle query
 *
 * @example
 * ```typescript
 * // ✅ Using this helper (good for timestamps)
 * const whereClause = buildCursorWhere(
 *   chatThread.createdAt,
 *   query.cursor, // "2025-10-06T19:43:09.000Z"
 *   'desc'
 * );
 *
 * // ✅ Using Drizzle directly (recommended for IDs)
 * import { gt } from 'drizzle-orm';
 * .where(cursor ? gt(users.id, cursor) : undefined)
 * ```
 *
 * @see https://orm.drizzle.team/docs/guides/cursor-based-pagination
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

// ============================================================================
// PAGE-BASED PAGINATION UTILITIES
// ============================================================================

/**
 * Calculate page-based pagination metadata
 *
 * Creates complete pagination metadata including page counts and navigation flags.
 * Used for building paginated API responses.
 *
 * @param page - Current page number (1-based)
 * @param limit - Number of items per page
 * @param total - Total number of items in dataset
 * @returns Complete pagination metadata object
 *
 * @example
 * ```typescript
 * const metadata = calculatePageMetadata(2, 20, 150);
 * // Returns: {
 * //   page: 2,
 * //   limit: 20,
 * //   total: 150,
 * //   pages: 8,
 * //   hasNext: true,
 * //   hasPrev: true
 * // }
 * ```
 */
export function calculatePageMetadata(
  page: number,
  limit: number,
  total: number,
): PagePaginationMetadata {
  const pages = Math.ceil(total / limit);

  return {
    page,
    limit,
    total,
    pages,
    hasNext: page < pages,
    hasPrev: page > 1,
  };
}

/**
 * Apply page-based pagination to query results
 *
 * High-level utility that combines offset calculation and metadata generation.
 * Use this when you have the total count and want complete pagination info.
 *
 * @template T - The item type
 * @param items - Array of items for the current page
 * @param params - Pagination parameters (page, limit)
 * @param total - Total number of items in dataset
 * @returns Object with items and pagination metadata
 *
 * @example
 * ```typescript
 * // In a route handler
 * const { page, limit } = c.validated.query;
 * const offset = calculateOffset(page, limit);
 *
 * // Get total count
 * const [{ count }] = await db
 *   .select({ count: sql<number>`count(*)` })
 *   .from(users);
 *
 * // Get items for current page
 * const items = await db
 *   .select()
 *   .from(users)
 *   .limit(limit)
 *   .offset(offset);
 *
 * // Apply pagination
 * return applyPagePagination(items, { page, limit }, count);
 * ```
 */
export function applyPagePagination<T>(
  items: T[],
  params: PagePaginationParams,
  total: number,
) {
  return {
    items,
    pagination: calculatePageMetadata(params.page, params.limit, total),
  };
}

/**
 * Validate pagination parameters
 *
 * Ensures page and limit are within acceptable ranges.
 * Prevents negative pages, excessive page sizes, etc.
 *
 * @param page - Page number to validate
 * @param limit - Limit to validate
 * @param maxLimit - Maximum allowed limit (default: 100)
 * @returns Validation result with sanitized values
 *
 * @example
 * ```typescript
 * const validation = validatePageParams(0, 1000, 100);
 * if (!validation.valid) {
 *   return Responses.badRequest(c, validation.error);
 * }
 * const { page, limit } = validation;
 * ```
 */
export function validatePageParams(
  page: number,
  limit: number,
  maxLimit = 100,
): { valid: true; page: number; limit: number } | { valid: false; error: string } {
  // Validate page
  if (!Number.isInteger(page) || page < 1) {
    return {
      valid: false,
      error: 'Page must be a positive integer',
    };
  }

  // Validate limit
  if (!Number.isInteger(limit) || limit < 1) {
    return {
      valid: false,
      error: 'Limit must be a positive integer',
    };
  }

  if (limit > maxLimit) {
    return {
      valid: false,
      error: `Limit cannot exceed ${maxLimit}`,
    };
  }

  return {
    valid: true,
    page,
    limit,
  };
}

// ============================================================================
// DRIZZLE ORM PAGINATION HELPERS (Official Pattern)
// ============================================================================

/**
 * Drizzle's official $dynamic() pattern for reusable pagination
 *
 * This helper follows Drizzle ORM's recommended approach using `.$dynamic()`
 * to create type-safe, reusable pagination functions.
 *
 * @template T - Drizzle query builder type
 * @param qb - Drizzle query builder instance (must call .$dynamic() first)
 * @param orderByColumn - Column or SQL expression to order by
 * @param page - Page number (1-based)
 * @param pageSize - Number of items per page
 * @returns Modified query builder with pagination applied
 *
 * @example
 * ```typescript
 * import { asc } from 'drizzle-orm';
 * import { withPagination } from '@/api/core';
 *
 * // ✅ Recommended: Use Drizzle's $dynamic() pattern
 * const query = db.select().from(users).$dynamic();
 * const paginatedQuery = withPagination(query, asc(users.id), 2, 20);
 * const results = await paginatedQuery;
 *
 * // ✅ Also works with relational queries
 * const relationalQuery = db.query.users.findMany().$dynamic();
 * const paginated = withPagination(relationalQuery, asc(users.createdAt), 1, 10);
 * ```
 *
 * @see https://orm.drizzle.team/docs/guides/limit-offset-pagination
 * @see https://orm.drizzle.team/docs/dynamic-query-building
 */
export function withPagination<T extends { limit: (limit: number) => T; offset: (offset: number) => T; orderBy: (...columns: (AnyColumn | SQL)[]) => T }>(
  qb: T,
  orderByColumn: AnyColumn | SQL,
  page = 1,
  pageSize = 10,
): T {
  return qb
    .orderBy(orderByColumn)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}
