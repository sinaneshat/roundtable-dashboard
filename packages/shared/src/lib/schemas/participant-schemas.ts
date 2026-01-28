/**
 * Participant Schema Definitions - Single Source of Truth
 *
 * Centralized Zod schemas for chat participants used across hooks, stores, and components.
 * Prevents schema duplication and ensures consistent validation.
 *
 * **SINGLE SOURCE OF TRUTH**: All hooks and stores must import from here.
 * Do NOT duplicate these schemas inline.
 *
 * NOTE: ChatParticipantSchema is NOT included here because it has platform-specific
 * dependencies (Drizzle on API, RPC types on Web). Each app should define their own
 * ChatParticipantSchema that extends from these base schemas.
 *
 * @module lib/schemas/participant-schemas
 */

import { z } from 'zod';

// ============================================================================
// PARTICIPANT INDEX CONSTANTS - SINGLE SOURCE OF TRUTH
// ============================================================================

/**
 * 0-BASED INDEXING: First participant is index 0
 * Default participant index when none is specified
 */
export const DEFAULT_PARTICIPANT_INDEX = 0;

/**
 * Sentinel value for "no participant" calculations
 * Used in similar pattern to NO_ROUND_SENTINEL
 */
export const NO_PARTICIPANT_SENTINEL = -1;

// ============================================================================
// PARTICIPANT METADATA SCHEMAS - MESSAGE METADATA
// ============================================================================

/**
 * Participant index schema - validates participant index in message metadata
 * 0-BASED: First participant is 0
 */
export const ParticipantIndexSchema = z.number().int().nonnegative();

/**
 * Participant index with sentinel schema - allows -1 for calculations
 */
export const ParticipantIndexWithSentinelSchema = z
  .number()
  .int()
  .min(NO_PARTICIPANT_SENTINEL);

/**
 * Type inference for participant index
 */
export type ParticipantIndex = z.infer<typeof ParticipantIndexSchema>;

/**
 * Type inference for participant index with sentinel
 */
export type ParticipantIndexWithSentinel = z.infer<
  typeof ParticipantIndexWithSentinelSchema
>;

/**
 * Participant ID schema - validates participant ID in message metadata
 */
export const ParticipantIdSchema = z.string().min(1, 'Participant ID required');

/**
 * Participant role schema - validates participant role in message metadata
 */
export const ParticipantRoleSchema = z.string().nullable();

/**
 * Model ID reference schema - validates model ID string in message metadata
 * NOTE: Use ModelIdSchema from enums for strict enum validation
 */
export const ModelIdReferenceSchema = z.string().min(1, 'Model ID required');

// ============================================================================
// DISPLAY UTILITIES
// ============================================================================

/**
 * Get display participant index (1-based for UI)
 * DISPLAY ONLY: Use this for user-facing text
 * 0-BASED -> 1-BASED: Adds 1 for display
 *
 * @param participantIndex - 0-based participant index
 * @returns 1-based display number (Participant 1, Participant 2, etc.)
 *
 * @example
 * ```typescript
 * const displayIndex = getDisplayParticipantIndex(0); // Returns 1
 * const displayIndex = getDisplayParticipantIndex(1); // Returns 2
 * ```
 */
export function getDisplayParticipantIndex(
  participantIndex: ParticipantIndex,
): number {
  return participantIndex + 1;
}

/**
 * Format participant index for display
 * Example: 0 -> "Participant #1", 1 -> "Participant #2"
 *
 * @param participantIndex - 0-based participant index
 * @returns Formatted string for display
 *
 * @example
 * ```typescript
 * const formatted = formatParticipantIndex(0); // Returns "Participant #1"
 * const formatted = formatParticipantIndex(1); // Returns "Participant #2"
 * ```
 */
export function formatParticipantIndex(
  participantIndex: ParticipantIndex,
): string {
  return `Participant #${getDisplayParticipantIndex(participantIndex)}`;
}

// ============================================================================
// ADDITIONAL CONTEXT SCHEMAS (for type safety across operations)
// ============================================================================

/**
 * Participant context for message operations
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
 * Minimal participant reference
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
 * Model reference for UI display
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
 * TYPE GUARD: Check if value is ParticipantContext
 */
export function isParticipantContext(
  data: unknown,
): data is ParticipantContext {
  return ParticipantContextSchema.safeParse(data).success;
}

/**
 * TYPE GUARD: Check if value is MinimalParticipant
 */
export function isMinimalParticipant(
  data: unknown,
): data is MinimalParticipant {
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
  priority: z.number().int().nonnegative(),
  role: z.string().nullable().optional(),
});

/**
 * ParticipantConfig schema - UI/Form variant
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
 * NOTE: customRoleId uses .nullable().optional() to align with database schema
 * Database uses `string | null`, forms can have `undefined` which is transformed to `null`
 *
 * @example
 * ```typescript
 * import { ParticipantConfigSchema } from '@roundtable/shared';
 *
 * const formData = ParticipantConfigSchema.parse({
 *   id: 'participant-1',
 *   modelId: 'openai/gpt-4o-mini',
 *   role: 'The Summarizer',
 *   customRoleId: null,
 *   priority: 0,
 *   settings: { temperature: 0.7 }
 * });
 * ```
 */
export const ParticipantConfigSchema = BaseParticipantConfigSchema.extend({
  customRoleId: z.string().nullable().optional(),
  settings: z
    .object({
      maxTokens: z.number().int().positive().optional(),
      systemPrompt: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
    })
    .optional(),
});

export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;

/**
 * ParticipantConfigInput schema - API service variant
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
 * import { ParticipantConfigInputSchema } from '@roundtable/shared';
 *
 * const input = ParticipantConfigInputSchema.parse({
 *   id: 'participant-abc',
 *   modelId: 'anthropic/claude-sonnet-4.5',
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

export type ParticipantConfigInput = z.infer<
  typeof ParticipantConfigInputSchema
>;

/**
 * ParticipantUpdatePayload schema - Mutation variant
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
 * import { ParticipantUpdatePayloadSchema } from '@roundtable/shared';
 *
 * const payload = ParticipantUpdatePayloadSchema.parse({
 *   id: 'participant-xyz',
 *   modelId: 'openai/gpt-4o-mini',
 *   role: 'The Synthesizer',
 *   customRoleId: null,
 *   priority: 2,
 *   isEnabled: true
 * });
 * ```
 */
export const ParticipantUpdatePayloadSchema
  = BaseParticipantConfigSchema.extend({
    customRoleId: z.string().nullable(),
    isEnabled: z.boolean(),
  });

export type ParticipantUpdatePayload = z.infer<
  typeof ParticipantUpdatePayloadSchema
>;

// ============================================================================
// TYPE GUARDS - Participant Config Variants
// ============================================================================

/**
 * TYPE GUARD: Check if value is ParticipantConfig (UI variant)
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
 * TYPE GUARD: Check if value is ParticipantConfigInput (API variant)
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
export function isParticipantConfigInput(
  data: unknown,
): data is ParticipantConfigInput {
  return ParticipantConfigInputSchema.safeParse(data).success;
}

/**
 * TYPE GUARD: Check if value is ParticipantUpdatePayload
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
export function isParticipantUpdatePayload(
  data: unknown,
): data is ParticipantUpdatePayload {
  return ParticipantUpdatePayloadSchema.safeParse(data).success;
}

/**
 * TYPE GUARD: Check if array contains valid ParticipantConfigs
 *
 * @param data - Data to validate
 * @returns True if data is array of ParticipantConfig
 */
export function isParticipantConfigArray(
  data: unknown,
): data is ParticipantConfig[] {
  const result = z.array(ParticipantConfigSchema).safeParse(data);
  return result.success;
}

// ============================================================================
// COMPARABLE PARTICIPANT SCHEMA - Used for comparison operations
// ============================================================================

/**
 * ComparableParticipant schema - Common fields for participant comparison
 *
 * REPLACES inline type extension in:
 * - /src/lib/utils/participant.ts (ComparableParticipant type)
 *
 * Used for:
 * - Participant comparison and equality checks
 * - Participant key generation
 * - Change detection
 *
 * Contains the minimal fields needed to compare two participants.
 * Accepts both ChatParticipant and ParticipantConfig objects.
 *
 * @example
 * ```typescript
 * import { ComparableParticipantSchema } from '@roundtable/shared';
 *
 * const comparable = ComparableParticipantSchema.parse({
 *   modelId: 'openai/gpt-4o-mini',
 *   role: 'The Summarizer',
 *   priority: 0,
 * });
 * ```
 */
export const ComparableParticipantSchema = z.object({
  customRoleId: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
  modelId: z.string(),
  priority: z.number(),
  role: z.string().nullable().optional(),
});

export type ComparableParticipant = z.infer<typeof ComparableParticipantSchema>;

/**
 * TYPE GUARD: Check if value is ComparableParticipant
 */
export function isComparableParticipant(
  data: unknown,
): data is ComparableParticipant {
  return ComparableParticipantSchema.safeParse(data).success;
}

// ============================================================================
// PARTICIPANT VALIDATION SCHEMAS - SERVICE LAYER
// ============================================================================

/**
 * ParticipantForValidation schema - Lightweight validation input
 *
 * SINGLE SOURCE OF TRUTH for participant validation inputs.
 * Used in:
 * - participant-validation.service.ts (validateParticipantUniqueness, validateParticipantModels)
 * - Tier limit validation
 * - Model access validation
 *
 * Minimal schema for validation operations - only fields needed for checks.
 *
 * @example
 * ```typescript
 * import { ParticipantForValidationSchema } from '@roundtable/shared';
 *
 * const participants = z.array(ParticipantForValidationSchema).parse(input);
 * validateParticipantUniqueness(participants);
 * ```
 */
export const ParticipantForValidationSchema = z.object({
  id: z.string(),
  isEnabled: z.boolean().optional(),
  modelId: z.string(),
});

export type ParticipantForValidation = z.infer<
  typeof ParticipantForValidationSchema
>;

/**
 * ValidateModelAccessOptions schema - Model access validation options
 *
 * SINGLE SOURCE OF TRUTH for model access validation options.
 * Used in:
 * - participant-validation.service.ts (validateModelAccess)
 *
 * Configures behavior of model access validation.
 *
 * @example
 * ```typescript
 * import { ValidateModelAccessOptionsSchema } from '@roundtable/shared';
 *
 * const options = ValidateModelAccessOptionsSchema.parse({ skipPricingCheck: true });
 * await validateModelAccess(modelId, userTier, options);
 * ```
 */
export const ValidateModelAccessOptionsSchema = z.object({
  skipPricingCheck: z.boolean().optional(),
});

export type ValidateModelAccessOptions = z.infer<
  typeof ValidateModelAccessOptionsSchema
>;

/**
 * TYPE GUARD: Check if value is ParticipantForValidation
 *
 * @param data - Data to validate
 * @returns True if data matches ParticipantForValidationSchema
 */
export function isParticipantForValidation(
  data: unknown,
): data is ParticipantForValidation {
  return ParticipantForValidationSchema.safeParse(data).success;
}

/**
 * TYPE GUARD: Check if array contains valid ParticipantForValidation entries
 *
 * @param data - Data to validate
 * @returns True if data is array of ParticipantForValidation
 */
export function isParticipantForValidationArray(
  data: unknown,
): data is ParticipantForValidation[] {
  return z.array(ParticipantForValidationSchema).safeParse(data).success;
}
