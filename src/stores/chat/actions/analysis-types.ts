/**
 * Chat Analysis Types and Schemas
 *
 * Type definitions and Zod schemas for analysis state management.
 * These types are used across analysis orchestrators and action hooks.
 *
 * ✅ SINGLE SOURCE OF TRUTH: Centralized analysis type definitions
 * Extracted from deprecated useChatAnalysis hook (removed in refactor)
 *
 * Location: /src/stores/chat/actions/analysis-types.ts
 */

'use client';

import { z } from 'zod';

import { AnalysisStatusSchema, ChatModeSchema } from '@/api/core/enums';
import type { ChatParticipant, ModeratorAnalysisPayload } from '@/api/routes/chat/schema';
import { ModeratorAnalysisPayloadSchema } from '@/api/routes/chat/schema';
import { ParticipantsArraySchema } from '@/lib/schemas/participant-schemas';

/**
 * Zod schema for UseChatAnalysisOptions validation
 * Validates hook options at entry point to ensure type safety
 */
export const UseChatAnalysisOptionsSchema = z.object({
  threadId: z.string(), // Allow empty string for initial state
  mode: ChatModeSchema,
  enabled: z.boolean().optional().default(true),
}).strict();

/**
 * Options for configuring the chat analysis hook
 * Derived from Zod schema for type safety
 */
export type UseChatAnalysisOptions = z.infer<typeof UseChatAnalysisOptionsSchema>;

/**
 * Zod schemas for internal function parameters
 */
/**
 * ✅ SINGLE SOURCE OF TRUTH: Uses ParticipantsArraySchema from central schemas
 */
export const CreatePendingAnalysisParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  messages: z.array(z.custom<unknown>()),
  participants: ParticipantsArraySchema,
  userQuestion: z.string().min(1),
}).strict();

export const UpdateAnalysisDataParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  data: ModeratorAnalysisPayloadSchema,
}).strict();

export const UpdateAnalysisStatusParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  status: AnalysisStatusSchema,
}).strict();

export const RoundNumberParamSchema = z.object({
  roundNumber: z.number().int().positive(),
}).strict();

export const MarkAnalysisFailedParamsSchema = z.object({
  roundNumber: z.number().int().positive(),
  errorMessage: z.string().min(1),
}).strict();

/**
 * Type definitions for analysis function parameters
 */
export type CreatePendingAnalysisParams = z.infer<typeof CreatePendingAnalysisParamsSchema>;
export type UpdateAnalysisDataParams = z.infer<typeof UpdateAnalysisDataParamsSchema>;
export type UpdateAnalysisStatusParams = z.infer<typeof UpdateAnalysisStatusParamsSchema>;
export type RoundNumberParam = z.infer<typeof RoundNumberParamSchema>;
export type MarkAnalysisFailedParams = z.infer<typeof MarkAnalysisFailedParamsSchema>;

/**
 * Type guard for validating analysis data structure
 *
 * @param data - Unknown data to validate
 * @returns True if data is valid ModeratorAnalysisPayload
 */
export function isValidAnalysisPayload(data: unknown): data is ModeratorAnalysisPayload {
  const result = ModeratorAnalysisPayloadSchema.safeParse(data);
  return result.success;
}

/**
 * Export participant type for convenience
 * Prevents circular dependencies when importing from schema files
 */
export type { ChatParticipant, ModeratorAnalysisPayload };
