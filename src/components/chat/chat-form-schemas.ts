import { z } from 'zod';

import { ChatModeSchema } from '@/api/core/enums';
import type { CreateThreadRequestSchema } from '@/api/routes/chat/schema';
import { MessageContentSchema } from '@/api/routes/chat/schema';

export const ParticipantConfigSchema = z.object({
  id: z.string(),
  modelId: z.string().min(1, 'Model ID is required'),
  role: z.string().nullable(),
  customRoleId: z.string().optional(),
  priority: z.number().int().nonnegative(),
  settings: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    systemPrompt: z.string().optional(),
  }).optional(),
});
export type ParticipantConfig = z.infer<typeof ParticipantConfigSchema>;
export const ChatInputFormSchema = z.object({
  message: MessageContentSchema,
  mode: ChatModeSchema,
  participants: z.array(ParticipantConfigSchema).min(1, 'At least one participant is required'),
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
