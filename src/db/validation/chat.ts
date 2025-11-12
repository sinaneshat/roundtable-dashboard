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
  chatPreSearch,
  chatRoundFeedback,
  chatThread,
  chatThreadChangelog,
} from '@/db/tables/chat';

import { Refinements } from './refinements';

/**
 * Chat Thread Schemas
 */
const baseThreadSelectSchema = createSelectSchema(chatThread);
export const chatThreadSelectSchema = baseThreadSelectSchema.extend({
  // ✅ FIX: metadata field accepts both null and undefined (SQLite behavior)
  metadata: z.any().nullable().optional(),
});
export const chatThreadInsertSchema = createInsertSchema(chatThread, {
  title: Refinements.title(),
});
export const chatThreadUpdateSchema = createUpdateSchema(chatThread, {
  title: Refinements.titleOptional(),
});

/**
 * Chat Participant Schemas
 */
const baseParticipantSelectSchema = createSelectSchema(chatParticipant);
export const chatParticipantSelectSchema = baseParticipantSelectSchema.extend({
  // ✅ FIX: settings field accepts both null and undefined (SQLite behavior)
  settings: z.any().nullable().optional(),
});
export const chatParticipantInsertSchema = createInsertSchema(chatParticipant, {
  modelId: Refinements.content(),
  role: Refinements.nameOptional(),
  priority: Refinements.priority(),
});
export const chatParticipantUpdateSchema = createUpdateSchema(chatParticipant, {
  modelId: Refinements.contentOptional(),
  role: Refinements.nameOptional(),
  priority: Refinements.priorityOptional(),
});

/**
 * Chat Message Schemas
 * ✅ AI SDK v5 ALIGNMENT: parts[] array replaces content/reasoning fields
 */
export const chatMessageSelectSchema = createSelectSchema(chatMessage);
export const chatMessageInsertSchema = createInsertSchema(chatMessage, {
  role: () => z.enum(['user', 'assistant']),
  // parts array is validated by database schema type
});
export const chatMessageUpdateSchema = createUpdateSchema(chatMessage, {
  // parts array is validated by database schema type
});

/**
 * Chat Thread Changelog Schemas
 */
export const chatThreadChangelogSelectSchema = createSelectSchema(chatThreadChangelog);
export const chatThreadChangelogInsertSchema = createInsertSchema(chatThreadChangelog, {
  changeSummary: Refinements.description(),
});
export const chatThreadChangelogUpdateSchema = createUpdateSchema(chatThreadChangelog);

/**
 * Custom Role Schemas
 * User-defined role templates with system prompts
 */
export const chatCustomRoleSelectSchema = createSelectSchema(chatCustomRole);
export const chatCustomRoleInsertSchema = createInsertSchema(chatCustomRole, {
  name: Refinements.name(),
  systemPrompt: Refinements.systemPrompt(),
  description: Refinements.descriptionOptional(),
});
export const chatCustomRoleUpdateSchema = createUpdateSchema(chatCustomRole, {
  name: Refinements.nameOptional(),
  systemPrompt: Refinements.systemPromptOptional(),
  description: Refinements.descriptionOptional(),
});

/**
 * Moderator Analysis Schemas
 * AI-generated analysis results for conversation rounds
 */
export const chatModeratorAnalysisSelectSchema = createSelectSchema(chatModeratorAnalysis);
export const chatModeratorAnalysisInsertSchema = createInsertSchema(chatModeratorAnalysis, {
  roundNumber: Refinements.nonNegativeInt(), // ✅ 0-BASED: Allow round 0
  userQuestion: Refinements.content(),
});
export const chatModeratorAnalysisUpdateSchema = createUpdateSchema(chatModeratorAnalysis);

/**
 * Pre-Search Schemas
 * Web search results executed before participant streaming
 */
export const chatPreSearchSelectSchema = createSelectSchema(chatPreSearch);
export const chatPreSearchInsertSchema = createInsertSchema(chatPreSearch, {
  roundNumber: Refinements.nonNegativeInt(), // ✅ 0-BASED: Allow round 0
  userQuery: Refinements.content(),
});
export const chatPreSearchUpdateSchema = createUpdateSchema(chatPreSearch);

/**
 * Round Feedback Schemas
 * User feedback (like/dislike) for conversation rounds
 */
export const chatRoundFeedbackSelectSchema = createSelectSchema(chatRoundFeedback);
export const chatRoundFeedbackInsertSchema = createInsertSchema(chatRoundFeedback, {
  roundNumber: Refinements.nonNegativeInt(), // ✅ 0-BASED: Allow round 0
  feedbackType: () => z.enum(['like', 'dislike']).nullable(),
});
export const chatRoundFeedbackUpdateSchema = createUpdateSchema(chatRoundFeedback, {
  feedbackType: () => z.enum(['like', 'dislike']).nullable().optional(),
});

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

export type ChatPreSearch = z.infer<typeof chatPreSearchSelectSchema>;
export type ChatPreSearchInsert = z.infer<typeof chatPreSearchInsertSchema>;
export type ChatPreSearchUpdate = z.infer<typeof chatPreSearchUpdateSchema>;

export type ChatRoundFeedback = z.infer<typeof chatRoundFeedbackSelectSchema>;
export type ChatRoundFeedbackInsert = z.infer<typeof chatRoundFeedbackInsertSchema>;
export type ChatRoundFeedbackUpdate = z.infer<typeof chatRoundFeedbackUpdateSchema>;
