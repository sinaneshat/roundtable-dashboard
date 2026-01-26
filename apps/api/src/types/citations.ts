/**
 * Citation & Context Types
 *
 * Consolidated type definitions for AI citations, context building, and source references.
 * SINGLE SOURCE OF TRUTH for citation-related types across all services.
 *
 * Services using these types:
 * - citation-context-builder.ts
 * - message-persistence.service.ts
 * - streaming-orchestration.service.ts
 * - prompts.service.ts
 *
 * @see /docs/type-inference-patterns.md for type safety patterns
 */

import { CitationSourceTypeSchema } from '@roundtable/shared/enums';
import * as z from 'zod';

// ============================================================================
// CITABLE SOURCE TYPES
// ============================================================================

/**
 * Citable source metadata schema
 */
export const CitableSourceMetadataSchema = z.object({
  /** Author of content */
  author: z.string().optional(),
  /** Description/excerpt */
  description: z.string().optional(),
  /** Domain for search results */
  domain: z.string().optional(),
  /** Download URL for file attachments */
  downloadUrl: z.string().optional(),
  filename: z.string().optional(),
  /** File size in bytes for attachments */
  fileSize: z.number().optional(),
  importance: z.number().optional(),
  /** MIME type for file attachments */
  mimeType: z.string().optional(),
  /** Published date for search results */
  publishedDate: z.string().optional(),
  /** Search query that returned this result */
  query: z.string().optional(),
  /** Reading time in minutes */
  readingTime: z.number().optional(),
  roundNumber: z.number().optional(),
  threadId: z.string().optional(),
  threadTitle: z.string().optional(),
  url: z.string().optional(),
  /** Word count */
  wordCount: z.number().optional(),
});

export type CitableSourceMetadata = z.infer<typeof CitableSourceMetadataSchema>;

/**
 * A citable source with unique ID for AI reference
 */
export const CitableSourceSchema = z.object({
  /** Content excerpt for context */
  content: z.string(),
  /** Unique ID for citation (e.g., mem_abc123, thd_xyz456) */
  id: z.string(),
  /** Additional metadata for resolution */
  metadata: CitableSourceMetadataSchema,
  /** Original source record ID */
  sourceId: z.string(),
  /** Display title for citation */
  title: z.string(),
  /** Source type from CITATION_SOURCE_TYPES */
  type: CitationSourceTypeSchema,
});

/** A citable source with unique ID for AI reference */
export type CitableSource = z.infer<typeof CitableSourceSchema>;

/**
 * Source map for citation resolution schema
 * Maps source IDs (e.g., mem_abc123) to full source data
 */
export const CitationSourceMapSchema = z.custom<Map<string, CitableSource>>();

export type CitationSourceMap = z.infer<typeof CitationSourceMapSchema>;

// ============================================================================
// CITABLE CONTEXT RESULT TYPES
// ============================================================================

/**
 * Stats about available context
 */
export const CitableContextStatsSchema = z.object({
  totalAttachments: z.number(),
  totalMemories: z.number(),
  totalModerators: z.number(),
  totalSearches: z.number(),
  totalThreads: z.number(),
});

export type CitableContextStats = z.infer<typeof CitableContextStatsSchema>;

/**
 * Result from building citable context
 */
export const CitableContextResultSchema = z.object({
  formattedPrompt: z.string(),
  sourceMap: CitationSourceMapSchema,
  sources: z.array(CitableSourceSchema),
  stats: CitableContextStatsSchema,
});

export type CitableContextResult = z.infer<typeof CitableContextResultSchema>;

// ============================================================================
// AVAILABLE CITATION SOURCE TYPE ENUM (5-PART PATTERN)
// ============================================================================

// 1️⃣ ARRAY CONSTANT - Source of truth for values
export const AVAILABLE_CITATION_SOURCE_TYPES = ['github', 'file'] as const;

// 2️⃣ DEFAULT VALUE
export const DEFAULT_AVAILABLE_CITATION_SOURCE_TYPE: AvailableCitationSourceType = 'file';

// 3️⃣ ZOD SCHEMA - Runtime validation + OpenAPI docs
export const AvailableCitationSourceTypeSchema = z.enum(AVAILABLE_CITATION_SOURCE_TYPES);

// 4️⃣ TYPESCRIPT TYPE - Inferred from Zod schema
export type AvailableCitationSourceType = z.infer<typeof AvailableCitationSourceTypeSchema>;

// 5️⃣ CONSTANT OBJECT - For usage in code (prevents typos)
export const AvailableCitationSourceTypes = {
  FILE: 'file' as const,
  GITHUB: 'github' as const,
} as const;

export const AvailableSourceSchema = z.object({
  description: z.string().optional(),
  domain: z.string().optional(),
  // Attachment-specific fields
  downloadUrl: z.string().optional(),
  /** Content excerpt/quote for citation display */
  excerpt: z.string().optional(),
  filename: z.string().optional(),
  fileSize: z.number().optional(),
  id: z.string(),
  mimeType: z.string().optional(),
  sourceType: CitationSourceTypeSchema,
  // Context fields
  threadTitle: z.string().optional(),
  title: z.string(),
  // Search-specific fields
  url: z.string().optional(),
});

/** Available source for citation UI */
export type AvailableSource = z.infer<typeof AvailableSourceSchema>;

// ============================================================================
// THREAD ATTACHMENT CONTEXT TYPES
// ============================================================================

/**
 * Attachment with extracted content for RAG
 */
export const ThreadAttachmentWithContentSchema = z.object({
  /** Citation ID for referencing in AI responses */
  citationId: z.string(),
  filename: z.string(),
  fileSize: z.number(),
  id: z.string(),
  messageId: z.string().nullable(),
  mimeType: z.string(),
  r2Key: z.string(),
  roundNumber: z.number().nullable(),
  /** Extracted text content (for text/code files) */
  textContent: z.string().nullable(),
});

/** Attachment with extracted content for RAG */
export type ThreadAttachmentWithContent = z.infer<typeof ThreadAttachmentWithContentSchema>;

/**
 * Stats for thread attachment context
 */
export const ThreadAttachmentContextStatsSchema = z.object({
  skipped: z.number(),
  total: z.number(),
  withContent: z.number(),
});

export type ThreadAttachmentContextStats = z.infer<typeof ThreadAttachmentContextStatsSchema>;

/**
 * Thread attachment context result
 */
export const ThreadAttachmentContextResultSchema = z.object({
  attachments: z.array(ThreadAttachmentWithContentSchema),
  citableSources: z.array(CitableSourceSchema),
  formattedPrompt: z.string(),
  stats: ThreadAttachmentContextStatsSchema,
});

export type ThreadAttachmentContextResult = z.infer<typeof ThreadAttachmentContextResultSchema>;

// ============================================================================
// ATTACHMENT CITATION INFO (for prompts)
// ============================================================================

/**
 * Attachment citation info for prompt building
 */
export const AttachmentCitationInfoSchema = z.object({
  /** Citation ID (e.g., att_abc123) */
  citationId: z.string(),
  /** Original filename */
  filename: z.string(),
  /** File size in bytes */
  fileSize: z.number(),
  /** MIME type */
  mimeType: z.string(),
  /** Round number where attachment was uploaded (null for thread-level attachments) */
  roundNumber: z.number().nullable(),
  /** Extracted text content (for text/code files) */
  textContent: z.string().nullable(),
});

/** Attachment citation info for prompt building */
export type AttachmentCitationInfo = z.infer<typeof AttachmentCitationInfoSchema>;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard: Check if value is a CitableSource
 */
export function isCitableSource(value: unknown): value is CitableSource {
  return CitableSourceSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is an AvailableSource
 */
export function isAvailableSource(value: unknown): value is AvailableSource {
  return AvailableSourceSchema.safeParse(value).success;
}

/**
 * Type guard: Check if value is ThreadAttachmentWithContent
 */
export function isThreadAttachmentWithContent(value: unknown): value is ThreadAttachmentWithContent {
  return ThreadAttachmentWithContentSchema.safeParse(value).success;
}
