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
/**
 * Schema for message part - minimal validation since parts can vary by type
 * Using z.record for flexibility while maintaining type safety
 */
const MessagePartSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]));

/**
 * Schema for message metadata values
 * Supports common JSON-serializable types
 */
const MetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

export const ChatMessageSelectSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  participantId: z.string().nullable(),
  role: z.string(),
  content: z.string().nullable(),
  parts: z.array(MessagePartSchema),
  status: z.string(),
  metadata: z.record(z.string(), MetadataValueSchema).nullable(),
  roundNumber: z.number().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();

/**
 * Zod schema for runtime validation in SSR message verification
 * Extended with flexible date handling for API responses
 */
export const ApiMessageSchema = ChatMessageSelectSchema.extend({
  createdAt: z.union([z.string().datetime(), z.date()]),
}).strict();
