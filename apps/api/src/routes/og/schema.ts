/**
 * OG Image Route Schemas
 *
 * Zod schemas for OG image generation endpoint.
 * @see /docs/backend-patterns.md - Schema conventions
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// REQUEST SCHEMAS
// ============================================================================

/**
 * Query params for /og/chat endpoint
 */
export const OgChatQuerySchema = z.object({
  slug: z.string().min(1).openapi({
    description: 'Thread slug to generate OG image for',
    example: 'brainstorming-startup-ideas-abc123',
  }),
  v: z.string().optional().openapi({
    description: 'Cache version hash (optional, for cache busting)',
    example: 'a1b2c3d4',
  }),
}).openapi('OgChatQuery');

export type OgChatQuery = z.infer<typeof OgChatQuerySchema>;
