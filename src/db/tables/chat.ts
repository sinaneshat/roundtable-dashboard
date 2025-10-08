import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import type { ChatModeId } from '@/lib/config/chat-modes';
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
  index('chat_participant_thread_idx').on(table.threadId),
  index('chat_participant_priority_idx').on(table.priority),
  index('chat_participant_custom_role_idx').on(table.customRoleId),
]);

/**
 * Chat Sessions
 * Represents one roundtable session = 1 user prompt + all participant responses
 * Normalized for queryability and referential integrity
 */
export const chatSession = sqliteTable('chat_session', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),
  sessionNumber: integer('session_number').notNull(), // Sequential: 1, 2, 3...
  mode: text('mode', { enum: CHAT_MODE_ENUM_VALUES })
    .notNull()
    .$type<ChatModeId>(), // Mode active during this session
  userPrompt: text('user_prompt').notNull(), // The user message that started this session
  userMessageId: text('user_message_id').notNull(), // Reference to the user message
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  completedAt: integer('completed_at', { mode: 'timestamp' }), // When all participants responded
}, table => [
  index('chat_session_thread_idx').on(table.threadId),
  index('chat_session_number_idx').on(table.threadId, table.sessionNumber), // Fast session queries
  index('chat_session_mode_idx').on(table.mode), // Query sessions by mode
]);

/**
 * Chat Session Participants
 * Junction table tracking which participants were active in each session
 * Enables querying: "Which sessions used Claude Opus?" or "What models participated together?"
 */
export const chatSessionParticipant = sqliteTable('chat_session_participant', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => chatSession.id, { onDelete: 'cascade' }),
  participantId: text('participant_id')
    .notNull()
    .references(() => chatParticipant.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(), // Denormalized for fast queries without joining
  role: text('role'), // Participant role during this session
  priority: integer('priority').notNull(), // Order in which this participant responded
  responded: integer('responded', { mode: 'boolean' })
    .notNull()
    .default(false), // Did this participant complete their response?
}, table => [
  index('chat_session_participant_session_idx').on(table.sessionId),
  index('chat_session_participant_model_idx').on(table.modelId), // Query by model
  index('chat_session_participant_priority_idx').on(table.sessionId, table.priority), // Response order
]);

/**
 * Chat Session Memories
 * Junction table tracking which memories were attached during each session
 * Enables querying: "Which sessions used memory X?" or "What memories were used together?"
 * Forward reference to chatMemory using function pattern
 */
export const chatSessionMemory = sqliteTable('chat_session_memory', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => chatSession.id, { onDelete: 'cascade' }),
  memoryId: text('memory_id').notNull(), // FK to chat_memory.id (enforced at DB level)
  memoryTitle: text('memory_title').notNull(), // Denormalized for display without joins
}, table => [
  index('chat_session_memory_session_idx').on(table.sessionId),
  index('chat_session_memory_memory_idx').on(table.memoryId),
]);

/**
 * Chat Messages
 * Individual messages in threads (user input + model responses)
 * Now references chat_session for proper normalization
 */
export const chatMessage = sqliteTable('chat_message', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),
  sessionId: text('session_id')
    .references(() => chatSession.id, { onDelete: 'set null' }), // ✅ FK to session
  participantId: text('participant_id')
    .references(() => chatParticipant.id, { onDelete: 'set null' }), // null for user messages
  role: text('role', { enum: ['user', 'assistant'] })
    .notNull()
    .default('assistant'),
  content: text('content').notNull(),
  reasoning: text('reasoning'), // For Claude extended thinking, GPT reasoning tokens
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
  parentMessageId: text('parent_message_id')
    // Self-reference for message threading - TypeScript has issues with circular refs
    .references((): ReturnType<typeof text> => chatMessage.id as ReturnType<typeof text>, {
      onDelete: 'set null',
    }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
}, table => [
  index('chat_message_thread_idx').on(table.threadId),
  index('chat_message_session_idx').on(table.sessionId), // ✅ Fast session message queries
  index('chat_message_created_idx').on(table.createdAt),
  index('chat_message_participant_idx').on(table.participantId),
]);

/**
 * Chat Memories
 * User-provided context, notes, and memories for threads
 * Can be reused across multiple threads
 */
export const chatMemory = sqliteTable('chat_memory', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  threadId: text('thread_id')
    .references(() => chatThread.id, { onDelete: 'cascade' }), // null = reusable memory, non-null = thread-specific
  type: text('type', { enum: ['personal', 'topic', 'instruction', 'fact'] })
    .notNull()
    .default('topic'),
  title: text('title').notNull(),
  description: text('description'), // Brief description of the memory
  content: text('content').notNull(),
  isGlobal: integer('is_global', { mode: 'boolean' })
    .notNull()
    .default(false), // If true, auto-applies to all threads
  metadata: text('metadata', { mode: 'json' }).$type<{
    tags?: string[];
    relevance?: number;
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
  index('chat_memory_user_idx').on(table.userId),
  index('chat_memory_thread_idx').on(table.threadId),
  index('chat_memory_global_idx').on(table.isGlobal),
]);

/**
 * Chat Thread-Memory Junction Table
 * Many-to-many relationship: allows attaching reusable memories to threads
 */
export const chatThreadMemory = sqliteTable('chat_thread_memory', {
  id: text('id').primaryKey(),
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),
  memoryId: text('memory_id')
    .notNull()
    .references(() => chatMemory.id, { onDelete: 'cascade' }),
  attachedAt: integer('attached_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
}, table => [
  index('chat_thread_memory_thread_idx').on(table.threadId),
  index('chat_thread_memory_memory_idx').on(table.memoryId),
  // Prevent duplicate memory attachments to the same thread
  index('chat_thread_memory_unique_idx').on(table.threadId, table.memoryId),
]);

/**
 * Model Configurations
 * Supported models and their default settings
 */
export const modelConfiguration = sqliteTable('model_configuration', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['openrouter', 'anthropic', 'openai', 'google', 'xai', 'perplexity'] })
    .notNull(),
  modelId: text('model_id').notNull().unique(), // Full model ID (e.g., 'anthropic/claude-sonnet-4.5')
  name: text('name').notNull(), // Display name
  description: text('description'),
  capabilities: text('capabilities', { mode: 'json' }).$type<{
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    reasoning?: boolean;
  }>(),
  defaultSettings: text('default_settings', { mode: 'json' }).$type<{
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    [key: string]: unknown;
  }>(),
  isEnabled: integer('is_enabled', { mode: 'boolean' })
    .notNull()
    .default(true),
  order: integer('order').notNull().default(0), // Display order
  metadata: text('metadata', { mode: 'json' }).$type<{
    icon?: string;
    color?: string;
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
  index('model_configuration_provider_idx').on(table.provider),
  index('model_configuration_enabled_idx').on(table.isEnabled),
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
  memories: many(chatMemory), // Thread-specific memories (threadId is set)
  threadMemories: many(chatThreadMemory), // Attached reusable memories via junction table
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
  session: one(chatSession, {
    fields: [chatMessage.sessionId],
    references: [chatSession.id],
  }),
  participant: one(chatParticipant, {
    fields: [chatMessage.participantId],
    references: [chatParticipant.id],
  }),
  parentMessage: one(chatMessage, {
    fields: [chatMessage.parentMessageId],
    references: [chatMessage.id],
    relationName: 'messageThread',
  }),
}));

export const chatMemoryRelations = relations(chatMemory, ({ one, many }) => ({
  user: one(user, {
    fields: [chatMemory.userId],
    references: [user.id],
  }),
  thread: one(chatThread, {
    fields: [chatMemory.threadId],
    references: [chatThread.id],
  }),
  threadMemories: many(chatThreadMemory), // Threads this memory is attached to via junction table
}));

export const chatThreadMemoryRelations = relations(chatThreadMemory, ({ one }) => ({
  thread: one(chatThread, {
    fields: [chatThreadMemory.threadId],
    references: [chatThread.id],
  }),
  memory: one(chatMemory, {
    fields: [chatThreadMemory.memoryId],
    references: [chatMemory.id],
  }),
}));

/**
 * Session Relations
 */
export const chatSessionRelations = relations(chatSession, ({ one, many }) => ({
  thread: one(chatThread, {
    fields: [chatSession.threadId],
    references: [chatThread.id],
  }),
  messages: many(chatMessage),
  sessionParticipants: many(chatSessionParticipant),
  sessionMemories: many(chatSessionMemory),
}));

export const chatSessionParticipantRelations = relations(chatSessionParticipant, ({ one }) => ({
  session: one(chatSession, {
    fields: [chatSessionParticipant.sessionId],
    references: [chatSession.id],
  }),
  participant: one(chatParticipant, {
    fields: [chatSessionParticipant.participantId],
    references: [chatParticipant.id],
  }),
}));

export const chatSessionMemoryRelations = relations(chatSessionMemory, ({ one }) => ({
  session: one(chatSession, {
    fields: [chatSessionMemory.sessionId],
    references: [chatSession.id],
  }),
  memory: one(chatMemory, {
    fields: [chatSessionMemory.memoryId],
    references: [chatMemory.id],
  }),
}));
