/**
 * SSR Message Verification Type Schemas
 *
 * Re-uses API-inferred types from services/api (SINGLE SOURCE OF TRUTH)
 * Following the type-inference-patterns.md pattern
 */

import { z } from 'zod';

/**
 * ChatMessageSelectSchema - Runtime validation for API messages
 * Derived from the RPC-inferred ApiMessage type structure
 */
export const ChatMessageSelectSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  participantId: z.string().nullable(),
  role: z.string(),
  content: z.string().nullable(),
  parts: z.array(z.unknown()),
  status: z.string(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  roundNumber: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();

/**
 * Zod schema for runtime validation in SSR message verification
 * Extended with flexible date handling for API responses
 */
export const ApiMessageSchema = ChatMessageSelectSchema.extend({
  createdAt: z.union([z.string().datetime(), z.date()]),
});
