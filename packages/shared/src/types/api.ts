/**
 * Shared API Types
 *
 * Common API types shared between packages.
 * All types follow the Zod-first pattern: schemas define runtime validation, types inferred via z.infer.
 *
 * NOTE: AppType should be imported directly from @roundtable/api
 * to enable proper RPC type inference with Hono client.
 */

import { z } from '@hono/zod-openapi';

import { ErrorDetailsSchema } from '../validation';

// ============================================================================
// API ERROR RESPONSE
// ============================================================================

export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    message: z.string(),
    code: z.string().optional(),
    details: ErrorDetailsSchema.optional(),
  }).strict(),
}).strict().openapi({
  description: 'API error response',
  example: {
    success: false,
    error: {
      message: 'Resource not found',
      code: 'NOT_FOUND',
    },
  },
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// ============================================================================
// API SUCCESS RESPONSE
// ============================================================================

export function createApiSuccessSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  }).strict().openapi({
    description: 'Successful API response',
  });
}

export type ApiSuccess<T> = {
  success: true;
  data: T;
};

// ============================================================================
// API RESPONSE (Union Type)
// ============================================================================

export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.union([
    createApiSuccessSchema(dataSchema),
    ApiErrorSchema,
  ]);
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ============================================================================
// PAGINATED RESPONSE
// ============================================================================

export function createPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    hasMore: z.boolean(),
  }).strict().openapi({
    description: 'Paginated response with offset-based pagination',
  });
}

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

// ============================================================================
// CURSOR PAGINATED RESPONSE
// ============================================================================

export function createCursorPaginatedResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    nextCursor: z.string().nullable(),
    hasMore: z.boolean(),
  }).strict().openapi({
    description: 'Paginated response with cursor-based pagination',
  });
}

export type CursorPaginatedResponse<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
};
