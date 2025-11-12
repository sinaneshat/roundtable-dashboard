/**
 * Participant Schema Definitions - Single Source of Truth
 *
 * Centralized Zod schemas for chat participants used across hooks, stores, and components.
 * Prevents schema duplication and ensures consistent validation.
 *
 * **SINGLE SOURCE OF TRUTH**: All hooks and stores must import from here.
 * Do NOT duplicate these schemas inline.
 *
 * @module lib/schemas/participant-schemas
 */

import { z } from 'zod';

import { chatParticipantSelectSchema } from '@/db/validation/chat';
import { ParticipantSettingsSchema } from '@/lib/config/participant-settings';

// ============================================================================
// PARTICIPANT SCHEMAS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * Full ChatParticipant schema with settings
 *
 * **SINGLE SOURCE OF TRUTH**: Extends database schema with settings field.
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
export const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
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
export const ParticipantsArraySchema = z.array(ChatParticipantSchema).min(0, 'Participants must be an array');

/**
 * Non-empty participants array (requires at least 1)
 * Use for operations that must have participants
 */
export const NonEmptyParticipantsArraySchema = z.array(ChatParticipantSchema).min(1, 'At least one participant required');

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
export function isChatParticipant(data: unknown): data is ChatParticipantWithSettings {
  const result = ChatParticipantSchema.safeParse(data);
  return result.success;
}

/**
 * Type guard to check if array contains valid participants
 *
 * @param data - Data to validate
 * @returns True if data is array of ChatParticipants
 */
export function isChatParticipantArray(data: unknown): data is ChatParticipantWithSettings[] {
  const result = ParticipantsArraySchema.safeParse(data);
  return result.success;
}

// ============================================================================
// ADDITIONAL CONTEXT SCHEMAS (for type safety across operations)
// ============================================================================

/**
 * ✅ Participant context for message operations
 *
 * REPLACES hardcoded inline types in:
 * - message-transforms.ts (3+ occurrences)
 * - error-handling.ts (1 occurrence)
 *
 * Used when processing messages with participant metadata.
 * Lighter than full ChatParticipant when only these fields are needed.
 */
export const ParticipantContextSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  role: z.string().nullable(),
});

export type ParticipantContext = z.infer<typeof ParticipantContextSchema>;

/**
 * ✅ Minimal participant reference
 *
 * REPLACES hardcoded inline types in:
 * - message-persistence.service.ts (2 occurrences)
 * - Various API handlers
 *
 * Used when only participant ID is needed for operations.
 */
export const MinimalParticipantSchema = z.object({
  id: z.string(),
});

export type MinimalParticipant = z.infer<typeof MinimalParticipantSchema>;

/**
 * ✅ Model reference for UI display
 *
 * REPLACES hardcoded inline types in:
 * - avatar-group.tsx
 * - Model selection components
 *
 * Used in UI components for model selection and display.
 */
export const ModelReferenceSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
});

export type ModelReference = z.infer<typeof ModelReferenceSchema>;

/**
 * ✅ TYPE GUARD: Check if value is ParticipantContext
 */
export function isParticipantContext(data: unknown): data is ParticipantContext {
  return ParticipantContextSchema.safeParse(data).success;
}

/**
 * ✅ TYPE GUARD: Check if value is MinimalParticipant
 */
export function isMinimalParticipant(data: unknown): data is MinimalParticipant {
  return MinimalParticipantSchema.safeParse(data).success;
}

// ============================================================================
// PARTICIPANT CONFIG SCHEMAS - UI and API Variants
// ============================================================================

/**
 * Base participant configuration schema
 * Common fields across all participant config variants
 *
 * SINGLE SOURCE OF TRUTH for participant configuration structure.
 * All variants (UI form, API input, update payload) extend from this base.
 */
const BaseParticipantConfigSchema = z.object({
  id: z.string(),
  modelId: z.string().min(1, 'Model ID is required'),
  role: z.string().nullable(),
  priority: z.number().int().nonnegative(),
});

/**
 * ✅ ParticipantConfig schema - UI/Form variant
 *
 * REPLACES duplicate definitions in:
 * - /src/components/chat/chat-form-schemas.ts (PRIMARY)
 * - /src/stores/chat/store-schemas.ts (DUPLICATE)
 *
 * Used for:
 * - Chat input form state (ChatInputFormSchema)
 * - Store form slice (FormStateSchema.selectedParticipants)
 * - Role selector component
 * - Participant list components
 *
 * Includes optional settings object for UI customization.
 *
 * @example
 * ```typescript
 * import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
 *
 * const formData = ParticipantConfigSchema.parse({
 *   id: 'participant-1',
 *   modelId: 'openai/gpt-4',
 *   role: 'The Analyzer',
 *   customRoleId: null,
 *   priority: 0,
 *   settings: { temperature: 0.7 }
 * });
 * ```
 */
export const ParticipantConfigSchema = BaseParticipantConfigSchema.extend({
  customRoleId: z.string().optional(),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).optional(),
});

export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;

/**
 * ✅ ParticipantConfigInput schema - API service variant
 *
 * REPLACES inline type in:
 * - /src/api/services/participant-config.service.ts:29-36
 *
 * Used for:
 * - Participant change detection service
 * - Database operations builder
 * - Changelog generation
 *
 * Includes isEnabled flag for soft delete/re-enable operations.
 *
 * @example
 * ```typescript
 * import { ParticipantConfigInputSchema } from '@/lib/schemas/participant-schemas';
 *
 * const input = ParticipantConfigInputSchema.parse({
 *   id: 'participant-abc',
 *   modelId: 'anthropic/claude-3.5-sonnet',
 *   role: 'The Critic',
 *   customRoleId: null,
 *   priority: 1,
 *   isEnabled: true
 * });
 * ```
 */
export const ParticipantConfigInputSchema = BaseParticipantConfigSchema.extend({
  customRoleId: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export type ParticipantConfigInput = z.infer<typeof ParticipantConfigInputSchema>;

/**
 * ✅ ParticipantUpdatePayload schema - Mutation variant
 *
 * REPLACES inline type in:
 * - /src/lib/utils/participant.ts:41-48
 *
 * Used for:
 * - Thread update mutations
 * - Optimistic updates
 * - Participant configuration changes
 *
 * All fields required for update operations.
 *
 * @example
 * ```typescript
 * import { ParticipantUpdatePayloadSchema } from '@/lib/schemas/participant-schemas';
 *
 * const payload = ParticipantUpdatePayloadSchema.parse({
 *   id: 'participant-xyz',
 *   modelId: 'openai/gpt-4',
 *   role: 'The Synthesizer',
 *   customRoleId: null,
 *   priority: 2,
 *   isEnabled: true
 * });
 * ```
 */
export const ParticipantUpdatePayloadSchema = BaseParticipantConfigSchema.extend({
  customRoleId: z.string().nullable(),
  isEnabled: z.boolean(),
});

export type ParticipantUpdatePayload = z.infer<typeof ParticipantUpdatePayloadSchema>;

// ============================================================================
// TYPE GUARDS - Participant Config Variants
// ============================================================================

/**
 * ✅ TYPE GUARD: Check if value is ParticipantConfig (UI variant)
 *
 * @param data - Data to validate
 * @returns True if data matches ParticipantConfigSchema
 *
 * @example
 * ```typescript
 * if (isParticipantConfig(data)) {
 *   // data is ParticipantConfig
 *   const settings = data.settings;
 * }
 * ```
 */
export function isParticipantConfig(data: unknown): data is ParticipantConfig {
  return ParticipantConfigSchema.safeParse(data).success;
}

/**
 * ✅ TYPE GUARD: Check if value is ParticipantConfigInput (API variant)
 *
 * @param data - Data to validate
 * @returns True if data matches ParticipantConfigInputSchema
 *
 * @example
 * ```typescript
 * if (isParticipantConfigInput(data)) {
 *   // data is ParticipantConfigInput
 *   const enabled = data.isEnabled;
 * }
 * ```
 */
export function isParticipantConfigInput(data: unknown): data is ParticipantConfigInput {
  return ParticipantConfigInputSchema.safeParse(data).success;
}

/**
 * ✅ TYPE GUARD: Check if value is ParticipantUpdatePayload
 *
 * @param data - Data to validate
 * @returns True if data matches ParticipantUpdatePayloadSchema
 *
 * @example
 * ```typescript
 * if (isParticipantUpdatePayload(data)) {
 *   // data is ParticipantUpdatePayload
 *   await updateParticipant(data);
 * }
 * ```
 */
export function isParticipantUpdatePayload(data: unknown): data is ParticipantUpdatePayload {
  return ParticipantUpdatePayloadSchema.safeParse(data).success;
}

/**
 * ✅ TYPE GUARD: Check if array contains valid ParticipantConfigs
 *
 * @param data - Data to validate
 * @returns True if data is array of ParticipantConfig
 */
export function isParticipantConfigArray(data: unknown): data is ParticipantConfig[] {
  const result = z.array(ParticipantConfigSchema).safeParse(data);
  return result.success;
}
