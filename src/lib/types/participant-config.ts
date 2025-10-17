/**
 * ✅ AI SDK v5 OFFICIAL PATTERN: Use API schemas directly, no custom abstractions
 *
 * This file provides MINIMAL type aliases for form handling.
 * All validation schemas come from @/api/routes/chat/schema (single source of truth).
 *
 * Reference: AI SDK v5 encourages using API types directly in components.
 */

import { z } from 'zod';

import type { CreateThreadRequestSchema } from '@/api/routes/chat/schema';
import { MessageContentSchema, ThreadModeSchema } from '@/api/routes/chat/schema';

// ============================================================================
// Participant Configuration (Frontend UI State)
// ============================================================================

/**
 * ✅ MINIMAL SCHEMA: Participant configuration for frontend forms
 * Used for UI state management (drag-drop reordering, enable/disable)
 *
 * NOTE: When sending to API, convert using the participant fields from CreateThreadRequest
 */
export const ParticipantConfigSchema = z.object({
  id: z.string(), // Frontend-only ID for React keys
  modelId: z.string().min(1, 'Model ID is required'),
  role: z.string().nullable(),
  customRoleId: z.string().optional(),
  order: z.number().int().nonnegative(), // Frontend-only for drag-drop
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
 * ✅ SIMPLIFIED: Chat input form schema
 * Reuses backend MessageContentSchema and ThreadModeSchema directly
 */
export const ChatInputFormSchema = z.object({
  message: MessageContentSchema,
  mode: ThreadModeSchema,
  participants: z.array(ParticipantConfigSchema).min(1, 'At least one participant is required'),
});

export type ChatInputFormData = z.infer<typeof ChatInputFormSchema>;

// ============================================================================
// Thread Input Form (Existing Thread Messages)
// ============================================================================

/**
 * ✅ SIMPLIFIED: Thread input form schema
 */
export const ThreadInputFormSchema = z.object({
  message: MessageContentSchema,
});

export type ThreadInputFormData = z.infer<typeof ThreadInputFormSchema>;

// ============================================================================
// Conversion Utilities (Frontend → API)
// ============================================================================

/**
 * ✅ SIMPLIFIED: Convert ChatInputFormData to CreateThreadRequest
 * Maps frontend form data directly to API request format
 */
export function toCreateThreadRequest(
  data: ChatInputFormData,
): z.infer<typeof CreateThreadRequestSchema> {
  return {
    title: 'New Chat', // Backend auto-generates from first message
    mode: data.mode,
    participants: data.participants.map(p => ({
      modelId: p.modelId,
      role: p.role || undefined,
      customRoleId: p.customRoleId,
      temperature: p.settings?.temperature,
      maxTokens: p.settings?.maxTokens,
      systemPrompt: p.settings?.systemPrompt,
    })),
    firstMessage: data.message,
  };
}
