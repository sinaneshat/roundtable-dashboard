/**
 * Participant Schema Definitions - API Package
 *
 * PLATFORM-SPECIFIC: ChatParticipantSchema defined here using Drizzle.
 * Common schemas imported from @roundtable/shared via barrel export.
 *
 * @see packages/shared/src/lib/schemas/participant-schemas.ts
 */

import * as z from 'zod';

import { chatParticipantSelectSchema } from '@/db/validation/chat';
import { ParticipantSettingsSchema } from '@/lib/config/participant-settings';

// ============================================================================
// PARTICIPANT SCHEMAS - PLATFORM-SPECIFIC (Uses Drizzle)
// ============================================================================

/**
 * Full ChatParticipant schema with settings
 *
 * **PLATFORM-SPECIFIC**: Extends Drizzle database schema with settings field.
 * Used across:
 * - useMultiParticipantChat hook
 * - useChatAnalysis hook
 * - Store actions
 * - Components requiring full participant data
 *
 * Matches the ChatParticipant type from API routes but with settings validated.
 *
 * @example
 * ```typescript
 * import { ChatParticipantSchema } from '@/lib/schemas/participant-schemas';
 *
 * const participants = z.array(ChatParticipantSchema).parse(data);
 * ```
 */
export const ChatParticipantSchema = chatParticipantSelectSchema.extend({
  settings: ParticipantSettingsSchema,
});

/**
 * Inferred TypeScript type for ChatParticipant with settings
 * Use this type instead of defining inline types
 */
export type ChatParticipantWithSettings = z.infer<typeof ChatParticipantSchema>;

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
 *   // data is ChatParticipantWithSettings
 *   const settings = data.settings;
 * }
 * ```
 */
export function isChatParticipant(
  data: unknown,
): data is ChatParticipantWithSettings {
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
): data is ChatParticipantWithSettings[] {
  const result = ParticipantsArraySchema.safeParse(data);
  return result.success;
}
