/**
 * Job Metadata Schemas - Single Source of Truth
 *
 * Zod schemas for automated job metadata stored in database.
 * Follows the same pattern as chat-metadata.ts for type safety.
 */

import * as z from 'zod';

// ============================================================================
// ROUND CONFIG SCHEMA
// ============================================================================

/**
 * Per-round configuration determined by prompt analysis
 */
export const DbRoundConfigSchema = z.object({
  round: z.number().int().nonnegative(),
  mode: z.string(),
  enableWebSearch: z.boolean(),
}).strict();

export type DbRoundConfig = z.infer<typeof DbRoundConfigSchema>;

// ============================================================================
// AUTOMATED JOB METADATA SCHEMA
// ============================================================================

/**
 * Automated Job Metadata
 * Stores prompt reasoning, round prompts, per-round configs, and error info
 */
export const DbAutomatedJobMetadataSchema = z.object({
  promptReasoning: z.string().optional(),
  roundPrompts: z.array(z.string()).optional(),
  roundConfigs: z.array(DbRoundConfigSchema).optional(),
  errorMessage: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
}).strict();

export type DbAutomatedJobMetadata = z.infer<typeof DbAutomatedJobMetadataSchema>;
