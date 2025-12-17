/**
 * Project and Knowledge Base Enums
 *
 * Enums for project management, attachments, memories, and citations.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// PROJECT INDEX STATUS (AutoRAG indexing for project attachments)
// ============================================================================

export const PROJECT_INDEX_STATUSES = [
  'pending',
  'indexing',
  'indexed',
  'failed',
] as const;

export const DEFAULT_PROJECT_INDEX_STATUS: ProjectIndexStatus = 'pending';

export const ProjectIndexStatusSchema = z.enum(PROJECT_INDEX_STATUSES).openapi({
  description: 'AutoRAG indexing status for project attachments',
  example: 'indexed',
});

export type ProjectIndexStatus = z.infer<typeof ProjectIndexStatusSchema>;

export const ProjectIndexStatuses = {
  PENDING: 'pending' as const,
  INDEXING: 'indexing' as const,
  INDEXED: 'indexed' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// PROJECT MEMORY SOURCE (origin of memory entries)
// ============================================================================

export const PROJECT_MEMORY_SOURCES = [
  'chat',
  'explicit',
  'summary',
  'search',
] as const;

export const DEFAULT_PROJECT_MEMORY_SOURCE: ProjectMemorySource = 'chat';

export const ProjectMemorySourceSchema = z.enum(PROJECT_MEMORY_SOURCES).openapi({
  description: 'Source of the project memory entry',
  example: 'chat',
});

export type ProjectMemorySource = z.infer<typeof ProjectMemorySourceSchema>;

export const ProjectMemorySources = {
  CHAT: 'chat' as const,
  EXPLICIT: 'explicit' as const,
  SUMMARY: 'summary' as const,
  SEARCH: 'search' as const,
} as const;

// ============================================================================
// PROJECT COLOR (visual identification)
// ============================================================================

export const PROJECT_COLORS = [
  'gray',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;

export const DEFAULT_PROJECT_COLOR: ProjectColor = 'blue';

export const ProjectColorSchema = z.enum(PROJECT_COLORS).openapi({
  description: 'Project color for visual identification',
  example: 'blue',
});

export type ProjectColor = z.infer<typeof ProjectColorSchema>;

export const ProjectColors = {
  GRAY: 'gray' as const,
  RED: 'red' as const,
  ORANGE: 'orange' as const,
  AMBER: 'amber' as const,
  YELLOW: 'yellow' as const,
  LIME: 'lime' as const,
  GREEN: 'green' as const,
  EMERALD: 'emerald' as const,
  TEAL: 'teal' as const,
  CYAN: 'cyan' as const,
  SKY: 'sky' as const,
  BLUE: 'blue' as const,
  INDIGO: 'indigo' as const,
  VIOLET: 'violet' as const,
  PURPLE: 'purple' as const,
  FUCHSIA: 'fuchsia' as const,
  PINK: 'pink' as const,
  ROSE: 'rose' as const,
} as const;

// ============================================================================
// CITATION SOURCE TYPE (RAG context citation sources)
// ============================================================================

export const CITATION_SOURCE_TYPES = [
  'memory',
  'thread',
  'attachment',
  'search',
  'summary',
  'rag',
] as const;

export const DEFAULT_CITATION_SOURCE_TYPE: CitationSourceType = 'memory';

export const CitationSourceTypeSchema = z.enum(CITATION_SOURCE_TYPES).openapi({
  description: 'Type of source being cited in AI response',
  example: 'memory',
});

export type CitationSourceType = z.infer<typeof CitationSourceTypeSchema>;

export const CitationSourceTypes = {
  MEMORY: 'memory' as const,
  THREAD: 'thread' as const,
  ATTACHMENT: 'attachment' as const,
  SEARCH: 'search' as const,
  SUMMARY: 'summary' as const,
  RAG: 'rag' as const,
} as const;

export const CitationSourceLabels: Record<CitationSourceType, string> = {
  [CitationSourceTypes.MEMORY]: 'Memory',
  [CitationSourceTypes.THREAD]: 'Thread',
  [CitationSourceTypes.ATTACHMENT]: 'File',
  [CitationSourceTypes.SEARCH]: 'Search',
  [CitationSourceTypes.SUMMARY]: 'Summary',
  [CitationSourceTypes.RAG]: 'Indexed File',
} as const;

// ============================================================================
// CITATION PREFIXES
// ============================================================================

export const CITATION_PREFIXES = ['mem', 'thd', 'att', 'sch', 'sum', 'rag'] as const;

export type CitationPrefix = (typeof CITATION_PREFIXES)[number];

export const CitationSourcePrefixes: Record<CitationSourceType, CitationPrefix> = {
  [CitationSourceTypes.MEMORY]: 'mem',
  [CitationSourceTypes.THREAD]: 'thd',
  [CitationSourceTypes.ATTACHMENT]: 'att',
  [CitationSourceTypes.SEARCH]: 'sch',
  [CitationSourceTypes.SUMMARY]: 'sum',
  [CitationSourceTypes.RAG]: 'rag',
};

export const CitationPrefixToSourceType: Record<CitationPrefix, CitationSourceType> = {
  mem: CitationSourceTypes.MEMORY,
  thd: CitationSourceTypes.THREAD,
  att: CitationSourceTypes.ATTACHMENT,
  sch: CitationSourceTypes.SEARCH,
  sum: CitationSourceTypes.SUMMARY,
  rag: CitationSourceTypes.RAG,
};

export const CitationSourceContentLimits: Record<CitationSourceType, number> = {
  [CitationSourceTypes.MEMORY]: 300,
  [CitationSourceTypes.THREAD]: 400,
  [CitationSourceTypes.ATTACHMENT]: 300,
  [CitationSourceTypes.SEARCH]: 300,
  [CitationSourceTypes.SUMMARY]: 400,
  [CitationSourceTypes.RAG]: 500,
} as const;
