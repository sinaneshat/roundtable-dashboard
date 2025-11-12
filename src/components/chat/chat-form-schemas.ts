import { z } from 'zod';

import { ChatModeSchema } from '@/api/core/enums';
import type { CreateThreadRequestSchema } from '@/api/routes/chat/schema';
import { MessageContentSchema } from '@/api/routes/chat/schema';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';

// ============================================================================
// RE-EXPORT: ParticipantConfig from unified schemas
// ============================================================================
/**
 * ✅ RE-EXPORT: ParticipantConfig type from unified schemas
 *
 * MIGRATED: Schema definition moved to /src/lib/schemas/participant-schemas.ts
 * This re-export maintains backward compatibility for form components.
 *
 * @see /src/lib/schemas/participant-schemas.ts - Single source of truth
 */
export type { ParticipantConfig } from '@/lib/schemas/participant-schemas';
export { ParticipantConfigSchema };
export const ChatInputFormSchema = z.object({
  message: MessageContentSchema,
  mode: ChatModeSchema,
  participants: z.array(ParticipantConfigSchema).min(1, 'At least one participant is required'),
  enableWebSearch: z.boolean().optional(),
});
export type ChatInputFormData = z.infer<typeof ChatInputFormSchema>;
export const ThreadInputFormSchema = z.object({
  message: MessageContentSchema,
});
export type ThreadInputFormData = z.infer<typeof ThreadInputFormSchema>;
export function toCreateThreadRequest(
  data: ChatInputFormData,
): z.infer<typeof CreateThreadRequestSchema> {
  return {
    title: 'New Chat',
    mode: data.mode,
    enableWebSearch: data.enableWebSearch ?? false,
    participants: data.participants.map((p, index) => ({
      modelId: p.modelId,
      role: p.role || undefined,
      customRoleId: p.customRoleId,
      priority: p.priority ?? index,
      temperature: p.settings?.temperature,
      maxTokens: p.settings?.maxTokens,
      systemPrompt: p.settings?.systemPrompt,
    })),
    firstMessage: data.message,
  };
}
