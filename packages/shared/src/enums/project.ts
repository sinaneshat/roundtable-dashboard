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
  FAILED: 'failed' as const,
  INDEXED: 'indexed' as const,
  INDEXING: 'indexing' as const,
  PENDING: 'pending' as const,
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
  ERROR: 'error' as const,
  NOT_FOUND: 'not_found' as const,
  PAUSED: 'paused' as const,
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
  INSTRUCTION: 'instruction' as const,
  MODERATOR: 'moderator' as const,
  SEARCH: 'search' as const,
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
  BOOK: 'book' as const,
  BRAIN: 'brain' as const,
  BRIEFCASE: 'briefcase' as const,
  CALENDAR: 'calendar' as const,
  CLOCK: 'clock' as const,
  CODE: 'code' as const,
  COINS: 'coins' as const,
  DATABASE: 'database' as const,
  FILE_TEXT: 'fileText' as const,
  GIFT: 'gift' as const,
  GLOBE: 'globe' as const,
  GRADUATION_CAP: 'graduationCap' as const,
  HAMMER: 'hammer' as const,
  HOME: 'home' as const,
  IMAGE: 'image' as const,
  KEY: 'key' as const,
  LAYERS: 'layers' as const,
  LIGHTBULB: 'lightbulb' as const,
  LOCK: 'lock' as const,
  MAIL: 'mail' as const,
  MESSAGE_SQUARE: 'messageSquare' as const,
  PACKAGE: 'package' as const,
  PENCIL: 'pencil' as const,
  SCALE: 'scale' as const,
  SEARCH: 'search' as const,
  SPARKLES: 'sparkles' as const,
  TARGET: 'target' as const,
  USERS: 'users' as const,
  WRENCH: 'wrench' as const,
  ZAP: 'zap' as const,
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
  AMBER: 'amber' as const,
  BLUE: 'blue' as const,
  CYAN: 'cyan' as const,
  EMERALD: 'emerald' as const,
  FUCHSIA: 'fuchsia' as const,
  GRAY: 'gray' as const,
  GREEN: 'green' as const,
  INDIGO: 'indigo' as const,
  LIME: 'lime' as const,
  ORANGE: 'orange' as const,
  PINK: 'pink' as const,
  PURPLE: 'purple' as const,
  RED: 'red' as const,
  ROSE: 'rose' as const,
  SKY: 'sky' as const,
  TEAL: 'teal' as const,
  VIOLET: 'violet' as const,
  YELLOW: 'yellow' as const,
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
  TRAVEL: 'travel' as const,
  WRITING: 'writing' as const,
} as const;

export type ProjectTemplateConfig = {
  key: ProjectTemplateKey;
  icon: ProjectIcon;
  color: ProjectColor;
};

export const PROJECT_TEMPLATES: readonly ProjectTemplateConfig[] = [
  { color: ProjectColors.AMBER, icon: ProjectIcons.COINS, key: ProjectTemplateKeys.INVESTING },
  { color: ProjectColors.BLUE, icon: ProjectIcons.GRADUATION_CAP, key: ProjectTemplateKeys.RESEARCH },
  { color: ProjectColors.VIOLET, icon: ProjectIcons.PENCIL, key: ProjectTemplateKeys.WRITING },
  { color: ProjectColors.ORANGE, icon: ProjectIcons.GLOBE, key: ProjectTemplateKeys.TRAVEL },
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
  ATTACHMENT: 'attachment' as const,
  MEMORY: 'memory' as const,
  MODERATOR: 'moderator' as const,
  RAG: 'rag' as const,
  SEARCH: 'search' as const,
  THREAD: 'thread' as const,
} as const;

export const CitationSourceLabels: Record<CitationSourceType, string> = {
  [CitationSourceTypes.ATTACHMENT]: 'File',
  [CitationSourceTypes.MEMORY]: 'Memory',
  [CitationSourceTypes.MODERATOR]: 'Moderator',
  [CitationSourceTypes.RAG]: 'Indexed File',
  [CitationSourceTypes.SEARCH]: 'Search',
  [CitationSourceTypes.THREAD]: 'Thread',
} as const;

// ============================================================================
// CITATION PREFIXES
// ============================================================================

export const CITATION_PREFIXES = ['mem', 'thd', 'att', 'sch', 'mod', 'rag'] as const;

export type CitationPrefix = (typeof CITATION_PREFIXES)[number];

export const CitationSourcePrefixes: Record<CitationSourceType, CitationPrefix> = {
  [CitationSourceTypes.ATTACHMENT]: 'att',
  [CitationSourceTypes.MEMORY]: 'mem',
  [CitationSourceTypes.MODERATOR]: 'mod',
  [CitationSourceTypes.RAG]: 'rag',
  [CitationSourceTypes.SEARCH]: 'sch',
  [CitationSourceTypes.THREAD]: 'thd',
};

export const CitationPrefixToSourceType: Record<CitationPrefix, CitationSourceType> = {
  att: CitationSourceTypes.ATTACHMENT,
  mem: CitationSourceTypes.MEMORY,
  mod: CitationSourceTypes.MODERATOR,
  rag: CitationSourceTypes.RAG,
  sch: CitationSourceTypes.SEARCH,
  thd: CitationSourceTypes.THREAD,
};

export const CitationSourceContentLimits: Record<CitationSourceType, number> = {
  [CitationSourceTypes.ATTACHMENT]: 300,
  [CitationSourceTypes.MEMORY]: 300,
  [CitationSourceTypes.MODERATOR]: 400,
  [CitationSourceTypes.RAG]: 500,
  [CitationSourceTypes.SEARCH]: 300,
  [CitationSourceTypes.THREAD]: 400,
} as const;
