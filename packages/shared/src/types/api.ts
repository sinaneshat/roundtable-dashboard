/**
 * Shared API Types
 *
 * Common API types shared between packages.
 *
 * NOTE: AppType should be imported directly from @roundtable/api
 * to enable proper RPC type inference with Hono client.
 */

// Common API response types
export type ApiError = {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
};

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Pagination types
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type CursorPaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
