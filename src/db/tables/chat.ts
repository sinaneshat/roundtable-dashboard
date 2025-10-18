import { relations, sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { CHAT_MODE_ENUM_VALUES, THREAD_STATUS_ENUM_VALUES } from '@/lib/config/chat-modes';

import { user } from './auth';

/**
 * Chat Threads
 * Container for multi-model conversations with configuration
 */
export const chatThread = sqliteTable('chat_thread', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(), // SEO-friendly URL slug (e.g., "product-strategy-abc123")
  mode: text('mode', { enum: CHAT_MODE_ENUM_VALUES })
    .notNull()
    .default('brainstorming'),
  status: text('status', { enum: THREAD_STATUS_ENUM_VALUES })
    .notNull()
    .default('active'),
  isFavorite: integer('is_favorite', { mode: 'boolean' })
    .notNull()
    .default(false), // User can mark threads as favorites
  isPublic: integer('is_public', { mode: 'boolean' })
    .notNull()
    .default(false), // Public threads can be viewed without authentication
  metadata: text('metadata', { mode: 'json' }).$type<{
    tags?: string[];
    summary?: string;
    [key: string]: unknown;
  }>(),
  // Optimistic locking - prevents lost updates in concurrent modifications
  version: integer('version').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp' }),
}, table => [
  index('chat_thread_user_idx').on(table.userId),
  index('chat_thread_status_idx').on(table.status),
  index('chat_thread_updated_idx').on(table.updatedAt),
  index('chat_thread_slug_idx').on(table.slug), // Fast lookups by slug for public sharing
  index('chat_thread_favorite_idx').on(table.isFavorite),
  index('chat_thread_public_idx').on(table.isPublic),
]);

/**
 * Custom Roles
 * User-defined role templates with system prompts that can be reused
 * Examples: "The Devil's Advocate", "The Fact Checker", "The Creative Ideator"
 * Defined before chatParticipant to allow forward reference
 */
export const chatCustomRole = sqliteTable('chat_custom_role', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(), // e.g., "The Devil's Advocate"
  description: text('description'), // Brief description of the role
  systemPrompt: text('system_prompt').notNull(), // The actual prompt that defines the role behavior
  metadata: text('metadata', { mode: 'json' }).$type<{
    tags?: string[];
    category?: string;
    [key: string]: unknown;
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  index('chat_custom_role_user_idx').on(table.userId),
  index('chat_custom_role_name_idx').on(table.name),
]);

/**
 * Chat Participants
 * Models participating in a thread with their assigned roles
 * Can use custom role templates or inline role definitions
 */
export const chatParticipant = sqliteTable('chat_participant', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(), // e.g., 'anthropic/claude-sonnet-4.5', 'openai/gpt-5'
  customRoleId: text('custom_role_id')
    .references(() => chatCustomRole.id, { onDelete: 'set null' }), // Reference to saved custom role (optional)
  role: text('role'), // Optional role name (from custom role or inline) - e.g., "The Ideator", "Devil's Advocate"
  priority: integer('priority').notNull().default(0), // Order in which models respond
  isEnabled: integer('is_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  settings: text('settings', { mode: 'json' }).$type<{
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string; // Inline system prompt (overrides custom role if both present)
    [key: string]: unknown;
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
}, table => [
  // Indexes for query performance
  index('chat_participant_thread_idx').on(table.threadId),
  index('chat_participant_priority_idx').on(table.priority),
  index('chat_participant_custom_role_idx').on(table.customRoleId),

  // ============================================================================
  // DATABASE-LEVEL CONSTRAINTS (Second layer of protection)
  // ============================================================================

  // ✅ PRIORITY CONSTRAINT: Ensure priority is non-negative
  // Rationale: Priority determines response order, must be >= 0
  check('check_priority_non_negative', sql`${table.priority} >= 0`),
]);

/**
 * Chat Thread Changelog
 * Tracks configuration changes to threads (participants, mode)
 * Shows between conversation rounds when user modifies thread configuration
 *
 * ✅ EVENT-BASED ROUND TRACKING: Like messages and analysis, changelog entries
 * are tied to specific rounds. They appear BETWEEN rounds to show what changed
 * before the next user prompt was submitted.
 *
 * Example flow:
 * - Round 1: User asks question, models respond
 * - [Analysis for Round 1]
 * - User changes mode from "brainstorming" to "analyzing"
 * - User reorders participants
 * - User submits next message → CHANGELOG CREATED for Round 2
 * - [Changelog showing mode change + reordering] ← Shows BEFORE Round 2 messages
 * - Round 2: User asks question, models respond with new config
 */
export const chatThreadChangelog = sqliteTable('chat_thread_changelog', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),
  // ✅ ROUND TRACKING: Which round does this changelog belong to?
  // Changelog for round N appears BEFORE round N messages (showing what changed)
  roundNumber: integer('round_number')
    .notNull()
    .default(1), // 1-indexed to match messages and analysis
  changeType: text('change_type', {
    enum: [
      'mode_change',
      'participant_added',
      'participant_removed',
      'participant_updated',
      'participants_reordered',
    ],
  }).notNull(),
  changeSummary: text('change_summary').notNull(), // Human-readable summary
  changeData: text('change_data', { mode: 'json' }).$type<{
    // For mode_change
    oldMode?: string;
    newMode?: string;
    // For participant changes
    participantId?: string;
    modelId?: string;
    role?: string | null;
    oldRole?: string | null;
    newRole?: string | null;
    // For participants_reordered
    participants?: Array<{
      id: string;
      modelId: string;
      role: string | null;
      order: number;
    }>;
    [key: string]: unknown;
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
}, table => [
  index('chat_thread_changelog_thread_idx').on(table.threadId),
  index('chat_thread_changelog_type_idx').on(table.changeType),
  index('chat_thread_changelog_created_idx').on(table.createdAt),
  // ✅ ROUND TRACKING INDEX: Efficient queries by thread + round
  index('chat_thread_changelog_thread_round_idx').on(table.threadId, table.roundNumber),
]);

/**
 * Chat Messages
 * Individual messages in threads (user input + model responses)
 * Supports message variants for regeneration and branching conversations
 */
export const chatMessage = sqliteTable('chat_message', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),
  participantId: text('participant_id')
    .references(() => chatParticipant.id, { onDelete: 'set null' }), // null for user messages
  role: text('role', { enum: ['user', 'assistant'] })
    .notNull()
    .default('assistant'),
  content: text('content').notNull(),
  reasoning: text('reasoning'), // For Claude extended thinking, GPT reasoning tokens
  // ✅ ROUND TRACKING: Event-based round number for reliable analysis placement
  // Round = User message + all participant responses
  // Eliminates fragile date/time calculations on frontend
  roundNumber: integer('round_number')
    .notNull()
    .default(1), // 1-indexed to match moderatorAnalysis.roundNumber
  toolCalls: text('tool_calls', { mode: 'json' }).$type<Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>>(),
  metadata: text('metadata', { mode: 'json' }).$type<{
    model?: string;
    finishReason?: string;
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    [key: string]: unknown;
  }>(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
}, table => [
  index('chat_message_thread_idx').on(table.threadId),
  index('chat_message_created_idx').on(table.createdAt),
  index('chat_message_participant_idx').on(table.participantId),
  // ✅ Composite index for efficient message filtering by role
  index('chat_message_role_idx').on(table.role),
  // ✅ Composite index for paginated message queries (thread + sort)
  index('chat_message_thread_created_idx').on(table.threadId, table.createdAt),
  // ✅ ROUND TRACKING INDEX: Efficient queries by thread + round for analysis placement
  index('chat_message_thread_round_idx').on(table.threadId, table.roundNumber),
]);

/**
 * Moderator Round Analysis
 * Stores AI-generated analysis results for each conversation round
 * Allows users to view past analyses when revisiting threads
 */
export const chatModeratorAnalysis = sqliteTable('chat_moderator_analysis', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),
  roundNumber: integer('round_number').notNull(), // 1-indexed round number
  mode: text('mode', { enum: CHAT_MODE_ENUM_VALUES }).notNull(), // Mode when analysis was performed
  userQuestion: text('user_question').notNull(), // The user's question/prompt for this round
  // ✅ CRITICAL: Status field for idempotency and state tracking
  // Prevents duplicate analysis generation on page refresh
  status: text('status', { enum: ['pending', 'streaming', 'completed', 'failed'] as const })
    .notNull()
    .default('pending'), // pending -> streaming -> completed/failed
  // Store the full analysis as JSON (leaderboard, participant analyses, summary, conclusion)
  // ✅ NULLABLE: Only populated once streaming completes successfully
  analysisData: text('analysis_data', { mode: 'json' }).$type<{
    leaderboard: Array<{
      rank: number;
      participantIndex: number;
      participantRole: string | null;
      modelName: string;
      overallRating: number;
      badge: string | null;
    }>;
    participantAnalyses: Array<{
      participantIndex: number;
      participantRole: string | null;
      modelId: string;
      modelName: string;
      overallRating: number;
      skillsMatrix: Array<{
        skillName: string;
        rating: number;
      }>;
      pros: string[];
      cons: string[];
      summary: string;
    }>;
    overallSummary: string;
    conclusion: string;
  }>(),
  // Store participant message IDs that were analyzed
  participantMessageIds: text('participant_message_ids', { mode: 'json' }).notNull().$type<string[]>(),
  // ✅ Error tracking for failed analyses
  errorMessage: text('error_message'),
  // ✅ Completion timestamp (null until status = 'completed')
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
}, table => [
  index('chat_moderator_analysis_thread_idx').on(table.threadId),
  index('chat_moderator_analysis_round_idx').on(table.threadId, table.roundNumber),
  index('chat_moderator_analysis_created_idx').on(table.createdAt),
  // ✅ NEW: Index on status for efficient querying of in-progress analyses
  index('chat_moderator_analysis_status_idx').on(table.status),
]);

/**
 * Drizzle Relations for improved query support
 */
export const chatThreadRelations = relations(chatThread, ({ one, many }) => ({
  user: one(user, {
    fields: [chatThread.userId],
    references: [user.id],
  }),
  participants: many(chatParticipant),
  messages: many(chatMessage),
  changelog: many(chatThreadChangelog), // Configuration change history
  moderatorAnalyses: many(chatModeratorAnalysis), // AI-generated round analyses
}));

export const chatCustomRoleRelations = relations(chatCustomRole, ({ one, many }) => ({
  user: one(user, {
    fields: [chatCustomRole.userId],
    references: [user.id],
  }),
  participants: many(chatParticipant), // Participants using this custom role
}));

export const chatParticipantRelations = relations(chatParticipant, ({ one, many }) => ({
  thread: one(chatThread, {
    fields: [chatParticipant.threadId],
    references: [chatThread.id],
  }),
  customRole: one(chatCustomRole, {
    fields: [chatParticipant.customRoleId],
    references: [chatCustomRole.id],
  }),
  messages: many(chatMessage),
}));

export const chatMessageRelations = relations(chatMessage, ({ one }) => ({
  thread: one(chatThread, {
    fields: [chatMessage.threadId],
    references: [chatThread.id],
  }),
  participant: one(chatParticipant, {
    fields: [chatMessage.participantId],
    references: [chatParticipant.id],
  }),
  // ✅ REMOVED: parentMessage relation (parentMessageId moved to metadata)
  // Parent message relationship is now tracked via metadata.parentMessageId
}));

/**
 * Changelog Relations
 */
export const chatThreadChangelogRelations = relations(chatThreadChangelog, ({ one }) => ({
  thread: one(chatThread, {
    fields: [chatThreadChangelog.threadId],
    references: [chatThread.id],
  }),
}));

/**
 * Moderator Analysis Relations
 */
export const chatModeratorAnalysisRelations = relations(chatModeratorAnalysis, ({ one }) => ({
  thread: one(chatThread, {
    fields: [chatModeratorAnalysis.threadId],
    references: [chatThread.id],
  }),
}));
