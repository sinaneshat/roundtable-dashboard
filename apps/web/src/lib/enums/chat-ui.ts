/**
 * Chat UI Enums
 *
 * Enums specific to chat UI components and interactions.
 */

import { z } from 'zod';

// ============================================================================
// CHAT ALERT VARIANT
// ============================================================================

// 1. ARRAY CONSTANT
export const CHAT_ALERT_VARIANTS = ['success', 'warning', 'error'] as const;

// 2. ZOD SCHEMA
export const ChatAlertVariantSchema = z.enum(CHAT_ALERT_VARIANTS);

// 3. TYPESCRIPT TYPE
export type ChatAlertVariant = z.infer<typeof ChatAlertVariantSchema>;

// 4. DEFAULT VALUE
export const DEFAULT_CHAT_ALERT_VARIANT: ChatAlertVariant = 'warning';

// 5. CONSTANT OBJECT
export const ChatAlertVariants = {
  SUCCESS: 'success' as const,
  WARNING: 'warning' as const,
  ERROR: 'error' as const,
} as const;

// 6. TYPE GUARD
export function isChatAlertVariant(value: unknown): value is ChatAlertVariant {
  return ChatAlertVariantSchema.safeParse(value).success;
}

// 7. DISPLAY LABELS
export const CHAT_ALERT_VARIANT_LABELS: Record<ChatAlertVariant, string> = {
  [ChatAlertVariants.SUCCESS]: 'Success',
  [ChatAlertVariants.WARNING]: 'Warning',
  [ChatAlertVariants.ERROR]: 'Error',
} as const;
