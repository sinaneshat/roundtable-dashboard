/**
 * Database Relations - Centralized Drizzle Relations
 *
 * All relations are defined here to break circular dependencies between table files.
 * Tables can still import each other for FK references (lazy callbacks), but relations
 * that need cross-table imports must be defined in this central file.
 */

import { relations } from 'drizzle-orm';

import { user } from './auth';
import {
  chatCustomRole,
  chatMessage,
  chatParticipant,
  chatPreSearch,
  chatThread,
  chatThreadChangelog,
  chatUserPreset,
  roundExecution,
} from './chat';
import { chatProject, projectAttachment, projectMemory } from './project';
import { messageUpload, threadUpload, upload } from './upload';

// ============================================================================
// Chat Relations
// ============================================================================

export const chatThreadRelations = relations(chatThread, ({ many, one }) => ({
  changelog: many(chatThreadChangelog),
  messages: many(chatMessage),
  participants: many(chatParticipant),
  preSearches: many(chatPreSearch),
  project: one(chatProject, {
    fields: [chatThread.projectId],
    references: [chatProject.id],
  }),
  user: one(user, {
    fields: [chatThread.userId],
    references: [user.id],
  }),
}));

export const chatCustomRoleRelations = relations(chatCustomRole, ({ many, one }) => ({
  participants: many(chatParticipant),
  user: one(user, {
    fields: [chatCustomRole.userId],
    references: [user.id],
  }),
}));

export const chatUserPresetRelations = relations(chatUserPreset, ({ one }) => ({
  user: one(user, {
    fields: [chatUserPreset.userId],
    references: [user.id],
  }),
}));

export const chatParticipantRelations = relations(chatParticipant, ({ many, one }) => ({
  customRole: one(chatCustomRole, {
    fields: [chatParticipant.customRoleId],
    references: [chatCustomRole.id],
  }),
  messages: many(chatMessage),
  thread: one(chatThread, {
    fields: [chatParticipant.threadId],
    references: [chatThread.id],
  }),
}));

export const chatMessageRelations = relations(chatMessage, ({ many, one }) => ({
  messageUploads: many(messageUpload),
  participant: one(chatParticipant, {
    fields: [chatMessage.participantId],
    references: [chatParticipant.id],
  }),
  thread: one(chatThread, {
    fields: [chatMessage.threadId],
    references: [chatThread.id],
  }),
}));

export const chatThreadChangelogRelations = relations(chatThreadChangelog, ({ one }) => ({
  thread: one(chatThread, {
    fields: [chatThreadChangelog.threadId],
    references: [chatThread.id],
  }),
}));

export const chatPreSearchRelations = relations(chatPreSearch, ({ one }) => ({
  thread: one(chatThread, {
    fields: [chatPreSearch.threadId],
    references: [chatThread.id],
  }),
}));

export const roundExecutionRelations = relations(roundExecution, ({ one }) => ({
  thread: one(chatThread, {
    fields: [roundExecution.threadId],
    references: [chatThread.id],
  }),
  user: one(user, {
    fields: [roundExecution.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// Project Relations
// ============================================================================

export const chatProjectRelations = relations(chatProject, ({ many, one }) => ({
  attachments: many(projectAttachment),
  memories: many(projectMemory),
  threads: many(chatThread),
  user: one(user, {
    fields: [chatProject.userId],
    references: [user.id],
  }),
}));

export const projectAttachmentRelations = relations(projectAttachment, ({ one }) => ({
  addedByUser: one(user, {
    fields: [projectAttachment.addedBy],
    references: [user.id],
  }),
  project: one(chatProject, {
    fields: [projectAttachment.projectId],
    references: [chatProject.id],
  }),
  upload: one(upload, {
    fields: [projectAttachment.uploadId],
    references: [upload.id],
  }),
}));

export const projectMemoryRelations = relations(projectMemory, ({ one }) => ({
  createdByUser: one(user, {
    fields: [projectMemory.createdBy],
    references: [user.id],
  }),
  project: one(chatProject, {
    fields: [projectMemory.projectId],
    references: [chatProject.id],
  }),
  sourceThread: one(chatThread, {
    fields: [projectMemory.sourceThreadId],
    references: [chatThread.id],
  }),
}));

// ============================================================================
// Upload Relations
// ============================================================================

export const uploadRelations = relations(upload, ({ many, one }) => ({
  messageUploads: many(messageUpload),
  threadUploads: many(threadUpload),
  user: one(user, {
    fields: [upload.userId],
    references: [user.id],
  }),
}));

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
