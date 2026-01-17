/**
 * Mutation Retry Type Schemas
 *
 * Zod-first schemas for mutation error handling
 * Following the type-inference-patterns.md pattern
 */

import { z } from 'zod';

/**
 * Error with HTTP status code
 * Used for retry logic based on status codes
 */
export const ErrorWithStatusSchema = z.object({
  message: z.string(),
  name: z.string(),
  stack: z.string().optional(),
  status: z.number().int().min(100).max(599),
});

export type ErrorWithStatus = z.infer<typeof ErrorWithStatusSchema>;

/**
 * Type guard for ErrorWithStatus
 * ✅ TYPE-SAFE: Uses in-operator for type narrowing without Record<string, unknown> cast
 */
export function isErrorWithStatus(error: Error): error is ErrorWithStatus {
  return 'status' in error && typeof error.status === 'number';
}
