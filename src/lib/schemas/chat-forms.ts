/**
 * Shared Chat Form Schemas
 *
 * Centralized form validation schemas that combine:
 * - Backend API schemas from @/api/routes/chat/schema
 * - Database schemas from @/db/validation/chat
 * - Type-safe inference for React Hook Form
 *
 * Following patterns from /docs/frontend-patterns.md and /docs/backend-patterns.md
 */

import { z } from 'zod';

import type { CreateThreadRequestSchema } from '@/api/routes/chat/schema';
import { MessageContentSchema, ThreadModeSchema } from '@/api/routes/chat/schema';
import { isValidModelId } from '@/lib/ai/models-config';
import type { ChatModeId } from '@/lib/config/chat-modes';
import { getDefaultChatMode } from '@/lib/config/chat-modes';

// ============================================================================
// Shared Sub-Schemas
// ============================================================================

/**
 * Participant configuration schema for frontend forms
 * Used in chat input, thread input, and config sheets
 */
export const ParticipantConfigSchema = z.object({
  id: z.string(),
  modelId: z.string().refine(isValidModelId, {
    message: 'Invalid model ID. Must be a valid model from AI configuration.',
  }),
  role: z.string().nullable(), // ✅ Matches database schema - role can be null
  customRoleId: z.string().optional(),
  order: z.number().int().nonnegative(),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).optional(),
});

/**
 * Infer type from schema before using it
 */
export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;

// ============================================================================
// Base Configuration Constants
// ============================================================================

/**
 * Default model ID for new chats
 * ✅ Dynamic: Uses first accessible model from top 10 most popular models
 *
 * Note: This fallback is used for form initialization. The actual default model
 * is determined dynamically by the backend based on user's subscription tier.
 * See: GET /api/v1/models/default endpoint
 *
 * This fallback should be a popular, widely accessible model that exists in most tiers.
 */
export const DEFAULT_MODEL_ID = 'anthropic/claude-3-haiku';

/**
 * Default participant configuration for form initialization
 * The actual default model will be fetched from the backend on component mount
 */
export const DEFAULT_PARTICIPANT: ParticipantConfig = {
  id: 'participant-default',
  modelId: DEFAULT_MODEL_ID,
  role: '',
  order: 0,
};

// ============================================================================
// Chat Input Form Schema (New Thread Creation)
// ============================================================================

/**
 * Chat input form schema
 * Used for creating new threads with initial message
 *
 * Reuses backend validation to ensure consistency:
 * - MessageContentSchema: min 1, max 5000 characters
 * - ThreadModeSchema: validated enum
 * - ParticipantConfigSchema: validated model IDs
 */
export const ChatInputFormSchema = z.object({
  message: MessageContentSchema,
  mode: ThreadModeSchema,
  participants: z.array(ParticipantConfigSchema).min(1, 'At least one participant is required'),
});

/**
 * Default values for chat input form
 * Uses centralized config for default mode
 *
 * NOTE: The participants array with DEFAULT_PARTICIPANT is just a fallback.
 * In practice, components should use the default_model_id from the models list response:
 * - Backend computes default model in GET /api/v1/models endpoint
 * - Response includes default_model_id field (best accessible model from top 10)
 * - Frontend consumes this from the prefetched models data (zero additional requests)
 * This ensures users get the best accessible model from top 10 popular models for their tier.
 */
export const chatInputFormDefaults = {
  message: '',
  mode: getDefaultChatMode(),
  participants: [DEFAULT_PARTICIPANT] as ParticipantConfig[],
};

// ============================================================================
// Thread Input Form Schema (Existing Thread Messages)
// ============================================================================

/**
 * Thread input form schema
 * Used for sending messages in existing threads
 *
 * Simpler than ChatInputFormSchema since thread already exists
 */
export const ThreadInputFormSchema = z.object({
  message: MessageContentSchema,
});

/**
 * Default values for thread input form
 */
export const threadInputFormDefaults = {
  message: '',
} as const;

// ============================================================================
// Thread Configuration Schema (Dynamic Updates)
// ============================================================================

/**
 * Thread configuration schema
 * Used for updating thread settings mid-conversation
 */
export const ThreadConfigSchema = z.object({
  mode: ThreadModeSchema,
  participants: z.array(ParticipantConfigSchema).min(1, 'At least one participant is required'),
});

// ============================================================================
// Type Exports (Inferred from Schemas)
// ============================================================================

export type ChatInputFormData = z.infer<typeof ChatInputFormSchema>;
export type ThreadInputFormData = z.infer<typeof ThreadInputFormSchema>;
export type ThreadConfig = z.infer<typeof ThreadConfigSchema>;

/**
 * Re-export ChatModeId for convenience
 */
export type { ChatModeId };

// ============================================================================
// Form Utilities
// ============================================================================

/**
 * Convert frontend ParticipantConfig to backend CreateThreadRequest format
 */
export function participantConfigToCreateThreadFormat(config: ParticipantConfig) {
  return {
    modelId: config.modelId,
    role: config.role || undefined,
    customRoleId: config.customRoleId,
    temperature: config.settings?.temperature,
    maxTokens: config.settings?.maxTokens,
    systemPrompt: config.settings?.systemPrompt,
  };
}

/**
 * Convert ChatInputFormData to CreateThreadRequest
 */
export function chatInputFormToCreateThreadRequest(
  data: ChatInputFormData,
): z.infer<typeof CreateThreadRequestSchema> {
  return {
    title: 'New Chat', // Backend auto-generates from first message
    mode: data.mode,
    participants: data.participants.map(participantConfigToCreateThreadFormat),
    firstMessage: data.message,
  };
}

/**
 * Convert ThreadConfig to StreamChatRequest format (partial update)
 */
export function threadConfigToStreamChatFormat(config: Partial<ThreadConfig>) {
  return {
    mode: config.mode,
    participants: config.participants?.map(p => ({
      modelId: p.modelId,
      role: p.role,
      customRoleId: p.customRoleId,
      order: p.order,
    })),
  };
}

/**
 * Ensure at least one participant exists (validation helper)
 *
 * NOTE: This returns DEFAULT_PARTICIPANT as a fallback only.
 * For initial participant selection, use the default_model_id from models list:
 * - Backend includes default_model_id in GET /api/v1/models response
 * - Frontend uses this from prefetched data (no additional request)
 */
export function ensureMinimumParticipants(
  participants: ParticipantConfig[],
): ParticipantConfig[] {
  if (participants.length === 0) {
    return [DEFAULT_PARTICIPANT];
  }
  return participants;
}

/**
 * Validate participants can be removed (must keep at least one)
 */
export function canRemoveParticipant(
  participants: ParticipantConfig[],
  _participantId: string,
): boolean {
  return participants.length > 1;
}
