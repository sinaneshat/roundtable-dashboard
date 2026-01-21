/**
 * Participant AI Model Settings
 *
 * ✅ SINGLE SOURCE OF TRUTH: Shared between backend and frontend
 *
 * Defines configuration settings for AI model participants in chat threads.
 * Used by chat API, database validation, and frontend components.
 *
 * @see /REFACTORING_PLAN.md - Phase 1, Task 1.2
 */

import { z } from '@hono/zod-openapi';

/**
 * Participant Settings Schema
 *
 * Configures AI model behavior for chat participants:
 * - temperature: Controls randomness/creativity (0 = deterministic, 2 = very creative)
 * - maxTokens: Maximum tokens in model response
 * - systemPrompt: Custom system instructions for the AI model
 *
 * All fields are optional and nullable for flexible configuration.
 * Unknown fields are passed through to support future extensions.
 */
export const ParticipantSettingsSchema = z
  .object({
    /**
     * Temperature setting for AI model creativity
     * @minimum 0
     * @maximum 2
     * @default 0.7
     */
    temperature: z
      .number()
      .min(0, 'Temperature must be at least 0')
      .max(2, 'Temperature must be at most 2')
      .optional()
      .openapi({
        description: 'Controls randomness in model responses (0 = deterministic, 2 = very creative)',
        example: 0.7,
      }),

    /**
     * Maximum tokens in model response
     * @minimum 1
     * @maximum 100000
     * @default 4096
     */
    maxTokens: z
      .number()
      .int('Max tokens must be an integer')
      .positive('Max tokens must be positive')
      .max(100000, 'Max tokens cannot exceed 100,000')
      .optional()
      .openapi({
        description: 'Maximum number of tokens the model can generate',
        example: 4096,
      }),

    /**
     * Custom system prompt for the AI model
     * @maxLength 10000
     */
    systemPrompt: z
      .string()
      .max(10000, 'System prompt cannot exceed 10,000 characters')
      .optional()
      .openapi({
        description: 'Custom system instructions to guide model behavior',
        example: 'You are a helpful assistant specializing in technical support.',
      }),
  })
  .strict() // Reject unknown fields for type safety
  .nullable() // Allow null values
  .optional() // Allow undefined
  .openapi({
    title: 'ParticipantSettings',
    description: 'Configuration settings for AI model participants',
  });

/**
 * TypeScript type inferred from ParticipantSettingsSchema
 */
export type ParticipantSettings = z.infer<typeof ParticipantSettingsSchema>;

/**
 * Default participant settings
 *
 * Provides sensible defaults for AI model configuration:
 * - Balanced creativity (0.7 temperature)
 * - Optimized response length (1024 tokens)
 * - No custom system prompt
 */
export const DEFAULT_PARTICIPANT_SETTINGS: Required<NonNullable<ParticipantSettings>> = {
  temperature: 0.7,
  maxTokens: 1024,
  systemPrompt: '',
} as const;

/**
 * Normalizes participant settings with safe defaults
 *
 * Parses and validates settings, falling back to defaults on invalid input.
 * Useful for handling user-provided or database-stored settings.
 *
 * @param settings - Raw settings object to normalize (can be invalid)
 * @returns Validated settings or defaults if parsing fails
 *
 * @example
 * ```typescript
 * // Valid settings
 * const settings = normalizeParticipantSettings({ temperature: 0.8 });
 * // Returns: { temperature: 0.8, maxTokens: 4096, systemPrompt: '' }
 *
 * // Invalid settings (temperature too high)
 * const invalid = normalizeParticipantSettings({ temperature: 5 });
 * // Returns: DEFAULT_PARTICIPANT_SETTINGS
 *
 * // Null/undefined settings
 * const empty = normalizeParticipantSettings(null);
 * // Returns: DEFAULT_PARTICIPANT_SETTINGS
 * ```
 */
export function normalizeParticipantSettings(
  settings: unknown,
): Required<NonNullable<ParticipantSettings>> {
  const parsed = ParticipantSettingsSchema.safeParse(settings);

  if (!parsed.success) {
    return DEFAULT_PARTICIPANT_SETTINGS;
  }

  // If parsed is null or undefined, return defaults
  if (!parsed.data) {
    return DEFAULT_PARTICIPANT_SETTINGS;
  }

  // Merge parsed settings with defaults
  return {
    temperature: parsed.data.temperature ?? DEFAULT_PARTICIPANT_SETTINGS.temperature,
    maxTokens: parsed.data.maxTokens ?? DEFAULT_PARTICIPANT_SETTINGS.maxTokens,
    systemPrompt: parsed.data.systemPrompt ?? DEFAULT_PARTICIPANT_SETTINGS.systemPrompt,
  };
}
