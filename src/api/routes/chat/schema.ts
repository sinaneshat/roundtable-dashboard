import { z } from '@hono/zod-openapi';

import {
  ChangelogChangeTypeSchema,
  ChangelogTypeSchema,
  ChatModeSchema,
  DEFAULT_CHAT_MODE,
  MessageStatusSchema,
  ParticipantStreamStatusSchema,
  PreSearchQueryStatusSchema,
  RoundPhaseSchema,
  SearchResultStatusSchema,
  UIMessageRoleSchema,
  WebSearchAnswerModeSchema,
  WebSearchComplexitySchema,
  WebSearchContentTypeSchema,
  WebSearchDepthSchema,
  WebSearchRawContentFormatSchema,
  WebSearchTimeRangeSchema,
  WebSearchTopicSchema,
} from '@/api/core/enums';
import { CursorPaginationQuerySchema } from '@/api/core/pagination';
import {
  CoreSchemas,
  createApiResponseSchema,
  createCursorPaginatedResponseSchema,
} from '@/api/core/schemas';
import { STRING_LIMITS } from '@/constants/validation';
import {
  DbChangelogDataSchema,
  DbCustomRoleMetadataSchema,
  DbMessageMetadataSchema,
  DbParticipantSettingsSchema,
  DbThreadMetadataSchema,
} from '@/db/schemas/chat-metadata';
import { userSelectSchema } from '@/db/validation/auth';
import {
  chatCustomRoleSelectSchema,
  chatMessageSelectSchema,
  chatModeratorAnalysisSelectSchema,
  chatParticipantSelectSchema,
  chatPreSearchSelectSchema,
  chatRoundFeedbackSelectSchema,
  chatRoundFeedbackUpdateSchema,
  chatThreadChangelogSelectSchema,
  chatThreadInsertSchema,
  chatThreadSelectSchema,
  chatThreadUpdateSchema,
} from '@/db/validation/chat';
import { RoundNumberSchema } from '@/lib/schemas/round-schemas';

/**
 * Message content validation schema with sanitization
 * - Trims whitespace from both ends
 * - Normalizes unicode characters (prevents homograph attacks)
 * - Enforces min/max length from shared constants
 *
 * @see STRING_LIMITS.MESSAGE_MAX - Single source of truth for max length
 */
export const MessageContentSchema = z.string()
  .trim()
  .normalize()
  .min(STRING_LIMITS.MESSAGE_MIN, 'Message is required')
  .max(STRING_LIMITS.MESSAGE_MAX, `Message is too long (max ${STRING_LIMITS.MESSAGE_MAX} characters)`);

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

/**
 * Changelog schema with flexible date handling
 * Accepts both string and Date for createdAt (API returns strings, store may have Dates)
 * ✅ FOLLOWS: StoredPreSearchSchema and StoredRoundSummarySchema pattern
 */
export const ChatThreadChangelogFlexibleSchema = chatThreadChangelogSelectSchema
  .extend({
    changeData: DbChangelogDataSchema,
    createdAt: z.union([z.string(), z.date()]),
  })
  .openapi('ChatThreadChangelogFlexible');

export type ChatThreadChangelogFlexible = z.infer<typeof ChatThreadChangelogFlexibleSchema>;

/**
 * Configuration changes group schema for UI components
 * Single source of truth for changelog grouping props
 * ✅ FIX: Accepts Date or ISO string for timestamp (JSON serialization uses strings)
 */
export const ConfigurationChangesGroupSchema = z.object({
  timestamp: z.union([z.date(), z.string()]),
  changes: z.array(ChatThreadChangelogFlexibleSchema),
}).openapi('ConfigurationChangesGroup');

export type ConfigurationChangesGroup = z.infer<typeof ConfigurationChangesGroupSchema>;

/**
 * Props schema for ConfigurationChangesGroup component
 */
export const ConfigurationChangesGroupPropsSchema = z.object({
  group: ConfigurationChangesGroupSchema,
  className: z.string().optional(),
}).openapi('ConfigurationChangesGroupProps');

export type ConfigurationChangesGroupProps = z.infer<typeof ConfigurationChangesGroupPropsSchema>;

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
    attachmentIds: z.array(z.string()).optional().openapi({
      description: 'Upload IDs to attach to the first message',
      example: ['01HXYZ123ABC', '01HXYZ456DEF'],
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
  summaries: z.array(chatModeratorAnalysisSelectSchema).optional().openapi({
    description: 'Round summaries for each round (optional - excluded for public threads)',
  }),
  feedback: z.array(chatRoundFeedbackSelectSchema).optional().openapi({
    description: 'User feedback for each round (optional - excluded for public threads)',
  }),
  preSearches: z.array(chatPreSearchSelectSchema).optional().openapi({
    description: 'Pre-search results for each round (optional - included for public threads with web search)',
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
/**
 * AddParticipantRequest schema
 * ✅ TYPE-SAFE: Uses z.object() directly for proper type inference
 * (drizzle-zod .pick() loses type information with OpenAPI extensions)
 */
export const AddParticipantRequestSchema = z.object({
  modelId: CoreSchemas.id().openapi({
    description: 'Model ID (e.g., anthropic/claude-3.5-sonnet)',
    example: 'anthropic/claude-3.5-sonnet',
  }),
  role: z.string().min(1).max(100).nullish().openapi({
    description: 'Optional assigned role',
    example: 'The Ideator',
  }),
  priority: z.number().int().min(0).optional().openapi({
    description: 'Display priority (0-indexed)',
  }),
  settings: DbParticipantSettingsSchema.nullable().optional().openapi({
    description: 'Optional participant settings',
  }),
}).openapi('AddParticipantRequest');

/**
 * UpdateParticipantRequest schema
 * ✅ TYPE-SAFE: Uses z.object() directly for proper type inference
 */
export const UpdateParticipantRequestSchema = z.object({
  role: z.string().min(1).max(100).nullish().openapi({
    description: 'Optional role name',
  }),
  priority: z.number().int().min(0).optional().openapi({
    description: 'Display priority',
  }),
  isEnabled: z.boolean().optional().openapi({
    description: 'Whether participant is enabled',
  }),
  settings: DbParticipantSettingsSchema.nullable().optional().openapi({
    description: 'Optional participant settings',
  }),
}).openapi('UpdateParticipantRequest');
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
  role: UIMessageRoleSchema.openapi({
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
    // ✅ CRITICAL FIX: Support file parts for multi-modal messages
    // AI SDK v5 sends file attachments as parts with type='file'
    z.object({
      type: z.literal('file'),
      url: z.string(),
      filename: z.string().optional(),
      mediaType: z.string().optional(),
    }),
  ])).openapi({
    description: 'Message parts array (text, reasoning, file, etc.)',
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

export const WebSearchParametersSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().min(1).max(3).optional().default(3),
  searchDepth: WebSearchDepthSchema.optional().default('advanced'),
  topic: WebSearchTopicSchema.optional(),
  timeRange: WebSearchTimeRangeSchema.optional(),
  days: z.number().int().positive().max(365).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  chunksPerSource: z.number().int().min(1).max(3).optional().default(2),
  includeImages: z.boolean().optional().default(true),
  includeImageDescriptions: z.boolean().optional().default(true),
  includeRawContent: z.union([z.boolean(), WebSearchRawContentFormatSchema]).optional().default('markdown'),
  maxTokens: z.number().int().positive().optional(),
  includeAnswer: z.union([z.boolean(), WebSearchAnswerModeSchema]).optional().default('advanced'),
  includeDomains: z.array(z.string()).optional(),
  excludeDomains: z.array(z.string()).optional(),
  country: z.string().length(2).optional(),
  includeFavicon: z.boolean().optional().default(true),
  autoParameters: z.boolean().optional().default(false),
}).openapi('WebSearchParameters');

export type WebSearchParameters = z.infer<typeof WebSearchParametersSchema>;

export const WebSearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string().min(1),
  content: z.string(),
  excerpt: z.string().optional(),
  fullContent: z.string().optional(),
  rawContent: z.string().optional(),
  score: z.number().min(0).max(1),
  publishedDate: z.string().nullable().optional(),
  domain: z.string().optional(),
  metadata: z.object({
    author: z.string().optional(),
    readingTime: z.number().optional(),
    wordCount: z.number().optional(),
    description: z.string().optional(),
    imageUrl: z.string().optional(),
    faviconUrl: z.string().optional(),
  }).optional(),
  contentType: WebSearchContentTypeSchema.optional(),
  keyPoints: z.array(z.string()).optional(),
  images: z.array(z.object({
    url: z.string(),
    description: z.string().optional(),
    alt: z.string().optional(),
  })).optional(),
}).openapi('WebSearchResultItem');

export type WebSearchResultItem = z.infer<typeof WebSearchResultItemSchema>;

export const WebSearchResultMetaSchema = z.object({
  cached: z.boolean().optional(),
  cacheAge: z.number().optional(),
  cacheHitRate: z.number().min(0).max(1).optional(),
  limitReached: z.boolean().optional(),
  searchesUsed: z.number().int().min(0).optional(),
  maxSearches: z.number().int().positive().optional(),
  remainingSearches: z.number().int().min(0).optional(),
  error: z.boolean().optional(),
  message: z.string().optional(),
  complexity: WebSearchComplexitySchema.optional(),
}).openapi('WebSearchResultMeta');

export type WebSearchResultMeta = z.infer<typeof WebSearchResultMetaSchema>;

/**
 * Auto-detected search parameters schema
 * Used when LLM automatically determines optimal search parameters
 */
export const WebSearchAutoParametersSchema = z.object({
  topic: WebSearchTopicSchema.optional(),
  timeRange: WebSearchTimeRangeSchema.optional(),
  searchDepth: WebSearchDepthSchema.optional(),
  reasoning: z.string().optional(),
}).openapi('WebSearchAutoParameters');

export type WebSearchAutoParameters = z.infer<typeof WebSearchAutoParametersSchema>;

export const WebSearchResultSchema = z.object({
  query: z.string(),
  answer: z.string().nullable(),
  results: z.array(WebSearchResultItemSchema),
  responseTime: z.number(),
  requestId: z.string().optional(),
  images: z.array(z.object({
    url: z.string(),
    description: z.string().optional(),
  })).optional(),
  autoParameters: WebSearchAutoParametersSchema.optional(),
  _meta: WebSearchResultMetaSchema.optional(),
}).openapi('WebSearchResult');

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;

export const GeneratedSearchQuerySchema = z.object({
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  complexity: z.string().optional().transform(val => val?.toLowerCase() as 'basic' | 'moderate' | 'deep' | undefined).pipe(WebSearchComplexitySchema.optional()),
  sourceCount: z.union([z.number(), z.string()]).optional(),
  requiresFullContent: z.boolean().optional(),
  chunksPerSource: z.union([z.number(), z.string()]).optional(),
  topic: WebSearchTopicSchema.optional(),
  timeRange: WebSearchTimeRangeSchema.optional(),
  needsAnswer: z.union([z.boolean(), WebSearchAnswerModeSchema]).optional(),
  includeImages: z.boolean().optional(),
  includeImageDescriptions: z.boolean().optional(),
  analysis: z.string().optional(),
}).openapi('GeneratedSearchQuery');

export type GeneratedSearchQuery = z.infer<typeof GeneratedSearchQuerySchema>;

export const MultiQueryGenerationSchema = z.object({
  totalQueries: z.union([z.number(), z.string()]),
  analysisRationale: z.string(),
  queries: z.array(GeneratedSearchQuerySchema),
}).openapi('MultiQueryGeneration');

export type MultiQueryGeneration = z.infer<typeof MultiQueryGenerationSchema>;

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
  summary: z.string(),
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
 * Pre-search request schema (unified with summary pattern)
 * ✅ FOLLOWS: Moderator summary request pattern
 * Executes web search BEFORE participant streaming
 */
export const PreSearchRequestSchema = z.object({
  userQuery: z.string().min(1).max(5000).openapi({
    description: 'User query for web search',
    example: 'What is the current Bitcoin price?',
  }),
  attachmentIds: z.array(z.string()).optional().openapi({
    description: 'Optional attachment IDs whose content should be considered in query generation',
    example: ['upload_123', 'upload_456'],
  }),
  fileContext: z.string().max(10000).optional().openapi({
    description: 'Optional extracted text content from uploaded files to consider in search query generation',
    example: 'Contents of the uploaded PDF document...',
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
    searchDepth: WebSearchDepthSchema,
    index: z.number(),
    total: z.number(),
  })),
  results: z.array(z.object({
    query: z.string(),
    answer: z.string().nullable(),
    results: z.array(WebSearchResultItemSchema),
    responseTime: z.number(),
    index: z.number().optional(), // ✅ Index for matching during progressive streaming
  })),
  summary: z.string(),
  successCount: z.number(),
  failureCount: z.number(),
  totalResults: z.number(),
  totalTime: z.number(),
}).openapi('PreSearchDataPayload');

export type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

/**
 * Partial pre-search result item schema for streaming UI updates
 * ✅ ZOD-FIRST: Minimal result structure for progressive display
 */
export const PartialPreSearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
}).openapi('PartialPreSearchResultItem');

/**
 * Partial pre-search data schema for progressive UI updates
 * ✅ ZOD-FIRST: Built incrementally as QUERY and RESULT events arrive
 * ✅ PATTERN: Uses WebSearchDepthSchema for type safety
 */
export const PartialPreSearchDataSchema = z.object({
  queries: z.array(z.object({
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    index: z.number(),
    total: z.number(),
  })),
  results: z.array(z.object({
    query: z.string(),
    answer: z.string().nullable(),
    results: z.array(PartialPreSearchResultItemSchema),
    responseTime: z.number(),
    index: z.number(),
  })),
  summary: z.string().optional(),
  totalResults: z.number().optional(),
  totalTime: z.number().optional(),
}).openapi('PartialPreSearchData');

export type PartialPreSearchData = z.infer<typeof PartialPreSearchDataSchema>;

/**
 * Stored pre-search schema (from database)
 * ✅ FOLLOWS: StoredRoundSummarySchema pattern
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
 * ✅ CONSISTENT: Uses createApiResponseSchema like summary
 */
export const PreSearchResponseSchema = createApiResponseSchema(StoredPreSearchSchema).openapi('PreSearchResponse');

export type PreSearchResponse = z.infer<typeof PreSearchResponseSchema>;

/**
 * Pre-search list payload and response schemas
 * ✅ FOLLOWS: RoundSummaryListPayloadSchema pattern
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
    description: 'Round number to regenerate (replace). ✅ 0-BASED: first round is 0. If provided, deletes old messages and summary for that round first.',
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
  attachmentIds: z.array(z.string()).optional().openapi({
    description: 'Upload IDs to attach to this message',
    example: ['01HXYZ123ABC', '01HXYZ456DEF'],
  }),
}).openapi('StreamChatRequest');
const MessagesListPayloadSchema = z.object({
  messages: z.array(ChatMessageSchema),
  count: z.number().int().nonnegative(),
}).openapi('MessagesListPayload');
export const MessagesListResponseSchema = createApiResponseSchema(MessagesListPayloadSchema).openapi('MessagesListResponse');
export type MessagesListResponse = z.infer<typeof MessagesListResponseSchema>;
/**
 * CreateCustomRoleRequest schema
 * ✅ TYPE-SAFE: Uses z.object() directly for proper type inference
 * (drizzle-zod .pick() loses type information with OpenAPI extensions)
 */
export const CreateCustomRoleRequestSchema = z.object({
  name: z.string().min(1).max(100).openapi({
    description: 'Custom role name',
    example: 'The Innovator',
  }),
  description: z.string().max(500).nullable().optional().openapi({
    description: 'Optional description',
  }),
  systemPrompt: z.string().min(1).max(8000).openapi({
    description: 'System prompt for the role',
  }),
  metadata: DbCustomRoleMetadataSchema.nullable().optional().openapi({
    description: 'Optional metadata',
  }),
}).openapi('CreateCustomRoleRequest');

/**
 * UpdateCustomRoleRequest schema
 * ✅ TYPE-SAFE: Uses z.object() directly for proper type inference
 */
export const UpdateCustomRoleRequestSchema = z.object({
  name: z.string().min(1).max(100).optional().openapi({
    description: 'Custom role name',
  }),
  description: z.string().max(500).nullable().optional().openapi({
    description: 'Optional description',
  }),
  systemPrompt: z.string().min(1).max(8000).optional().openapi({
    description: 'System prompt for the role',
  }),
  metadata: DbCustomRoleMetadataSchema.nullable().optional().openapi({
    description: 'Optional metadata',
  }),
}).openapi('UpdateCustomRoleRequest');
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
export const RoundSummaryRequestSchema = z.object({
  participantMessageIds: z.array(CoreSchemas.id()).optional().openapi({
    description: 'Array of message IDs from participants (optional - backend auto-queries from database if not provided)',
    example: ['msg_abc123', 'msg_def456', 'msg_ghi789'],
  }),
}).openapi('RoundSummaryRequest');

// ============================================================================
// ROUND SUMMARY SCHEMAS (Simplified)
// ============================================================================

/**
 * Round Summary Metrics - 4 simple metrics for rating the conversation
 * All metrics are 0-100 scale
 */
export const RoundSummaryMetricsSchema = z.object({
  engagement: z.coerce.number().min(0).max(100).describe('How engaged the participants were (0-100)'),
  insight: z.coerce.number().min(0).max(100).describe('Quality of insights provided (0-100)'),
  balance: z.coerce.number().min(0).max(100).describe('How balanced the perspectives were (0-100)'),
  clarity: z.coerce.number().min(0).max(100).describe('How clear the communication was (0-100)'),
}).openapi('RoundSummaryMetrics');

/**
 * Round Summary AI Content - What the AI model generates
 * ✅ STREAMING: Use this schema for streamObject - contains ONLY AI-generated fields
 * Server adds roundNumber, mode, userQuestion metadata after generation
 * ✅ COMPREHENSIVE: Supports 8-section LLM Council summary format (~4096 tokens = ~20000 chars)
 */
export const RoundSummaryAIContentSchema = z.object({
  summary: z.string().describe('Comprehensive structured summary including: Question Overview, Participants, Individual Perspectives, Areas of Agreement, Areas of Disagreement, Points of Convergence, Consensus/Conclusion, and Open Questions'),
  metrics: RoundSummaryMetricsSchema.describe('Ratings for engagement, insight, balance, and clarity (0-100 each)'),
}).openapi('RoundSummaryAIContent');

/**
 * Round Summary Payload - Full payload with metadata
 * Used for stored/completed summaries, NOT for streaming
 * ✅ COMPREHENSIVE: Supports 8-section LLM Council summary format
 */
export const RoundSummaryPayloadSchema = z.object({
  roundNumber: RoundNumberSchema,
  mode: z.string(),
  userQuestion: z.string(),
  summary: z.string().describe('Comprehensive structured summary including: Question Overview, Participants, Individual Perspectives, Areas of Agreement, Areas of Disagreement, Points of Convergence, Consensus/Conclusion, and Open Questions'),
  metrics: RoundSummaryMetricsSchema,
}).openapi('RoundSummaryPayload');

export const RoundSummaryResponseSchema = createApiResponseSchema(RoundSummaryPayloadSchema).openapi('RoundSummaryResponse');

// ============================================================================
// ROUND SUMMARY STREAMING SCHEMAS (Array Element Pattern)
// ============================================================================
// Uses AI SDK streamObject array mode with elementStream for field-by-field streaming
// Each element is a complete update, not partial text characters
// Reference: https://sdk.vercel.ai/docs/reference/ai-sdk-core/stream-object

/**
 * Summary stream element - discriminated union for array streaming
 * Each element represents a complete field update, streamed one at a time
 *
 * ✅ AI SDK PATTERN: Use `output: 'array'` + `elementStream` for complete elements
 * Unlike `output: 'object'` which streams partial JSON text character-by-character,
 * array mode streams complete elements as they're generated.
 *
 * The model generates an array of these field updates in order:
 * 1. { type: 'summary', value: 'Full summary text here' }
 * 2. { type: 'engagement', value: 85 }
 * 3. { type: 'insight', value: 90 }
 * 4. { type: 'balance', value: 75 }
 * 5. { type: 'clarity', value: 80 }
 */
export const SummaryFieldUpdateSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('summary'),
    value: z.string().describe('Concise text summary of the round conversation (2-3 sentences)'),
  }),
  z.object({
    type: z.literal('engagement'),
    value: z.number().min(0).max(100).describe('How actively participants contributed (0-100)'),
  }),
  z.object({
    type: z.literal('insight'),
    value: z.number().min(0).max(100).describe('Quality and depth of ideas shared (0-100)'),
  }),
  z.object({
    type: z.literal('balance'),
    value: z.number().min(0).max(100).describe('How well perspectives were distributed (0-100)'),
  }),
  z.object({
    type: z.literal('clarity'),
    value: z.number().min(0).max(100).describe('How clear and understandable the discussion was (0-100)'),
  }),
]).openapi('SummaryFieldUpdate');

export type SummaryFieldUpdate = z.infer<typeof SummaryFieldUpdateSchema>;

export const SummaryAcceptedPayloadSchema = z.object({
  summaryId: z.string(),
  status: z.literal('processing'),
  message: z.string().optional(),
}).openapi('SummaryAcceptedPayload');

export const SummaryAcceptedResponseSchema = SummaryAcceptedPayloadSchema.openapi('SummaryAcceptedResponse');

// ✅ TYPE-SAFE: Stored round summary with properly typed summary data
// ✅ FIX: Accept both string and Date for timestamps (API returns strings, transform converts to Date)
export const StoredRoundSummarySchema = chatModeratorAnalysisSelectSchema
  .extend({
    summaryData: RoundSummaryPayloadSchema.omit({ roundNumber: true, mode: true, userQuestion: true }).nullable().optional(),
    // Override date fields to accept both string and Date (transform handles conversion)
    createdAt: z.union([z.string(), z.date()]),
    completedAt: z.union([z.string(), z.date()]).nullable(),
  })
  .openapi('StoredRoundSummary');

// ✅ EXPORTED: For store cache validation in actions/types.ts
export const RoundSummaryListPayloadSchema = z.object({
  items: z.array(StoredRoundSummarySchema),
  count: z.number().int().nonnegative(),
}).openapi('RoundSummaryListPayload');

export const RoundSummaryListResponseSchema = createApiResponseSchema(RoundSummaryListPayloadSchema).openapi('RoundSummaryListResponse');

export type RoundSummaryListResponse = z.infer<typeof RoundSummaryListResponseSchema>;
export type RoundSummaryListPayload = z.infer<typeof RoundSummaryListPayloadSchema>;

// ============================================================================
// CACHE VALIDATION SCHEMAS (Frontend React Query)
// ============================================================================
// Flexible schemas for validating React Query cache data
// Uses z.boolean() for success (cache may have failed responses)
// Uses .optional() on fields (cache may have partial data)

/**
 * Generic API cache response wrapper
 * Unlike createApiResponseSchema which uses z.literal(true),
 * this accepts z.boolean() since cache may contain failed responses
 *
 * ✅ SINGLE SOURCE OF TRUTH: Used in stores/chat/actions/types.ts
 */
export function createCacheResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema,
  });
}

/**
 * Flexible ChatThread schema for cache validation
 * Accepts both string and Date for timestamps (API returns strings, optimistic updates may have Dates)
 * Most fields optional since cache may have partial data
 */
export const ChatThreadCacheSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  slug: z.string().optional(),
  previousSlug: z.string().nullable().optional(),
  mode: z.string().optional(),
  status: z.string().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  isAiGeneratedTitle: z.boolean().optional(),
  enableWebSearch: z.boolean().optional(),
  metadata: z.unknown().optional(),
  // Date fields accept both string (from JSON API) and Date (from optimistic updates)
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  lastMessageAt: z.union([z.string(), z.date()]).nullable().optional(),
}).openapi('ChatThreadCache');

export type ChatThreadCache = z.infer<typeof ChatThreadCacheSchema>;

/**
 * Summaries cache response schema
 * Wraps RoundSummaryListPayloadSchema with cache response wrapper
 */
export const SummariesCacheResponseSchema = createCacheResponseSchema(
  z.object({
    items: z.array(StoredRoundSummarySchema),
  }),
);

export type SummariesCacheResponse = z.infer<typeof SummariesCacheResponseSchema>;

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
// ============================================================================
// SIMPLIFIED CHANGELOG DATA SCHEMAS
// ============================================================================
// Consolidated from 5 separate schemas to 3 discriminated union types
// Each changeData includes a 'type' field for discrimination

const BaseChangeDataSchema = z.object({
  type: ChangelogChangeTypeSchema,
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
export type RoundSummaryRequest = z.infer<typeof RoundSummaryRequestSchema>;
export type RoundSummaryAIContent = z.infer<typeof RoundSummaryAIContentSchema>;
export type RoundSummaryPayload = z.infer<typeof RoundSummaryPayloadSchema>;
export type RoundSummaryMetrics = z.infer<typeof RoundSummaryMetricsSchema>;
export type StoredRoundSummary = z.infer<typeof StoredRoundSummarySchema>;
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
// STREAM PARAM SCHEMAS
// ============================================================================

/**
 * Thread ID param schema for stream endpoints
 */
export const ThreadIdParamSchema = z.object({
  threadId: z.string().openapi({
    param: { name: 'threadId', in: 'path' },
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
}).openapi('ThreadIdParam');

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
  status: ParticipantStreamStatusSchema,
  messageId: z.string().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  errorMessage: z.string().nullable(),
}).openapi('StreamState');

export type StreamState = z.infer<typeof StreamStateSchema>;

export const StreamStatusResponseSchema = createApiResponseSchema(StreamStateSchema).openapi('StreamStatusResponse');

export type StreamStatusResponse = z.infer<typeof StreamStatusResponseSchema>;

// ============================================================================
// UNIFIED RESUMPTION PHASE SCHEMAS
// ============================================================================

/**
 * Pre-search phase status schema for unified resumption
 * Tracks web search execution status within a round
 */
export const PreSearchPhaseStatusSchema = z.object({
  enabled: z.boolean().openapi({
    description: 'Whether web search is enabled for this thread',
    example: true,
  }),
  status: MessageStatusSchema.nullable().openapi({
    description: 'Pre-search status (pending/streaming/complete/failed)',
    example: 'complete',
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active pre-search stream ID for resumption',
    example: 'presearch_thread_abc123_0_1234567890',
  }),
  preSearchId: z.string().nullable().openapi({
    description: 'Database pre-search record ID',
    example: 'ps_abc123',
  }),
}).openapi('PreSearchPhaseStatus');

export type PreSearchPhaseStatus = z.infer<typeof PreSearchPhaseStatusSchema>;

/**
 * Participant phase status schema for unified resumption
 * Tracks all participant stream statuses within a round
 */
export const ParticipantPhaseStatusSchema = z.object({
  hasActiveStream: z.boolean().openapi({
    description: 'Whether there is an active participant stream in KV',
    example: true,
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active participant stream ID (format: {threadId}_r{roundNumber}_p{participantIndex})',
    example: 'thread_abc123_r0_p1',
  }),
  totalParticipants: RoundNumberSchema.nullable().openapi({
    description: 'Total number of participants in the round',
    example: 3,
  }),
  currentParticipantIndex: RoundNumberSchema.nullable().openapi({
    description: 'Index of currently streaming participant',
    example: 1,
  }),
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema).nullable().openapi({
    description: 'Status of each participant (keyed by index)',
    example: { 0: 'completed', 1: 'active', 2: 'active' },
  }),
  nextParticipantToTrigger: RoundNumberSchema.nullable().openapi({
    description: 'Index of next participant that needs to be triggered',
    example: 2,
  }),
  allComplete: z.boolean().openapi({
    description: 'Whether all participants have finished (completed or failed)',
    example: false,
  }),
}).openapi('ParticipantPhaseStatus');

export type ParticipantPhaseStatus = z.infer<typeof ParticipantPhaseStatusSchema>;

/**
 * Summarizer phase status schema for unified resumption
 * Tracks round summary generation status
 */
export const SummarizerPhaseStatusSchema = z.object({
  status: MessageStatusSchema.nullable().openapi({
    description: 'Summarizer status (pending/streaming/complete/failed)',
    example: 'streaming',
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active summary stream ID for resumption',
    example: 'summary:thread_abc123:r0',
  }),
  summaryId: z.string().nullable().openapi({
    description: 'Database summary record ID',
    example: 'summary_abc123',
  }),
}).openapi('SummarizerPhaseStatus');

export type SummarizerPhaseStatus = z.infer<typeof SummarizerPhaseStatusSchema>;

/**
 * Thread stream resumption state schema - UNIFIED VERSION
 *
 * Returns comprehensive metadata about ALL active streams for server-side prefetching.
 * Enables unified resumption across pre-search, participants, and summarizer phases.
 *
 * ✅ AI SDK v5 PATTERN: Supports resume across all streaming phases
 * ✅ RESUMABLE STREAMS: Enables Zustand pre-fill before React renders
 *
 * Phase detection logic:
 * 1. If preSearch.status is 'pending' or 'streaming' → currentPhase = 'pre_search'
 * 2. If participants.allComplete is false → currentPhase = 'participants'
 * 3. If summarizer.status is 'pending' or 'streaming' → currentPhase = 'summarizer'
 * 4. Otherwise → currentPhase = 'complete' (or 'idle' if no round started)
 */
export const ThreadStreamResumptionStateSchema = z.object({
  // Round identification
  roundNumber: RoundNumberSchema.nullable().openapi({
    description: 'Current round number being processed (0-based)',
    example: 0,
  }),

  // Current phase for resumption logic
  currentPhase: RoundPhaseSchema.openapi({
    description: 'Current phase of the round: idle, pre_search, participants, summarizer, or complete',
    example: 'participants',
  }),

  // Pre-search phase status (null if web search not enabled)
  preSearch: PreSearchPhaseStatusSchema.nullable().openapi({
    description: 'Pre-search phase status (null if web search disabled)',
  }),

  // Participant streaming phase status
  participants: ParticipantPhaseStatusSchema.openapi({
    description: 'Participant streaming phase status',
  }),

  // Summarizer/round summary phase status
  summarizer: SummarizerPhaseStatusSchema.nullable().openapi({
    description: 'Summarizer/round summary phase status',
  }),

  // Overall round completion status
  roundComplete: z.boolean().openapi({
    description: 'Whether the entire round is complete (all phases finished)',
    example: false,
  }),

  // Legacy compatibility fields
  hasActiveStream: z.boolean().openapi({
    description: 'LEGACY: Use currentPhase !== "complete" instead. Whether any stream is active',
    example: true,
  }),
  streamId: z.string().nullable().openapi({
    description: 'LEGACY: Use phase-specific streamId. Active participant stream ID',
    example: 'thread_abc123_r0_p1',
  }),
  totalParticipants: RoundNumberSchema.nullable().openapi({
    description: 'LEGACY: Use participants.totalParticipants',
    example: 3,
  }),
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema).nullable().openapi({
    description: 'LEGACY: Use participants.participantStatuses',
    example: { 0: 'completed', 1: 'active', 2: 'active' },
  }),
  nextParticipantToTrigger: RoundNumberSchema.nullable().openapi({
    description: 'LEGACY: Use participants.nextParticipantToTrigger',
    example: 2,
  }),
}).openapi('ThreadStreamResumptionState');

export type ThreadStreamResumptionState = z.infer<typeof ThreadStreamResumptionStateSchema>;

export const ThreadStreamResumptionStateResponseSchema = createApiResponseSchema(
  ThreadStreamResumptionStateSchema,
).openapi('ThreadStreamResumptionStateResponse');

export type ThreadStreamResumptionStateResponse = z.infer<typeof ThreadStreamResumptionStateResponseSchema>;

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
  totalQueries: z.union([z.number(), z.string()]),
}).openapi('PreSearchStartData');

export type PreSearchStartData = z.infer<typeof PreSearchStartDataSchema>;

export const PreSearchQueryGeneratedDataSchema = z.object({
  type: z.literal('pre_search_query_generated'),
  timestamp: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  index: RoundNumberSchema,
  total: z.union([z.number(), z.string()]),
}).openapi('PreSearchQueryGeneratedData');

export type PreSearchQueryGeneratedData = z.infer<typeof PreSearchQueryGeneratedDataSchema>;

export const PreSearchQueryDataSchema = z.object({
  type: z.literal('pre_search_query'),
  timestamp: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  index: RoundNumberSchema,
  total: z.union([z.number(), z.string()]),
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
  searchDepth: WebSearchDepthSchema,
  index: RoundNumberSchema,
  total: z.number().int().min(1),
  status: PreSearchQueryStatusSchema,
  result: WebSearchResultSchema.optional(),
  timestamp: z.number(),
}).openapi('PreSearchQuery');

export type PreSearchQuery = z.infer<typeof PreSearchQuerySchema>;

// ============================================================================
// PRE-SEARCH SSE EVENT SCHEMAS
// ============================================================================
// Server-Sent Event type definitions for pre-search streaming
// Frontend: Import these types for EventSource handlers

/**
 * Base event data with timestamp
 */
const BaseSSEEventDataSchema = z.object({
  timestamp: z.number(),
});

/**
 * Start event - sent when pre-search begins
 */
export const PreSearchStartEventSchema = z.object({
  event: z.literal('start'),
  data: BaseSSEEventDataSchema.extend({
    userQuery: z.string(),
    totalQueries: z.number(),
  }),
}).openapi('PreSearchStartEvent');

export type PreSearchStartEvent = z.infer<typeof PreSearchStartEventSchema>;

/**
 * Query event - streams AI-generated search query incrementally
 */
export const PreSearchQueryEventSchema = z.object({
  event: z.literal('query'),
  data: BaseSSEEventDataSchema.extend({
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    index: z.number(),
    total: z.number(),
    fallback: z.boolean().optional(),
  }),
}).openapi('PreSearchQueryEvent');

export type PreSearchQueryEvent = z.infer<typeof PreSearchQueryEventSchema>;

/**
 * Result event - streams search results as fetched
 */
export const PreSearchResultEventSchema = z.object({
  event: z.literal('result'),
  data: BaseSSEEventDataSchema.extend({
    query: z.string(),
    answer: z.string().nullable(),
    results: z.array(z.object({
      title: z.string(),
      url: z.string(),
      content: z.string(),
      excerpt: z.string().optional(),
      fullContent: z.string().optional(),
      score: z.number(),
      publishedDate: z.string().nullable(),
      domain: z.string().optional(),
    })),
    resultCount: z.number(),
    responseTime: z.number(),
    index: z.number(),
    status: SearchResultStatusSchema.optional(),
    error: z.string().optional(),
  }),
}).openapi('PreSearchResultEvent');

export type PreSearchResultEvent = z.infer<typeof PreSearchResultEventSchema>;

/**
 * Answer chunk event - streams AI answer progressively (buffered 100ms)
 */
export const PreSearchAnswerChunkEventSchema = z.object({
  event: z.literal('answer_chunk'),
  data: z.object({
    chunk: z.string(),
  }),
}).openapi('PreSearchAnswerChunkEvent');

export type PreSearchAnswerChunkEvent = z.infer<typeof PreSearchAnswerChunkEventSchema>;

/**
 * Answer complete event - signals answer streaming finished
 */
export const PreSearchAnswerCompleteEventSchema = z.object({
  event: z.literal('answer_complete'),
  data: z.object({
    answer: z.string(),
    mode: WebSearchDepthSchema,
    generatedAt: z.string(),
  }),
}).openapi('PreSearchAnswerCompleteEvent');

export type PreSearchAnswerCompleteEvent = z.infer<typeof PreSearchAnswerCompleteEventSchema>;

/**
 * Answer error event - non-blocking answer generation failure
 */
export const PreSearchAnswerErrorEventSchema = z.object({
  event: z.literal('answer_error'),
  data: z.object({
    error: z.string(),
    message: z.string(),
  }),
}).openapi('PreSearchAnswerErrorEvent');

export type PreSearchAnswerErrorEvent = z.infer<typeof PreSearchAnswerErrorEventSchema>;

/**
 * Complete event - all searches executed (before answer streaming)
 */
export const PreSearchCompleteEventSchema = z.object({
  event: z.literal('complete'),
  data: BaseSSEEventDataSchema.extend({
    totalSearches: z.number(),
    successfulSearches: z.number(),
    failedSearches: z.number(),
    totalResults: z.number(),
  }),
}).openapi('PreSearchCompleteEvent');

export type PreSearchCompleteEvent = z.infer<typeof PreSearchCompleteEventSchema>;

/**
 * Done event - final event with complete searchData payload
 */
export const PreSearchDoneEventSchema = z.object({
  event: z.literal('done'),
  data: z.object({
    queries: z.array(z.object({
      query: z.string(),
      rationale: z.string(),
      searchDepth: WebSearchDepthSchema,
      index: z.number(),
      total: z.number(),
    })),
    results: z.array(z.object({
      query: z.string(),
      answer: z.string().nullable(),
      results: z.array(z.object({
        title: z.string(),
        url: z.string(),
        content: z.string(),
        excerpt: z.string().optional(),
        fullContent: z.string().optional(),
        score: z.number(),
        publishedDate: z.string().nullable(),
        domain: z.string().optional(),
      })),
      responseTime: z.number(),
    })),
    analysis: z.string(),
    successCount: z.number(),
    failureCount: z.number(),
    totalResults: z.number(),
    totalTime: z.number(),
  }),
}).openapi('PreSearchDoneEvent');

export type PreSearchDoneEvent = z.infer<typeof PreSearchDoneEventSchema>;

/**
 * Failed event - critical search failure
 */
export const PreSearchFailedEventSchema = z.object({
  event: z.literal('failed'),
  data: z.object({
    error: z.string(),
    errorCategory: z.string().optional(),
    isTransient: z.boolean().optional(),
  }),
}).openapi('PreSearchFailedEvent');

export type PreSearchFailedEvent = z.infer<typeof PreSearchFailedEventSchema>;

/**
 * Union of all pre-search SSE events
 */
export const PreSearchSSEEventSchema = z.discriminatedUnion('event', [
  PreSearchStartEventSchema,
  PreSearchQueryEventSchema,
  PreSearchResultEventSchema,
  PreSearchAnswerChunkEventSchema,
  PreSearchAnswerCompleteEventSchema,
  PreSearchAnswerErrorEventSchema,
  PreSearchCompleteEventSchema,
  PreSearchDoneEventSchema,
  PreSearchFailedEventSchema,
]).openapi('PreSearchSSEEvent');

export type PreSearchSSEEvent = z.infer<typeof PreSearchSSEEventSchema>;

/**
 * Type guard: check if event is answer chunk
 */
export function isAnswerChunkEvent(event: PreSearchSSEEvent): event is PreSearchAnswerChunkEvent {
  return event.event === 'answer_chunk';
}

/**
 * Type guard: check if event is answer complete
 */
export function isAnswerCompleteEvent(event: PreSearchSSEEvent): event is PreSearchAnswerCompleteEvent {
  return event.event === 'answer_complete';
}

/**
 * Type guard: check if event is answer error
 */
export function isAnswerErrorEvent(event: PreSearchSSEEvent): event is PreSearchAnswerErrorEvent {
  return event.event === 'answer_error';
}

/**
 * Parse SSE event data with type safety
 */
export function parsePreSearchEvent<T extends PreSearchSSEEvent>(
  messageEvent: MessageEvent,
  expectedType: T['event'],
): T['data'] | null {
  try {
    return JSON.parse(messageEvent.data) as T['data'];
  } catch {
    console.error(`Failed to parse ${expectedType} event data`);
    return null;
  }
}

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
  answer: z.string().nullable().optional(),
  className: z.string().optional(),
  meta: WebSearchResultMetaSchema.optional(),
  complexity: WebSearchComplexitySchema.optional(),
}).openapi('WebSearchDisplayProps');

export type WebSearchDisplayProps = z.infer<typeof WebSearchDisplayPropsSchema>;

/**
 * Extended web search display component props with streaming state
 * Extends WebSearchDisplayPropsSchema with streaming-specific fields
 */
export const WebSearchDisplayExtendedPropsSchema = WebSearchDisplayPropsSchema.extend({
  isStreaming: z.boolean().optional(),
  requestId: z.string().optional(),
  query: z.string().optional(),
  autoParameters: WebSearchAutoParametersSchema.optional(),
}).openapi('WebSearchDisplayExtendedProps');

export type WebSearchDisplayExtendedProps = z.infer<typeof WebSearchDisplayExtendedPropsSchema>;

/**
 * Individual image item in search results
 * Used for rendering image galleries
 */
export const WebSearchImageItemSchema = z.object({
  url: z.string(),
  title: z.string(),
  sourceUrl: z.string(),
  alt: z.string().optional(),
  domain: z.string().optional(),
}).openapi('WebSearchImageItem');

export type WebSearchImageItem = z.infer<typeof WebSearchImageItemSchema>;

/**
 * Web search image gallery component props schema
 */
export const WebSearchImageGalleryPropsSchema = z.object({
  results: z.array(WebSearchResultItemSchema),
  className: z.string().optional(),
}).openapi('WebSearchImageGalleryProps');

export type WebSearchImageGalleryProps = z.infer<typeof WebSearchImageGalleryPropsSchema>;

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
