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
import {
  MessageContentSchema,
  ThreadModeSchema,
} from '@/api/routes/chat/schema';
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
  // ✅ 100% DYNAMIC: Model ID validation happens on backend via OpenRouter API
  // Format: "provider/model-name" (e.g., "anthropic/claude-3.5-sonnet")
  modelId: z.string().min(1, 'Model ID is required').regex(
    /^[\w-]+\/[\w.-]+$/,
    'Model ID must be in format: provider/model-name',
  ),
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
 * ❌ REMOVED: DEFAULT_MODEL_ID and DEFAULT_PARTICIPANT
 *
 * These were removed to enforce single source of truth.
 * The backend dynamically selects the default model via GET /api/v1/models
 * based on the user's subscription tier and top 10 most popular models.
 *
 * Frontend components MUST:
 * 1. Fetch models from GET /api/v1/models (includes default_model_id)
 * 2. Use the default_model_id from the response
 * 3. Show loading state until models are fetched
 *
 * ✅ SINGLE SOURCE OF TRUTH: Backend openRouterModelsService.getDefaultModelForTier()
 */

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
 * ✅ SINGLE SOURCE OF TRUTH: Participants must be populated from backend
 * - Backend computes default model in GET /api/v1/models endpoint
 * - Response includes default_model_id field (best accessible model from top 10)
 * - Frontend MUST use default_model_id from models response
 * - Empty array here forces components to properly handle dynamic loading
 */
export const chatInputFormDefaults = {
  message: '',
  mode: getDefaultChatMode(),
  participants: [] as ParticipantConfig[], // Empty - must be populated from backend
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
 * ⚠️ WARNING: Returns empty array if no participants exist
 * Components MUST handle empty participants array by:
 * 1. Fetching models from GET /api/v1/models
 * 2. Using default_model_id from response
 * 3. Creating participant with that model
 *
 * ✅ SINGLE SOURCE OF TRUTH: No hardcoded fallback models
 */
export function ensureMinimumParticipants(
  participants: ParticipantConfig[],
): ParticipantConfig[] {
  // Return as-is - components must handle empty array properly
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
