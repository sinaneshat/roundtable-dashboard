/**
 * Chat Form Validation Schemas
 *
 * Form schemas and types for chat components.
 * Colocated with chat components following the established pattern
 * of keeping component-specific schemas with their components.
 *
 * NOTE: This file provides MINIMAL type aliases for form handling.
 * All validation schemas reuse backend schemas from @/api/routes/chat/schema
 * (single source of truth), following AI SDK v5 patterns.
 */

import { z } from 'zod';

import { ChatModeSchema } from '@/api/core/enums';
import type { CreateThreadRequestSchema } from '@/api/routes/chat/schema';
import { MessageContentSchema } from '@/api/routes/chat/schema';

// ============================================================================
// Participant Configuration (Frontend UI State)
// ============================================================================

/**
 * MINIMAL SCHEMA: Participant configuration for frontend forms
 * Used for UI state management (drag-drop reordering, enable/disable)
 *
 * NOTE: When sending to API, convert using toCreateThreadRequest()
 */
export const ParticipantConfigSchema = z.object({
  id: z.string(), // Frontend-only ID for React keys
  modelId: z.string().min(1, 'Model ID is required'),
  role: z.string().nullable(),
  customRoleId: z.string().optional(),
  priority: z.number().int().nonnegative(), // Display order (0-indexed) - matches backend schema
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).optional(),
});

export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;

// ============================================================================
// Chat Input Form (New Thread Creation)
// ============================================================================

/**
 * SIMPLIFIED: Chat input form schema
 * Reuses backend MessageContentSchema and ChatModeSchema directly
 */
export const ChatInputFormSchema = z.object({
  message: MessageContentSchema,
  mode: ChatModeSchema,
  participants: z.array(ParticipantConfigSchema).min(1, 'At least one participant is required'),
});

export type ChatInputFormData = z.infer<typeof ChatInputFormSchema>;

// ============================================================================
// Thread Input Form (Existing Thread Messages)
// ============================================================================

/**
 * SIMPLIFIED: Thread input form schema
 */
export const ThreadInputFormSchema = z.object({
  message: MessageContentSchema,
});

export type ThreadInputFormData = z.infer<typeof ThreadInputFormSchema>;

// ============================================================================
// Conversion Utilities (Frontend → API)
// ============================================================================

/**
 * SIMPLIFIED: Convert ChatInputFormData to CreateThreadRequest
 * Maps frontend form data directly to API request format
 */
export function toCreateThreadRequest(
  data: ChatInputFormData,
): z.infer<typeof CreateThreadRequestSchema> {
  return {
    title: 'New Chat', // Backend auto-generates from first message
    mode: data.mode,
    participants: data.participants.map((p, index) => ({
      modelId: p.modelId,
      role: p.role || undefined,
      customRoleId: p.customRoleId,
      priority: p.priority ?? index, // Use priority if set, otherwise use index
      temperature: p.settings?.temperature,
      maxTokens: p.settings?.maxTokens,
      systemPrompt: p.settings?.systemPrompt,
    })),
    firstMessage: data.message,
  };
}
