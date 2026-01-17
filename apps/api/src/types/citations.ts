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
import { z } from 'zod';

// ============================================================================
// CITABLE SOURCE TYPES
// ============================================================================

/**
 * Citable source metadata schema
 */
export const CitableSourceMetadataSchema = z.object({
  threadId: z.string().optional(),
  threadTitle: z.string().optional(),
  roundNumber: z.number().optional(),
  url: z.string().optional(),
  importance: z.number().optional(),
  filename: z.string().optional(),
  /** Download URL for file attachments */
  downloadUrl: z.string().optional(),
  /** MIME type for file attachments */
  mimeType: z.string().optional(),
  /** File size in bytes for attachments */
  fileSize: z.number().optional(),
  /** Domain for search results */
  domain: z.string().optional(),
  /** Published date for search results */
  publishedDate: z.string().optional(),
  /** Search query that returned this result */
  query: z.string().optional(),
  /** Author of content */
  author: z.string().optional(),
  /** Word count */
  wordCount: z.number().optional(),
  /** Reading time in minutes */
  readingTime: z.number().optional(),
  /** Description/excerpt */
  description: z.string().optional(),
});

export type CitableSourceMetadata = z.infer<typeof CitableSourceMetadataSchema>;

/**
 * A citable source with unique ID for AI reference
 */
export const CitableSourceSchema = z.object({
  /** Unique ID for citation (e.g., mem_abc123, thd_xyz456) */
  id: z.string(),
  /** Source type from CITATION_SOURCE_TYPES */
  type: CitationSourceTypeSchema,
  /** Original source record ID */
  sourceId: z.string(),
  /** Display title for citation */
  title: z.string(),
  /** Content excerpt for context */
  content: z.string(),
  /** Additional metadata for resolution */
  metadata: CitableSourceMetadataSchema,
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
  totalMemories: z.number(),
  totalThreads: z.number(),
  totalSearches: z.number(),
  totalModerators: z.number(),
  totalAttachments: z.number(),
});

export type CitableContextStats = z.infer<typeof CitableContextStatsSchema>;

/**
 * Result from building citable context
 */
export const CitableContextResultSchema = z.object({
  sources: z.array(CitableSourceSchema),
  sourceMap: CitationSourceMapSchema,
  formattedPrompt: z.string(),
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
  GITHUB: 'github' as const,
  FILE: 'file' as const,
} as const;

export const AvailableSourceSchema = z.object({
  id: z.string(),
  sourceType: CitationSourceTypeSchema,
  title: z.string(),
  // Attachment-specific fields
  downloadUrl: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
  // Search-specific fields
  url: z.string().optional(),
  domain: z.string().optional(),
  // Context fields
  threadTitle: z.string().optional(),
  description: z.string().optional(),
  /** Content excerpt/quote for citation display */
  excerpt: z.string().optional(),
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
  id: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  r2Key: z.string(),
  messageId: z.string().nullable(),
  roundNumber: z.number().nullable(),
  /** Extracted text content (for text/code files) */
  textContent: z.string().nullable(),
  /** Citation ID for referencing in AI responses */
  citationId: z.string(),
});

/** Attachment with extracted content for RAG */
export type ThreadAttachmentWithContent = z.infer<typeof ThreadAttachmentWithContentSchema>;

/**
 * Stats for thread attachment context
 */
export const ThreadAttachmentContextStatsSchema = z.object({
  total: z.number(),
  withContent: z.number(),
  skipped: z.number(),
});

export type ThreadAttachmentContextStats = z.infer<typeof ThreadAttachmentContextStatsSchema>;

/**
 * Thread attachment context result
 */
export const ThreadAttachmentContextResultSchema = z.object({
  attachments: z.array(ThreadAttachmentWithContentSchema),
  formattedPrompt: z.string(),
  citableSources: z.array(CitableSourceSchema),
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
  /** Original filename */
  filename: z.string(),
  /** Citation ID (e.g., att_abc123) */
  citationId: z.string(),
  /** MIME type */
  mimeType: z.string(),
  /** File size in bytes */
  fileSize: z.number(),
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
