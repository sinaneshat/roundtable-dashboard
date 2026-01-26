/**
 * OG Image Routes
 *
 * OpenAPI route definitions for OG image generation.
 * @see /docs/backend-patterns.md - Route conventions
 */

import { createRoute, z } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { createPublicRouteResponses } from '@/core';

import { OgChatQuerySchema } from './schema';

/**
 * GET /og/chat - Generate OG image for public thread
 *
 * Returns a dynamically generated PNG image for social media sharing.
 * Public endpoint - no authentication required.
 */
export const ogChatRoute = createRoute({
  description: 'Generates a dynamic Open Graph image for a publicly shared thread. Returns PNG image directly.',
  method: 'get',
  path: '/og/chat',
  request: {
    query: OgChatQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      content: {
        'image/png': {
          // ✅ JUSTIFIED: Binary responses cannot be validated by Zod at runtime.
          // OpenAPI spec requires schema; using string+binary format for documentation.
          schema: z.string().openapi({
            description: 'PNG image binary data',
            format: 'binary',
          }),
        },
      },
      description: 'OG image generated successfully (returns fallback for missing/private threads)',
      headers: z.object({
        'Cache-Control': z.string(),
        'Content-Type': z.literal('image/png'),
        'X-OG-Cache': z.enum(['HIT', 'MISS']),
      }),
    },
    ...createPublicRouteResponses(),
  },
  summary: 'Generate OG image for public thread',
  tags: ['og'],
});
