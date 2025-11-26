import { z } from '@hono/zod-openapi';

import {
  AGREEMENT_STATUSES,
  ChangelogTypeSchema,
  ChatModeSchema,
  ConfidenceWeightingSchema,
  DEBATE_PHASES,
  DEFAULT_CHAT_MODE,
  EVIDENCE_STRENGTHS,
  PreSearchQueryStatusSchema,
  VOTE_TYPES,
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

export const WebSearchParametersSchema = z.object({
  query: z.string().min(1),
  maxResults: z.number().int().positive().min(1).max(20).optional().default(10),
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
  autoParameters: z.object({
    topic: WebSearchTopicSchema.optional(),
    timeRange: WebSearchTimeRangeSchema.optional(),
    searchDepth: WebSearchDepthSchema.optional(),
    reasoning: z.string().optional(),
  }).optional(),
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
// ============================================================================
// MULTI-AI DELIBERATION SCHEMAS - New Framework
// ============================================================================

/**
 * AI Model Scorecard - Measures cognitive strengths
 * Uses z.coerce.number() to automatically convert AI-generated string numbers to actual numbers
 */
export const AIScorecardSchema = z.object({
  logic: z.coerce.number(),
  riskAwareness: z.coerce.number(),
  creativity: z.coerce.number(),
  evidence: z.coerce.number(),
  consensus: z.coerce.number().optional(),
}).openapi('AIScorecard');

/**
 * Contributor Perspective - Single AI participant's viewpoint
 */
export const ContributorPerspectiveSchema = z.object({
  participantIndex: RoundNumberSchema,
  role: z.string(),
  modelId: z.string(),
  modelName: z.string(),
  scorecard: AIScorecardSchema,
  stance: z.string(),
  evidence: z.array(z.string()),
  vote: z.enum(VOTE_TYPES),
}).openapi('ContributorPerspective');

/**
 * Contested claim in consensus analysis
 */
export const ContestedClaimSchema = z.object({
  claim: z.string(),
  status: z.literal('contested'),
}).openapi('ContestedClaim');

/**
 * Agreement heatmap entry - Shows which models agree/disagree on claims
 */
export const AgreementHeatmapEntrySchema = z.object({
  claim: z.string(),
  perspectives: z.record(z.string(), z.enum(AGREEMENT_STATUSES)),
}).openapi('AgreementHeatmapEntry');

/**
 * Argument strength profile - Radar chart data per model
 * Uses z.coerce.number() to automatically convert AI-generated string numbers to actual numbers
 */
export const ArgumentStrengthProfileSchema = z.record(
  z.string(),
  z.object({
    logic: z.coerce.number(),
    evidence: z.coerce.number(),
    riskAwareness: z.coerce.number(),
    consensus: z.coerce.number(),
    creativity: z.coerce.number(),
  }),
).openapi('ArgumentStrengthProfile');

/**
 * Consensus Analysis - Agreement patterns across contributors
 * Uses z.coerce.number() to automatically convert AI-generated string numbers to actual numbers
 */
export const ConsensusAnalysisSchema = z.object({
  alignmentSummary: z.object({
    totalClaims: z.coerce.number(),
    majorAlignment: z.coerce.number(),
    contestedClaims: z.coerce.number(),
    contestedClaimsList: z.array(ContestedClaimSchema),
  }),
  agreementHeatmap: z.array(AgreementHeatmapEntrySchema),
  argumentStrengthProfile: ArgumentStrengthProfileSchema,
}).openapi('ConsensusAnalysis');

/**
 * Reasoning thread - Claim with supporting synthesis
 */
export const ReasoningThreadSchema = z.object({
  claim: z.string(),
  synthesis: z.string(),
}).openapi('ReasoningThread');

/**
 * Evidence coverage for a claim
 * Uses z.coerce.number() to automatically convert AI-generated string numbers to actual numbers
 */
export const EvidenceCoverageSchema = z.object({
  claim: z.string(),
  strength: z.enum(EVIDENCE_STRENGTHS),
  percentage: z.coerce.number(),
}).openapi('EvidenceCoverage');

/**
 * Evidence & Reasoning - Supporting data and logic
 */
export const EvidenceAndReasoningSchema = z.object({
  reasoningThreads: z.array(ReasoningThreadSchema),
  evidenceCoverage: z.array(EvidenceCoverageSchema),
}).openapi('EvidenceAndReasoning');

/**
 * Alternative scenario with confidence
 * Uses z.coerce.number() to automatically convert AI-generated string numbers to actual numbers
 */
export const AlternativeScenarioSchema = z.object({
  scenario: z.string(),
  confidence: z.coerce.number(),
}).openapi('AlternativeScenario');

/**
 * Recommendation item with optional interactive suggestions
 */
export const RecommendationSchema = z.object({
  title: z.string(),
  description: z.string(),
  // Actionable user prompt to continue the conversation
  suggestedPrompt: z.string().optional(),
  // Optional interactive fields for applying suggestions to form
  suggestedModels: z.array(z.string()).optional(),
  suggestedRoles: z.array(z.string()).optional(),
  suggestedMode: z.string().optional(),
}).openapi('Recommendation');

/**
 * Round summary - Progress and key themes
 * Uses z.coerce.number() to automatically convert AI-generated string numbers to actual numbers
 */
export const RoundSummarySchema = z.object({
  participation: z.object({
    approved: z.coerce.number(),
    cautioned: z.coerce.number(),
    rejected: z.coerce.number(),
  }),
  keyThemes: z.string(),
  unresolvedQuestions: z.array(z.string()),
  generated: z.string(),
}).openapi('RoundSummary');

/**
 * Consensus Evolution Phase - Shows consensus percentage at each debate phase
 * Used for timeline visualization showing how consensus evolved through deliberation
 */
export const ConsensusEvolutionPhaseSchema = z.object({
  phase: z.enum(DEBATE_PHASES),
  percentage: z.coerce.number().min(0).max(100),
  label: z.string().optional(), // Optional human-readable label like "Opening", "Final Vote"
}).openapi('ConsensusEvolutionPhase');

/**
 * Consensus Evolution - Timeline of consensus through debate phases
 * Shows how agreement evolved from Opening (low) to Final Vote (high)
 */
export const ConsensusEvolutionSchema = z.array(ConsensusEvolutionPhaseSchema).openapi('ConsensusEvolution');

/**
 * Complete Moderator Analysis Payload - Multi-AI Deliberation Framework
 */
export const ModeratorAnalysisPayloadSchema = z.object({
  roundNumber: RoundNumberSchema,
  mode: z.string(),
  userQuestion: z.string(),

  // Round Confidence Header - Overall confidence metrics
  roundConfidence: z.coerce.number().min(0).max(100).optional(), // Overall confidence % (e.g., 78%)
  confidenceWeighting: ConfidenceWeightingSchema.optional(), // Weighting method (default: balanced)

  // Consensus Evolution - Timeline showing consensus at each debate phase
  consensusEvolution: ConsensusEvolutionSchema.optional(), // Array of phases with percentages

  // Key Insights & Recommendations
  summary: z.string(),
  recommendations: z.array(RecommendationSchema),

  // Contributor Perspectives
  contributorPerspectives: z.array(ContributorPerspectiveSchema),

  // Consensus Analysis
  consensusAnalysis: ConsensusAnalysisSchema,

  // Evidence & Reasoning
  evidenceAndReasoning: EvidenceAndReasoningSchema,

  // Explore Alternatives
  alternatives: z.array(AlternativeScenarioSchema),

  // Round Summary
  roundSummary: RoundSummarySchema,
}).openapi('ModeratorAnalysisPayload');
export const ModeratorAnalysisResponseSchema = createApiResponseSchema(ModeratorAnalysisPayloadSchema).openapi('ModeratorAnalysisResponse');
export const AnalysisAcceptedPayloadSchema = z.object({
  analysisId: z.string(),
  status: z.literal('processing'),
  message: z.string().optional(),
}).openapi('AnalysisAcceptedPayload');
export const AnalysisAcceptedResponseSchema = AnalysisAcceptedPayloadSchema.openapi('AnalysisAcceptedResponse');

// ✅ TYPE-SAFE: Stored moderator analysis with properly typed analysis data
// ✅ FIX: Accept both string and Date for timestamps (API returns strings, transform converts to Date)
// ✅ BREAKING CHANGE: Updated to multi-AI deliberation framework
export const StoredModeratorAnalysisSchema = chatModeratorAnalysisSelectSchema
  .extend({
    analysisData: ModeratorAnalysisPayloadSchema.omit({ roundNumber: true, mode: true, userQuestion: true }).nullable().optional(),
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
export type Recommendation = z.infer<typeof RecommendationSchema>;
export type ContributorPerspective = z.infer<typeof ContributorPerspectiveSchema>;
export type ConsensusAnalysis = z.infer<typeof ConsensusAnalysisSchema>;
export type EvidenceAndReasoning = z.infer<typeof EvidenceAndReasoningSchema>;
export type AlternativeScenario = z.infer<typeof AlternativeScenarioSchema>;
export type ConsensusEvolutionPhase = z.infer<typeof ConsensusEvolutionPhaseSchema>;
export type ConsensusEvolution = z.infer<typeof ConsensusEvolutionSchema>;
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
  totalQueries: z.union([z.number(), z.string()]),
}).openapi('PreSearchStartData');

export type PreSearchStartData = z.infer<typeof PreSearchStartDataSchema>;

export const PreSearchQueryGeneratedDataSchema = z.object({
  type: z.literal('pre_search_query_generated'),
  timestamp: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: z.enum(['basic', 'advanced']),
  index: RoundNumberSchema,
  total: z.union([z.number(), z.string()]),
}).openapi('PreSearchQueryGeneratedData');

export type PreSearchQueryGeneratedData = z.infer<typeof PreSearchQueryGeneratedDataSchema>;

export const PreSearchQueryDataSchema = z.object({
  type: z.literal('pre_search_query'),
  timestamp: z.number(),
  query: z.string(),
  rationale: z.string(),
  searchDepth: z.enum(['basic', 'advanced']),
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
  answer: z.string().nullable().optional(),
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
