import { z } from '@hono/zod-openapi';

import {
  ChangelogTypeSchema,
  ChatModeSchema,
  DEFAULT_CHAT_MODE,
  PreSearchQueryStatusSchema,
  WebSearchAnswerModeSchema,
  WebSearchComplexitySchema,
  WebSearchContentTypeSchema,
  WebSearchDepthSchema,
  WebSearchRawContentFormatSchema,
  WebSearchTimeRangeSchema,
  WebSearchTopicSchema,
} from '@/api/core/enums';
import {
  CoreSchemas,
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
  CursorPaginationQuerySchema,
} from '@/api/core/schemas';
import {
  DbChangelogDataSchema,
  DbCustomRoleMetadataSchema,
  DbMessageMetadataSchema,
  DbParticipantSettingsSchema,
  DbThreadMetadataSchema,
} from '@/db/schemas/chat-metadata';
import { userSelectSchema } from '@/db/validation/auth';
import {
  chatCustomRoleInsertSchema,
  chatCustomRoleSelectSchema,
  chatCustomRoleUpdateSchema,
  chatMessageSelectSchema,
  chatModeratorAnalysisSelectSchema,
  chatParticipantInsertSchema,
  chatParticipantSelectSchema,
  chatParticipantUpdateSchema,
  chatPreSearchSelectSchema,
  chatRoundFeedbackSelectSchema,
  chatRoundFeedbackUpdateSchema,
  chatThreadChangelogSelectSchema,
  chatThreadInsertSchema,
  chatThreadSelectSchema,
  chatThreadUpdateSchema,
} from '@/db/validation/chat';
import { RoundNumberSchema } from '@/lib/schemas/round-schemas';

export const MessageContentSchema = z.string()
  .min(1, 'Message is required')
  .max(5000, 'Message is too long (max 5000 characters)');

// ============================================================================
// PARTICIPANT SCHEMAS - Consolidated
// ============================================================================

/**
 * Unique model ID validation refinement
 * Applied once at base schema level to avoid duplicate validation
 */
const uniqueModelIdsRefinement = {
  check: (participants: Array<{ modelId: string; isEnabled?: boolean }>) => {
    const enabledParticipants = participants.filter(p => p.isEnabled !== false);
    const modelIds = enabledParticipants.map(p => p.modelId);
    const uniqueModelIds = new Set(modelIds);
    return modelIds.length === uniqueModelIds.size;
  },
  message: 'Duplicate modelIds detected. Each enabled participant must have a unique model.',
};

/**
 * Base participant schema - single source of truth for participant fields
 * All participant variants derive from this schema using pick/omit
 */
const BaseParticipantSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Participant ID',
    example: 'participant_1',
  }),
  modelId: CoreSchemas.id().openapi({
    description: 'Model ID (e.g., anthropic/claude-3.5-sonnet, openai/gpt-4o)',
    example: 'anthropic/claude-3.5-sonnet',
  }),
  role: z.string().nullable().optional().openapi({
    description: 'Optional assigned role for this model',
    example: 'The Ideator',
  }),
  customRoleId: CoreSchemas.id().nullable().optional().openapi({
    description: 'Optional custom role ID to load system prompt from',
    example: '01HXYZ123ABC',
  }),
  systemPrompt: z.string().optional().openapi({
    description: 'Optional system prompt override (takes precedence over customRoleId)',
  }),
  temperature: z.number().min(0).max(2).optional().openapi({
    description: 'Temperature setting',
  }),
  maxTokens: z.number().int().positive().optional().openapi({
    description: 'Max tokens setting',
  }),
  priority: z.number().int().min(0).openapi({
    description: 'Display order (0-indexed)',
  }),
  isEnabled: z.boolean().optional().default(true).openapi({
    description: 'Whether participant is enabled',
  }),
});

/**
 * Participant schema for create operations - omits server-generated fields
 */
const CreateParticipantSchema = BaseParticipantSchema.omit({
  id: true,
  priority: true,
  isEnabled: true,
});

/**
 * Participant schema for update operations - partial updates allowed
 * Note: id is optional to support both updating existing participants (with id)
 * and creating new participants (without id or with empty id)
 */
const UpdateParticipantSchema = BaseParticipantSchema.pick({
  id: true,
  modelId: true,
  role: true,
  customRoleId: true,
  priority: true,
  isEnabled: true,
}).extend({
  // Override id to be optional - allows creating new participants without IDs
  id: CoreSchemas.id().optional().or(z.literal('')).openapi({
    description: 'Participant ID (optional - omit or use empty string for new participants)',
    example: 'participant_1',
  }),
});

/**
 * Participant schema for streaming requests - minimal required fields
 */
const StreamParticipantSchema = BaseParticipantSchema.pick({
  id: true,
  modelId: true,
  role: true,
  customRoleId: true,
  priority: true,
  isEnabled: true,
});

// ============================================================================
// ENTITY SCHEMAS
// ============================================================================

// ✅ TYPE-SAFE: Use strongly-typed schemas from single source of truth
const ChatParticipantSchema = chatParticipantSelectSchema
  .extend({
    // ✅ TYPE-SAFE: Settings nullable (SQLite can return null)
    settings: DbParticipantSettingsSchema.nullable().optional(),
  })
  .openapi('ChatParticipant');

// ✅ TYPE-SAFE: Discriminated union metadata (user | assistant | pre-search, nullable for legacy)
const ChatMessageSchema = chatMessageSelectSchema
  .extend({
    toolCalls: z.array(z.object({
      id: z.string(),
      type: z.string(),
      function: z.object({
        name: z.string(),
        arguments: z.string(),
      }),
    })).nullable().optional(),
    // ✅ TYPE-SAFE: Metadata typed by discriminated union (nullable for legacy data)
    metadata: DbMessageMetadataSchema.nullable(),
  })
  .openapi('ChatMessage');

// ✅ TYPE-SAFE: Strictly typed thread metadata (tags, summary only)
const ChatThreadSchema = chatThreadSelectSchema
  .extend({
    metadata: DbThreadMetadataSchema.nullable().optional(),
  })
  .openapi('ChatThread');

// ✅ TYPE-SAFE: Discriminated union changelog data (4 change types)
const ChatThreadChangelogSchema = chatThreadChangelogSelectSchema
  .extend({
    changeData: DbChangelogDataSchema,
  })
  .openapi('ChatThreadChangelog');

// ✅ TYPE-SAFE: Strictly typed custom role metadata (tags, category only)
const ChatCustomRoleSchema = chatCustomRoleSelectSchema
  .extend({
    metadata: DbCustomRoleMetadataSchema.nullable().optional(),
  })
  .openapi('ChatCustomRole');

export const CreateThreadRequestSchema = chatThreadInsertSchema
  .pick({
    title: true,
    mode: true,
    enableWebSearch: true,
    metadata: true,
  })
  .extend({
    title: z.string().min(1).max(200).optional().default('New Chat').openapi({
      description: 'Thread title (auto-generated from first message if "New Chat")',
      example: 'Product strategy brainstorm',
    }),
    mode: ChatModeSchema.optional().default(DEFAULT_CHAT_MODE).openapi({
      description: 'Conversation mode',
      example: 'brainstorming',
    }),
    enableWebSearch: z.boolean().optional().default(false).openapi({
      description: 'Allow participants to browse web for information',
      example: false,
    }),
    participants: z.array(CreateParticipantSchema)
      .min(1)
      .refine(uniqueModelIdsRefinement.check, { message: uniqueModelIdsRefinement.message })
      .openapi({
        description: 'Participants array (order determines priority - immutable after creation)',
      }),
    firstMessage: MessageContentSchema.openapi({
      description: 'Initial user message to start the conversation',
      example: 'What are innovative product ideas for sustainability?',
    }),
  })
  .openapi('CreateThreadRequest');
export const UpdateThreadRequestSchema = chatThreadUpdateSchema
  .pick({
    title: true,
    mode: true,
    status: true,
    isFavorite: true,
    isPublic: true,
    enableWebSearch: true,
    metadata: true,
  })
  .extend({
    participants: z.array(UpdateParticipantSchema)
      .optional()
      .openapi({ description: 'Complete list of participants with their updated state' }),
  })
  .refine(
    (data) => {
      if (!data.participants)
        return true;
      return uniqueModelIdsRefinement.check(data.participants);
    },
    { message: uniqueModelIdsRefinement.message, path: ['participants'] },
  )
  .openapi('UpdateThreadRequest');
export const ThreadListQuerySchema = CursorPaginationQuerySchema.extend({
  search: z.string().optional().openapi({
    description: 'Search query to filter threads by title',
    example: 'product strategy',
  }),
}).openapi('ThreadListQuery');
const ThreadDetailPayloadSchema = z.object({
  thread: ChatThreadSchema,
  participants: z.array(ChatParticipantSchema),
  messages: z.array(ChatMessageSchema),
  changelog: z.array(ChatThreadChangelogSchema),
  analyses: z.array(chatModeratorAnalysisSelectSchema).optional().openapi({
    description: 'Moderator analyses for each round (optional - excluded for public threads)',
  }),
  feedback: z.array(chatRoundFeedbackSelectSchema).optional().openapi({
    description: 'User feedback for each round (optional - excluded for public threads)',
  }),
  user: userSelectSchema.pick({
    id: true,
    name: true,
    image: true,
  }),
}).openapi('ThreadDetailPayload');
export const ThreadListResponseSchema = createCursorPaginatedResponseSchema(ChatThreadSchema).openapi('ThreadListResponse');
export type ThreadListResponse = z.infer<typeof ThreadListResponseSchema>;
export const ThreadDetailResponseSchema = createApiResponseSchema(ThreadDetailPayloadSchema).openapi('ThreadDetailResponse');
export type ThreadDetailResponse = z.infer<typeof ThreadDetailResponseSchema>;

// Thread slug status payload (lightweight for polling during AI title generation)
const ThreadSlugStatusPayloadSchema = z.object({
  slug: z.string().openapi({
    description: 'Thread URL slug',
    example: 'product-strategy-brainstorm-abc123',
  }),
  title: z.string().openapi({
    description: 'Thread title',
    example: 'Product Strategy Brainstorm',
  }),
  isAiGeneratedTitle: z.boolean().openapi({
    description: 'Whether the title was generated by AI (vs default "New Chat")',
    example: true,
  }),
}).openapi('ThreadSlugStatusPayload');

export const ThreadSlugStatusResponseSchema = createApiResponseSchema(ThreadSlugStatusPayloadSchema).openapi('ThreadSlugStatusResponse');

// Inferred type for thread slug status polling
export type ThreadSlugStatus = z.infer<typeof ThreadSlugStatusPayloadSchema>;

export const DeleteThreadResponseSchema = createApiResponseSchema(z.object({
  deleted: z.boolean().openapi({ example: true }),
})).openapi('DeleteThreadResponse');
export const AddParticipantRequestSchema = chatParticipantInsertSchema
  .pick({
    modelId: true,
    role: true,
    priority: true,
    settings: true,
  })
  .extend({
    role: z.string().min(1).max(100).nullish().openapi({
      description: 'Optional assigned role',
      example: 'The Ideator',
    }),
  })
  .openapi('AddParticipantRequest');
export const UpdateParticipantRequestSchema = chatParticipantUpdateSchema
  .pick({
    role: true,
    priority: true,
    isEnabled: true,
    settings: true,
  })
  .openapi('UpdateParticipantRequest');
const ParticipantDetailPayloadSchema = z.object({
  participant: ChatParticipantSchema,
}).openapi('ParticipantDetailPayload');
export const ParticipantDetailResponseSchema = createApiResponseSchema(ParticipantDetailPayloadSchema).openapi('ParticipantDetailResponse');
export type ParticipantDetailResponse = z.infer<typeof ParticipantDetailResponseSchema>;
/**
 * AI SDK UIMessage schema for OpenAPI documentation
 * This is a simplified representation - actual runtime validation uses AI SDK's validateUIMessages()
 *
 * Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-ui/ui-message
 */
const UIMessageSchema = z.object({
  id: z.string().openapi({
    description: 'Unique message identifier',
    example: 'msg_user1',
  }),
  role: z.enum(['user', 'assistant', 'system']).openapi({
    description: 'Message role',
    example: 'user',
  }),
  parts: z.array(z.union([
    z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
    z.object({
      type: z.literal('reasoning'),
      text: z.string(),
    }),
  ])).openapi({
    description: 'Message parts array (text, reasoning, etc.)',
    example: [{ type: 'text', text: 'What are the best practices for API design?' }],
  }),
  createdAt: z.string().datetime().optional().openapi({
    description: 'Message creation timestamp',
    example: '2025-01-15T10:30:00.000Z',
  }),
  // ✅ TYPE-SAFE: Use discriminated union schema for strict validation
  metadata: DbMessageMetadataSchema.optional().openapi({
    description: 'Message metadata (discriminated by role: user | assistant | system)',
  }),
}).openapi('UIMessage');

// ============================================================================
// WEB SEARCH SCHEMAS (Domain-Specific)
// ============================================================================

/**
 * Web search parameters schema (Tavily-enhanced)
 * All fields optional for backward compatibility
 */
export const WebSearchParametersSchema = z.object({
  // Core search parameters
  query: z.string().min(1).describe('Search query to find information on the web'),
  maxResults: z.number().int().positive().min(1).max(20).optional().default(10).describe('Maximum number of search results to return (1-20, default 10)'),
  searchDepth: WebSearchDepthSchema.optional().default('advanced').describe('Search depth: basic for fast results, advanced for comprehensive search'),

  // Topic and content filtering
  topic: WebSearchTopicSchema.optional().describe('Search topic category for specialized search optimization'),
  timeRange: WebSearchTimeRangeSchema.optional().describe('Filter results by time range (day, week, month, year)'),
  days: z.number().int().positive().max(365).optional().describe('Filter results by specific number of days (for news topic)'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Start date for date range filter (YYYY-MM-DD)'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('End date for date range filter (YYYY-MM-DD)'),

  // Content extraction options
  chunksPerSource: z.number().int().min(1).max(3).optional().default(2).describe('Number of content chunks per source (1-3, for advanced search)'),
  includeImages: z.boolean().optional().default(true).describe('Include images from search results'),
  includeImageDescriptions: z.boolean().optional().default(true).describe('Generate AI descriptions for images'),
  includeRawContent: z.union([z.boolean(), WebSearchRawContentFormatSchema]).optional().default('markdown').describe('Include raw page content (boolean or format: markdown/text)'),
  maxTokens: z.number().int().positive().optional().describe('Maximum tokens for content extraction'),

  // Answer generation
  includeAnswer: z.union([z.boolean(), WebSearchAnswerModeSchema]).optional().default('advanced').describe('Include AI-generated answer summary (boolean or mode: basic/advanced)'),

  // Domain filtering
  includeDomains: z.array(z.string()).optional().describe('Only search within these domains'),
  excludeDomains: z.array(z.string()).optional().describe('Exclude these domains from search'),

  // Geographic and metadata
  country: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code for geographic prioritization'),
  includeFavicon: z.boolean().optional().default(true).describe('Include website favicons in results'),

  // Auto-parameters mode
  autoParameters: z.boolean().optional().default(false).describe('Automatically detect and apply optimal search parameters'),
}).openapi('WebSearchParameters');

export type WebSearchParameters = z.infer<typeof WebSearchParametersSchema>;

/**
 * Individual search result schema (Tavily-enhanced)
 */
export const WebSearchResultItemSchema = z.object({
  title: z.string().describe('Title of the search result'),
  // ✅ FIX: More lenient URL validation - some search APIs return malformed URLs
  // Use string().min(1) instead of url() to avoid validation failures on relative/malformed URLs
  url: z.string().min(1).describe('URL of the search result'),
  content: z.string().describe('Content snippet from the page'),
  excerpt: z.string().optional().describe('Short snippet from search results'),
  fullContent: z.string().optional().describe('Full scraped content from actual page (up to 15000 chars)'),
  rawContent: z.string().optional().describe('Raw content in markdown or text format (Tavily-style)'),
  score: z.number().min(0).max(1).describe('Relevance score (0-1)'),
  publishedDate: z.string().nullable().optional().describe('Publication date if available (ISO 8601)'),
  domain: z.string().optional().describe('Domain extracted from URL'),
  metadata: z.object({
    author: z.string().optional().describe('Article/page author'),
    readingTime: z.number().optional().describe('Estimated reading time in minutes'),
    wordCount: z.number().optional().describe('Word count of extracted content'),
    description: z.string().optional().describe('Meta description or summary'),
    imageUrl: z.string().optional().describe('Main image URL from the page'),
    faviconUrl: z.string().optional().describe('Favicon URL for the website'),
  }).optional().describe('Additional metadata extracted from the page'),
  contentType: WebSearchContentTypeSchema.optional().describe('Content type classification'),
  keyPoints: z.array(z.string()).optional().describe('Key points extracted from content'),
  // Tavily-specific fields
  images: z.array(z.object({
    url: z.string().describe('Image URL'),
    description: z.string().optional().describe('AI-generated image description'),
    alt: z.string().optional().describe('Image alt text'),
  })).optional().describe('Images found in the result with optional AI descriptions'),
}).openapi('WebSearchResultItem');

export type WebSearchResultItem = z.infer<typeof WebSearchResultItemSchema>;

/**
 * Search result metadata schema
 * Includes cache performance tracking and usage limits
 */
export const WebSearchResultMetaSchema = z.object({
  // Cache metadata
  cached: z.boolean().optional().describe('Whether result was retrieved from cache'),
  cacheAge: z.number().optional().describe('Age of cached result in milliseconds (only for cached results)'),
  cacheHitRate: z.number().min(0).max(1).optional().describe('Overall cache hit rate (0-1)'),

  // Usage limits
  limitReached: z.boolean().optional().describe('Whether participant has reached search limit'),
  searchesUsed: z.number().int().min(0).optional().describe('Number of searches used by participant'),
  maxSearches: z.number().int().positive().optional().describe('Maximum searches allowed per participant'),
  remainingSearches: z.number().int().min(0).optional().describe('Remaining searches for participant'),

  // Error tracking
  error: z.boolean().optional().describe('Whether search encountered an error'),
  message: z.string().optional().describe('Additional message or error description'),

  // Performance
  complexity: WebSearchComplexitySchema.optional().describe('Search complexity level used'),
}).openapi('WebSearchResultMeta');

export type WebSearchResultMeta = z.infer<typeof WebSearchResultMetaSchema>;

/**
 * Complete web search result schema (Tavily-enhanced)
 */
export const WebSearchResultSchema = z.object({
  query: z.string().describe('The search query that was executed'),
  answer: z.string().nullable().describe('AI-generated answer summary'),
  results: z.array(WebSearchResultItemSchema).describe('Array of search results'),
  responseTime: z.number().describe('API response time in milliseconds'),
  requestId: z.string().optional().describe('Unique request ID for tracking and debugging'),
  // Tavily-style images array
  images: z.array(z.object({
    url: z.string().describe('Image URL'),
    description: z.string().optional().describe('AI-generated image description'),
  })).optional().describe('Consolidated images from all results with AI descriptions'),
  // Auto-detected parameters
  autoParameters: z.object({
    topic: WebSearchTopicSchema.optional().describe('Auto-detected search topic'),
    timeRange: WebSearchTimeRangeSchema.optional().describe('Auto-detected time range'),
    searchDepth: WebSearchDepthSchema.optional().describe('Auto-detected search depth'),
    reasoning: z.string().optional().describe('Explanation of why these parameters were chosen'),
  }).optional().describe('Auto-detected search parameters based on query analysis'),
  _meta: WebSearchResultMetaSchema.optional().describe('Search metadata (cache status, limits, etc.)'),
}).openapi('WebSearchResult');

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;

/**
 * Generated search query schema
 * Used by web-search.service.ts AI generation
 */
export const GeneratedSearchQuerySchema = z.object({
  query: z.string().describe('The generated search query'),
  rationale: z.string().describe('Explanation for why this query will help answer the user question'),
  searchDepth: WebSearchDepthSchema.describe('Recommended search depth for this query'),
  complexity: WebSearchComplexitySchema.optional().describe('Query complexity level: BASIC (2-3 sources), MODERATE (4-6 sources), DEEP (7-10 sources)'),
  // ✅ DYNAMIC SOURCE COUNT: AI determines optimal source count based on query complexity
  sourceCount: z.number().min(1).max(10).optional().describe('Dynamic source count: BASIC=2-3, MODERATE=4-6, DEEP=7-10 (AI-determined based on complexity)'),
  // ✅ TAVILY-STYLE: AI-driven advanced parameters
  requiresFullContent: z.boolean().optional().describe('Whether full content extraction is needed'),
  chunksPerSource: z.number().int().min(1).max(3).optional().describe('Number of content chunks per source for deep research (1-3)'),
  topic: WebSearchTopicSchema.optional().describe('Auto-detected topic category'),
  timeRange: WebSearchTimeRangeSchema.optional().describe('Auto-detected time relevance'),
  needsAnswer: z.union([z.boolean(), WebSearchAnswerModeSchema]).optional().describe('Whether to generate AI answer summary (boolean or mode: basic/advanced)'),
  // ✅ DYNAMIC IMAGE DECISIONS: AI determines if images are needed
  includeImages: z.boolean().optional().describe('Whether to fetch and include images from search results (true for visual queries, false for text-only)'),
  includeImageDescriptions: z.boolean().optional().describe('Whether images need AI-generated descriptions (true for complex visual analysis, false for simple display)'),
  analysis: z.string().optional().describe('Analysis of user intent and information needs'),
}).openapi('GeneratedSearchQuery');

export type GeneratedSearchQuery = z.infer<typeof GeneratedSearchQuerySchema>;

// ============================================================================
// SERVICE LAYER SCHEMAS (Moved from services - Single Source of Truth)
// ============================================================================

/**
 * Participant configuration input schema
 * Used by participant-config.service.ts for change detection
 */
export const ParticipantConfigInputSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Participant ID (temp ID for new participants)',
    example: 'participant_temp_1',
  }),
  modelId: CoreSchemas.id().openapi({
    description: 'Model ID',
    example: 'anthropic/claude-3.5-sonnet',
  }),
  role: z.string().nullable().optional().openapi({
    description: 'Optional role name',
  }),
  customRoleId: CoreSchemas.id().nullable().optional().openapi({
    description: 'Optional custom role ID',
  }),
  priority: z.number().int().min(0).openapi({
    description: 'Display priority',
  }),
  isEnabled: z.boolean().optional().default(true).openapi({
    description: 'Whether participant is enabled',
  }),
}).openapi('ParticipantConfigInput');

export type ParticipantConfigInput = z.infer<typeof ParticipantConfigInputSchema>;

/**
 * Search context options schema
 * Used by search-context-builder.ts for context generation
 */
export const SearchContextOptionsSchema = z.object({
  currentRoundNumber: RoundNumberSchema.openapi({
    description: 'Current round number for determining context detail level (0-based: first round is 0)',
  }),
  includeFullResults: z.boolean().optional().default(true).openapi({
    description: 'Whether to include full results for current round',
  }),
}).openapi('SearchContextOptions');

export type SearchContextOptions = z.infer<typeof SearchContextOptionsSchema>;

/**
 * Validated pre-search data schema
 * Used by search-context-builder.ts for metadata extraction
 */
export const ValidatedPreSearchDataSchema = z.object({
  queries: z.array(z.object({
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    index: RoundNumberSchema, // ✅ 0-BASED: Query index starts at 0
  })),
  analysis: z.string(),
  successCount: RoundNumberSchema,
  failureCount: RoundNumberSchema,
  totalResults: RoundNumberSchema,
  totalTime: z.number(),
  results: z.array(z.object({
    query: z.string(),
    answer: z.string().nullable(),
    // ✅ FULL CONTENT SUPPORT: Use complete WebSearchResultItemSchema for all fields
    // This ensures fullContent, metadata, domain, etc. are available for participant exposure
    results: z.array(WebSearchResultItemSchema),
    responseTime: z.number(),
  })),
}).openapi('ValidatedPreSearchData');

export type ValidatedPreSearchData = z.infer<typeof ValidatedPreSearchDataSchema>;

// ============================================================================
// PRE-SEARCH API SCHEMAS
// ============================================================================

/**
 * Pre-search request schema (unified with analysis pattern)
 * ✅ FOLLOWS: Moderator analysis request pattern
 * Executes web search BEFORE participant streaming
 */
export const PreSearchRequestSchema = z.object({
  userQuery: z.string().min(1).max(5000).openapi({
    description: 'User query for web search',
    example: 'What is the current Bitcoin price?',
  }),
}).openapi('PreSearchRequest');

export type PreSearchRequest = z.infer<typeof PreSearchRequestSchema>;

/**
 * Pre-search data payload schema
 * ✅ ZOD-FIRST: Matches database searchData JSON column type
 */
export const PreSearchDataPayloadSchema = z.object({
  queries: z.array(z.object({
    query: z.string(),
    rationale: z.string(),
    searchDepth: z.enum(['basic', 'advanced']),
    index: z.number(),
    total: z.number(),
  })),
  results: z.array(z.object({
    query: z.string(),
    answer: z.string().nullable(),
    results: z.array(WebSearchResultItemSchema),
    responseTime: z.number(),
  })),
  analysis: z.string(),
  successCount: z.number(),
  failureCount: z.number(),
  totalResults: z.number(),
  totalTime: z.number(),
}).openapi('PreSearchDataPayload');

export type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

/**
 * Stored pre-search schema (from database)
 * ✅ FOLLOWS: StoredModeratorAnalysisSchema pattern
 * ✅ FIX: Accept both string and Date for timestamps (API returns strings, transform converts to Date)
 */
export const StoredPreSearchSchema = chatPreSearchSelectSchema
  .extend({
    searchData: PreSearchDataPayloadSchema.nullable().optional(),
    // Override date fields to accept both string and Date (transform handles conversion)
    createdAt: z.union([z.string(), z.date()]),
    completedAt: z.union([z.string(), z.date()]).nullable(),
  })
  .openapi('StoredPreSearch');

export type StoredPreSearch = z.infer<typeof StoredPreSearchSchema>;

/**
 * Pre-search response schema (API response wrapper)
 * ✅ CONSISTENT: Uses createApiResponseSchema like analysis
 */
export const PreSearchResponseSchema = createApiResponseSchema(StoredPreSearchSchema).openapi('PreSearchResponse');

export type PreSearchResponse = z.infer<typeof PreSearchResponseSchema>;

/**
 * Pre-search list payload and response schemas
 * ✅ FOLLOWS: ModeratorAnalysisListPayloadSchema pattern
 */
const PreSearchListPayloadSchema = z.object({
  items: z.array(StoredPreSearchSchema),
  count: z.number().int().nonnegative(),
}).openapi('PreSearchListPayload');

export const PreSearchListResponseSchema = createApiResponseSchema(PreSearchListPayloadSchema).openapi('PreSearchListResponse');
export type PreSearchListResponse = z.infer<typeof PreSearchListResponseSchema>;

// ============================================================================
// CHAT STREAMING SCHEMAS
// ============================================================================

export const StreamChatRequestSchema = z.object({
  message: UIMessageSchema.openapi({
    description: 'Last message in AI SDK UIMessage format (send only new message - backend loads history)',
  }),
  id: z.string().min(1).openapi({
    description: 'Thread ID for persistence and participant loading',
    example: 'thread_abc123',
  }),
  participantIndex: z.number().int().min(0).optional().default(0).openapi({
    description: 'Index of participant to stream (0-based). Frontend orchestrates multiple participants.',
    example: 0,
  }),
  participants: z.array(StreamParticipantSchema)
    .optional()
    .openapi({
      description: 'Current participant configuration (optional). If provided, used instead of loading from database.',
    }),
  regenerateRound: RoundNumberSchema.optional().openapi({
    description: 'Round number to regenerate (replace). ✅ 0-BASED: first round is 0. If provided, deletes old messages and analysis for that round first.',
    example: 0,
  }),
  mode: ChatModeSchema.optional().openapi({
    description: 'Conversation mode for this thread. If changed, generates changelog entry.',
    example: 'brainstorming',
  }),
  enableWebSearch: z.boolean().optional().openapi({
    description: 'Enable/disable web search for this thread. If changed, generates changelog entry.',
    example: true,
  }),
}).openapi('StreamChatRequest');
const MessagesListPayloadSchema = z.object({
  messages: z.array(ChatMessageSchema),
  count: z.number().int().nonnegative(),
}).openapi('MessagesListPayload');
export const MessagesListResponseSchema = createApiResponseSchema(MessagesListPayloadSchema).openapi('MessagesListResponse');
export type MessagesListResponse = z.infer<typeof MessagesListResponseSchema>;
export const CreateCustomRoleRequestSchema = chatCustomRoleInsertSchema
  .pick({
    name: true,
    description: true,
    systemPrompt: true,
    metadata: true,
  })
  .openapi('CreateCustomRoleRequest');
export const UpdateCustomRoleRequestSchema = chatCustomRoleUpdateSchema
  .pick({
    name: true,
    description: true,
    systemPrompt: true,
    metadata: true,
  })
  .openapi('UpdateCustomRoleRequest');
const CustomRoleDetailPayloadSchema = z.object({
  customRole: ChatCustomRoleSchema,
}).openapi('CustomRoleDetailPayload');
export const CustomRoleListResponseSchema = createCursorPaginatedResponseSchema(ChatCustomRoleSchema).openapi('CustomRoleListResponse');
export const CustomRoleDetailResponseSchema = createApiResponseSchema(CustomRoleDetailPayloadSchema).openapi('CustomRoleDetailResponse');
const ChangelogListPayloadSchema = z.object({
  items: z.array(ChatThreadChangelogSchema),
  count: z.number().int().nonnegative(),
}).openapi('ChangelogListPayload');
export const ChangelogListResponseSchema = createApiResponseSchema(ChangelogListPayloadSchema).openapi('ChangelogListResponse');
export type ChangelogListResponse = z.infer<typeof ChangelogListResponseSchema>;
export const CreateChangelogParamsSchema = z.object({
  threadId: CoreSchemas.id(),
  roundNumber: RoundNumberSchema, // ✅ 0-BASED: Allow round 0
  changeType: ChangelogTypeSchema,
  changeSummary: z.string().min(1).max(500),
  changeData: DbChangelogDataSchema, // ✅ SINGLE SOURCE OF TRUTH: Use discriminated union
}).openapi('CreateChangelogParams');
export type CreateChangelogParams = z.infer<typeof CreateChangelogParamsSchema>;
export const ParticipantInfoSchema = chatParticipantSelectSchema
  .pick({
    id: true,
    modelId: true,
    role: true,
    priority: true,
  })
  .extend({
    modelName: z.string().optional().openapi({
      description: 'Human-readable model name (computed from model lookup)',
    }),
  })
  .openapi('ParticipantInfo');
export type ParticipantInfo = z.infer<typeof ParticipantInfoSchema>;
export const RoundtablePromptConfigSchema = z.object({
  mode: z.string(),
  currentParticipantIndex: z.number().int().nonnegative(),
  currentParticipant: ParticipantInfoSchema,
  allParticipants: z.array(ParticipantInfoSchema),
  customSystemPrompt: z.string().nullable().optional(),
}).openapi('RoundtablePromptConfig');
export type RoundtablePromptConfig = z.infer<typeof RoundtablePromptConfigSchema>;
export const ModeratorAnalysisRequestSchema = z.object({
  participantMessageIds: z.array(CoreSchemas.id()).optional().openapi({
    description: 'Array of message IDs from participants (optional - backend auto-queries from database if not provided)',
    example: ['msg_abc123', 'msg_def456', 'msg_ghi789'],
  }),
}).openapi('ModeratorAnalysisRequest');
export const SkillRatingSchema = z.object({
  skillName: z.string()
    .describe('Name of the skill being evaluated (e.g., "Creativity", "Technical Depth", "Clarity")'),
  rating: z.number().min(1).max(10).describe('Rating out of 10 for this specific skill'),
}).openapi('SkillRating');
export const ParticipantAnalysisSchema = z.object({
  participantIndex: RoundNumberSchema.describe('Index of the participant in the conversation (0-based)'),
  participantRole: z.string().nullable().describe('The role assigned to this participant (e.g., "The Ideator")'),
  modelId: z.string()
    .describe('AI model ID (e.g., "anthropic/claude-sonnet-4.5")'),
  modelName: z.string()
    .describe('Human-readable model name (e.g., "Claude Sonnet 4.5")'),
  overallRating: z.number().min(1).max(10).describe('Overall rating out of 10 for this response'),
  skillsMatrix: z.array(SkillRatingSchema)
    .length(5)
    .describe('Individual skill ratings for pentagon visualization - MUST be exactly 5 skills (e.g., Creativity, Technical Depth, Clarity, Analysis, Innovation)'),
  pros: z.array(z.string()).min(1).describe('List of strengths in this response (2-4 items)'),
  cons: z.array(z.string()).min(1).describe('List of weaknesses or areas for improvement (1-3 items)'),
  summary: z.string().max(300).describe('Brief summary of this participant\'s contribution (1-2 sentences)'),
}).openapi('ParticipantAnalysis');
export const LeaderboardEntrySchema = z.object({
  rank: z.number().int().min(1).describe('Rank position (1 = best)'),
  participantIndex: RoundNumberSchema.describe('Index of the participant'),
  participantRole: z.string().nullable().describe('The role assigned to this participant'),
  modelId: z.string()
    .describe('AI model ID (e.g., "anthropic/claude-sonnet-4.5")'),
  modelName: z.string()
    .describe('Human-readable model name'),
  overallRating: z.number().min(1).max(10).describe('Overall rating for ranking'),
  badge: z.string().nullable().describe('Optional badge/award (e.g., "Most Creative", "Best Analysis")'),
}).openapi('LeaderboardEntry');

// RecommendedAction schema - used within RoundSummarySchema
export const RecommendedActionSchema = z.object({
  action: z.string().describe('User-ready prompt addressing specific gaps in the conversation. Write as the user would: "Can you explore X? What challenges..." NOT "Explore X" or "Consider Y". Be direct and actionable.'),
  rationale: z.string().describe('Why this addresses a blind spot in the conversation'),
  suggestedModels: z.array(z.string()).describe('Model IDs to add (e.g., "openai/gpt-4o"), empty if none'),
  suggestedRoles: z.array(z.string()).describe('Roles for new participants (e.g., "critic"), empty if none'),
  suggestedMode: z.string().describe('Mode change if beneficial (e.g., "debating"), empty if none'),
});

export const RoundSummarySchema = z.object({
  keyInsights: z.array(z.string()).min(1).max(6).describe('3-6 most important insights or patterns identified across all participant responses'),
  consensusPoints: z.array(z.string()).min(0).max(5).describe('2-5 key points where participants showed agreement or alignment (empty if no consensus)'),
  divergentApproaches: z.array(z.object({
    topic: z.string().describe('The specific topic or aspect where participants diverged'),
    perspectives: z.array(z.string()).min(1).describe('Different perspectives taken by participants (at least 1)'),
  })).min(0).max(4).describe('0-4 areas where participants took significantly different approaches'),
  comparativeAnalysis: z.object({
    strengthsByCategory: z.array(z.object({
      category: z.string().describe('Strength category (e.g., "Technical Depth", "Creativity")'),
      participants: z.array(z.string()).describe('Participant names or indices showing this strength'),
    })).min(1).max(6).describe('2-6 strength categories mapped to participants who excel in each'),
    tradeoffs: z.array(z.string()).min(1).max(4).describe('2-4 key trade-offs to consider when choosing between approaches'),
  }).describe('Structured comparison showing which approaches excel in which areas and trade-offs'),
  decisionFramework: z.object({
    criteriaToConsider: z.array(z.string()).min(2).max(5).describe('3-5 key criteria the user should consider when evaluating the responses'),
    scenarioRecommendations: z.array(z.object({
      scenario: z.string().describe('A specific use case or scenario'),
      recommendation: z.string().describe('Which approach(es) work best for this scenario and why'),
    })).min(1).max(3).describe('2-3 scenario-based recommendations'),
  }).describe('Framework to help user make informed decisions'),
  overallSummary: z.string().min(50).max(1200).describe('Narrative summary that synthesizes the analysis (50-1200 chars, adapt length to complexity)'),
  conclusion: z.string().min(30).max(600).describe('Final conclusion with recommendation (30-600 chars, adapt length to complexity)'),
  recommendedActions: z.array(RecommendedActionSchema).min(1).max(5).describe('1-5 next steps addressing conversation gaps. Generate after conclusion.'),
}).openapi('RoundSummary');

export const ModeratorAnalysisPayloadSchema = z.object({
  roundNumber: RoundNumberSchema.describe('The conversation round number (✅ 0-BASED: starts at 0)'),
  mode: z.string().describe('Conversation mode (analyzing, brainstorming, debating, solving)'),
  userQuestion: z.string().describe('The user\'s original question/prompt'),
  participantAnalyses: z.array(ParticipantAnalysisSchema).min(1).describe('Detailed analysis for each participant'),
  leaderboard: z.array(LeaderboardEntrySchema).min(1).describe('Ranked list of participants by overall performance'),
  roundSummary: RoundSummarySchema.describe('Comprehensive structured summary providing decision-making value'),
}).openapi('ModeratorAnalysisPayload');
export const ModeratorAnalysisResponseSchema = createApiResponseSchema(ModeratorAnalysisPayloadSchema).openapi('ModeratorAnalysisResponse');
export const AnalysisAcceptedPayloadSchema = z.object({
  analysisId: z.string().describe('ID of the analysis record being processed'),
  status: z.literal('processing').describe('Status indicating background processing has started'),
  message: z.string().optional().describe('Optional message about polling for completion'),
}).openapi('AnalysisAcceptedPayload');
export const AnalysisAcceptedResponseSchema = AnalysisAcceptedPayloadSchema.openapi('AnalysisAcceptedResponse');

// ✅ TYPE-SAFE: Stored moderator analysis with properly typed analysis data
// ✅ FIX: Accept both string and Date for timestamps (API returns strings, transform converts to Date)
export const StoredModeratorAnalysisSchema = chatModeratorAnalysisSelectSchema
  .extend({
    analysisData: z.object({
      leaderboard: z.array(LeaderboardEntrySchema),
      participantAnalyses: z.array(ParticipantAnalysisSchema),
      roundSummary: RoundSummarySchema,
    }).nullable().optional(),
    // Override date fields to accept both string and Date (transform handles conversion)
    createdAt: z.union([z.string(), z.date()]),
    completedAt: z.union([z.string(), z.date()]).nullable(),
  })
  .openapi('StoredModeratorAnalysis');

const ModeratorAnalysisListPayloadSchema = z.object({
  items: z.array(StoredModeratorAnalysisSchema),
  count: z.number().int().nonnegative(),
}).openapi('ModeratorAnalysisListPayload');
export const ModeratorAnalysisListResponseSchema = createApiResponseSchema(ModeratorAnalysisListPayloadSchema).openapi('ModeratorAnalysisListResponse');
export type ModeratorAnalysisListResponse = z.infer<typeof ModeratorAnalysisListResponseSchema>;

// Export schemas for store usage
export { ChatParticipantSchema, ChatThreadSchema };

export type ChatThread = z.infer<typeof ChatThreadSchema>;
export type CreateThreadRequest = z.infer<typeof CreateThreadRequestSchema>;
export type UpdateThreadRequest = z.infer<typeof UpdateThreadRequestSchema>;
export type UpdateThreadParticipant = z.infer<typeof UpdateParticipantSchema>;
export type ChatParticipant = z.infer<typeof ChatParticipantSchema>;
export type AddParticipantRequest = z.infer<typeof AddParticipantRequestSchema>;
export type UpdateParticipantRequest = z.infer<typeof UpdateParticipantRequestSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type StreamChatRequest = z.infer<typeof StreamChatRequestSchema>;
export type ChatCustomRole = z.infer<typeof ChatCustomRoleSchema>;
export type CreateCustomRoleRequest = z.infer<typeof CreateCustomRoleRequestSchema>;
export type UpdateCustomRoleRequest = z.infer<typeof UpdateCustomRoleRequestSchema>;
export type RoundSummary = z.infer<typeof RoundSummarySchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
// ============================================================================
// SIMPLIFIED CHANGELOG DATA SCHEMAS
// ============================================================================
// Consolidated from 5 separate schemas to 3 discriminated union types
// Each changeData includes a 'type' field for discrimination

const BaseChangeDataSchema = z.object({
  type: z.enum(['participant', 'participant_role', 'mode_change']),
});

export const ParticipantChangeDataSchema = BaseChangeDataSchema.extend({
  type: z.literal('participant'),
  modelId: z.string(),
  role: z.string().nullable().optional(),
  participantId: z.string().optional(),
});
export type ParticipantChangeData = z.infer<typeof ParticipantChangeDataSchema>;

export const ParticipantRoleChangeDataSchema = BaseChangeDataSchema.extend({
  type: z.literal('participant_role'),
  modelId: z.string(),
  oldRole: z.string().nullable().optional(),
  newRole: z.string().nullable().optional(),
  participantId: z.string().optional(),
});
export type ParticipantRoleChangeData = z.infer<typeof ParticipantRoleChangeDataSchema>;

export const ModeChangeDataSchema = BaseChangeDataSchema.extend({
  type: z.literal('mode_change'),
  oldMode: z.string(),
  newMode: z.string(),
});
export type ModeChangeData = z.infer<typeof ModeChangeDataSchema>;

// Discriminated union for all change data types
export const ChangeDataSchema = z.discriminatedUnion('type', [
  ParticipantChangeDataSchema,
  ParticipantRoleChangeDataSchema,
  ModeChangeDataSchema,
]);
export type ChangeData = z.infer<typeof ChangeDataSchema>;
export type ChatThreadChangelog = z.infer<typeof ChatThreadChangelogSchema>;
export type ParticipantAnalysis = z.infer<typeof ParticipantAnalysisSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type ModeratorAnalysisRequest = z.infer<typeof ModeratorAnalysisRequestSchema>;
export type ModeratorAnalysisPayload = z.infer<typeof ModeratorAnalysisPayloadSchema>;
export type StoredModeratorAnalysis = z.infer<typeof StoredModeratorAnalysisSchema>;
export const RoundFeedbackParamSchema = z.object({
  threadId: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  roundNumber: z.string().openapi({
    description: 'Round number (✅ 0-BASED: first round is 0)',
    example: '0',
  }),
});
export const RoundFeedbackRequestSchema = chatRoundFeedbackUpdateSchema
  .pick({
    feedbackType: true,
  })
  .openapi('RoundFeedbackRequest');
export type RoundFeedbackRequest = z.infer<typeof RoundFeedbackRequestSchema>;
const ChatRoundFeedbackSchema = chatRoundFeedbackSelectSchema
  .pick({
    id: true,
    threadId: true,
    userId: true,
    roundNumber: true,
    feedbackType: true,
    createdAt: true,
    updatedAt: true,
  })
  .openapi('ChatRoundFeedback');
export type RoundFeedback = z.infer<typeof ChatRoundFeedbackSchema>;
export const SetRoundFeedbackResponseSchema = createApiResponseSchema(
  ChatRoundFeedbackSchema,
).openapi('SetRoundFeedbackResponse');
export const GetThreadFeedbackResponseSchema = createApiResponseSchema(
  z.array(ChatRoundFeedbackSchema),
).openapi('GetThreadFeedbackResponse');

/**
 * Round Feedback Data Schema (Store/Client-Specific)
 * Minimal feedback data for store state management
 */
export const RoundFeedbackDataSchema = chatRoundFeedbackSelectSchema
  .pick({
    roundNumber: true,
    feedbackType: true,
  })
  .openapi('RoundFeedbackData');

export type RoundFeedbackData = z.infer<typeof RoundFeedbackDataSchema>;

// ============================================================================
// RESUMABLE STREAM SCHEMAS
// ============================================================================

/**
 * Stream status response schema
 * Used for checking if participant stream is active/completed for resumption
 */
export const StreamStateSchema = z.object({
  threadId: z.string(),
  roundNumber: RoundNumberSchema,
  participantIndex: RoundNumberSchema,
  status: z.enum(['active', 'completed', 'failed']),
  messageId: z.string().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
}).openapi('StreamState');

export type StreamState = z.infer<typeof StreamStateSchema>;

export const StreamStatusResponseSchema = createApiResponseSchema(StreamStateSchema).openapi('StreamStatusResponse');

export type StreamStatusResponse = z.infer<typeof StreamStatusResponseSchema>;

// ============================================================================
// PRE-SEARCH STREAMING DATA SCHEMAS
// ============================================================================
// Following AI SDK v5 pattern for custom data streaming
// Reference: ai-sdk-v5-crash-course exercises 07.01, 07.02, 99.04, 99.05

/**
 * Pre-search phase start event
 * Sent when initial web search phase begins
 */
export const PreSearchStartDataSchema = z.object({
  type: z.literal('pre_search_start'),
  timestamp: z.number(),
  userQuery: z.string(),
  totalQueries: z.number().int().min(1).max(5),
}).openapi('PreSearchStartData');

export type PreSearchStartData = z.infer<typeof PreSearchStartDataSchema>;

/**
 * Pre-search query generation event
 * Sent when AI generates a search query (streaming object phase)
 */
export const PreSearchQueryGeneratedDataSchema = z.object({
  type: z.literal('pre_search_query_generated'),
  timestamp: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: z.enum(['basic', 'advanced']),
  index: RoundNumberSchema,
  total: z.number().int().min(1),
}).openapi('PreSearchQueryGeneratedData');

export type PreSearchQueryGeneratedData = z.infer<typeof PreSearchQueryGeneratedDataSchema>;

/**
 * Pre-search query execution event
 * Sent when individual search query is being executed
 */
export const PreSearchQueryDataSchema = z.object({
  type: z.literal('pre_search_query'),
  timestamp: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: z.enum(['basic', 'advanced']),
  index: RoundNumberSchema,
  total: z.number().int().min(1),
}).openapi('PreSearchQueryData');

export type PreSearchQueryData = z.infer<typeof PreSearchQueryDataSchema>;

/**
 * Pre-search result event
 * Sent when individual search completes
 */
export const PreSearchResultDataSchema = z.object({
  type: z.literal('pre_search_result'),
  timestamp: z.number(),
  query: z.string(),
  answer: z.string().nullable(),
  resultCount: RoundNumberSchema,
  responseTime: z.number(),
  index: RoundNumberSchema,
}).openapi('PreSearchResultData');

export type PreSearchResultData = z.infer<typeof PreSearchResultDataSchema>;

/**
 * Pre-search complete event
 * Sent when all initial searches complete
 */
export const PreSearchCompleteDataSchema = z.object({
  type: z.literal('pre_search_complete'),
  timestamp: z.number(),
  totalSearches: RoundNumberSchema,
  successfulSearches: RoundNumberSchema,
  failedSearches: RoundNumberSchema,
  totalResults: RoundNumberSchema,
}).openapi('PreSearchCompleteData');

export type PreSearchCompleteData = z.infer<typeof PreSearchCompleteDataSchema>;

/**
 * Pre-search error event
 * Sent when pre-search phase fails
 */
export const PreSearchErrorDataSchema = z.object({
  type: z.literal('pre_search_error'),
  timestamp: z.number(),
  error: z.string(),
}).openapi('PreSearchErrorData');

export type PreSearchErrorData = z.infer<typeof PreSearchErrorDataSchema>;

/**
 * Discriminated union of all pre-search data events
 * Used for type-safe streaming data handling
 */
export const PreSearchStreamDataSchema = z.discriminatedUnion('type', [
  PreSearchStartDataSchema,
  PreSearchQueryGeneratedDataSchema,
  PreSearchQueryDataSchema,
  PreSearchResultDataSchema,
  PreSearchCompleteDataSchema,
  PreSearchErrorDataSchema,
]);

export type PreSearchStreamData = z.infer<typeof PreSearchStreamDataSchema>;

// ============================================================================
// PRE-SEARCH STATE SCHEMAS (Store Types)
// ============================================================================
// Following Single Source of Truth pattern - schemas defined here, types inferred

/**
 * Pre-search status and query status schemas
 * ✅ FULLY MIGRATED: Import PreSearchStatusSchema and PreSearchQueryStatusSchema from @/api/core/enums
 */
// Note: PreSearchStatus schemas moved to @/api/core/enums for consistency with other status enums

/**
 * Pre-search query state schema
 * Represents a single search query in the store
 */
export const PreSearchQuerySchema = z.object({
  query: z.string(),
  rationale: z.string(),
  searchDepth: z.enum(['basic', 'advanced']),
  index: RoundNumberSchema,
  total: z.number().int().min(1),
  status: PreSearchQueryStatusSchema,
  result: WebSearchResultSchema.optional(),
  timestamp: z.number(),
}).openapi('PreSearchQuery');

export type PreSearchQuery = z.infer<typeof PreSearchQuerySchema>;

// ============================================================================
// DATABASE QUERY RESULT SCHEMAS
// ============================================================================

/**
 * Schema for chat messages with their associated participants
 * Used in analysis and streaming handlers to validate query results
 *
 * Pattern: Combines chatMessageSelectSchema with nested participant relation
 * This replaces complex type extraction like:
 * type MessageWithParticipant = Awaited<ReturnType<typeof db.query.chatMessage.findMany>>[number] & {...}
 */
export const MessageWithParticipantSchema = chatMessageSelectSchema
  .extend({
    participant: ChatParticipantSchema.nullable(),
  })
  .openapi('MessageWithParticipant');

export type MessageWithParticipant = z.infer<typeof MessageWithParticipantSchema>;

// ============================================================================
// COMPONENT PROP SCHEMAS (UI Layer)
// ============================================================================

/**
 * Web search display component props schema
 * Single source of truth for component prop validation
 */
export const WebSearchDisplayPropsSchema = z.object({
  results: z.array(WebSearchResultItemSchema),
  answer: z.string().nullable().optional().describe('AI-generated answer summary'),
  className: z.string().optional(),
  meta: WebSearchResultMetaSchema.optional(),
  complexity: WebSearchComplexitySchema.optional(),
}).openapi('WebSearchDisplayProps');

export type WebSearchDisplayProps = z.infer<typeof WebSearchDisplayPropsSchema>;

/**
 * Web search result item component props schema (simple variant)
 * Used for rendering individual search results with avatar
 */
export const WebSearchResultItemPropsSchema = z.object({
  result: WebSearchResultItemSchema,
  showDivider: z.boolean().optional().default(true),
  className: z.string().optional(),
}).openapi('WebSearchResultItemProps');

export type WebSearchResultItemProps = z.infer<typeof WebSearchResultItemPropsSchema>;
