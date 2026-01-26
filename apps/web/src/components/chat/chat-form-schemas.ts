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
  enableWebSearch: z.boolean().optional(),
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
  attachmentIds?: string[],
  projectId?: string,
): CreateThreadPayload {
  return {
    attachmentIds: attachmentIds && attachmentIds.length > 0 ? attachmentIds : undefined,
    enableWebSearch: data.enableWebSearch ?? false,
    firstMessage: data.message,
    mode: data.mode,
    participants: data.participants.map((p) => {
      // Conditionally build participant to satisfy exactOptionalPropertyTypes
      const participant: CreateParticipantPayload = {
        modelId: p.modelId,
      };
      if (p.customRoleId !== undefined) {
        participant.customRoleId = p.customRoleId;
      }
      if (p.settings?.maxTokens !== undefined) {
        participant.maxTokens = p.settings.maxTokens;
      }
      if (p.role) {
        participant.role = p.role;
      }
      if (p.settings?.systemPrompt !== undefined) {
        participant.systemPrompt = p.settings.systemPrompt;
      }
      if (p.settings?.temperature !== undefined) {
        participant.temperature = p.settings.temperature;
      }
      return participant;
    }),
    projectId: projectId ?? null,
    title: 'New Chat',
  };
}
