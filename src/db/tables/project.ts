/**
 * Project Tables - ChatGPT Projects-style Knowledge Bases
 *
 * Enables project-based knowledge management with AutoRAG integration.
 * Projects group threads and provide shared context from user-uploaded documents.
 *
 * Architecture:
 * - Projects contain multiple threads (one-to-many)
 * - Projects reference centralized uploads via projectAttachment junction table
 * - AutoRAG indexes project attachments for semantic search
 * - Metadata filtering isolates project contexts
 *
 * Upload Pattern (S3/R2 Best Practices):
 * - All files uploaded via centralized /uploads endpoint -> upload table
 * - Projects reference uploads via projectAttachment (junction table)
 * - Same upload can be referenced by multiple projects/threads/messages
 */

import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  PROJECT_COLORS,
  PROJECT_INDEX_STATUSES,
  PROJECT_MEMORY_SOURCES,
} from '@/api/core/enums';
import type {
  ProjectAttachmentRagMetadata,
  ProjectMemoryMetadata,
  ProjectMetadata,
  ProjectSettings,
} from '@/db/validation/project';

import { user } from './auth';
import { chatThread } from './chat';
import { upload } from './upload';

// Types: ProjectColor/ProjectIndexStatus/ProjectMemorySource from @/api/core/enums
// Types: ProjectMetadata/ProjectSettings from @/db/validation/project

/**
 * Chat Projects
 * Container for knowledge bases with AutoRAG integration
 *
 * Similar to ChatGPT Projects - groups threads with shared context
 */
export const chatProject = sqliteTable('chat_project', {
  id: text('id').primaryKey(),

  // Owner
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Project details
  name: text('name').notNull(), // "Q1 Marketing Strategy"
  description: text('description'), // Optional project description
  color: text('color', { enum: PROJECT_COLORS }).default('blue'), // Visual identification color

  // Custom instructions (OpenAI Projects pattern)
  customInstructions: text('custom_instructions'), // Project-level instructions for all threads

  // AutoRAG configuration
  autoragInstanceId: text('autorag_instance_id'), // e.g., "roundtable-rag-local"
  r2FolderPrefix: text('r2_folder_prefix').notNull(), // "projects/{projectId}/"

  // Project settings (type from validation/project.ts)
  settings: text('settings', { mode: 'json' }).$type<ProjectSettings>(),

  // Metadata (type from validation/project.ts)
  metadata: text('metadata', { mode: 'json' }).$type<ProjectMetadata>(),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, table => [
  // Indexes for efficient queries
  index('chat_project_user_idx').on(table.userId),
  index('chat_project_created_idx').on(table.createdAt),
  index('chat_project_name_idx').on(table.name),
]);

/**
 * Project Attachments (Junction Table)
 *
 * Links centralized uploads to projects for knowledge base use.
 * Follows S3/R2 best practices: centralized uploads with feature-specific references.
 *
 * Architecture:
 * - upload: Source of truth for all file uploads (R2 storage)
 * - project_attachment: References uploads for project knowledge base
 * - Same upload can be referenced by multiple projects if needed
 *
 * AutoRAG Integration:
 * - indexStatus tracks indexing progress for RAG retrieval
 * - ragMetadata provides project-specific context hints for LLM
 */
export const projectAttachment = sqliteTable('project_attachment', {
  id: text('id').primaryKey(),

  // Parent project
  projectId: text('project_id')
    .notNull()
    .references(() => chatProject.id, { onDelete: 'cascade' }),

  // Reference to centralized upload
  uploadId: text('upload_id')
    .notNull()
    .references(() => upload.id, { onDelete: 'cascade' }),

  // AutoRAG indexing status (separate from upload status)
  indexStatus: text('index_status', { enum: PROJECT_INDEX_STATUSES })
    .notNull()
    .default('pending'),

  // Project-specific metadata for RAG context
  ragMetadata: text('rag_metadata', { mode: 'json' }).$type<ProjectAttachmentRagMetadata>(),

  // User who added this attachment to the project
  addedBy: text('added_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, table => [
  // Indexes for efficient queries
  index('project_attachment_project_idx').on(table.projectId),
  index('project_attachment_upload_idx').on(table.uploadId),
  index('project_attachment_status_idx').on(table.indexStatus),
  index('project_attachment_added_by_idx').on(table.addedBy),
  index('project_attachment_created_idx').on(table.createdAt),
  // Prevent duplicate upload references in same project
  uniqueIndex('project_attachment_unique_idx').on(table.projectId, table.uploadId),
]);

/**
 * Project Memory
 * Persistent memory entries for cross-chat context within a project
 *
 * OpenAI ChatGPT Projects Pattern:
 * - Conversations within a project build persistent context over time
 * - Memory can be auto-extracted from chats or explicitly added
 * - Memory is isolated per project (project-only memory)
 */
export const projectMemory = sqliteTable('project_memory', {
  id: text('id').primaryKey(),

  // Parent project
  projectId: text('project_id')
    .notNull()
    .references(() => chatProject.id, { onDelete: 'cascade' }),

  // Memory content
  content: text('content').notNull(), // The actual memory/context text
  summary: text('summary'), // Optional short summary for display

  // Source tracking
  source: text('source', { enum: PROJECT_MEMORY_SOURCES })
    .notNull()
    .default('chat'),
  sourceThreadId: text('source_thread_id')
    .references(() => chatThread.id, { onDelete: 'set null' }), // Thread this memory came from (if applicable)
  sourceRoundNumber: integer('source_round_number'), // Round number within thread (if from chat)

  // Importance and relevance
  importance: integer('importance').notNull().default(5), // 1-10 scale for retrieval prioritization
  isActive: integer('is_active', { mode: 'boolean' })
    .notNull()
    .default(true), // Soft delete / disable memory

  // Metadata for context (type from validation/project.ts)
  metadata: text('metadata', { mode: 'json' }).$type<ProjectMemoryMetadata>(),

  // User who created/approved this memory
  createdBy: text('created_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
}, table => [
  // Indexes for efficient queries
  index('project_memory_project_idx').on(table.projectId),
  index('project_memory_source_idx').on(table.source),
  index('project_memory_thread_idx').on(table.sourceThreadId),
  index('project_memory_active_idx').on(table.isActive),
  index('project_memory_importance_idx').on(table.importance),
  index('project_memory_created_idx').on(table.createdAt),
  // Composite index for project + active memories ordered by importance
  index('project_memory_project_active_importance_idx').on(table.projectId, table.isActive, table.importance),
]);

/**
 * Relations
 */
export const chatProjectRelations = relations(chatProject, ({ one, many }) => ({
  user: one(user, {
    fields: [chatProject.userId],
    references: [user.id],
  }),
  threads: many(chatThread),
  attachments: many(projectAttachment),
  memories: many(projectMemory),
}));

export const projectAttachmentRelations = relations(projectAttachment, ({ one }) => ({
  project: one(chatProject, {
    fields: [projectAttachment.projectId],
    references: [chatProject.id],
  }),
  upload: one(upload, {
    fields: [projectAttachment.uploadId],
    references: [upload.id],
  }),
  addedByUser: one(user, {
    fields: [projectAttachment.addedBy],
    references: [user.id],
  }),
}));

export const projectMemoryRelations = relations(projectMemory, ({ one }) => ({
  project: one(chatProject, {
    fields: [projectMemory.projectId],
    references: [chatProject.id],
  }),
  sourceThread: one(chatThread, {
    fields: [projectMemory.sourceThreadId],
    references: [chatThread.id],
  }),
  createdByUser: one(user, {
    fields: [projectMemory.createdBy],
    references: [user.id],
  }),
}));
