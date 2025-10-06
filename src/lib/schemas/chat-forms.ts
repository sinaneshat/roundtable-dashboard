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
  role: z.string(),
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
 * Default model ID for new chats (cheapest free-tier model)
 */
export const DEFAULT_MODEL_ID = 'google/gemini-2.5-flash';

/**
 * Default participant configuration
 */
export const DEFAULT_PARTICIPANT: ParticipantConfig = {
  id: 'participant-default',
  modelId: DEFAULT_MODEL_ID,
  role: '',
  order: 0,
};

/**
 * Memory IDs array schema
 */
export const MemoryIdsSchema = z.array(z.string());

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
  memoryIds: MemoryIdsSchema,
});

/**
 * Default values for chat input form
 * Uses centralized config for default mode
 */
export const chatInputFormDefaults = {
  message: '',
  mode: getDefaultChatMode(),
  participants: [DEFAULT_PARTICIPANT] as ParticipantConfig[],
  memoryIds: [] as string[],
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
  memoryIds: MemoryIdsSchema,
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
    memoryIds: data.memoryIds && data.memoryIds.length > 0 ? data.memoryIds : undefined,
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
    memoryIds: config.memoryIds,
  };
}

/**
 * Ensure at least one participant exists (validation helper)
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
