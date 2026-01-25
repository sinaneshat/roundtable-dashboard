/**
 * Shared Validation Schemas
 *
 * Zod schemas used by both API and web packages.
 */

import * as z from 'zod';

// Import billing schemas from enums (single source of truth)
import { BillingIntervalSchema } from '../enums/billing';

// ============================================================================
// CHAT METADATA SCHEMAS - Re-exported for convenience
// ============================================================================

export * from './chat-metadata';

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
}).strict();

export type ValidationError = z.infer<typeof ValidationErrorSchema>;

/**
 * Validation error details for error responses
 * Wraps array of validation errors
 */
export const ValidationErrorDetailsSchema = z.object({
  validationErrors: z.array(ValidationErrorSchema).optional(),
}).strict();

export type ValidationErrorDetails = z.infer<typeof ValidationErrorDetailsSchema>;

// ============================================================================
// PAGINATION SCHEMAS
// ============================================================================

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
}).strict();

export const SortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const DateRangeSchema = z.object({
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
}).strict();

// ============================================================================
// API RESPONSE SCHEMAS (for client-side parsing)
// ============================================================================

/**
 * Standard API success response wrapper
 */
export function ApiSuccessResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
    meta: z.object({
      requestId: z.string().optional(),
      timestamp: z.string().optional(),
    }).strict().optional(),
  }).strict();
}

/**
 * Error details schema - structured error context
 * Single source of truth for error details record type
 */
export const ErrorDetailsSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]));

export type ErrorDetails = z.infer<typeof ErrorDetailsSchema>;

/**
 * Standard API error response wrapper
 */

export const ApiErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    validation: z.array(ValidationErrorSchema).optional(),
    details: ErrorDetailsSchema.optional(),
  }).strict(),
  meta: z.object({
    requestId: z.string().optional(),
    timestamp: z.string().optional(),
  }).strict().optional(),
}).strict();

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
}).strict();

export type ProductVariant = z.infer<typeof ProductVariantSchema>;

// Type exports
export type Pagination = z.infer<typeof PaginationSchema>;
export type CursorPagination = z.infer<typeof CursorPaginationSchema>;
export type SortOrder = z.infer<typeof SortOrderSchema>;
export type DateRange = z.infer<typeof DateRangeSchema>;
