/**
 * Web Search Enums
 *
 * Enums for pre-search, web search parameters, and search result handling.
 */

import { z } from '@hono/zod-openapi';

// ============================================================================
// PRE-SEARCH STATUS
// ============================================================================

export const PRE_SEARCH_STATUSES = ['idle', 'streaming', 'active', 'complete', 'failed'] as const;

export const DEFAULT_PRE_SEARCH_STATUS: PreSearchStatus = 'idle';

export const PreSearchStatusSchema = z.enum(PRE_SEARCH_STATUSES).openapi({
  description: 'Pre-search operation status',
  example: 'active',
});

export type PreSearchStatus = z.infer<typeof PreSearchStatusSchema>;

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

export const PRE_SEARCH_QUERY_STATUSES = ['active', 'complete'] as const;

export const DEFAULT_PRE_SEARCH_QUERY_STATUS: PreSearchQueryStatus = 'active';

export const PreSearchQueryStatusSchema = z.enum(PRE_SEARCH_QUERY_STATUSES).openapi({
  description: 'Individual pre-search query status',
  example: 'active',
});

export type PreSearchQueryStatus = z.infer<typeof PreSearchQueryStatusSchema>;

export const PreSearchQueryStatuses = {
  ACTIVE: 'active' as const,
  COMPLETE: 'complete' as const,
} as const;

// ============================================================================
// PRE-SEARCH QUERY STATE STATUS (Frontend UI Tracking)
// ============================================================================

export const PRE_SEARCH_QUERY_STATE_STATUSES = ['pending', 'searching', 'complete', 'failed'] as const;

export const DEFAULT_PRE_SEARCH_QUERY_STATE_STATUS: PreSearchQueryStateStatus = 'pending';

export const PreSearchQueryStateStatusSchema = z.enum(PRE_SEARCH_QUERY_STATE_STATUSES).openapi({
  description: 'UI status for tracking individual pre-search query progress',
  example: 'searching',
});

export type PreSearchQueryStateStatus = z.infer<typeof PreSearchQueryStateStatusSchema>;

export const PreSearchQueryStateStatuses = {
  PENDING: 'pending' as const,
  SEARCHING: 'searching' as const,
  COMPLETE: 'complete' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// SEARCH RESULT STATUS
// ============================================================================

export const SEARCH_RESULT_STATUSES = ['searching', 'processing', 'complete', 'error'] as const;

export const DEFAULT_SEARCH_RESULT_STATUS: SearchResultStatus = 'searching';

export const SearchResultStatusSchema = z.enum(SEARCH_RESULT_STATUSES).openapi({
  description: 'Status of a search result processing',
  example: 'complete',
});

export type SearchResultStatus = z.infer<typeof SearchResultStatusSchema>;

export const SearchResultStatuses = {
  SEARCHING: 'searching' as const,
  PROCESSING: 'processing' as const,
  COMPLETE: 'complete' as const,
  ERROR: 'error' as const,
} as const;

// ============================================================================
// QUERY RESULT STATUS (Individual query execution status)
// ============================================================================

export const QUERY_RESULT_STATUSES = ['pending', 'success', 'failed'] as const;

export const DEFAULT_QUERY_RESULT_STATUS: QueryResultStatus = 'pending';

export const QueryResultStatusSchema = z.enum(QUERY_RESULT_STATUSES).openapi({
  description: 'Status of an individual search query result',
  example: 'success',
});

export type QueryResultStatus = z.infer<typeof QueryResultStatusSchema>;

export const QueryResultStatuses = {
  PENDING: 'pending' as const,
  SUCCESS: 'success' as const,
  FAILED: 'failed' as const,
} as const;

// ============================================================================
// PRE-SEARCH SSE EVENT NAMES
// ============================================================================

export const PRE_SEARCH_SSE_EVENTS = ['start', 'query', 'result', 'answer_chunk', 'answer_complete', 'answer_error', 'complete', 'done', 'failed'] as const;

export const DEFAULT_PRE_SEARCH_SSE_EVENT: PreSearchSseEvent = 'start';

export const PreSearchSseEventSchema = z.enum(PRE_SEARCH_SSE_EVENTS).openapi({
  description: 'Server-Sent Events (SSE) event names for pre-search streaming',
  example: 'query',
});

export type PreSearchSseEvent = z.infer<typeof PreSearchSseEventSchema>;

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

export const WEB_SEARCH_COMPLEXITIES = ['basic', 'moderate', 'deep'] as const;

export const DEFAULT_WEB_SEARCH_COMPLEXITY: WebSearchComplexity = 'basic';

export const WebSearchComplexitySchema = z.enum(WEB_SEARCH_COMPLEXITIES).openapi({
  description: 'Web search complexity level',
  example: 'moderate',
});

export type WebSearchComplexity = z.infer<typeof WebSearchComplexitySchema>;

export const WebSearchComplexities = {
  BASIC: 'basic' as const,
  MODERATE: 'moderate' as const,
  DEEP: 'deep' as const,
} as const;

// ============================================================================
// WEB SEARCH DEPTH
// ============================================================================

export const WEB_SEARCH_DEPTHS = ['basic', 'advanced'] as const;

export const DEFAULT_WEB_SEARCH_DEPTH: WebSearchDepth = 'basic';

export const WebSearchDepthSchema = z.enum(WEB_SEARCH_DEPTHS).openapi({
  description: 'Web search thoroughness level',
  example: 'basic',
});

export type WebSearchDepth = z.infer<typeof WebSearchDepthSchema>;

export const WebSearchDepths = {
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// QUERY ANALYSIS COMPLEXITY
// ============================================================================

export const QUERY_ANALYSIS_COMPLEXITIES = ['simple', 'moderate', 'complex'] as const;

export const DEFAULT_QUERY_ANALYSIS_COMPLEXITY: QueryAnalysisComplexity = 'simple';

export const QueryAnalysisComplexitySchema = z.enum(QUERY_ANALYSIS_COMPLEXITIES).openapi({
  description: 'User query complexity level for determining search strategy',
  example: 'moderate',
});

export type QueryAnalysisComplexity = z.infer<typeof QueryAnalysisComplexitySchema>;

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

export const WEB_SEARCH_CONTENT_TYPES = ['article', 'comparison', 'guide', 'data', 'news', 'blog', 'research', 'general'] as const;

export const DEFAULT_WEB_SEARCH_CONTENT_TYPE: WebSearchContentType = 'general';

export const WebSearchContentTypeSchema = z.enum(WEB_SEARCH_CONTENT_TYPES).openapi({
  description: 'Content type classification for search results',
  example: 'article',
});

export type WebSearchContentType = z.infer<typeof WebSearchContentTypeSchema>;

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

export const WEB_SEARCH_TOPICS = ['general', 'news', 'finance', 'health', 'scientific', 'travel'] as const;

export const DEFAULT_WEB_SEARCH_TOPIC: WebSearchTopic = 'general';

export const WebSearchTopicSchema = z.enum(WEB_SEARCH_TOPICS).openapi({
  description: 'Search topic category for specialized search optimization',
  example: 'general',
});

export type WebSearchTopic = z.infer<typeof WebSearchTopicSchema>;

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

export const WEB_SEARCH_TIME_RANGES = ['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y'] as const;

export const DEFAULT_WEB_SEARCH_TIME_RANGE: WebSearchTimeRange = 'week';

export const WebSearchTimeRangeSchema = z.enum(WEB_SEARCH_TIME_RANGES).openapi({
  description: 'Time range filter for search results',
  example: 'week',
});

export type WebSearchTimeRange = z.infer<typeof WebSearchTimeRangeSchema>;

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

export const WEB_SEARCH_RAW_CONTENT_FORMATS = ['markdown', 'text'] as const;

export const DEFAULT_WEB_SEARCH_RAW_CONTENT_FORMAT: WebSearchRawContentFormat = 'markdown';

export const WebSearchRawContentFormatSchema = z.enum(WEB_SEARCH_RAW_CONTENT_FORMATS).openapi({
  description: 'Format for raw content extraction',
  example: 'markdown',
});

export type WebSearchRawContentFormat = z.infer<typeof WebSearchRawContentFormatSchema>;

export const WebSearchRawContentFormats = {
  MARKDOWN: 'markdown' as const,
  TEXT: 'text' as const,
} as const;

// ============================================================================
// WEB SEARCH ANSWER MODE
// ============================================================================

export const WEB_SEARCH_ANSWER_MODES = ['none', 'basic', 'advanced'] as const;

export const DEFAULT_WEB_SEARCH_ANSWER_MODE: WebSearchAnswerMode = 'basic';

export const WebSearchAnswerModeSchema = z.enum(WEB_SEARCH_ANSWER_MODES).openapi({
  description: 'LLM-generated answer summary mode',
  example: 'basic',
});

export type WebSearchAnswerMode = z.infer<typeof WebSearchAnswerModeSchema>;

export const WebSearchAnswerModes = {
  NONE: 'none' as const,
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// WEB SEARCH ACTIVE ANSWER MODE (excludes 'none')
// ============================================================================

export const WEB_SEARCH_ACTIVE_ANSWER_MODES = ['basic', 'advanced'] as const;

export const DEFAULT_ACTIVE_ANSWER_MODE: WebSearchActiveAnswerMode = 'basic';

export const WebSearchActiveAnswerModeSchema = z.enum(WEB_SEARCH_ACTIVE_ANSWER_MODES).openapi({
  description: 'Active LLM-generated answer summary mode (excludes none)',
  example: 'basic',
});

export type WebSearchActiveAnswerMode = z.infer<typeof WebSearchActiveAnswerModeSchema>;

export const WebSearchActiveAnswerModes = {
  BASIC: 'basic' as const,
  ADVANCED: 'advanced' as const,
} as const;

// ============================================================================
// WEB SEARCH STREAMING STAGE
// ============================================================================

export const WEB_SEARCH_STREAMING_STAGES = ['query', 'search', 'synthesize'] as const;

export const DEFAULT_WEB_SEARCH_STREAMING_STAGE: WebSearchStreamingStage = 'query';

export const WebSearchStreamingStageSchema = z.enum(WEB_SEARCH_STREAMING_STAGES).openapi({
  description: 'Current stage of web search streaming process',
  example: 'search',
});

export type WebSearchStreamingStage = z.infer<typeof WebSearchStreamingStageSchema>;

export const WebSearchStreamingStages = {
  QUERY: 'query' as const,
  SEARCH: 'search' as const,
  SYNTHESIZE: 'synthesize' as const,
} as const;

// ============================================================================
// WEB SEARCH STREAM EVENT TYPES
// ============================================================================

export const WEB_SEARCH_STREAM_EVENT_TYPES = ['metadata', 'result', 'complete', 'error'] as const;

export const DEFAULT_WEB_SEARCH_STREAM_EVENT_TYPE: WebSearchStreamEventType = 'metadata';

export const WebSearchStreamEventTypeSchema = z.enum(WEB_SEARCH_STREAM_EVENT_TYPES).openapi({
  description: 'Event types for progressive web search streaming',
  example: 'result',
});

export type WebSearchStreamEventType = z.infer<typeof WebSearchStreamEventTypeSchema>;

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
