/**
 * Web Search Enums
 *
 * Enums for pre-search, web search parameters, and search result handling.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// PRE-SEARCH STATUS
// ============================================================================

// 1. ARRAY CONSTANT
export const PRE_SEARCH_STATUSES = ['idle', 'streaming', 'active', 'complete', 'failed'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_PRE_SEARCH_STATUS = 'idle' as const;

// 3. ZOD SCHEMA
export const PreSearchStatusSchema = z.enum(PRE_SEARCH_STATUSES).openapi({
  description: 'Pre-search operation status',
  example: 'active',
});

// 4. TYPESCRIPT TYPE
export type PreSearchStatus = z.infer<typeof PreSearchStatusSchema>;

// 5. CONSTANT OBJECT
export const PreSearchStatuses = {
  IDLE: 'idle' as const,
  STREAMING: 'streaming' as const,
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// PRE-SEARCH QUERY STATUS (Backend API)
// ============================================================================

// 1. ARRAY CONSTANT
export const PRE_SEARCH_QUERY_STATUSES = ['active', 'complete'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_PRE_SEARCH_QUERY_STATUS = 'active' as const;

// 3. ZOD SCHEMA
export const PreSearchQueryStatusSchema = z.enum(PRE_SEARCH_QUERY_STATUSES).openapi({
  description: 'Individual pre-search query status',
  example: 'active',
});

// 4. TYPESCRIPT TYPE
export type PreSearchQueryStatus = z.infer<typeof PreSearchQueryStatusSchema>;

// 5. CONSTANT OBJECT
export const PreSearchQueryStatuses = {
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// PRE-SEARCH QUERY STATE STATUS (Frontend UI Tracking)
// ============================================================================

// 1. ARRAY CONSTANT
export const PRE_SEARCH_QUERY_STATE_STATUSES = ['pending', 'searching', 'complete', 'failed'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_PRE_SEARCH_QUERY_STATE_STATUS = 'pending' as const;

// 3. ZOD SCHEMA
export const PreSearchQueryStateStatusSchema = z.enum(PRE_SEARCH_QUERY_STATE_STATUSES).openapi({
  description: 'UI status for tracking individual pre-search query progress',
  example: 'searching',
});

// 4. TYPESCRIPT TYPE
export type PreSearchQueryStateStatus = z.infer<typeof PreSearchQueryStateStatusSchema>;

// 5. CONSTANT OBJECT
export const PreSearchQueryStateStatuses = {
  PENDING: 'pending' as const,
  SEARCHING: 'searching' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// SEARCH RESULT STATUS
// ============================================================================

// 1. ARRAY CONSTANT
export const SEARCH_RESULT_STATUSES = ['searching', 'processing', 'complete', 'error'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_SEARCH_RESULT_STATUS = 'searching' as const;

// 3. ZOD SCHEMA
export const SearchResultStatusSchema = z.enum(SEARCH_RESULT_STATUSES).openapi({
  description: 'Status of a search result processing',
  example: 'complete',
});

// 4. TYPESCRIPT TYPE
export type SearchResultStatus = z.infer<typeof SearchResultStatusSchema>;

// 5. CONSTANT OBJECT
export const SearchResultStatuses = {
  SEARCHING: 'searching' as const,
  PROCESSING: 'processing' as const,
  COMPLETE: 'complete' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// QUERY RESULT STATUS (Individual query execution status)
// ============================================================================

// 1. ARRAY CONSTANT
export const QUERY_RESULT_STATUSES = ['pending', 'success', 'failed'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_QUERY_RESULT_STATUS = 'pending' as const;

// 3. ZOD SCHEMA
export const QueryResultStatusSchema = z.enum(QUERY_RESULT_STATUSES).openapi({
  description: 'Status of an individual search query result',
  example: 'success',
});

// 4. TYPESCRIPT TYPE
export type QueryResultStatus = z.infer<typeof QueryResultStatusSchema>;

// 5. CONSTANT OBJECT
export const QueryResultStatuses = {
  PENDING: 'pending' as const,
  SUCCESS: 'success' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// PRE-SEARCH SSE EVENT NAMES
// ============================================================================

// 1. ARRAY CONSTANT
export const PRE_SEARCH_SSE_EVENTS = ['start', 'query', 'result', 'answer_chunk', 'answer_complete', 'answer_error', 'complete', 'done', 'failed'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_PRE_SEARCH_SSE_EVENT = 'start' as const;

// 3. ZOD SCHEMA
export const PreSearchSseEventSchema = z.enum(PRE_SEARCH_SSE_EVENTS).openapi({
  description: 'Server-Sent Events (SSE) event names for pre-search streaming',
  example: 'query',
});

// 4. TYPESCRIPT TYPE
export type PreSearchSseEvent = z.infer<typeof PreSearchSseEventSchema>;

// 5. CONSTANT OBJECT
export const PreSearchSseEvents = {
  START: 'start' as const,
  QUERY: 'query' as const,
  RESULT: 'result' as const,
  ANSWER_CHUNK: 'answer_chunk' as const,
  ANSWER_COMPLETE: 'answer_complete' as const,
  ANSWER_ERROR: 'answer_error' as const,
  COMPLETE: 'complete' as const,
  DONE: 'done' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// WEB SEARCH COMPLEXITY
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_COMPLEXITIES = ['basic', 'moderate', 'deep'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_COMPLEXITY = 'basic' as const;

// 3. ZOD SCHEMA
export const WebSearchComplexitySchema = z.enum(WEB_SEARCH_COMPLEXITIES).openapi({
  description: 'Web search complexity level',
  example: 'moderate',
});

// 4. TYPESCRIPT TYPE
export type WebSearchComplexity = z.infer<typeof WebSearchComplexitySchema>;

// 5. CONSTANT OBJECT
export const WebSearchComplexities = {
  BASIC: 'basic' as const,
  MODERATE: 'moderate' as const,
  DEEP: 'deep' as const,
} as const;

// ============================================================================
// WEB SEARCH DEPTH
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_DEPTHS = ['basic', 'advanced'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_DEPTH = 'basic' as const;

// 3. ZOD SCHEMA
export const WebSearchDepthSchema = z.enum(WEB_SEARCH_DEPTHS).openapi({
  description: 'Web search thoroughness level',
  example: 'basic',
});

// 4. TYPESCRIPT TYPE
export type WebSearchDepth = z.infer<typeof WebSearchDepthSchema>;

// 5. CONSTANT OBJECT
export const WebSearchDepths = {
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// QUERY ANALYSIS COMPLEXITY
// ============================================================================

// 1. ARRAY CONSTANT
export const QUERY_ANALYSIS_COMPLEXITIES = ['simple', 'moderate', 'complex'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_QUERY_ANALYSIS_COMPLEXITY = 'simple' as const;

// 3. ZOD SCHEMA
export const QueryAnalysisComplexitySchema = z.enum(QUERY_ANALYSIS_COMPLEXITIES).openapi({
  description: 'User query complexity level for determining search strategy',
  example: 'moderate',
});

// 4. TYPESCRIPT TYPE
export type QueryAnalysisComplexity = z.infer<typeof QueryAnalysisComplexitySchema>;

// 5. CONSTANT OBJECT
export const QueryAnalysisComplexities = {
  SIMPLE: 'simple' as const,
  MODERATE: 'moderate' as const,
  COMPLEX: 'complex' as const,
} as const;

// ============================================================================
// MAX QUERY COUNT (for search strategy)
// ============================================================================

export const MAX_QUERY_COUNTS = [1, 2, 3] as const;

export const MaxQueryCountSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]).openapi({
  description: 'Maximum number of search queries to generate',
  example: 2,
});

export type MaxQueryCount = z.infer<typeof MaxQueryCountSchema>;

// ============================================================================
// QUERY ANALYSIS RESULT SCHEMA
// ============================================================================

export const QueryAnalysisResultSchema = z.object({
  complexity: QueryAnalysisComplexitySchema,
  maxQueries: MaxQueryCountSchema,
  defaultSearchDepth: WebSearchDepthSchema,
  defaultSourceCount: z.number().int().min(1).max(5).openapi({
    description: 'Default number of sources to fetch per query',
    example: 3,
  }),
  reasoning: z.string().openapi({
    description: 'Explanation of why this complexity level was chosen',
    example: 'Long detailed query - multiple search angles recommended',
  }),
}).openapi({
  description: 'Result of user query complexity analysis',
});

export type QueryAnalysisResult = z.infer<typeof QueryAnalysisResultSchema>;

// ============================================================================
// WEB SEARCH CONTENT TYPE
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_CONTENT_TYPES = ['article', 'comparison', 'guide', 'data', 'news', 'blog', 'research', 'general'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_CONTENT_TYPE = 'general' as const;

// 3. ZOD SCHEMA
export const WebSearchContentTypeSchema = z.enum(WEB_SEARCH_CONTENT_TYPES).openapi({
  description: 'Content type classification for search results',
  example: 'article',
});

// 4. TYPESCRIPT TYPE
export type WebSearchContentType = z.infer<typeof WebSearchContentTypeSchema>;

// 5. CONSTANT OBJECT
export const WebSearchContentTypes = {
  ARTICLE: 'article' as const,
  COMPARISON: 'comparison' as const,
  GUIDE: 'guide' as const,
  DATA: 'data' as const,
  NEWS: 'news' as const,
  BLOG: 'blog' as const,
  RESEARCH: 'research' as const,
  GENERAL: 'general' as const,
} as const;

// ============================================================================
// WEB SEARCH TOPIC
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_TOPICS = ['general', 'news', 'finance', 'health', 'scientific', 'travel'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_TOPIC = 'general' as const;

// 3. ZOD SCHEMA
export const WebSearchTopicSchema = z.enum(WEB_SEARCH_TOPICS).openapi({
  description: 'Search topic category for specialized search optimization',
  example: 'general',
});

// 4. TYPESCRIPT TYPE
export type WebSearchTopic = z.infer<typeof WebSearchTopicSchema>;

// 5. CONSTANT OBJECT
export const WebSearchTopics = {
  GENERAL: 'general' as const,
  NEWS: 'news' as const,
  FINANCE: 'finance' as const,
  HEALTH: 'health' as const,
  SCIENTIFIC: 'scientific' as const,
  TRAVEL: 'travel' as const,
} as const;

// ============================================================================
// WEB SEARCH TIME RANGE
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_TIME_RANGES = ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_TIME_RANGE = 'week' as const;

// 3. ZOD SCHEMA
export const WebSearchTimeRangeSchema = z.enum(WEB_SEARCH_TIME_RANGES).openapi({
  description: 'Time range filter for search results',
  example: 'week',
});

// 4. TYPESCRIPT TYPE
export type WebSearchTimeRange = z.infer<typeof WebSearchTimeRangeSchema>;

// 5. CONSTANT OBJECT
export const WebSearchTimeRanges = {
  DAY: 'day' as const,
  WEEK: 'week' as const,
  MONTH: 'month' as const,
  YEAR: 'year' as const,
  D: 'd' as const,
  W: 'w' as const,
  M: 'm' as const,
  Y: 'y' as const,
} as const;

// ============================================================================
// WEB SEARCH RAW CONTENT FORMAT
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_RAW_CONTENT_FORMATS = ['markdown', 'text'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_RAW_CONTENT_FORMAT = 'markdown' as const;

// 3. ZOD SCHEMA
export const WebSearchRawContentFormatSchema = z.enum(WEB_SEARCH_RAW_CONTENT_FORMATS).openapi({
  description: 'Format for raw content extraction',
  example: 'markdown',
});

// 4. TYPESCRIPT TYPE
export type WebSearchRawContentFormat = z.infer<typeof WebSearchRawContentFormatSchema>;

// 5. CONSTANT OBJECT
export const WebSearchRawContentFormats = {
  MARKDOWN: 'markdown' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// WEB SEARCH ANSWER MODE
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_ANSWER_MODES = ['none', 'basic', 'advanced'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_ANSWER_MODE = 'basic' as const;

// 3. ZOD SCHEMA
export const WebSearchAnswerModeSchema = z.enum(WEB_SEARCH_ANSWER_MODES).openapi({
  description: 'LLM-generated answer summary mode',
  example: 'basic',
});

// 4. TYPESCRIPT TYPE
export type WebSearchAnswerMode = z.infer<typeof WebSearchAnswerModeSchema>;

// 5. CONSTANT OBJECT
export const WebSearchAnswerModes = {
  NONE: 'none' as const,
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// WEB SEARCH ACTIVE ANSWER MODE (excludes 'none')
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_ACTIVE_ANSWER_MODES = ['basic', 'advanced'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_ACTIVE_ANSWER_MODE = 'basic' as const;

// 3. ZOD SCHEMA
export const WebSearchActiveAnswerModeSchema = z.enum(WEB_SEARCH_ACTIVE_ANSWER_MODES).openapi({
  description: 'Active LLM-generated answer summary mode (excludes none)',
  example: 'basic',
});

// 4. TYPESCRIPT TYPE
export type WebSearchActiveAnswerMode = z.infer<typeof WebSearchActiveAnswerModeSchema>;

// 5. CONSTANT OBJECT
export const WebSearchActiveAnswerModes = {
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// WEB SEARCH STREAMING STAGE
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_STREAMING_STAGES = ['query', 'search', 'synthesize'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_STREAMING_STAGE = 'query' as const;

// 3. ZOD SCHEMA
export const WebSearchStreamingStageSchema = z.enum(WEB_SEARCH_STREAMING_STAGES).openapi({
  description: 'Current stage of web search streaming process',
  example: 'search',
});

// 4. TYPESCRIPT TYPE
export type WebSearchStreamingStage = z.infer<typeof WebSearchStreamingStageSchema>;

// 5. CONSTANT OBJECT
export const WebSearchStreamingStages = {
  QUERY: 'query' as const,
  SEARCH: 'search' as const,
  SYNTHESIZE: 'synthesize' as const,
} as const;

// ============================================================================
// WEB SEARCH STREAM EVENT TYPES
// ============================================================================

// 1. ARRAY CONSTANT
export const WEB_SEARCH_STREAM_EVENT_TYPES = ['metadata', 'result', 'complete', 'error'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_WEB_SEARCH_STREAM_EVENT_TYPE = 'metadata' as const;

// 3. ZOD SCHEMA
export const WebSearchStreamEventTypeSchema = z.enum(WEB_SEARCH_STREAM_EVENT_TYPES).openapi({
  description: 'Event types for progressive web search streaming',
  example: 'result',
});

// 4. TYPESCRIPT TYPE
export type WebSearchStreamEventType = z.infer<typeof WebSearchStreamEventTypeSchema>;

// 5. CONSTANT OBJECT
export const WebSearchStreamEventTypes = {
  METADATA: 'metadata' as const,
  RESULT: 'result' as const,
  COMPLETE: 'complete' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// WEB SEARCH CONSTANTS
// ============================================================================

export const UNKNOWN_DOMAIN = 'unknown' as const;

// ============================================================================
// BROWSER ENVIRONMENT (for Puppeteer browser type discrimination)
// ============================================================================

// 1. ARRAY CONSTANT
export const BROWSER_ENVIRONMENTS = ['cloudflare', 'local'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_BROWSER_ENVIRONMENT = 'local' as const;

// 3. ZOD SCHEMA
export const BrowserEnvironmentSchema = z.enum(BROWSER_ENVIRONMENTS).openapi({
  description: 'Browser environment: cloudflare for Workers, local for development',
  example: 'local',
});

// 4. TYPESCRIPT TYPE
export type BrowserEnvironment = z.infer<typeof BrowserEnvironmentSchema>;

// 5. CONSTANT OBJECT
export const BrowserEnvironments = {
  CLOUDFLARE: 'cloudflare' as const,
  LOCAL: 'local' as const,
} as const;

// ============================================================================
// PAGE WAIT STRATEGY (Puppeteer page.goto waitUntil options)
// Official Puppeteer PuppeteerLifeCycleEvent types:
// - 'load': Waits for the 'load' event
// - 'domcontentloaded': Waits for the 'DOMContentLoaded' event
// - 'networkidle0': Waits till there are no more than 0 network connections for at least 500ms
// - 'networkidle2': Waits till there are no more than 2 network connections for at least 500ms
// Ref: https://github.com/puppeteer/puppeteer/blob/main/docs/api/puppeteer.puppeteerlifecycleevent.md
// ============================================================================

// 1. ARRAY CONSTANT
export const PAGE_WAIT_STRATEGIES = ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_PAGE_WAIT_STRATEGY = 'domcontentloaded' as const;

// 3. ZOD SCHEMA
export const PageWaitStrategySchema = z.enum(PAGE_WAIT_STRATEGIES).openapi({
  description: 'Puppeteer page.goto() wait strategy for navigation completion',
  example: 'domcontentloaded',
});

// 4. TYPESCRIPT TYPE
export type PageWaitStrategy = z.infer<typeof PageWaitStrategySchema>;

// 5. CONSTANT OBJECT
export const PageWaitStrategies = {
  LOAD: 'load' as const,
  DOM_CONTENT_LOADED: 'domcontentloaded' as const,
  NETWORK_IDLE_0: 'networkidle0' as const,
  NETWORK_IDLE_2: 'networkidle2' as const,
} as const;

// ============================================================================
// BLOCKED RESOURCE TYPE (Puppeteer request interception)
// ============================================================================

// 1. ARRAY CONSTANT
export const BLOCKED_RESOURCE_TYPES = ['font', 'media', 'websocket', 'manifest'] as const;

// 2. DEFAULT VALUE
export const DEFAULT_BLOCKED_RESOURCE_TYPE = 'font' as const;

// 3. ZOD SCHEMA
export const BlockedResourceTypeSchema = z.enum(BLOCKED_RESOURCE_TYPES).openapi({
  description: 'Puppeteer resource types to block during page load for performance',
  example: 'font',
});

// 4. TYPESCRIPT TYPE
export type BlockedResourceType = z.infer<typeof BlockedResourceTypeSchema>;

// 5. CONSTANT OBJECT
export const BlockedResourceTypes = {
  FONT: 'font' as const,
  MEDIA: 'media' as const,
  WEBSOCKET: 'websocket' as const,
  MANIFEST: 'manifest' as const,
} as const;

// 6. DEFAULT ARRAY (for blocking multiple resource types)
export const DEFAULT_BLOCKED_RESOURCE_TYPES: BlockedResourceType[] = [
  BlockedResourceTypes.FONT,
  BlockedResourceTypes.MEDIA,
  BlockedResourceTypes.WEBSOCKET,
  BlockedResourceTypes.MANIFEST,
];
