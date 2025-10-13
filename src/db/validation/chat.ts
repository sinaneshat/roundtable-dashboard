import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import {
  chatCustomRole,
  chatMessage,
  chatModeratorAnalysis,
  chatParticipant,
  chatThread,
  chatThreadChangelog,
} from '@/db/tables/chat';
import { isValidModelId } from '@/lib/ai/models-config';
import { CHAT_MODES } from '@/lib/config/chat-modes';

/**
 * Chat Thread Schemas
 * Uses centralized CHAT_MODES for type safety
 */
export const chatThreadSelectSchema = createSelectSchema(chatThread);
export const chatThreadInsertSchema = createInsertSchema(chatThread, {
  title: schema => schema.min(1).max(200),
  mode: () => z.enum(CHAT_MODES),
});
export const chatThreadUpdateSchema = createUpdateSchema(chatThread, {
  title: schema => schema.min(1).max(200).optional(),
  mode: () => z.enum(CHAT_MODES).optional(),
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
 * Custom Role Schemas
 * User-defined role templates with system prompts
 */
export const chatCustomRoleSelectSchema = createSelectSchema(chatCustomRole);
export const chatCustomRoleInsertSchema = createInsertSchema(chatCustomRole, {
  name: schema => schema.min(1).max(100),
  systemPrompt: schema => schema.min(1),
  description: schema => schema.max(500).optional(),
});
export const chatCustomRoleUpdateSchema = createUpdateSchema(chatCustomRole, {
  name: schema => schema.min(1).max(100).optional(),
  systemPrompt: schema => schema.min(1).optional(),
  description: schema => schema.max(500).optional(),
});

/**
 * Moderator Analysis Schemas
 * AI-generated analysis results for conversation rounds
 */
export const chatModeratorAnalysisSelectSchema = createSelectSchema(chatModeratorAnalysis);
export const chatModeratorAnalysisInsertSchema = createInsertSchema(chatModeratorAnalysis, {
  roundNumber: schema => schema.min(1),
  userQuestion: schema => schema.min(1),
});
export const chatModeratorAnalysisUpdateSchema = createUpdateSchema(chatModeratorAnalysis);

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

export type ChatThreadChangelog = z.infer<typeof chatThreadChangelogSelectSchema>;
export type ChatThreadChangelogInsert = z.infer<typeof chatThreadChangelogInsertSchema>;
export type ChatThreadChangelogUpdate = z.infer<typeof chatThreadChangelogUpdateSchema>;

export type ChatCustomRole = z.infer<typeof chatCustomRoleSelectSchema>;
export type ChatCustomRoleInsert = z.infer<typeof chatCustomRoleInsertSchema>;
export type ChatCustomRoleUpdate = z.infer<typeof chatCustomRoleUpdateSchema>;

export type ChatModeratorAnalysis = z.infer<typeof chatModeratorAnalysisSelectSchema>;
export type ChatModeratorAnalysisInsert = z.infer<typeof chatModeratorAnalysisInsertSchema>;
export type ChatModeratorAnalysisUpdate = z.infer<typeof chatModeratorAnalysisUpdateSchema>;
