/**
 * Chat, Thread, and Message Enums
 *
 * Core enums for chat functionality, thread management, and message handling.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// MODERATOR CONSTANTS (5-part pattern)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - N/A for single values, use constant directly
// 2️⃣ DEFAULT VALUE - The main constants
/** Moderator display name shown in UI */
export const MODERATOR_NAME = 'Council Moderator';

/** Sentinel value for moderator (not a real participant, sorts last) */
export const MODERATOR_PARTICIPANT_INDEX = -99;

// 3️⃣ ZOD SCHEMA - For validation when needed
export const ModeratorNameSchema = z.literal(MODERATOR_NAME).openapi({
  description: 'Moderator display name',
  example: MODERATOR_NAME,
});

export const ModeratorParticipantIndexSchema = z.literal(MODERATOR_PARTICIPANT_INDEX).openapi({
  description: 'Sentinel value for moderator participant index',
  example: MODERATOR_PARTICIPANT_INDEX,
});

// 4️⃣ TYPESCRIPT TYPE - Inferred from schema
export type ModeratorName = z.infer<typeof ModeratorNameSchema>;

// 5️⃣ CONSTANT OBJECT - For programmatic access
export const ModeratorConstants = {
  NAME: MODERATOR_NAME,
  PARTICIPANT_INDEX: MODERATOR_PARTICIPANT_INDEX,
} as const;

// ============================================================================
// CHAT MODE
// ============================================================================

export const CHAT_MODES = ['analyzing', 'brainstorming', 'debating', 'solving'] as const;

export const DEFAULT_CHAT_MODE: ChatMode = 'debating';

export const DEFAULT_THREAD_STATUS: ThreadStatus = 'active';

export const DEFAULT_MESSAGE_STATUS: MessageStatus = 'pending';

export const DEFAULT_MESSAGE_ROLE: MessageRole = 'user';

export const DEFAULT_CHANGELOG_TYPE: ChangelogType = 'added';

export const ChatModeSchema = z.enum(CHAT_MODES).openapi({
  description: 'Conversation mode for roundtable discussions',
  example: 'brainstorming',
});

export type ChatMode = z.infer<typeof ChatModeSchema>;

export const ChatModes = {
  ANALYZING: 'analyzing' as const,
  BRAINSTORMING: 'brainstorming' as const,
  DEBATING: 'debating' as const,
  SOLVING: 'solving' as const,
} as const;

// ============================================================================
// THREAD STATUS
// ============================================================================

export const THREAD_STATUSES = ['active', 'archived', 'deleted'] as const;

export const ThreadStatusSchema = z.enum(THREAD_STATUSES).openapi({
  description: 'Thread lifecycle status',
  example: 'active',
});

export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export const ThreadStatuses = {
  ACTIVE: 'active' as const,
  ARCHIVED: 'archived' as const,
  DELETED: 'deleted' as const,
} as const;

// ============================================================================
// MESSAGE STATUS
// ============================================================================

export const MESSAGE_STATUSES = ['pending', 'streaming', 'complete', 'failed'] as const;

export const MessageStatusSchema = z.enum(MESSAGE_STATUSES).openapi({
  description: 'Message status during streaming lifecycle',
  example: 'streaming',
});

export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageStatuses = {
  PENDING: 'pending' as const,
  STREAMING: 'streaming' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// MESSAGE ROLE (Database - includes 'tool' for tool invocations)
// ============================================================================

export const MESSAGE_ROLES = ['user', 'assistant', 'tool'] as const;

export const MessageRoleSchema = z.enum(MESSAGE_ROLES).openapi({
  description: 'Message role (user input, AI response, or tool result)',
  example: 'assistant',
});

export type MessageRole = z.infer<typeof MessageRoleSchema>;

export const MessageRoles = {
  USER: 'user' as const,
  ASSISTANT: 'assistant' as const,
  TOOL: 'tool' as const,
} as const;

// ============================================================================
// CHANGELOG TYPE (Thread changelog event type)
// ============================================================================

export const CHANGELOG_TYPES = ['added', 'modified', 'removed'] as const;

export const ChangelogTypeSchema = z.enum(CHANGELOG_TYPES).openapi({
  description: 'Type of changelog event',
  example: 'added',
});

export type ChangelogType = z.infer<typeof ChangelogTypeSchema>;

export const ChangelogTypes = {
  ADDED: 'added' as const,
  MODIFIED: 'modified' as const,
  REMOVED: 'removed' as const,
} as const;

// ============================================================================
// CHANGELOG CHANGE TYPE (Thread changelog discriminator)
// ============================================================================

export const CHANGELOG_CHANGE_TYPES = ['participant', 'participant_role', 'mode_change'] as const;

export const ChangelogChangeTypeSchema = z.enum(CHANGELOG_CHANGE_TYPES).openapi({
  description: 'Type of thread changelog change',
  example: 'participant',
});

export type ChangelogChangeType = z.infer<typeof ChangelogChangeTypeSchema>;

export const ChangelogChangeTypes = {
  PARTICIPANT: 'participant' as const,
  PARTICIPANT_ROLE: 'participant_role' as const,
  MODE_CHANGE: 'mode_change' as const,
} as const;

// ============================================================================
// SCREEN MODE
// ============================================================================

export const SCREEN_MODES = ['overview', 'thread', 'public'] as const;

export const DEFAULT_SCREEN_MODE: ScreenMode = 'overview';

export const ScreenModeSchema = z.enum(SCREEN_MODES).openapi({
  description: 'Chat interface screen mode',
  example: 'thread',
});

export type ScreenMode = z.infer<typeof ScreenModeSchema>;

export const ScreenModes = {
  OVERVIEW: 'overview' as const,
  THREAD: 'thread' as const,
  PUBLIC: 'public' as const,
} as const;

// ============================================================================
// PARTICIPANT COMPARISON MODE
// ============================================================================

export const PARTICIPANT_COMPARISON_MODES = ['modelIds', 'strict'] as const;

export const DEFAULT_PARTICIPANT_COMPARISON_MODE: ParticipantComparisonMode = 'strict';

export const ParticipantComparisonModeSchema = z.enum(PARTICIPANT_COMPARISON_MODES).openapi({
  description: 'Strategy for comparing participant configurations',
  example: 'strict',
});

export type ParticipantComparisonMode = z.infer<typeof ParticipantComparisonModeSchema>;

export const ParticipantComparisonModes = {
  MODEL_IDS: 'modelIds' as const,
  STRICT: 'strict' as const,
} as const;
