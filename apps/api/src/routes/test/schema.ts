/**
 * Test Route Schemas
 */

import { z } from '@hono/zod-openapi';

import { createApiResponseSchema } from '@/core/schemas';

export const SetCreditsRequestSchema = z.object({
  credits: z.number().int().min(0).max(1000000).openapi({
    description: 'Credit amount to set',
    example: 10000,
  }),
}).openapi('SetCreditsRequest');

export type SetCreditsRequest = z.infer<typeof SetCreditsRequestSchema>;

const SetCreditsPayloadSchema = z.object({
  balance: z.number().openapi({
    description: 'Current credit balance',
    example: 10000,
  }),
  reserved: z.number().openapi({
    description: 'Reserved credits',
    example: 0,
  }),
  available: z.number().openapi({
    description: 'Available credits',
    example: 10000,
  }),
  planType: z.string().openapi({
    description: 'User plan type',
    example: 'free',
  }),
}).openapi('SetCreditsPayload');

export const SetCreditsResponseSchema = createApiResponseSchema(
  SetCreditsPayloadSchema,
).openapi('SetCreditsResponse');

export type SetCreditsResponse = z.infer<typeof SetCreditsResponseSchema>;
