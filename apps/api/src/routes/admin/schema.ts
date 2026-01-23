import { z } from '@hono/zod-openapi';

/**
 * Admin user search request schema
 * Supports partial matching by name or email (min 3 chars)
 */
export const AdminSearchUserQuerySchema = z.object({
  q: z.string().min(3).max(100).openapi({
    example: 'john',
    description: 'Search query - matches against user name or email (min 3 characters)',
  }),
  limit: z.coerce.number().min(1).max(10).default(5).optional().openapi({
    example: 5,
    description: 'Maximum number of results to return (default: 5, max: 10)',
  }),
}).openapi('AdminSearchUserQuery');

export type AdminSearchUserQuery = z.infer<typeof AdminSearchUserQuerySchema>;

/**
 * Single user result schema
 */
export const AdminSearchUserResultSchema = z.object({
  id: z.string().openapi({
    example: 'cm4abc123',
    description: 'User identifier',
  }),
  email: z.string().email().openapi({
    example: 'user@example.com',
    description: 'User email address',
  }),
  name: z.string().openapi({
    example: 'John Doe',
    description: 'User display name',
  }),
  image: z.string().nullable().openapi({
    example: 'https://example.com/avatar.jpg',
    description: 'User avatar URL',
  }),
}).openapi('AdminSearchUserResult');

export type AdminSearchUserResult = z.infer<typeof AdminSearchUserResultSchema>;

/**
 * Admin user search response payload schema
 * Returns array of matching users
 */
export const AdminSearchUserPayloadSchema = z.object({
  users: z.array(AdminSearchUserResultSchema).openapi({
    description: 'List of matching users',
  }),
  total: z.number().openapi({
    example: 3,
    description: 'Total number of matches found',
  }),
}).openapi('AdminSearchUserPayload');

export type AdminSearchUserPayload = z.infer<typeof AdminSearchUserPayloadSchema>;

/**
 * Admin clear user cache request schema
 * Clears all server-side caches for a user (for impersonation)
 */
export const AdminClearUserCacheBodySchema = z.object({
  userId: z.string().min(1).openapi({
    example: 'cm4abc123',
    description: 'User ID to clear caches for',
  }),
}).openapi('AdminClearUserCacheBody');

export type AdminClearUserCacheBody = z.infer<typeof AdminClearUserCacheBodySchema>;

/**
 * Admin clear user cache response payload schema
 */
export const AdminClearUserCachePayloadSchema = z.object({
  cleared: z.boolean().openapi({
    example: true,
    description: 'Whether cache was cleared successfully',
  }),
}).openapi('AdminClearUserCachePayload');

export type AdminClearUserCachePayload = z.infer<typeof AdminClearUserCachePayloadSchema>;
