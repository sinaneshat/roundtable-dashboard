import { z } from 'zod';

import { ChatModeSchema } from '@/api/core/enums';
import type { CreateThreadRequestSchema } from '@/api/routes/chat/schema';
import { MessageContentSchema } from '@/api/routes/chat/schema';
import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';

// ============================================================================
// FORM SCHEMAS
// ============================================================================

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
  attachmentIds?: string[],
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
    attachmentIds: attachmentIds && attachmentIds.length > 0 ? attachmentIds : undefined,
  };
}
