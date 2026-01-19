/**
 * OG Image Schema
 *
 * Request/response schemas for dynamic OG image generation.
 * Images are generated server-side using satori and returned as PNG buffers.
 */

import * as z from 'zod';

// Request query parameters
export const OgImageQuerySchema = z.object({
  slug: z.string().optional().describe('Thread slug for dynamic content'),
});

export type OgImageQuery = z.infer<typeof OgImageQuerySchema>;
