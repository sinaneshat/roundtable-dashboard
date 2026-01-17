/**
 * Shared Validation Schemas
 *
 * Zod schemas used by both API and web packages.
 */

import { z } from 'zod';

// Import billing schemas from enums (single source of truth)
import { BillingIntervalSchema } from '../enums/billing';

// ============================================================================
// VALIDATION ERROR SCHEMAS
// ============================================================================

/**
 * Single validation error structure
 * Used in error responses and validation logging
 */
export const ValidationErrorSchema = z.object({
  field: z.string(),
  message: z.string(),
  code: z.string().optional(),
});

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

/**
 * Validation error details for error responses
 * Wraps array of validation errors
 */
export const ValidationErrorDetailsSchema = z.object({
  validationErrors: z.array(ValidationErrorSchema).optional(),
});

export type ValidationErrorDetails = z.infer<typeof ValidationErrorDetailsSchema>;

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const SortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const DateRangeSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
});

// ============================================================================
// API RESPONSE SCHEMAS (for client-side parsing)
// ============================================================================

/**
 * Standard API success response wrapper
 */
export const ApiSuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      requestId: z.string().optional(),
      timestamp: z.string().optional(),
    }).optional(),
  });

/**
 * Standard API error response wrapper
 */
export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    validation: z.array(ValidationErrorSchema).optional(),
    details: z.unknown().optional(),
  }),
  meta: z.object({
    requestId: z.string().optional(),
    timestamp: z.string().optional(),
  }).optional(),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// ============================================================================
// PRODUCT AND BILLING SCHEMAS
// ============================================================================

/**
 * Product variant schema (shared between API and client)
 * Uses BillingIntervalSchema imported from enums/billing
 */
export const ProductVariantSchema = z.object({
  id: z.string(),
  priceId: z.string(),
  price: z.number(),
  interval: BillingIntervalSchema,
  currency: z.string().default('usd'),
});

export type ProductVariant = z.infer<typeof ProductVariantSchema>;

// Type exports
export type Pagination = z.infer<typeof PaginationSchema>;
export type CursorPagination = z.infer<typeof CursorPaginationSchema>;
export type SortOrder = z.infer<typeof SortOrderSchema>;
export type DateRange = z.infer<typeof DateRangeSchema>;
