/**
 * SSR Message Verification Type Schemas
 *
 * Zod-first schemas for SSR message verification
 * Following the type-inference-patterns.md pattern
 */

import * as z from 'zod';

import { chatMessageSelectSchema } from '@/db/validation/chat';

/**
 * API message schema - extends ChatMessage with flexible date handling
 * API responses have string dates that need transformation to Date objects
 */
export const ApiMessageSchema = chatMessageSelectSchema.extend({
  createdAt: z.union([z.string().datetime(), z.date()]),
});

export type ApiMessage = z.infer<typeof ApiMessageSchema>;
