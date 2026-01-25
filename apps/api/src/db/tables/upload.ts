/**
 * Upload Tables - Centralized File Storage
 *
 * Clean architecture for file uploads with junction tables for relationships.
 * Follows S3/R2 best practices: centralized uploads with feature-specific references.
 *
 * Architecture:
 * - upload: Central file storage (R2 bucket references)
 * - threadUpload: Junction table linking uploads to threads
 * - messageUpload: Junction table linking uploads to messages
 * - projectAttachment: Junction table linking uploads to projects (in project.ts)
 *
 * Benefits:
 * - Same upload can be reused across threads, messages, projects
 * - No nullable FKs creating ambiguous data states
 * - Consistent junction table pattern everywhere
 * - Clean separation of concerns
 */

import { CHAT_ATTACHMENT_STATUSES, DEFAULT_CHAT_ATTACHMENT_STATUS } from '@roundtable/shared/enums';
// Relations imported from centralized relations.ts
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import type { UploadMetadata } from '@/db/validation/upload';

import { user } from './auth';

// NOTE: chatMessage/chatThread imports removed to break circular dependency.
// FK constraints are enforced at DB level via migration.

// Types: ChatAttachmentStatus from @/api/core/enums, UploadMetadata from @/db/validation/upload

/**
 * Upload
 * Central file storage entity - represents an uploaded file in R2
 *
 * This table is the single source of truth for file metadata.
 * Relationships to threads, messages, and projects are handled via junction tables.
 */
export const upload = sqliteTable('upload', {
  id: text('id').primaryKey(),

  // Owner - user who uploaded the file
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),

  // File details
  filename: text('filename').notNull(), // Original filename: "report.pdf"
  r2Key: text('r2_key').notNull().unique(), // R2 storage key: "uploads/{userId}/{id}_{filename}"

  // File metadata
  fileSize: integer('file_size').notNull(), // Size in bytes
  mimeType: text('mime_type').notNull(), // MIME type: "application/pdf", "image/png"
  status: text('status', { enum: CHAT_ATTACHMENT_STATUSES })
    .notNull()
    .default(DEFAULT_CHAT_ATTACHMENT_STATUS),

  // Processing metadata (for AI/extraction)
  metadata: text('metadata', { mode: 'json' }).$type<UploadMetadata>(),

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
  index('upload_user_idx').on(table.userId),
  index('upload_status_idx').on(table.status),
  index('upload_created_idx').on(table.createdAt),
  index('upload_r2_key_idx').on(table.r2Key),
  index('upload_mime_type_idx').on(table.mimeType),
]);

/**
 * Thread Upload (Junction Table)
 * Links uploads to threads for file attachments in chat conversations
 */
export const threadUpload = sqliteTable('thread_upload', {
  id: text('id').primaryKey(),

  // FK to chat_thread.id enforced at DB level (avoids circular import)
  threadId: text('thread_id')
    .notNull(),

  // Upload reference
  uploadId: text('upload_id')
    .notNull()
    .references(() => upload.id, { onDelete: 'cascade' }),

  // Context for this attachment in the thread
  context: text('context'), // Optional description of how this file is used

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
}, table => [
  index('thread_upload_thread_idx').on(table.threadId),
  index('thread_upload_upload_idx').on(table.uploadId),
  index('thread_upload_created_idx').on(table.createdAt),
  // Prevent duplicate upload references in same thread
  uniqueIndex('thread_upload_unique_idx').on(table.threadId, table.uploadId),
]);

/**
 * Message Upload (Junction Table)
 * Links uploads to specific messages for inline attachments
 */
export const messageUpload = sqliteTable('message_upload', {
  id: text('id').primaryKey(),

  // FK to chat_message.id enforced at DB level (avoids circular import)
  messageId: text('message_id')
    .notNull(),

  // Upload reference
  uploadId: text('upload_id')
    .notNull()
    .references(() => upload.id, { onDelete: 'cascade' }),

  // Order of attachment in message (for multiple attachments)
  displayOrder: integer('display_order').notNull().default(0),

  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .defaultNow()
    .notNull(),
}, table => [
  index('message_upload_message_idx').on(table.messageId),
  index('message_upload_upload_idx').on(table.uploadId),
  index('message_upload_created_idx').on(table.createdAt),
  // Prevent duplicate upload references in same message
  uniqueIndex('message_upload_unique_idx').on(table.messageId, table.uploadId),
]);

// Relations moved to relations.ts to break circular dependencies
