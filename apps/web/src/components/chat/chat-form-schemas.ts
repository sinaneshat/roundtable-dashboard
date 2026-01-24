import type { ChatMode } from '@roundtable/shared';
import { ChatModeSchema } from '@roundtable/shared';
import { z } from 'zod';

import { ParticipantConfigSchema } from '@/lib/schemas/participant-schemas';

const MessageContentSchema = z.string();

type CreateParticipantPayload = {
  modelId: string;
  role?: string | null;
  customRoleId?: string | null;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
};

type CreateThreadPayload = {
  title?: string;
  mode?: ChatMode;
  enableWebSearch?: boolean;
  participants: CreateParticipantPayload[];
  firstMessage: string;
  attachmentIds?: string[];
  projectId?: string | null;
};

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
  projectId?: string,
): CreateThreadPayload {
  return {
    title: 'New Chat',
    mode: data.mode,
    enableWebSearch: data.enableWebSearch ?? false,
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
    projectId: projectId ?? null,
  };
}
