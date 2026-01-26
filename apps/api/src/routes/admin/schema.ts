import { z } from '@hono/zod-openapi';

/**
 * Admin user search request schema
 * Supports partial matching by name or email (min 3 chars)
 */
export const AdminSearchUserQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(10).default(5).optional().openapi({
    description: 'Maximum number of results to return (default: 5, max: 10)',
    example: 5,
  }),
  q: z.string().min(3).max(100).openapi({
    description: 'Search query - matches against user name or email (min 3 characters)',
    example: 'john',
  }),
}).openapi('AdminSearchUserQuery');

export type AdminSearchUserQuery = z.infer<typeof AdminSearchUserQuerySchema>;

/**
 * Single user result schema
 */
export const AdminSearchUserResultSchema = z.object({
  email: z.string().email().openapi({
    description: 'User email address',
    example: 'user@example.com',
  }),
  id: z.string().openapi({
    description: 'User identifier',
    example: 'cm4abc123',
  }),
  image: z.string().nullable().openapi({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
  }),
  name: z.string().openapi({
    description: 'User display name',
    example: 'John Doe',
  }),
}).openapi('AdminSearchUserResult');

export type AdminSearchUserResult = z.infer<typeof AdminSearchUserResultSchema>;

/**
 * Admin user search response payload schema
 * Returns array of matching users
 */
export const AdminSearchUserPayloadSchema = z.object({
  total: z.number().openapi({
    description: 'Total number of matches found',
    example: 3,
  }),
  users: z.array(AdminSearchUserResultSchema).openapi({
    description: 'List of matching users',
  }),
}).openapi('AdminSearchUserPayload');

export type AdminSearchUserPayload = z.infer<typeof AdminSearchUserPayloadSchema>;

/**
 * Admin clear user cache request schema
 * Clears all server-side caches for a user (for impersonation)
 */
export const AdminClearUserCacheBodySchema = z.object({
  userId: z.string().min(1).openapi({
    description: 'User ID to clear caches for',
    example: 'cm4abc123',
  }),
}).openapi('AdminClearUserCacheBody');

export type AdminClearUserCacheBody = z.infer<typeof AdminClearUserCacheBodySchema>;

/**
 * Admin clear user cache response payload schema
 */
export const AdminClearUserCachePayloadSchema = z.object({
  cleared: z.boolean().openapi({
    description: 'Whether cache was cleared successfully',
    example: true,
  }),
}).openapi('AdminClearUserCachePayload');

export type AdminClearUserCachePayload = z.infer<typeof AdminClearUserCachePayloadSchema>;
