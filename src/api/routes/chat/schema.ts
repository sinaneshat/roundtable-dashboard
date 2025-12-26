import { z } from '@hono/zod-openapi';

import type { MessageStatus } from '@/api/core/enums';
import {
  ChangelogChangeTypeSchema,
  ChangelogTypeSchema,
  ChatModeSchema,
  DEFAULT_CHAT_MODE,
  MessageStatusSchema,
  ParticipantStreamStatusSchema,
  PreSearchQueryStatusSchema,
  QueryResultStatusSchema,
  RoundPhaseSchema,
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
import { CoreSchemas, createApiResponseSchema, createCursorPaginatedResponseSchema } from '@/api/core/schemas';
import { StreamStateSchema } from '@/api/types/streaming';
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
  chatParticipantSelectSchema,
  chatPreSearchSelectSchema,
  chatRoundFeedbackSelectSchema,
  chatRoundFeedbackUpdateSchema,
  chatThreadChangelogSelectSchema,
  chatThreadInsertSchema,
  chatThreadSelectSchema,
  chatThreadUpdateSchema,
} from '@/db/validation/chat';
import { ChatParticipantSchema } from '@/lib/schemas/participant-schemas';
import { RoundNumberSchema } from '@/lib/schemas/round-schemas';

export const MessageContentSchema = z.string()
  .trim()
  .normalize()
  .min(STRING_LIMITS.MESSAGE_MIN, 'Message is required')
  .max(STRING_LIMITS.MESSAGE_MAX, `Message is too long (max ${STRING_LIMITS.MESSAGE_MAX} characters)`);

const uniqueModelIdsRefinement = {
  check: (participants: Array<{ modelId: string; isEnabled?: boolean }>) => {
    const enabledParticipants = participants.filter(p => p.isEnabled !== false);
    const modelIds = enabledParticipants.map(p => p.modelId);
    const uniqueModelIds = new Set(modelIds);
    return modelIds.length === uniqueModelIds.size;
  },
  message: 'Duplicate modelIds detected. Each enabled participant must have a unique model.',
};

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

const CreateParticipantSchema = BaseParticipantSchema.omit({
  id: true,
  priority: true,
  isEnabled: true,
});

const UpdateParticipantSchema = BaseParticipantSchema.pick({
  id: true,
  modelId: true,
  role: true,
  customRoleId: true,
  priority: true,
  isEnabled: true,
}).extend({
  id: CoreSchemas.id().optional().or(z.literal('')).openapi({
    description: 'Participant ID (optional - omit or use empty string for new participants)',
    example: 'participant_1',
  }),
});

const StreamParticipantSchema = BaseParticipantSchema.pick({
  id: true,
  modelId: true,
  role: true,
  customRoleId: true,
  priority: true,
  isEnabled: true,
});

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
    metadata: DbMessageMetadataSchema.nullable(),
  })
  .openapi('ChatMessage');

export const ChatThreadSchema = chatThreadSelectSchema
  .extend({
    metadata: DbThreadMetadataSchema.nullable().optional(),
  })
  .openapi('ChatThread');

const ChatThreadChangelogSchema = chatThreadChangelogSelectSchema
  .extend({
    changeData: DbChangelogDataSchema,
  })
  .openapi('ChatThreadChangelog');

export const ChatThreadChangelogFlexibleSchema = chatThreadChangelogSelectSchema
  .extend({
    changeData: DbChangelogDataSchema,
    createdAt: z.union([z.string(), z.date()]),
  })
  .openapi('ChatThreadChangelogFlexible');

export type ChatThreadChangelogFlexible = z.infer<typeof ChatThreadChangelogFlexibleSchema>;

export const ConfigurationChangesGroupSchema = z.object({
  timestamp: z.union([z.date(), z.string()]),
  changes: z.array(ChatThreadChangelogFlexibleSchema),
}).openapi('ConfigurationChangesGroup');

export type ConfigurationChangesGroup = z.infer<typeof ConfigurationChangesGroupSchema>;

export const ConfigurationChangesGroupPropsSchema = z.object({
  group: ConfigurationChangesGroupSchema,
  className: z.string().optional(),
}).openapi('ConfigurationChangesGroupProps');

export type ConfigurationChangesGroupProps = z.infer<typeof ConfigurationChangesGroupPropsSchema>;

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

export type ThreadSlugStatus = z.infer<typeof ThreadSlugStatusPayloadSchema>;

export const DeleteThreadResponseSchema = createApiResponseSchema(z.object({
  deleted: z.boolean().openapi({ example: true }),
})).openapi('DeleteThreadResponse');

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
    description: 'Optional attachment IDs for query generation context',
    example: ['upload_123', 'upload_456'],
  }),
  fileContext: z.string().max(10000).optional().openapi({
    description: 'Optional file text content for query generation context',
    example: 'Contents of the uploaded PDF document...',
  }),
}).openapi('PreSearchRequest');

export type PreSearchRequest = z.infer<typeof PreSearchRequestSchema>;

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
    index: z.number().optional(),
  })),
  summary: z.string(),
  successCount: z.number(),
  failureCount: z.number(),
  totalResults: z.number(),
  totalTime: z.number(),
}).openapi('PreSearchDataPayload');

export type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

export const PartialPreSearchResultItemSchema = z.object({
  title: z.string(),
  url: z.string(),
  content: z.string().optional(),
  excerpt: z.string().optional(),
}).openapi('PartialPreSearchResultItem');

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

export const StoredPreSearchSchema = chatPreSearchSelectSchema
  .extend({
    searchData: PreSearchDataPayloadSchema.nullable().optional(),
    createdAt: z.union([z.string(), z.date()]),
    completedAt: z.union([z.string(), z.date()]).nullable(),
  })
  .openapi('StoredPreSearch');

export type StoredPreSearch = z.infer<typeof StoredPreSearchSchema>;

export const PreSearchResponseSchema = createApiResponseSchema(StoredPreSearchSchema).openapi('PreSearchResponse');

export type PreSearchResponse = z.infer<typeof PreSearchResponseSchema>;

const PreSearchListPayloadSchema = z.object({
  items: z.array(StoredPreSearchSchema),
  count: z.number().int().nonnegative(),
}).openapi('PreSearchListPayload');

export const PreSearchListResponseSchema = createApiResponseSchema(PreSearchListPayloadSchema).openapi('PreSearchListResponse');
export type PreSearchListResponse = z.infer<typeof PreSearchListResponseSchema>;

export const UserPresetModelRoleSchema = z.object({
  modelId: CoreSchemas.id().openapi({
    description: 'Model ID (e.g., anthropic/claude-3.5-sonnet)',
    example: 'anthropic/claude-3.5-sonnet',
  }),
  role: z.string().min(1).max(100).openapi({
    description: 'Role name for this model in the preset',
    example: 'The Ideator',
  }),
}).openapi('UserPresetModelRole');

export type UserPresetModelRole = z.infer<typeof UserPresetModelRoleSchema>;

export const UserPresetSchema = z.object({
  id: CoreSchemas.id().openapi({
    description: 'Preset ID',
    example: 'user-preset-1234567890-abc',
  }),
  name: z.string().min(1).max(100).openapi({
    description: 'Preset name',
    example: 'Product Strategy Team',
  }),
  modelRoles: z.array(UserPresetModelRoleSchema).openapi({
    description: 'Array of model-role pairs in this preset',
  }),
  mode: ChatModeSchema.openapi({
    description: 'Conversation mode for this preset',
    example: 'brainstorming',
  }),
  createdAt: z.number().int().nonnegative().openapi({
    description: 'Unix timestamp when preset was created',
    example: 1735132800000,
  }),
  updatedAt: z.number().int().nonnegative().openapi({
    description: 'Unix timestamp when preset was last updated',
    example: 1735132800000,
  }),
}).openapi('UserPreset');

export type UserPreset = z.infer<typeof UserPresetSchema>;

export const CreateUserPresetRequestSchema = z.object({
  name: z.string().min(1).max(100).openapi({
    description: 'Preset name',
    example: 'Product Strategy Team',
  }),
  modelRoles: z.array(UserPresetModelRoleSchema).min(1).openapi({
    description: 'Array of model-role pairs (at least 1 required)',
  }),
  mode: ChatModeSchema.openapi({
    description: 'Conversation mode for this preset',
    example: 'brainstorming',
  }),
}).openapi('CreateUserPresetRequest');

export type CreateUserPresetRequest = z.infer<typeof CreateUserPresetRequestSchema>;

export const UpdateUserPresetRequestSchema = z.object({
  name: z.string().min(1).max(100).optional().openapi({
    description: 'Preset name',
  }),
  modelRoles: z.array(UserPresetModelRoleSchema).min(1).optional().openapi({
    description: 'Array of model-role pairs',
  }),
  mode: ChatModeSchema.optional().openapi({
    description: 'Conversation mode',
  }),
}).openapi('UpdateUserPresetRequest');

export type UpdateUserPresetRequest = z.infer<typeof UpdateUserPresetRequestSchema>;

const UserPresetDetailPayloadSchema = z.object({
  preset: UserPresetSchema,
}).openapi('UserPresetDetailPayload');

export const UserPresetDetailResponseSchema = createApiResponseSchema(UserPresetDetailPayloadSchema).openapi('UserPresetDetailResponse');
export type UserPresetDetailResponse = z.infer<typeof UserPresetDetailResponseSchema>;

export const UserPresetListResponseSchema = createCursorPaginatedResponseSchema(UserPresetSchema).openapi('UserPresetListResponse');
export type UserPresetListResponse = z.infer<typeof UserPresetListResponseSchema>;

export const StreamChatRequestSchema = z.object({
  message: UIMessageSchema.openapi({
    description: 'Last message in AI SDK UIMessage format',
  }),
  id: z.string().min(1).openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  participantIndex: z.number().int().min(0).optional().default(0).openapi({
    description: 'Participant index (0-based)',
    example: 0,
  }),
  participants: z.array(StreamParticipantSchema)
    .optional()
    .openapi({
      description: 'Participant configuration (optional)',
    }),
  regenerateRound: RoundNumberSchema.optional().openapi({
    description: 'Round to regenerate (0-based)',
    example: 0,
  }),
  mode: ChatModeSchema.optional().openapi({
    description: 'Conversation mode',
    example: 'brainstorming',
  }),
  enableWebSearch: z.boolean().optional().openapi({
    description: 'Enable web search',
    example: true,
  }),
  attachmentIds: z.array(z.string()).optional().openapi({
    description: 'Upload IDs',
    example: ['01HXYZ123ABC', '01HXYZ456DEF'],
  }),
}).openapi('StreamChatRequest');
const MessagesListPayloadSchema = z.object({
  messages: z.array(ChatMessageSchema),
  count: z.number().int().nonnegative(),
}).openapi('MessagesListPayload');
export const MessagesListResponseSchema = createApiResponseSchema(MessagesListPayloadSchema).openapi('MessagesListResponse');
export type MessagesListResponse = z.infer<typeof MessagesListResponseSchema>;

export const CreateCustomRoleRequestSchema = z.object({
  name: z.string().min(1).max(100).openapi({
    description: 'Custom role name',
    example: 'The Innovator',
  }),
  description: z.string().max(500).nullable().optional().openapi({
    description: 'Optional description',
  }),
  systemPrompt: z.string().min(1).max(10000).openapi({
    description: 'System prompt for the role',
  }),
  metadata: DbCustomRoleMetadataSchema.nullable().optional().openapi({
    description: 'Optional metadata',
  }),
}).openapi('CreateCustomRoleRequest');

export const UpdateCustomRoleRequestSchema = z.object({
  name: z.string().min(1).max(100).optional().openapi({
    description: 'Custom role name',
  }),
  description: z.string().max(500).nullable().optional().openapi({
    description: 'Optional description',
  }),
  systemPrompt: z.string().min(1).max(10000).optional().openapi({
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
  roundNumber: RoundNumberSchema,
  changeType: ChangelogTypeSchema,
  changeSummary: z.string().min(1).max(500),
  changeData: DbChangelogDataSchema,
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
export const RoundModeratorRequestSchema = z.object({
  participantMessageIds: z.array(CoreSchemas.id()).optional().openapi({
    description: 'Message IDs from participants (optional)',
    example: ['msg_abc123', 'msg_def456', 'msg_ghi789'],
  }),
}).openapi('RoundModeratorRequest');

export const ModeratorMetricsSchema = z.object({
  engagement: z.coerce.number().min(0).max(100).describe('How engaged the participants were (0-100)'),
  insight: z.coerce.number().min(0).max(100).describe('Quality of insights provided (0-100)'),
  balance: z.coerce.number().min(0).max(100).describe('How balanced the perspectives were (0-100)'),
  clarity: z.coerce.number().min(0).max(100).describe('How clear the communication was (0-100)'),
}).openapi('ModeratorMetrics');

export const ModeratorAIContentSchema = z.object({
  summary: z.string().describe('Comprehensive structured summary in markdown format'),
  metrics: ModeratorMetricsSchema.describe('Ratings for engagement, insight, balance, and clarity (0-100 each)'),
}).openapi('ModeratorAIContent');

export const ModeratorPayloadSchema = ModeratorAIContentSchema;
export type ModeratorPayload = z.infer<typeof ModeratorPayloadSchema>;

export const ModeratorDetailPayloadSchema = z.object({
  roundNumber: RoundNumberSchema,
  mode: z.string(),
  userQuestion: z.string(),
  summary: z.string().describe('Comprehensive structured summary in markdown format'),
  metrics: ModeratorMetricsSchema,
}).openapi('ModeratorDetailPayload');

export const ModeratorResponseSchema = createApiResponseSchema(ModeratorDetailPayloadSchema).openapi('ModeratorResponse');

export function createCacheResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema,
  });
}

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
  createdAt: z.union([z.string(), z.date()]).optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
  lastMessageAt: z.union([z.string(), z.date()]).nullable().optional(),
}).openapi('ChatThreadCache');

export type ChatThreadCache = z.infer<typeof ChatThreadCacheSchema>;

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

export const ChangeDataSchema = z.discriminatedUnion('type', [
  ParticipantChangeDataSchema,
  ParticipantRoleChangeDataSchema,
  ModeChangeDataSchema,
]);

export type ChangeData = z.infer<typeof ChangeDataSchema>;
export type ChatThreadChangelog = z.infer<typeof ChatThreadChangelogSchema>;
export type RoundModeratorRequest = z.infer<typeof RoundModeratorRequestSchema>;
export type ModeratorAIContent = z.infer<typeof ModeratorAIContentSchema>;
export type ModeratorMetrics = z.infer<typeof ModeratorMetricsSchema>;

export type StoredModeratorData = {
  id: string;
  threadId: string;
  roundNumber: number;
  mode: string;
  userQuestion: string;
  status: MessageStatus;
  moderatorData: { text: string; metrics: ModeratorMetrics } | null;
  participantMessageIds: string[];
  errorMessage: string | null;
  createdAt: Date | string;
  completedAt: Date | string | null;
};

export const RoundFeedbackParamSchema = z.object({
  threadId: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  roundNumber: z.string().openapi({
    description: 'Round number (0-based)',
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

export const RoundFeedbackDataSchema = chatRoundFeedbackSelectSchema
  .pick({
    roundNumber: true,
    feedbackType: true,
  })
  .openapi('RoundFeedbackData');

export type RoundFeedbackData = z.infer<typeof RoundFeedbackDataSchema>;

export type StreamState = z.infer<typeof StreamStateSchema>;

export const StreamStatusResponseSchema = createApiResponseSchema(StreamStateSchema).openapi('StreamStatusResponse');

export type StreamStatusResponse = z.infer<typeof StreamStatusResponseSchema>;

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

export const ModeratorPhaseStatusSchema = z.object({
  status: MessageStatusSchema.nullable().openapi({
    description: 'Moderator status (pending/streaming/complete/failed)',
    example: 'streaming',
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active moderator stream ID for resumption',
    example: 'summary:thread_abc123:r0',
  }),
  moderatorMessageId: z.string().nullable().openapi({
    description: 'Database moderator message record ID',
    example: 'summary_abc123',
  }),
}).openapi('ModeratorPhaseStatus');

export type ModeratorPhaseStatus = z.infer<typeof ModeratorPhaseStatusSchema>;

export const ThreadStreamResumptionStateSchema = z.object({
  roundNumber: RoundNumberSchema.nullable().openapi({
    description: 'Current round number being processed (0-based)',
    example: 0,
  }),
  currentPhase: RoundPhaseSchema.openapi({
    description: 'Current phase of the round: idle, pre_search, participants, moderator, or complete',
    example: 'participants',
  }),
  preSearch: PreSearchPhaseStatusSchema.nullable().openapi({
    description: 'Pre-search phase status',
  }),
  participants: ParticipantPhaseStatusSchema.openapi({
    description: 'Participant streaming phase status',
  }),
  moderator: ModeratorPhaseStatusSchema.nullable().openapi({
    description: 'Moderator phase status',
  }),
  roundComplete: z.boolean().openapi({
    description: 'Whether the entire round is complete (all phases finished)',
    example: false,
  }),
  hasActiveStream: z.boolean().openapi({
    description: 'Whether any stream is active',
    example: true,
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active participant stream ID',
    example: 'thread_abc123_r0_p1',
  }),
  totalParticipants: RoundNumberSchema.nullable().openapi({
    description: 'Total participants',
    example: 3,
  }),
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema).nullable().openapi({
    description: 'Participant statuses',
    example: { 0: 'completed', 1: 'active', 2: 'active' },
  }),
  nextParticipantToTrigger: RoundNumberSchema.nullable().openapi({
    description: 'Next participant index',
    example: 2,
  }),
}).openapi('ThreadStreamResumptionState');

export type ThreadStreamResumptionState = z.infer<typeof ThreadStreamResumptionStateSchema>;

export const ThreadStreamResumptionStateResponseSchema = createApiResponseSchema(
  ThreadStreamResumptionStateSchema,
).openapi('ThreadStreamResumptionStateResponse');

export type ThreadStreamResumptionStateResponse = z.infer<typeof ThreadStreamResumptionStateResponseSchema>;

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
 * Import PreSearchStatusSchema and PreSearchQueryStatusSchema from @/api/core/enums
 */

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

// ============================================================================
// PRE-SEARCH SSE EVENT SCHEMAS
// ============================================================================
// Server-Sent Event type definitions for pre-search streaming
// Frontend: Import these types for EventSource handlers
// NOTE: These use 'event' discriminator (SSE event names), distinct from PreSearchStreamEvent in message-metadata (uses 'type')

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
    status: QueryResultStatusSchema.optional(),
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
 * Used in moderator and streaming handlers to validate query results
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
