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

import { relations } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import { CHAT_ATTACHMENT_STATUSES } from '@/api/core/enums';
import type { UploadMetadata } from '@/db/validation/upload';

import { user } from './auth';
import { chatMessage, chatThread } from './chat';

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
    .default('uploaded'),

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

  // Thread reference
  threadId: text('thread_id')
    .notNull()
    .references(() => chatThread.id, { onDelete: 'cascade' }),

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

  // Message reference
  messageId: text('message_id')
    .notNull()
    .references(() => chatMessage.id, { onDelete: 'cascade' }),

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

/**
 * Upload Relations
 */
export const uploadRelations = relations(upload, ({ one, many }) => ({
  user: one(user, {
    fields: [upload.userId],
    references: [user.id],
  }),
  threadUploads: many(threadUpload),
  messageUploads: many(messageUpload),
}));

/**
 * Thread Upload Relations
 */
export const threadUploadRelations = relations(threadUpload, ({ one }) => ({
  thread: one(chatThread, {
    fields: [threadUpload.threadId],
    references: [chatThread.id],
  }),
  upload: one(upload, {
    fields: [threadUpload.uploadId],
    references: [upload.id],
  }),
}));

/**
 * Message Upload Relations
 */
export const messageUploadRelations = relations(messageUpload, ({ one }) => ({
  message: one(chatMessage, {
    fields: [messageUpload.messageId],
    references: [chatMessage.id],
  }),
  upload: one(upload, {
    fields: [messageUpload.uploadId],
    references: [upload.id],
  }),
}));
