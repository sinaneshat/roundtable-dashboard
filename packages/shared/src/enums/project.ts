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
// AI SEARCH CHECK STATUS (result of checking AI Search instance availability)
// ============================================================================

export const AI_SEARCH_CHECK_STATUSES = [
  'active',
  'paused',
  'not_found',
  'error',
] as const;

export const AiSearchCheckStatusSchema = z.enum(AI_SEARCH_CHECK_STATUSES).openapi({
  description: 'Status result from checking AI Search instance availability',
  example: 'active',
});

export type AiSearchCheckStatus = z.infer<typeof AiSearchCheckStatusSchema>;

export const AiSearchCheckStatuses = {
  ACTIVE: 'active' as const,
  PAUSED: 'paused' as const,
  NOT_FOUND: 'not_found' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// PROJECT MEMORY SOURCE (origin of memory entries)
// ============================================================================

export const PROJECT_MEMORY_SOURCES = [
  'chat',
  'explicit',
  'moderator',
  'search',
  'instruction',
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
  MODERATOR: 'moderator' as const,
  SEARCH: 'search' as const,
  INSTRUCTION: 'instruction' as const,
} as const;

// ============================================================================
// PROJECT ICON (visual identification)
// ============================================================================

export const PROJECT_ICONS = [
  'briefcase',
  'code',
  'book',
  'globe',
  'graduationCap',
  'coins',
  'pencil',
  'image',
  'gift',
  'clock',
  'lightbulb',
  'fileText',
  'layers',
  'scale',
  'wrench',
  'users',
  'target',
  'zap',
  'database',
  'mail',
  'lock',
  'key',
  'home',
  'brain',
  'sparkles',
  'messageSquare',
  'calendar',
  'package',
  'hammer',
  'search',
] as const;

export const DEFAULT_PROJECT_ICON: ProjectIcon = 'briefcase';

export const ProjectIconSchema = z.enum(PROJECT_ICONS).openapi({
  description: 'Project icon for visual identification',
  example: 'briefcase',
});

export type ProjectIcon = z.infer<typeof ProjectIconSchema>;

export const ProjectIcons = {
  BRIEFCASE: 'briefcase' as const,
  CODE: 'code' as const,
  BOOK: 'book' as const,
  GLOBE: 'globe' as const,
  GRADUATION_CAP: 'graduationCap' as const,
  COINS: 'coins' as const,
  PENCIL: 'pencil' as const,
  IMAGE: 'image' as const,
  GIFT: 'gift' as const,
  CLOCK: 'clock' as const,
  LIGHTBULB: 'lightbulb' as const,
  FILE_TEXT: 'fileText' as const,
  LAYERS: 'layers' as const,
  SCALE: 'scale' as const,
  WRENCH: 'wrench' as const,
  USERS: 'users' as const,
  TARGET: 'target' as const,
  ZAP: 'zap' as const,
  DATABASE: 'database' as const,
  MAIL: 'mail' as const,
  LOCK: 'lock' as const,
  KEY: 'key' as const,
  HOME: 'home' as const,
  BRAIN: 'brain' as const,
  SPARKLES: 'sparkles' as const,
  MESSAGE_SQUARE: 'messageSquare' as const,
  CALENDAR: 'calendar' as const,
  PACKAGE: 'package' as const,
  HAMMER: 'hammer' as const,
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
// PROJECT TEMPLATE (for quick project creation)
// ============================================================================

export const PROJECT_TEMPLATE_KEYS = ['investing', 'research', 'writing', 'travel'] as const;

export const ProjectTemplateKeySchema = z.enum(PROJECT_TEMPLATE_KEYS).openapi({
  description: 'Project template key for quick creation',
  example: 'research',
});

export type ProjectTemplateKey = z.infer<typeof ProjectTemplateKeySchema>;

export const ProjectTemplateKeys = {
  INVESTING: 'investing' as const,
  RESEARCH: 'research' as const,
  WRITING: 'writing' as const,
  TRAVEL: 'travel' as const,
} as const;

export type ProjectTemplateConfig = {
  key: ProjectTemplateKey;
  icon: ProjectIcon;
  color: ProjectColor;
};

export const PROJECT_TEMPLATES: readonly ProjectTemplateConfig[] = [
  { key: ProjectTemplateKeys.INVESTING, icon: ProjectIcons.COINS, color: ProjectColors.AMBER },
  { key: ProjectTemplateKeys.RESEARCH, icon: ProjectIcons.GRADUATION_CAP, color: ProjectColors.BLUE },
  { key: ProjectTemplateKeys.WRITING, icon: ProjectIcons.PENCIL, color: ProjectColors.VIOLET },
  { key: ProjectTemplateKeys.TRAVEL, icon: ProjectIcons.GLOBE, color: ProjectColors.ORANGE },
] as const;

// ============================================================================
// CITATION SOURCE TYPE (RAG context citation sources)
// ============================================================================

export const CITATION_SOURCE_TYPES = [
  'memory',
  'thread',
  'attachment',
  'search',
  'moderator',
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
  MODERATOR: 'moderator' as const,
  RAG: 'rag' as const,
} as const;

export const CitationSourceLabels: Record<CitationSourceType, string> = {
  [CitationSourceTypes.MEMORY]: 'Memory',
  [CitationSourceTypes.THREAD]: 'Thread',
  [CitationSourceTypes.ATTACHMENT]: 'File',
  [CitationSourceTypes.SEARCH]: 'Search',
  [CitationSourceTypes.MODERATOR]: 'Moderator',
  [CitationSourceTypes.RAG]: 'Indexed File',
} as const;

// ============================================================================
// CITATION PREFIXES
// ============================================================================

export const CITATION_PREFIXES = ['mem', 'thd', 'att', 'sch', 'mod', 'rag'] as const;

export type CitationPrefix = (typeof CITATION_PREFIXES)[number];

export const CitationSourcePrefixes: Record<CitationSourceType, CitationPrefix> = {
  [CitationSourceTypes.MEMORY]: 'mem',
  [CitationSourceTypes.THREAD]: 'thd',
  [CitationSourceTypes.ATTACHMENT]: 'att',
  [CitationSourceTypes.SEARCH]: 'sch',
  [CitationSourceTypes.MODERATOR]: 'mod',
  [CitationSourceTypes.RAG]: 'rag',
};

export const CitationPrefixToSourceType: Record<CitationPrefix, CitationSourceType> = {
  mem: CitationSourceTypes.MEMORY,
  thd: CitationSourceTypes.THREAD,
  att: CitationSourceTypes.ATTACHMENT,
  sch: CitationSourceTypes.SEARCH,
  mod: CitationSourceTypes.MODERATOR,
  rag: CitationSourceTypes.RAG,
};

export const CitationSourceContentLimits: Record<CitationSourceType, number> = {
  [CitationSourceTypes.MEMORY]: 300,
  [CitationSourceTypes.THREAD]: 400,
  [CitationSourceTypes.ATTACHMENT]: 300,
  [CitationSourceTypes.SEARCH]: 300,
  [CitationSourceTypes.MODERATOR]: 400,
  [CitationSourceTypes.RAG]: 500,
} as const;
