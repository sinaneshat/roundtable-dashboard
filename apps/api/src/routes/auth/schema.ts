import { z } from '@hono/zod-openapi';

import { userSelectSchema } from '@/db/validation/auth';

/**
 * ✅ REUSE: Better Auth user schema from database validation
 * Picks only authenticated user fields for /auth/me endpoint response
 * Extended with OpenAPI metadata for API documentation
 *
 * NO TRANSFORMS: Handler serializes data, schema only validates
 * Fields: id, email, name, emailVerified, image, createdAt, updatedAt
 * Use for: /auth/me endpoint, user dashboards, account settings
 */
export const SecureMePayloadSchema = userSelectSchema
  .pick({
    id: true,
    email: true,
    name: true,
    emailVerified: true,
    image: true,
    createdAt: true,
    updatedAt: true,
  })
  .openapi('SecureMePayload');

/**
 * API response type
 * Note: Date objects are automatically serialized to ISO strings by Hono/JSON.stringify
 */
export type SecureMePayload = z.infer<typeof SecureMePayloadSchema>;

/**
 * Clear own cache response schema
 * For users to clear their own server-side caches on logout/session change
 */
export const ClearOwnCachePayloadSchema = z.object({
  cleared: z.boolean().openapi({
    example: true,
    description: 'Whether cache was cleared successfully',
  }),
}).openapi('ClearOwnCachePayload');

export type ClearOwnCachePayload = z.infer<typeof ClearOwnCachePayloadSchema>;
