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

import { z } from 'zod';

import { CitationSourceTypeSchema } from '@/api/core/enums';

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
 * Source map for citation resolution
 * Maps source IDs (e.g., mem_abc123) to full source data
 */
export type CitationSourceMap = Map<string, CitableSource>;

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
export type CitableContextResult = {
  /** Array of citable sources */
  sources: CitableSource[];
  /** Map for quick source lookup by ID */
  sourceMap: CitationSourceMap;
  /** Formatted prompt section with citation instructions */
  formattedPrompt: string;
  /** Stats about available context */
  stats: CitableContextStats;
};

export type AvailableCitationSourceType = 'github' | 'file';
export const AvailableSourceSchema = z.object({
  id: z.string(),
  sourceType: CitationSourceTypeSchema,
  title: z.string(),
  downloadUrl: z.string().optional(),
  filename: z.string().optional(),
  mimeType: z.string().optional(),
  fileSize: z.number().optional(),
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
export type ThreadAttachmentContextResult = {
  attachments: ThreadAttachmentWithContent[];
  /** Formatted prompt section for system prompt */
  formattedPrompt: string;
  /** Citable sources for citation resolution */
  citableSources: CitableSource[];
  stats: ThreadAttachmentContextStats;
};

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
