import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
  chatMemory,
  chatMessage,
  chatParticipant,
  chatThread,
  chatThreadChangelog,
  modelConfiguration,
} from '@/db/tables/chat';
import { isValidModelId } from '@/lib/ai/models-config';
import { ALLOWED_CHAT_MODES } from '@/lib/config/chat-modes';

/**
 * Chat Thread Schemas
 * Uses centralized ALLOWED_CHAT_MODES for type safety
 */
export const chatThreadSelectSchema = createSelectSchema(chatThread);
export const chatThreadInsertSchema = createInsertSchema(chatThread, {
  title: schema => schema.min(1).max(200),
  mode: () => z.enum(ALLOWED_CHAT_MODES as [string, ...string[]]),
});
export const chatThreadUpdateSchema = createUpdateSchema(chatThread, {
  title: schema => schema.min(1).max(200).optional(),
  mode: () => z.enum(ALLOWED_CHAT_MODES as [string, ...string[]]).optional(),
});

/**
 * Chat Participant Schemas
 * ✅ DYNAMIC: Validates modelId as string (accepts any OpenRouter model)
 */
export const chatParticipantSelectSchema = createSelectSchema(chatParticipant);
export const chatParticipantInsertSchema = createInsertSchema(chatParticipant, {
  modelId: () => z.string()
    .min(1)
    .refine(isValidModelId, { message: 'Must be a valid model ID' })
    .describe('Must be a valid OpenRouter model ID'),
  role: schema => schema.min(1).max(100).optional(),
  priority: schema => schema.min(0).max(100),
});
export const chatParticipantUpdateSchema = createUpdateSchema(chatParticipant, {
  modelId: () => z.string()
    .min(1)
    .refine(isValidModelId, { message: 'Must be a valid model ID' })
    .describe('Must be a valid OpenRouter model ID')
    .optional(),
  role: schema => schema.min(1).max(100).optional(),
  priority: schema => schema.min(0).max(100).optional(),
});

/**
 * Chat Message Schemas
 */
export const chatMessageSelectSchema = createSelectSchema(chatMessage);
export const chatMessageInsertSchema = createInsertSchema(chatMessage, {
  content: schema => schema.min(1),
  role: () => z.enum(['user', 'assistant']),
});
export const chatMessageUpdateSchema = createUpdateSchema(chatMessage, {
  content: schema => schema.min(1).optional(),
});

/**
 * Chat Memory Schemas
 */
export const chatMemorySelectSchema = createSelectSchema(chatMemory);
export const chatMemoryInsertSchema = createInsertSchema(chatMemory, {
  title: schema => schema.min(1).max(200),
  content: schema => schema.min(1),
  type: () => z.enum(['personal', 'topic', 'instruction', 'fact']),
});
export const chatMemoryUpdateSchema = createUpdateSchema(chatMemory, {
  title: schema => schema.min(1).max(200).optional(),
  content: schema => schema.min(1).optional(),
});

/**
 * Model Configuration Schemas
 * ✅ DYNAMIC: Validates modelId as string (accepts any OpenRouter model)
 */
export const modelConfigurationSelectSchema = createSelectSchema(modelConfiguration);
export const modelConfigurationInsertSchema = createInsertSchema(modelConfiguration, {
  modelId: () => z.string()
    .min(1)
    .refine(isValidModelId, { message: 'Must be a valid model ID' })
    .describe('Must be a valid OpenRouter model ID'),
  name: schema => schema.min(1).max(100),
  provider: () => z.enum(['openrouter', 'anthropic', 'openai', 'google', 'xai', 'perplexity']),
});
export const modelConfigurationUpdateSchema = createUpdateSchema(modelConfiguration, {
  modelId: () => z.string()
    .min(1)
    .refine(isValidModelId, { message: 'Must be a valid model ID' })
    .describe('Must be a valid OpenRouter model ID')
    .optional(),
  name: schema => schema.min(1).max(100).optional(),
});

/**
 * Chat Thread Changelog Schemas
 * ✅ Tracks configuration changes to threads
 */
const CHANGELOG_TYPES = [
  'mode_change',
  'participant_added',
  'participant_removed',
  'participant_updated',
  'memory_added',
  'memory_removed',
] as const;

export const chatThreadChangelogSelectSchema = createSelectSchema(chatThreadChangelog);
export const chatThreadChangelogInsertSchema = createInsertSchema(chatThreadChangelog, {
  changeType: () => z.enum(CHANGELOG_TYPES).describe('Type of configuration change'),
  changeSummary: schema => schema.min(1).max(500).describe('Human-readable summary of the change'),
});
export const chatThreadChangelogUpdateSchema = createUpdateSchema(chatThreadChangelog);

/**
 * Type exports
 */
export type ChatThread = z.infer<typeof chatThreadSelectSchema>;
export type ChatThreadInsert = z.infer<typeof chatThreadInsertSchema>;
export type ChatThreadUpdate = z.infer<typeof chatThreadUpdateSchema>;

export type ChatParticipant = z.infer<typeof chatParticipantSelectSchema>;
export type ChatParticipantInsert = z.infer<typeof chatParticipantInsertSchema>;
export type ChatParticipantUpdate = z.infer<typeof chatParticipantUpdateSchema>;

export type ChatMessage = z.infer<typeof chatMessageSelectSchema>;
export type ChatMessageInsert = z.infer<typeof chatMessageInsertSchema>;
export type ChatMessageUpdate = z.infer<typeof chatMessageUpdateSchema>;

export type ChatMemory = z.infer<typeof chatMemorySelectSchema>;
export type ChatMemoryInsert = z.infer<typeof chatMemoryInsertSchema>;
export type ChatMemoryUpdate = z.infer<typeof chatMemoryUpdateSchema>;

export type ModelConfiguration = z.infer<typeof modelConfigurationSelectSchema>;
export type ModelConfigurationInsert = z.infer<typeof modelConfigurationInsertSchema>;
export type ModelConfigurationUpdate = z.infer<typeof modelConfigurationUpdateSchema>;

export type ChatThreadChangelog = z.infer<typeof chatThreadChangelogSelectSchema>;
export type ChatThreadChangelogInsert = z.infer<typeof chatThreadChangelogInsertSchema>;
export type ChatThreadChangelogUpdate = z.infer<typeof chatThreadChangelogUpdateSchema>;
