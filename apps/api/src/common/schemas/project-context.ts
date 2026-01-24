/**
 * Project Context Schemas
 *
 * Centralized Zod schemas for project context service contracts.
 * Single source of truth for RAG context, memories, chats, searches, and moderators.
 */

import * as z from 'zod';

import type { getDbAsync } from '@/db';

// ============================================================================
// Memory Context Schemas
// ============================================================================

export const ProjectMemoryItemSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  summary: z.string().nullable(),
  source: z.string(),
  importance: z.number().int().nonnegative(),
  sourceThreadId: z.string().nullable(),
});

export type ProjectMemoryItem = z.infer<typeof ProjectMemoryItemSchema>;

export const ProjectMemoryContextSchema = z.object({
  memories: z.array(ProjectMemoryItemSchema),
  totalCount: z.number().int().nonnegative(),
});

export type ProjectMemoryContext = z.infer<typeof ProjectMemoryContextSchema>;

// ============================================================================
// Chat Context Schemas
// ============================================================================

export const ProjectChatMessageSchema = z.object({
  role: z.string(),
  content: z.string(),
  roundNumber: z.number().int().nonnegative(),
});

export type ProjectChatMessage = z.infer<typeof ProjectChatMessageSchema>;

export const ProjectChatThreadSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  messages: z.array(ProjectChatMessageSchema),
});

export type ProjectChatThread = z.infer<typeof ProjectChatThreadSchema>;

export const ProjectChatContextSchema = z.object({
  threads: z.array(ProjectChatThreadSchema),
  totalThreads: z.number().int().nonnegative(),
});

export type ProjectChatContext = z.infer<typeof ProjectChatContextSchema>;

// ============================================================================
// Search Context Schemas
// ============================================================================

export const ProjectSearchResultSchema = z.object({
  query: z.string(),
  answer: z.string().nullable(),
});

export type ProjectSearchResult = z.infer<typeof ProjectSearchResultSchema>;

export const ProjectSearchItemSchema = z.object({
  threadId: z.string().min(1),
  threadTitle: z.string(),
  roundNumber: z.number().int().nonnegative(),
  userQuery: z.string(),
  summary: z.string().nullable(),
  results: z.array(ProjectSearchResultSchema),
});

export type ProjectSearchItem = z.infer<typeof ProjectSearchItemSchema>;

export const ProjectSearchContextSchema = z.object({
  searches: z.array(ProjectSearchItemSchema),
  totalCount: z.number().int().nonnegative(),
});

export type ProjectSearchContext = z.infer<typeof ProjectSearchContextSchema>;

// ============================================================================
// Moderator Context Schemas
// ============================================================================

export const ProjectModeratorItemSchema = z.object({
  threadId: z.string().min(1),
  threadTitle: z.string(),
  roundNumber: z.number().int().nonnegative(),
  userQuestion: z.string(),
  moderator: z.string(),
  recommendations: z.array(z.string()),
  keyThemes: z.string().nullable(),
});

export type ProjectModeratorItem = z.infer<typeof ProjectModeratorItemSchema>;

export const ProjectModeratorContextSchema = z.object({
  moderators: z.array(ProjectModeratorItemSchema),
  totalCount: z.number().int().nonnegative(),
});

export type ProjectModeratorContext = z.infer<typeof ProjectModeratorContextSchema>;

// ============================================================================
// Attachment Context Schemas
// ============================================================================

export const ProjectAttachmentItemSchema = z.object({
  id: z.string().min(1),
  filename: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int().nonnegative(),
  r2Key: z.string(),
  threadId: z.string().nullable(),
  threadTitle: z.string().nullable(),
});

export type ProjectAttachmentItem = z.infer<typeof ProjectAttachmentItemSchema>;

export const ProjectAttachmentContextSchema = z.object({
  attachments: z.array(ProjectAttachmentItemSchema),
  totalCount: z.number().int().nonnegative(),
});

export type ProjectAttachmentContext = z.infer<typeof ProjectAttachmentContextSchema>;

// ============================================================================
// Aggregated Context Schema
// ============================================================================

export const AggregatedProjectContextSchema = z.object({
  memories: ProjectMemoryContextSchema,
  chats: ProjectChatContextSchema,
  searches: ProjectSearchContextSchema,
  moderators: ProjectModeratorContextSchema,
  attachments: ProjectAttachmentContextSchema,
});

export type AggregatedProjectContext = z.infer<typeof AggregatedProjectContextSchema>;

// ============================================================================
// Project Context Params Schema
// ============================================================================

export const ProjectContextParamsSchema = z.object({
  projectId: z.string().min(1),
  currentThreadId: z.string().min(1),
  userQuery: z.string(),
  maxMemories: z.number().int().positive().optional(),
  maxMessagesPerThread: z.number().int().positive().optional(),
  maxSearchResults: z.number().int().positive().optional(),
  maxModerators: z.number().int().positive().optional(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
});

export type ProjectContextParams = z.infer<typeof ProjectContextParamsSchema>;

// ============================================================================
// RAG Context Params Schema
// ============================================================================

export const ProjectRagContextParamsSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().min(1),
  ai: z.custom<Ai | undefined>(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  maxResults: z.number().int().positive().optional(),
  userId: z.string().min(1).optional(),
});

export type ProjectRagContextParams = z.infer<typeof ProjectRagContextParamsSchema>;
