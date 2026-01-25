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
  chatRoundFeedback,
  chatThread,
  chatThreadChangelog,
  chatUserPreset,
} from './chat';
import { chatProject, projectAttachment, projectMemory } from './project';
import { messageUpload, threadUpload, upload } from './upload';

// ============================================================================
// Chat Relations
// ============================================================================

export const chatThreadRelations = relations(chatThread, ({ one, many }) => ({
  user: one(user, {
    fields: [chatThread.userId],
    references: [user.id],
  }),
  project: one(chatProject, {
    fields: [chatThread.projectId],
    references: [chatProject.id],
  }),
  participants: many(chatParticipant),
  messages: many(chatMessage),
  changelog: many(chatThreadChangelog),
  preSearches: many(chatPreSearch),
  roundFeedback: many(chatRoundFeedback),
}));

export const chatCustomRoleRelations = relations(chatCustomRole, ({ one, many }) => ({
  user: one(user, {
    fields: [chatCustomRole.userId],
    references: [user.id],
  }),
  participants: many(chatParticipant),
}));

export const chatUserPresetRelations = relations(chatUserPreset, ({ one }) => ({
  user: one(user, {
    fields: [chatUserPreset.userId],
    references: [user.id],
  }),
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

export const chatMessageRelations = relations(chatMessage, ({ one, many }) => ({
  thread: one(chatThread, {
    fields: [chatMessage.threadId],
    references: [chatThread.id],
  }),
  participant: one(chatParticipant, {
    fields: [chatMessage.participantId],
    references: [chatParticipant.id],
  }),
  messageUploads: many(messageUpload),
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

export const chatRoundFeedbackRelations = relations(chatRoundFeedback, ({ one }) => ({
  thread: one(chatThread, {
    fields: [chatRoundFeedback.threadId],
    references: [chatThread.id],
  }),
  user: one(user, {
    fields: [chatRoundFeedback.userId],
    references: [user.id],
  }),
}));

// ============================================================================
// Project Relations
// ============================================================================

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

// ============================================================================
// Upload Relations
// ============================================================================

export const uploadRelations = relations(upload, ({ one, many }) => ({
  user: one(user, {
    fields: [upload.userId],
    references: [user.id],
  }),
  threadUploads: many(threadUpload),
  messageUploads: many(messageUpload),
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
