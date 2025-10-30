/**
 * Project Tables - ChatGPT Projects-style Knowledge Bases
 *
 * Enables project-based knowledge management with AutoRAG integration.
 * Projects group threads and provide shared context from user-uploaded documents.
 *
 * Architecture:
 * - Projects contain multiple threads (one-to-many)
 * - Projects have knowledge base files stored in R2
 * - AutoRAG indexes project folders for semantic search
 * - Metadata filtering isolates project contexts
 */

import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { user } from './auth';
import { chatThread } from './chat';

/**
 * Project Knowledge File Status
 */
export const PROJECT_FILE_STATUS_ENUM_VALUES = [
  'uploaded', // File uploaded to R2, awaiting indexing
  'indexing', // AutoRAG is processing the file
  'indexed', // Successfully indexed and queryable
  'error', // Indexing failed
] as const;

export type ProjectFileStatus = typeof PROJECT_FILE_STATUS_ENUM_VALUES[number];

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

  // Custom instructions (OpenAI Projects pattern)
  customInstructions: text('custom_instructions'), // Project-level instructions for all threads

  // AutoRAG configuration
  autoragInstanceId: text('autorag_instance_id'), // e.g., "roundtable-rag-local"
  r2FolderPrefix: text('r2_folder_prefix').notNull(), // "projects/{projectId}/"

  // Project settings
  settings: text('settings', { mode: 'json' }).$type<{
    autoIndexing?: boolean; // Auto-index new files (default: true)
    maxFileSize?: number; // Max file size in bytes
    allowedFileTypes?: string[]; // Allowed MIME types
    [key: string]: unknown;
  }>(),

  // Metadata
  metadata: text('metadata', { mode: 'json' }).$type<{
    tags?: string[];
    category?: string;
    [key: string]: unknown;
  }>(),

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
 * Project Knowledge Files
 * Tracks files uploaded to project knowledge bases
 *
 * Files are stored in R2 and indexed by AutoRAG
 */
export const projectKnowledgeFile = sqliteTable('project_knowledge_file', {
  id: text('id').primaryKey(),

  // Parent project
  projectId: text('project_id')
    .notNull()
    .references(() => chatProject.id, { onDelete: 'cascade' }),

  // File details
  filename: text('filename').notNull(), // Original filename: "Q1_Strategy.pdf"
  r2Key: text('r2_key').notNull().unique(), // R2 storage key: "projects/{projectId}/file.pdf"
  uploadedBy: text('uploaded_by')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // File metadata
  fileSize: integer('file_size').notNull(), // Size in bytes
  fileType: text('file_type').notNull(), // MIME type: "application/pdf"
  status: text('status', { enum: PROJECT_FILE_STATUS_ENUM_VALUES })
    .notNull()
    .default('uploaded'),

  // Optional metadata for AutoRAG
  metadata: text('metadata', { mode: 'json' }).$type<{
    context?: string; // LLM context hint (doesn't affect retrieval)
    description?: string; // User-provided description
    tags?: string[]; // File tags
    [key: string]: unknown;
  }>(),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' })
    .defaultNow()
    .notNull(),
}, table => [
  // Indexes for efficient queries
  index('project_knowledge_file_project_idx').on(table.projectId),
  index('project_knowledge_file_status_idx').on(table.status),
  index('project_knowledge_file_uploaded_by_idx').on(table.uploadedBy),
  index('project_knowledge_file_created_idx').on(table.createdAt),
  index('project_knowledge_file_r2_key_idx').on(table.r2Key),
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
  knowledgeFiles: many(projectKnowledgeFile),
}));

export const projectKnowledgeFileRelations = relations(projectKnowledgeFile, ({ one }) => ({
  project: one(chatProject, {
    fields: [projectKnowledgeFile.projectId],
    references: [chatProject.id],
  }),
  uploadedByUser: one(user, {
    fields: [projectKnowledgeFile.uploadedBy],
    references: [user.id],
  }),
}));
