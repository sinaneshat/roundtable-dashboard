/**
 * Chat Validation Schemas
 *
 * ✅ DATABASE-ONLY: Pure Drizzle-Zod schemas derived from database tables
 * ❌ NO CUSTOM LOGIC: No business logic validations (e.g., isValidModelId)
 *
 * For API-specific validations and business logic, see:
 * @/api/routes/chat/schema.ts
 */

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

/**
 * Chat Thread Schemas
 */
export const chatThreadSelectSchema = createSelectSchema(chatThread);
export const chatThreadInsertSchema = createInsertSchema(chatThread, {
  title: schema => schema.min(1).max(200),
});
export const chatThreadUpdateSchema = createUpdateSchema(chatThread, {
  title: schema => schema.min(1).max(200).optional(),
});

/**
 * Chat Participant Schemas
 */
export const chatParticipantSelectSchema = createSelectSchema(chatParticipant);
export const chatParticipantInsertSchema = createInsertSchema(chatParticipant, {
  modelId: schema => schema.min(1),
  role: schema => schema.min(1).max(100).optional(),
  priority: schema => schema.min(0).max(100),
});
export const chatParticipantUpdateSchema = createUpdateSchema(chatParticipant, {
  modelId: schema => schema.min(1).optional(),
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
 */
export const chatThreadChangelogSelectSchema = createSelectSchema(chatThreadChangelog);
export const chatThreadChangelogInsertSchema = createInsertSchema(chatThreadChangelog, {
  changeSummary: schema => schema.min(1).max(500),
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
