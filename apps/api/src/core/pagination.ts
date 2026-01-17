/**
 * Unified Pagination System
 *
 * Single source of truth for all pagination logic in the API layer.
 * Consolidates cursor-based and offset-based pagination patterns.
 *
 * Features:
 * - Cursor-based pagination (for infinite scroll)
 * - Page-based pagination (for traditional pagination)
 * - Drizzle ORM integration
 * - Type-safe Zod schemas
 * - Consistent response formats
 *
 * Philosophy:
 * - Leverage Drizzle First: Use Drizzle's .limit(), .offset(), .orderBy() methods directly
 * - Convenience Wrappers: Helpers here provide convenience for common patterns (e.g., timestamp cursors)
 * - Official Patterns: withPagination() follows Drizzle's recommended .$dynamic() approach
 *
 * @see https://orm.drizzle.team/docs/guides/limit-offset-pagination
 * @see https://orm.drizzle.team/docs/guides/cursor-based-pagination
 * @see https://orm.drizzle.team/docs/dynamic-query-building
 */

import type { SortDirection } from '@roundtable/shared/enums';
import { SortDirections, SortDirectionSchema } from '@roundtable/shared/enums';
import type { AnyColumn, SQL } from 'drizzle-orm';
import { and, asc, desc, gt, lt } from 'drizzle-orm';
import { z } from 'zod';

import { API } from '@/constants';

// ============================================================================
// PAGINATION CONSTANTS
// ============================================================================

/**
 * Default number of items per page
 * @constant
 */
export const DEFAULT_PAGE_SIZE = API.DEFAULT_PAGE_SIZE;

/**
 * Maximum number of items allowed per page
 * @constant
 */
export const MAX_PAGE_SIZE = API.MAX_PAGE_SIZE;

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

/**
 * Cursor-based pagination query parameters
 * Optimized for infinite scroll and React Query
 */
export const CursorPaginationQuerySchema = z.object({
  cursor: z.string().optional().openapi({
    description: 'Cursor for pagination (ISO timestamp or ID)',
    example: '2024-01-15T10:30:00Z',
  }),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).openapi({
    description: `Maximum number of items to return (max ${MAX_PAGE_SIZE})`,
    example: DEFAULT_PAGE_SIZE,
  }),
}).openapi('CursorPaginationQuery');

/**
 * Page-based pagination query parameters
 */
export const OffsetPaginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({
    example: 1,
    description: 'Page number (1-based)',
  }),
  limit: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE).openapi({
    example: DEFAULT_PAGE_SIZE,
    description: `Results per page (max ${MAX_PAGE_SIZE})`,
  }),
}).openapi('OffsetPaginationQuery');

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Cursor Field Configuration schema
 * Defines which field to use as cursor and its sort direction
 */
export const CursorFieldConfigSchema = z.object({
  field: z.string(),
  direction: SortDirectionSchema,
});

export type CursorFieldConfig = z.infer<typeof CursorFieldConfigSchema>;

/**
 * Page-based pagination parameters schema
 */
export const PagePaginationParamsSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

export type PagePaginationParams = z.infer<typeof PagePaginationParamsSchema>;

/**
 * Page-based pagination metadata schema
 */
export const PagePaginationMetadataSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pages: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  hasPrev: z.boolean(),
});

export type PagePaginationMetadata = z.infer<typeof PagePaginationMetadataSchema>;

/**
 * Cursor-based pagination metadata schema
 */
export const CursorPaginationMetadataSchema = z.object({
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  count: z.number().int().nonnegative(),
});

export type CursorPaginationMetadata = z.infer<typeof CursorPaginationMetadataSchema>;

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
 *   limit: limit + 1,
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
  const hasMore = items.length > limit;
  const paginatedItems = hasMore ? items.slice(0, limit) : items;
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
 * Convenience wrapper around Drizzle's gt/lt operators for cursor pagination.
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
 * // Using this helper (good for timestamps)
 * const whereClause = buildCursorWhere(
 *   chatThread.createdAt,
 *   query.cursor,
 *   'desc'
 * );
 *
 * // Using Drizzle directly (recommended for IDs)
 * import { gt } from 'drizzle-orm';
 * .where(cursor ? gt(users.id, cursor) : undefined)
 * ```
 *
 * @see https://orm.drizzle.team/docs/guides/cursor-based-pagination
 */
export function buildCursorWhere(
  cursorColumn: AnyColumn,
  cursor: string | undefined,
  direction: SortDirection,
): SQL | undefined {
  if (!cursor) {
    return undefined;
  }

  const cursorDate = new Date(cursor);
  return direction === SortDirections.DESC ? lt(cursorColumn, cursorDate) : gt(cursorColumn, cursorDate);
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
  direction: SortDirection,
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
  direction: SortDirection,
): SQL {
  return direction === SortDirections.DESC ? desc(cursorColumn) : asc(cursorColumn);
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
 * const offset = (page - 1) * limit;
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
 * @param maxLimit - Maximum allowed limit (default: MAX_PAGE_SIZE)
 * @returns Validation result with sanitized values
 *
 * @example
 * ```typescript
 * const validation = validatePageParams(0, 1000, MAX_PAGE_SIZE);
 * if (!validation.valid) {
 *   return Responses.badRequest(c, validation.error);
 * }
 * const { page, limit } = validation;
 * ```
 */
export function validatePageParams(
  page: number,
  limit: number,
  maxLimit = MAX_PAGE_SIZE,
): { valid: true; page: number; limit: number } | { valid: false; error: string } {
  if (!Number.isInteger(page) || page < 1) {
    return {
      valid: false,
      error: 'Page must be a positive integer',
    };
  }

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
 * Drizzle query builder type with pagination methods
 */
type DrizzleQueryBuilder<T> = {
  limit: (limit: number) => T;
  offset: (offset: number) => T;
  orderBy: (...columns: (AnyColumn | SQL)[]) => T;
};

/**
 * Drizzle's official $dynamic() pattern for reusable pagination
 *
 * This helper follows Drizzle ORM's recommended approach using .$dynamic()
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
 * import { withPagination } from '@/core';
 *
 * // Recommended: Use Drizzle's $dynamic() pattern
 * const query = db.select().from(users).$dynamic();
 * const paginatedQuery = withPagination(query, asc(users.id), 2, 20);
 * const results = await paginatedQuery;
 *
 * // Also works with relational queries
 * const relationalQuery = db.query.users.findMany().$dynamic();
 * const paginated = withPagination(relationalQuery, asc(users.createdAt), 1, 10);
 * ```
 *
 * @see https://orm.drizzle.team/docs/guides/limit-offset-pagination
 * @see https://orm.drizzle.team/docs/dynamic-query-building
 */
export function withPagination<T extends DrizzleQueryBuilder<T>>(
  qb: T,
  orderByColumn: AnyColumn | SQL,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE,
): T {
  return qb
    .orderBy(orderByColumn)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type CursorPaginationQuery = z.infer<typeof CursorPaginationQuerySchema>;
export type OffsetPaginationQuery = z.infer<typeof OffsetPaginationQuerySchema>;
