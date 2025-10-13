import type { z } from '@hono/zod-openapi';

import { CoreSchemas } from '@/api/core/schemas';
import { userSelectSchema } from '@/db/validation/auth';

/**
 * ✅ REUSE: Better Auth user schema from database validation
 * Extended with OpenAPI metadata for API documentation
 * Used for /auth/me endpoint response
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
  .extend({
    userId: CoreSchemas.id().openapi({
      example: 'cm4abc123def456ghi',
      description: 'Better Auth user identifier (alias for id)',
    }),
  })
  .transform(data => ({
    // Map 'id' to 'userId' for API response compatibility
    userId: data.id,
    email: data.email,
    name: data.name,
    emailVerified: data.emailVerified,
    image: data.image,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  }))
  .openapi('SecureMePayload');

// Export for handler type inference
export type SecureMePayload = z.infer<typeof SecureMePayloadSchema>;
