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
import type { z } from 'zod';

import {
  DbChangelogDataSchema,
  DbCustomRoleMetadataSchema,
  DbMessageMetadataSchema,
  DbParticipantSettingsSchema,
  DbThreadMetadataSchema,
  DbUserPresetMetadataSchema,
} from '@/db/schemas/chat-metadata';
import {
  chatCustomRole,
  chatMessage,
  chatParticipant,
  chatPreSearch,
  chatRoundFeedback,
  chatThread,
  chatThreadChangelog,
  chatUserPreset,
  roundExecution,
} from '@/db/tables/chat';

/**
 * Chat Thread Schemas
 * Note: Field validation applied at API layer
 */
const baseThreadSelectSchema = createSelectSchema(chatThread);
export const chatThreadSelectSchema = baseThreadSelectSchema.extend({
  metadata: DbThreadMetadataSchema.nullable().optional(),
});
export const chatThreadInsertSchema = createInsertSchema(chatThread);
export const chatThreadUpdateSchema = createUpdateSchema(chatThread);

/**
 * Chat Participant Schemas
 * Note: Field validation applied at API layer
 */
const baseParticipantSelectSchema = createSelectSchema(chatParticipant);
export const chatParticipantSelectSchema = baseParticipantSelectSchema.extend({
  settings: DbParticipantSettingsSchema.nullable().optional(),
});
export const chatParticipantInsertSchema = createInsertSchema(chatParticipant);
export const chatParticipantUpdateSchema = createUpdateSchema(chatParticipant);

/**
 * Chat Message Schemas
 * AI SDK v6 ALIGNMENT: parts[] array replaces content/reasoning fields
 * Note: Field validation applied at API layer
 */
export const chatMessageSelectSchema = createSelectSchema(chatMessage).extend({
  metadata: DbMessageMetadataSchema.nullable(),
});
export const chatMessageInsertSchema = createInsertSchema(chatMessage);
export const chatMessageUpdateSchema = createUpdateSchema(chatMessage);

/**
 * Chat Thread Changelog Schemas
 * Note: Field validation applied at API layer
 */
export const chatThreadChangelogSelectSchema = createSelectSchema(chatThreadChangelog).extend({
  changeData: DbChangelogDataSchema,
});
export const chatThreadChangelogInsertSchema = createInsertSchema(chatThreadChangelog);

/**
 * Custom Role Schemas
 * User-defined role templates with system prompts
 * Note: Field validation applied at API layer
 */
export const chatCustomRoleSelectSchema = createSelectSchema(chatCustomRole).extend({
  metadata: DbCustomRoleMetadataSchema.nullable().optional(),
});
export const chatCustomRoleInsertSchema = createInsertSchema(chatCustomRole);
export const chatCustomRoleUpdateSchema = createUpdateSchema(chatCustomRole);

/**
 * Pre-Search Schemas
 * Web search results executed before participant streaming
 * Note: Field validation applied at API layer
 */
export const chatPreSearchSelectSchema = createSelectSchema(chatPreSearch);
export const chatPreSearchInsertSchema = createInsertSchema(chatPreSearch);

/**
 * Round Feedback Schemas
 * User feedback (like/dislike) for conversation rounds
 * Note: Field validation applied at API layer
 */
export const chatRoundFeedbackSelectSchema = createSelectSchema(chatRoundFeedback);
export const chatRoundFeedbackInsertSchema = createInsertSchema(chatRoundFeedback);
export const chatRoundFeedbackUpdateSchema = createUpdateSchema(chatRoundFeedback);

/**
 * User Preset Schemas
 * User-saved preset configurations for thread creation
 * Note: Field validation applied at API layer
 */
export const chatUserPresetSelectSchema = createSelectSchema(chatUserPreset).extend({
  metadata: DbUserPresetMetadataSchema.nullable().optional(),
});
export const chatUserPresetInsertSchema = createInsertSchema(chatUserPreset);
export const chatUserPresetUpdateSchema = createUpdateSchema(chatUserPreset);

/**
 * Round Execution Schemas
 * Durable round execution tracking for robust streaming resumption
 * Note: Field validation applied at API layer
 */
export const roundExecutionSelectSchema = createSelectSchema(roundExecution);
export const roundExecutionInsertSchema = createInsertSchema(roundExecution);
export const roundExecutionUpdateSchema = createUpdateSchema(roundExecution);

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

export type ChatCustomRole = z.infer<typeof chatCustomRoleSelectSchema>;
export type ChatCustomRoleInsert = z.infer<typeof chatCustomRoleInsertSchema>;
export type ChatCustomRoleUpdate = z.infer<typeof chatCustomRoleUpdateSchema>;

export type ChatPreSearch = z.infer<typeof chatPreSearchSelectSchema>;
export type ChatPreSearchInsert = z.infer<typeof chatPreSearchInsertSchema>;

export type ChatRoundFeedback = z.infer<typeof chatRoundFeedbackSelectSchema>;
export type ChatRoundFeedbackInsert = z.infer<typeof chatRoundFeedbackInsertSchema>;
export type ChatRoundFeedbackUpdate = z.infer<typeof chatRoundFeedbackUpdateSchema>;

export type ChatUserPreset = z.infer<typeof chatUserPresetSelectSchema>;
export type ChatUserPresetInsert = z.infer<typeof chatUserPresetInsertSchema>;
export type ChatUserPresetUpdate = z.infer<typeof chatUserPresetUpdateSchema>;

export type RoundExecution = z.infer<typeof roundExecutionSelectSchema>;
export type RoundExecutionInsert = z.infer<typeof roundExecutionInsertSchema>;
export type RoundExecutionUpdate = z.infer<typeof roundExecutionUpdateSchema>;
