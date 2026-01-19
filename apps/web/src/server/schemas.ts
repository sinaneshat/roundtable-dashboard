/**
 * Zod validation schemas for server function inputs.
 * Used with @tanstack/zod-adapter for type-safe input validation.
 */
import { z } from 'zod';

/**
 * Schema for thread/resource slug parameter.
 * Validates slug format (lowercase alphanumeric with hyphens).
 */
export const slugSchema = z.string().min(1).max(255);

/**
 * Schema for thread/resource ID parameter.
 * Validates UUID format.
 */
export const threadIdSchema = z.string().uuid();

/**
 * Schema for generic string ID parameter.
 * Validates non-empty string with reasonable max length.
 */
export const idSchema = z.string().min(1).max(255);
