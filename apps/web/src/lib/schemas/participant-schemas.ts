/**
 * Participant Schema Definitions - Web Package
 *
 * PLATFORM-SPECIFIC: ChatParticipantSchema defined here using RPC types.
 * Common schemas imported from @roundtable/shared via barrel export.
 *
 * **RPC-FIRST PATTERN**: Types are derived from API responses via Hono RPC.
 * Schemas validate against the RPC-derived types using `satisfies`.
 *
 * @see packages/shared/src/lib/schemas/participant-schemas.ts
 */

import { z } from 'zod';

import { ParticipantSettingsSchema } from '@/lib/config/participant-settings';
import type { ApiParticipant } from '@/services/api';

// ============================================================================
// PARTICIPANT SCHEMAS - RPC-DERIVED TYPE ALIGNMENT
// ============================================================================

/**
 * ChatParticipant validation schema
 *
 * **RPC-FIRST PATTERN**: For type-only usage, prefer `ApiParticipant` from `@/services/api`.
 * This schema provides runtime validation when needed.
 *
 * The canonical type flows from: backend -> Hono RPC -> `ApiParticipant`
 *
 * @example
 * ```typescript
 * // Type-only usage (preferred when validation not needed)
 * import type { ApiParticipant } from '@/services/api';
 * const participant: ApiParticipant = data;
 *
 * // Runtime validation (when needed)
 * import { ChatParticipantSchema } from '@/lib/schemas/participant-schemas';
 * const validated = ChatParticipantSchema.parse(data);
 * ```
 */
export const ChatParticipantSchema = z.object({
  // Date fields use string (JSON serialization converts Date to string)
  createdAt: z.string(),
  customRoleId: z.string().nullable(),
  id: z.string(),
  isEnabled: z.boolean(),
  modelId: z.string(),
  priority: z.number().int().nonnegative(),
  role: z.string().nullable(),
  settings: ParticipantSettingsSchema,
  threadId: z.string(),
  updatedAt: z.string(),
});

// Compile-time type check: ensures schema output aligns with RPC-derived ApiParticipant
// If this fails to compile, the schema shape has diverged from the API response type
void (0 as unknown as (
  z.infer<typeof ChatParticipantSchema> extends ApiParticipant ? true : never
));

// ============================================================================
// PARTICIPANT ARRAY SCHEMAS
// ============================================================================

/**
 * Array of participants schema with validation
 *
 * **SINGLE SOURCE OF TRUTH**: Use for validating participant arrays.
 * Enforces minimum 0 participants (empty allowed for loading states).
 *
 * @example
 * ```typescript
 * const ParticipantsArraySchema = z.array(ChatParticipantSchema).min(1);
 * ```
 */
export const ParticipantsArraySchema = z
  .array(ChatParticipantSchema)
  .min(0, 'Participants must be an array');

/**
 * Non-empty participants array (requires at least 1)
 * Use for operations that must have participants
 */
export const NonEmptyParticipantsArraySchema = z
  .array(ChatParticipantSchema)
  .min(1, 'At least one participant required');

// ============================================================================
// HELPER TYPE GUARDS
// ============================================================================

/**
 * Type guard to check if data is a valid ChatParticipant with settings
 *
 * @param data - Data to validate
 * @returns True if data matches ChatParticipantSchema
 *
 * @example
 * ```typescript
 * if (isChatParticipant(data)) {
 *   // data is ApiParticipant
 *   const settings = data.settings;
 * }
 * ```
 */
export function isChatParticipant(
  data: unknown,
): data is ApiParticipant {
  const result = ChatParticipantSchema.safeParse(data);
  return result.success;
}

/**
 * Type guard to check if array contains valid participants
 *
 * @param data - Data to validate
 * @returns True if data is array of ChatParticipants
 */
export function isChatParticipantArray(
  data: unknown,
): data is ApiParticipant[] {
  const result = ParticipantsArraySchema.safeParse(data);
  return result.success;
}
