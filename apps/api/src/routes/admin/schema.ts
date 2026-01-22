import { z } from '@hono/zod-openapi';

import { CoreSchemas } from '@/core';

/**
 * Admin user search request schema
 */
export const AdminSearchUserQuerySchema = z.object({
  email: CoreSchemas.email().openapi({
    example: 'user@example.com',
    description: 'Email address to search for',
  }),
}).openapi('AdminSearchUserQuery');

export type AdminSearchUserQuery = z.infer<typeof AdminSearchUserQuerySchema>;

/**
 * Admin user search response payload schema
 */
export const AdminSearchUserPayloadSchema = z.object({
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
}).openapi('AdminSearchUserPayload');

export type AdminSearchUserPayload = z.infer<typeof AdminSearchUserPayloadSchema>;
