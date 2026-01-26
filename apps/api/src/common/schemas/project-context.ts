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
  content: z.string(),
  id: z.string().min(1),
  importance: z.number().int().nonnegative(),
  source: z.string(),
  sourceThreadId: z.string().nullable(),
  summary: z.string().nullable(),
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
  content: z.string(),
  role: z.string(),
  roundNumber: z.number().int().nonnegative(),
});

export type ProjectChatMessage = z.infer<typeof ProjectChatMessageSchema>;

export const ProjectChatThreadSchema = z.object({
  id: z.string().min(1),
  messages: z.array(ProjectChatMessageSchema),
  title: z.string(),
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
  answer: z.string().nullable(),
  query: z.string(),
});

export type ProjectSearchResult = z.infer<typeof ProjectSearchResultSchema>;

export const ProjectSearchItemSchema = z.object({
  results: z.array(ProjectSearchResultSchema),
  roundNumber: z.number().int().nonnegative(),
  summary: z.string().nullable(),
  threadId: z.string().min(1),
  threadTitle: z.string(),
  userQuery: z.string(),
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
  keyThemes: z.string().nullable(),
  moderator: z.string(),
  recommendations: z.array(z.string()),
  roundNumber: z.number().int().nonnegative(),
  threadId: z.string().min(1),
  threadTitle: z.string(),
  userQuestion: z.string(),
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
  filename: z.string(),
  fileSize: z.number().int().nonnegative(),
  id: z.string().min(1),
  mimeType: z.string(),
  r2Key: z.string(),
  source: z.enum(['project', 'thread']),
  textContent: z.string().nullable(),
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
  attachments: ProjectAttachmentContextSchema,
  chats: ProjectChatContextSchema,
  memories: ProjectMemoryContextSchema,
  moderators: ProjectModeratorContextSchema,
  searches: ProjectSearchContextSchema,
});

export type AggregatedProjectContext = z.infer<typeof AggregatedProjectContextSchema>;

// ============================================================================
// Project Context Params Schema
// ============================================================================

export const ProjectContextParamsSchema = z.object({
  currentThreadId: z.string().min(1),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  maxMemories: z.number().int().positive().optional(),
  maxMessagesPerThread: z.number().int().positive().optional(),
  maxModerators: z.number().int().positive().optional(),
  maxSearchResults: z.number().int().positive().optional(),
  projectId: z.string().min(1),
  r2Bucket: z.custom<R2Bucket>().optional(),
  userQuery: z.string(),
});

export type ProjectContextParams = z.infer<typeof ProjectContextParamsSchema>;

// ============================================================================
// RAG Context Params Schema
// ============================================================================

export const ProjectRagContextParamsSchema = z.object({
  ai: z.custom<Ai | undefined>(),
  db: z.custom<Awaited<ReturnType<typeof getDbAsync>>>(),
  maxResults: z.number().int().positive().optional(),
  projectId: z.string().min(1),
  query: z.string().min(1),
  userId: z.string().min(1).optional(),
});

export type ProjectRagContextParams = z.infer<typeof ProjectRagContextParamsSchema>;

// ============================================================================
// Citable Context Params Schema
// ============================================================================

export const CitableContextParamsSchema = ProjectContextParamsSchema.extend({
  baseUrl: z.string().min(1).describe('Base URL for generating absolute download URLs'),
  includeAttachments: z.boolean().optional(),
});

export type CitableContextParams = z.infer<typeof CitableContextParamsSchema>;
