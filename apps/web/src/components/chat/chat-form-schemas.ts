import { ChatModeSchema } from '@roundtable/shared';
import { z } from 'zod';

import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';
import { MessageContentSchema } from '@/types/api';

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
): any {
  return {
    title: 'New Chat',
    mode: data.mode,
    enableWebSearch: data.enableWebSearch ?? false,
    // ✅ FIX: CreateParticipantSchema omits id, priority, isEnabled
    // Priority is determined by array order on backend
    participants: data.participants.map(p => ({
      modelId: p.modelId,
      role: p.role || undefined,
      customRoleId: p.customRoleId,
      temperature: p.settings?.temperature,
      maxTokens: p.settings?.maxTokens,
      systemPrompt: p.settings?.systemPrompt,
    })),
    firstMessage: data.message,
    attachmentIds: attachmentIds && attachmentIds.length > 0 ? attachmentIds : undefined,
  };
}
