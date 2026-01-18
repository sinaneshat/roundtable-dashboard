/**
 * OG Image Routes
 *
 * Dynamic Open Graph image generation for chat threads.
 * Returns PNG images with CDN cache headers.
 */

import { createRoute } from '@hono/zod-openapi';
import * as HttpStatusCodes from 'stoker/http-status-codes';

import { OgImageQuerySchema } from './schema';

export const ogImageRoute = createRoute({
  method: 'get',
  path: '/og/chat',
  tags: ['system'],
  summary: 'Generate OG image for chat thread',
  description: 'Dynamically generates Open Graph image for chat threads using satori. Returns PNG with CDN cache headers.',
  request: {
    query: OgImageQuerySchema,
  },
  responses: {
    [HttpStatusCodes.OK]: {
      description: 'PNG image generated successfully',
      content: {
        'image/png': {
          schema: {
            type: 'string',
            format: 'binary',
          },
        },
      },
    },
  },
});
