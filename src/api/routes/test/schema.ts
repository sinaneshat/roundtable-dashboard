/**
 * Test Route Schemas
 */

import { z } from 'zod';

import { createApiResponseSchema } from '@/api/core';

/**
 * Set Credits Request
 */
export const SetCreditsRequestSchema = z.object({
  credits: z.number().int().min(0).max(1000000),
});

export type SetCreditsRequest = z.infer<typeof SetCreditsRequestSchema>;

/**
 * Set Credits Response
 */
export const SetCreditsResponseSchema = createApiResponseSchema(
  z.object({
    balance: z.number(),
    reserved: z.number(),
    available: z.number(),
    planType: z.string(),
  }),
);

export type SetCreditsResponse = z.infer<typeof SetCreditsResponseSchema>;
