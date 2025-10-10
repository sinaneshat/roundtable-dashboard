/**
 * Changelog Change Data Schemas
 *
 * ✅ ZOD PATTERN: Type-safe schemas for ChatThreadChangelog.changeData
 * Eliminates inline type casting throughout the codebase
 *
 * The backend stores changeData as z.record(z.string(), z.unknown()) for flexibility,
 * but the frontend needs type safety for each specific change type.
 *
 * Pattern:
 * 1. Define Zod schema for each change type's data structure
 * 2. Infer TypeScript type from schema
 * 3. Use safeParse for runtime validation
 */

import { z } from 'zod';

// ============================================================================
// Participant Change Data Schemas
// ============================================================================

/**
 * Schema for participant_added changeData
 */
export const ParticipantAddedDataSchema = z.object({
  modelId: z.string(),
  role: z.string().nullable().optional(),
  priority: z.number().optional(),
}).passthrough();

export type ParticipantAddedData = z.infer<typeof ParticipantAddedDataSchema>;

/**
 * Schema for participant_removed changeData
 */
export const ParticipantRemovedDataSchema = z.object({
  modelId: z.string(),
  role: z.string().nullable().optional(),
}).passthrough();

export type ParticipantRemovedData = z.infer<typeof ParticipantRemovedDataSchema>;

/**
 * Schema for participant_updated changeData
 * Supports two formats:
 * 1. before/after structure (used in some contexts)
 * 2. oldRole/newRole structure (used by the service layer)
 */
export const ParticipantUpdatedDataSchema = z.object({
  // Format 1: before/after structure
  before: z.object({
    modelId: z.string().optional(),
    role: z.string().nullable().optional(),
    priority: z.number().optional(),
  }).passthrough().optional(),
  after: z.object({
    modelId: z.string().optional(),
    role: z.string().nullable().optional(),
    priority: z.number().optional(),
  }).passthrough().optional(),
  // Format 2: oldRole/newRole structure (service layer)
  modelId: z.string().optional(),
  oldRole: z.string().nullable().optional(),
  newRole: z.string().nullable().optional(),
}).passthrough();

export type ParticipantUpdatedData = z.infer<typeof ParticipantUpdatedDataSchema>;

/**
 * Schema for participants_reordered changeData
 */
export const ParticipantsReorderedDataSchema = z.object({
  participantIds: z.array(z.string()).optional(),
  count: z.number().optional(),
  // Detailed participants array with order information
  participants: z.array(z.object({
    id: z.string(),
    modelId: z.string(),
    role: z.string().nullable(),
    order: z.number(),
  })).optional(),
}).passthrough();

export type ParticipantsReorderedData = z.infer<typeof ParticipantsReorderedDataSchema>;

// ============================================================================
// Memory Change Data Schemas
// ============================================================================

/**
 * Schema for memory_added changeData
 */
export const MemoryAddedDataSchema = z.object({
  title: z.string(),
  type: z.string().optional(),
  description: z.string().nullable().optional(),
}).passthrough();

export type MemoryAddedData = z.infer<typeof MemoryAddedDataSchema>;

/**
 * Schema for memory_removed changeData
 */
export const MemoryRemovedDataSchema = z.object({
  title: z.string(),
  type: z.string().optional(),
}).passthrough();

export type MemoryRemovedData = z.infer<typeof MemoryRemovedDataSchema>;

// ============================================================================
// Mode Change Data Schema
// ============================================================================

/**
 * Schema for mode_change changeData
 */
export const ModeChangeDataSchema = z.object({
  previousMode: z.string(),
  newMode: z.string(),
}).passthrough();

export type ModeChangeData = z.infer<typeof ModeChangeDataSchema>;

// ============================================================================
// Union Type for All Change Data
// ============================================================================

/**
 * Union schema for all possible changeData structures
 */
export const ChangeDataSchema = z.union([
  ParticipantAddedDataSchema,
  ParticipantRemovedDataSchema,
  ParticipantUpdatedDataSchema,
  ParticipantsReorderedDataSchema,
  MemoryAddedDataSchema,
  MemoryRemovedDataSchema,
  ModeChangeDataSchema,
]);

export type ChangeData = z.infer<typeof ChangeDataSchema>;

// ============================================================================
// Type Guards with Runtime Validation
// ============================================================================

/**
 * ✅ ZOD PATTERN: Type guard for participant_added changeData
 * Uses Zod safeParse for runtime validation
 */
export function isParticipantAddedData(
  data: unknown,
): data is ParticipantAddedData {
  return ParticipantAddedDataSchema.safeParse(data).success;
}

/**
 * ✅ ZOD PATTERN: Type guard for participant_removed changeData
 */
export function isParticipantRemovedData(
  data: unknown,
): data is ParticipantRemovedData {
  return ParticipantRemovedDataSchema.safeParse(data).success;
}

/**
 * ✅ ZOD PATTERN: Type guard for participant_updated changeData
 */
export function isParticipantUpdatedData(
  data: unknown,
): data is ParticipantUpdatedData {
  return ParticipantUpdatedDataSchema.safeParse(data).success;
}

/**
 * ✅ ZOD PATTERN: Type guard for participants_reordered changeData
 */
export function isParticipantsReorderedData(
  data: unknown,
): data is ParticipantsReorderedData {
  return ParticipantsReorderedDataSchema.safeParse(data).success;
}

/**
 * ✅ ZOD PATTERN: Type guard for memory_added changeData
 */
export function isMemoryAddedData(
  data: unknown,
): data is MemoryAddedData {
  return MemoryAddedDataSchema.safeParse(data).success;
}

/**
 * ✅ ZOD PATTERN: Type guard for memory_removed changeData
 */
export function isMemoryRemovedData(
  data: unknown,
): data is MemoryRemovedData {
  return MemoryRemovedDataSchema.safeParse(data).success;
}

/**
 * ✅ ZOD PATTERN: Type guard for mode_change changeData
 */
export function isModeChangeData(
  data: unknown,
): data is ModeChangeData {
  return ModeChangeDataSchema.safeParse(data).success;
}

// ============================================================================
// Safe Parsing Helpers
// ============================================================================

/**
 * ✅ ZOD PATTERN: Safely parse changeData with proper type inference
 * Returns parsed data or undefined if parsing fails
 */
export function parseChangeData<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): z.infer<T> | undefined {
  const result = schema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Parse participant added data safely
 */
export function parseParticipantAddedData(data: unknown): ParticipantAddedData | undefined {
  return parseChangeData(ParticipantAddedDataSchema, data);
}

/**
 * Parse participant removed data safely
 */
export function parseParticipantRemovedData(data: unknown): ParticipantRemovedData | undefined {
  return parseChangeData(ParticipantRemovedDataSchema, data);
}

/**
 * Parse participant updated data safely
 */
export function parseParticipantUpdatedData(data: unknown): ParticipantUpdatedData | undefined {
  return parseChangeData(ParticipantUpdatedDataSchema, data);
}

/**
 * Parse memory added data safely
 */
export function parseMemoryAddedData(data: unknown): MemoryAddedData | undefined {
  return parseChangeData(MemoryAddedDataSchema, data);
}

/**
 * Parse memory removed data safely
 */
export function parseMemoryRemovedData(data: unknown): MemoryRemovedData | undefined {
  return parseChangeData(MemoryRemovedDataSchema, data);
}

/**
 * Parse mode change data safely
 */
export function parseModeChangeData(data: unknown): ModeChangeData | undefined {
  return parseChangeData(ModeChangeDataSchema, data);
}

/**
 * Parse participants reordered data safely
 */
export function parseParticipantsReorderedData(data: unknown): ParticipantsReorderedData | undefined {
  return parseChangeData(ParticipantsReorderedDataSchema, data);
}
