import { z } from '@hono/zod-openapi';
import {
  ChangelogChangeTypeSchema,
  ChangelogTypeSchema,
  ChatModes,
  ChatModeSchema,
  ConsensusStatusSchema,
  CoreAssumptionFocusTypeSchema,
  DEFAULT_CHAT_MODE,
  LimitationImportanceSchema,
  MessagePartTypeSchema,
  MessageStatusSchema,
  ParticipantStreamStatusSchema,
  PreSearchQueryStatusSchema,
  PreSearchStreamingEventTypeSchema,
  QueryResultStatusSchema,
  RoundExecutionPhaseSchema,
  RoundExecutionStatusSchema,
  RoundPhaseSchema,
  SharedAssumptionTypeSchema,
  UIMessageRoleSchema,
  WebSearchAnswerModeSchema,
  WebSearchComplexitySchema,
  WebSearchContentTypeSchema,
  WebSearchDepthSchema,
  WebSearchRawContentFormatSchema,
  WebSearchTimeRangeSchema,
  WebSearchTopicSchema,
} from '@roundtable/shared/enums';
import type { ExecutionContext } from 'hono';

import { STRING_LIMITS } from '@/constants';
import { CursorPaginationQuerySchema } from '@/core/pagination';
import { CoreSchemas, createApiResponseSchema, createCursorPaginatedResponseSchema } from '@/core/schemas';
import {
  DbChangelogDataSchema,
  DbCustomRoleMetadataSchema,
  DbMessageMetadataSchema,
  DbMessagePartsSchema,
  DbModeratorMessageMetadataSchema,
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
import type { ApiEnv } from '@/types';
import { StreamStateSchema } from '@/types/streaming';

export const MessageContentSchema = z.string()
  .trim()
  .normalize()
  .min(STRING_LIMITS.MESSAGE_MIN, 'Message is required')
  .max(STRING_LIMITS.MESSAGE_MAX, `Message is too long (max ${STRING_LIMITS.MESSAGE_MAX} characters)`);

const uniqueModelIdsRefinement = {
  check: (participants: { modelId: string; isEnabled?: boolean }[]) => {
    const enabledParticipants = participants.filter(p => p.isEnabled !== false);
    const modelIds = enabledParticipants.map(p => p.modelId);
    const uniqueModelIds = new Set(modelIds);
    return modelIds.length === uniqueModelIds.size;
  },
  message: 'Duplicate modelIds detected. Each enabled participant must have a unique model.',
};

const BaseParticipantSchema = z.object({
  customRoleId: CoreSchemas.id().nullable().optional().openapi({
    description: 'Optional custom role ID to load system prompt from',
    example: '01HXYZ123ABC',
  }),
  id: CoreSchemas.id().openapi({
    description: 'Participant ID',
    example: 'participant_1',
  }),
  isEnabled: z.boolean().optional().default(true).openapi({
    description: 'Whether participant is enabled',
  }),
  maxTokens: z.number().int().positive().optional().openapi({
    description: 'Max tokens setting',
  }),
  modelId: CoreSchemas.id().openapi({
    description: 'Model ID (e.g., anthropic/claude-sonnet-4.5, openai/gpt-4o)',
    example: 'anthropic/claude-sonnet-4.5',
  }),
  priority: z.number().int().min(0).openapi({
    description: 'Display order (0-indexed)',
  }),
  role: z.string().nullable().optional().openapi({
    description: 'Optional assigned role for this model',
    example: 'The Ideator',
  }),
  systemPrompt: z.string().optional().openapi({
    description: 'Optional system prompt override (takes precedence over customRoleId)',
  }),
  temperature: z.number().min(0).max(2).optional().openapi({
    description: 'Temperature setting',
  }),
});

const CreateParticipantSchema = BaseParticipantSchema.omit({
  id: true,
  isEnabled: true,
  priority: true,
});

const UpdateParticipantSchema = BaseParticipantSchema.pick({
  customRoleId: true,
  id: true,
  isEnabled: true,
  modelId: true,
  priority: true,
  role: true,
}).extend({
  id: CoreSchemas.id().optional().or(z.literal('')).openapi({
    description: 'Participant ID (optional - omit or use empty string for new participants)',
    example: 'participant_1',
  }),
});

const StreamParticipantSchema = BaseParticipantSchema.pick({
  customRoleId: true,
  id: true,
  isEnabled: true,
  modelId: true,
  priority: true,
  role: true,
});

const ChatMessageSchema = chatMessageSelectSchema
  .extend({
    metadata: DbMessageMetadataSchema.nullable(),
    toolCalls: z.array(z.object({
      function: z.object({
        arguments: z.string(),
        name: z.string(),
      }),
      id: z.string(),
      type: z.string(),
    })).nullable(),
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

export const ChatThreadFlexibleSchema = ChatThreadSchema.extend({
  createdAt: z.union([z.string(), z.date()]),
  lastMessageAt: z.union([z.string(), z.date()]).nullable(),
  updatedAt: z.union([z.string(), z.date()]),
}).openapi('ChatThreadFlexible');

export type ChatThreadFlexible = z.infer<typeof ChatThreadFlexibleSchema>;

export const ChatParticipantFlexibleSchema = ChatParticipantSchema.extend({
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
}).openapi('ChatParticipantFlexible');

export type ChatParticipantFlexible = z.infer<typeof ChatParticipantFlexibleSchema>;

export const ConfigurationChangesGroupSchema = z.object({
  changes: z.array(ChatThreadChangelogFlexibleSchema),
  timestamp: z.union([z.date(), z.string()]),
}).openapi('ConfigurationChangesGroup');

export type ConfigurationChangesGroup = z.infer<typeof ConfigurationChangesGroupSchema>;

export const ConfigurationChangesGroupPropsSchema = z.object({
  className: z.string().optional(),
  group: ConfigurationChangesGroupSchema,
}).openapi('ConfigurationChangesGroupProps');

export type ConfigurationChangesGroupProps = z.infer<typeof ConfigurationChangesGroupPropsSchema>;

const ChatCustomRoleSchema = chatCustomRoleSelectSchema
  .extend({
    metadata: DbCustomRoleMetadataSchema.nullable().optional(),
  })
  .openapi('ChatCustomRole');

export const CreateThreadRequestSchema = chatThreadInsertSchema
  .pick({
    enableWebSearch: true,
    metadata: true,
    mode: true,
    projectId: true,
    title: true,
  })
  .extend({
    attachmentIds: z.array(z.string()).optional().openapi({
      description: 'Upload IDs to attach to the first message',
      example: ['01HXYZ123ABC', '01HXYZ456DEF'],
    }),
    enableWebSearch: z.boolean().optional().default(false).openapi({
      description: 'Allow participants to browse web for information',
      example: false,
    }),
    firstMessage: MessageContentSchema.openapi({
      description: 'Initial user message to start the conversation',
      example: 'What are innovative product ideas for sustainability?',
    }),
    firstMessageId: z.string().optional().openapi({
      description: 'Optional message ID for the first message - if provided, will be used instead of generating a new one. Critical for streaming which expects the message to exist with this exact ID.',
      example: 'msg_abc123',
    }),
    mode: ChatModeSchema.optional().default(DEFAULT_CHAT_MODE).openapi({
      description: 'Conversation mode',
      example: ChatModes.BRAINSTORMING,
    }),
    participants: z.array(CreateParticipantSchema)
      .min(1)
      .refine(uniqueModelIdsRefinement.check, { message: uniqueModelIdsRefinement.message })
      .openapi({
        description: 'Participants array (order determines priority - immutable after creation)',
      }),
    title: z.string().min(STRING_LIMITS.TITLE_MIN).max(STRING_LIMITS.TITLE_MAX).optional().default('New Chat').openapi({
      description: 'Thread title (auto-generated from first message if "New Chat")',
      example: 'Product strategy brainstorm',
    }),
  })
  .openapi('CreateThreadRequest');
export const UpdateThreadRequestSchema = chatThreadUpdateSchema
  .pick({
    enableWebSearch: true,
    isFavorite: true,
    isPublic: true,
    metadata: true,
    mode: true,
    projectId: true,
    status: true,
    title: true,
  })
  .extend({
    newMessage: z.object({
      attachmentIds: z.array(z.string()).optional(),
      content: MessageContentSchema,
      id: z.string().optional().openapi({
        description: 'Optional message ID - if provided, will be used instead of generating a new one. Critical for streaming which expects the message to exist with this exact ID.',
        example: 'msg_abc123',
      }),
      roundNumber: RoundNumberSchema,
    }).optional().openapi({
      description: 'New user message to add to the thread',
    }),
    participants: z.array(UpdateParticipantSchema)
      .optional()
      .openapi({ description: 'Complete list of participants with their updated state' }),
  })
  .refine(
    (data) => {
      if (!data.participants) {
        return true;
      }
      return uniqueModelIdsRefinement.check(data.participants);
    },
    { message: uniqueModelIdsRefinement.message, path: ['participants'] },
  )
  .refine(
    (data) => {
      // Prevent setting isFavorite=true when also setting projectId
      // Project threads cannot be favorited
      if (data.isFavorite === true && data.projectId !== undefined && data.projectId !== null) {
        return false;
      }
      return true;
    },
    { message: 'Project threads cannot be favorited', path: ['isFavorite'] },
  )
  .openapi('UpdateThreadRequest');
export const ThreadListQuerySchema = CursorPaginationQuerySchema.extend({
  projectId: z.string().optional().openapi({
    description: 'Filter threads by project ID (excludes isFavorite from response)',
    example: '01HXYZ123ABC',
  }),
  search: z.string().optional().openapi({
    description: 'Search query to filter threads by title',
    example: 'product strategy',
  }),
}).openapi('ThreadListQuery');
export const ThreadDetailPayloadSchema = z.object({
  changelog: z.array(ChatThreadChangelogSchema),
  feedback: z.array(chatRoundFeedbackSelectSchema).optional().openapi({
    description: 'User feedback for each round (optional - excluded for public threads)',
  }),
  messages: z.array(ChatMessageSchema),
  participants: z.array(ChatParticipantSchema),
  preSearches: z.array(chatPreSearchSelectSchema).optional().openapi({
    description: 'Pre-search results for each round (optional - included for public threads with web search)',
  }),
  thread: ChatThreadSchema,
  user: userSelectSchema.pick({
    id: true,
    image: true,
    name: true,
  }),
}).openapi('ThreadDetailPayload');
export type ThreadDetailPayload = z.infer<typeof ThreadDetailPayloadSchema>;
export const ThreadListResponseSchema = createCursorPaginatedResponseSchema(ChatThreadSchema).openapi('ThreadListResponse');
export type ThreadListResponse = z.infer<typeof ThreadListResponseSchema>;

// Public thread slugs list - for generateStaticParams (ISR/SSG)
export const PublicThreadSlugSchema = z.object({
  slug: z.string().openapi({
    description: 'Thread slug for URL',
    example: 'how-to-build-ai-app-abc123',
  }),
}).openapi('PublicThreadSlug');

export const PublicThreadSlugsPayloadSchema = z.object({
  slugs: z.array(PublicThreadSlugSchema).openapi({
    description: 'List of public thread slugs',
  }),
}).openapi('PublicThreadSlugsPayload');

export const PublicThreadSlugsResponseSchema = createApiResponseSchema(PublicThreadSlugsPayloadSchema).openapi('PublicThreadSlugsResponse');
export type PublicThreadSlugsResponse = z.infer<typeof PublicThreadSlugsResponseSchema>;

export const ThreadDetailResponseSchema = createApiResponseSchema(ThreadDetailPayloadSchema).openapi('ThreadDetailResponse');
export type ThreadDetailResponse = z.infer<typeof ThreadDetailResponseSchema>;

export const UpdateThreadPayloadSchema = z.object({
  message: ChatMessageSchema.optional().openapi({
    description: 'Newly created user message (only present if newMessage was provided in request)',
  }),
  participants: z.array(ChatParticipantSchema),
  thread: ChatThreadSchema,
}).openapi('UpdateThreadPayload');
export type UpdateThreadPayload = z.infer<typeof UpdateThreadPayloadSchema>;

export const UpdateThreadResponseSchema = createApiResponseSchema(UpdateThreadPayloadSchema).openapi('UpdateThreadResponse');
export type UpdateThreadResponse = z.infer<typeof UpdateThreadResponseSchema>;

const ThreadSlugStatusPayloadSchema = z.object({
  isAiGeneratedTitle: z.boolean().openapi({
    description: 'Whether the title was generated by AI (vs default "New Chat")',
    example: true,
  }),
  slug: z.string().openapi({
    description: 'Thread URL slug',
    example: 'product-strategy-brainstorm-abc123',
  }),
  title: z.string().openapi({
    description: 'Thread title',
    example: 'Product Strategy Brainstorm',
  }),
}).openapi('ThreadSlugStatusPayload');

export const ThreadSlugStatusResponseSchema = createApiResponseSchema(ThreadSlugStatusPayloadSchema).openapi('ThreadSlugStatusResponse');

export type ThreadSlugStatus = z.infer<typeof ThreadSlugStatusPayloadSchema>;

export const DeleteThreadResponseSchema = createApiResponseSchema(z.object({
  deleted: z.boolean().openapi({ example: true }),
  projectId: z.string().nullish().openapi({
    description: 'Project ID if thread belonged to a project (for cache invalidation)',
    example: '01HXYZ123ABC',
  }),
})).openapi('DeleteThreadResponse');

export const AddParticipantRequestSchema = z.object({
  modelId: CoreSchemas.id().openapi({
    description: 'Model ID (e.g., anthropic/claude-sonnet-4.5)',
    example: 'anthropic/claude-sonnet-4.5',
  }),
  priority: z.number().int().min(0).optional().openapi({
    description: 'Display priority (0-indexed)',
  }),
  role: z.string().min(1).max(100).nullish().openapi({
    description: 'Optional assigned role',
    example: 'The Ideator',
  }),
  settings: DbParticipantSettingsSchema.nullable().optional().openapi({
    description: 'Optional participant settings',
  }),
}).openapi('AddParticipantRequest');

export const UpdateParticipantRequestSchema = z.object({
  isEnabled: z.boolean().optional().openapi({
    description: 'Whether participant is enabled',
  }),
  priority: z.number().int().min(0).optional().openapi({
    description: 'Display priority',
  }),
  role: z.string().min(1).max(100).nullish().openapi({
    description: 'Optional role name',
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
const UIMessageTextPartSchema = z.object({
  text: z.string(),
  type: MessagePartTypeSchema.extract(['text']),
});

const UIMessageReasoningPartSchema = z.object({
  text: z.string(),
  type: MessagePartTypeSchema.extract(['reasoning']),
});

const UIMessageFilePartSchema = z.object({
  filename: z.string().optional(),
  mediaType: z.string().default('application/octet-stream'),
  type: MessagePartTypeSchema.extract(['file']),
  url: z.string(),
});

const UIMessageSchema = z.object({
  createdAt: z.string().datetime().optional().openapi({
    description: 'Message creation timestamp',
    example: '2025-01-15T10:30:00.000Z',
  }),
  id: z.string().openapi({
    description: 'Unique message identifier',
    example: 'msg_user1',
  }),
  metadata: DbMessageMetadataSchema.optional().openapi({
    description: 'Message metadata (discriminated by role: user | assistant | system)',
  }),
  parts: z.array(z.union([
    UIMessageTextPartSchema,
    UIMessageReasoningPartSchema,
    UIMessageFilePartSchema,
  ])).openapi({
    description: 'Message parts array (text, reasoning, file, etc.)',
    example: [{ text: 'What are the best practices for API design?', type: 'text' }],
  }),
  role: UIMessageRoleSchema.openapi({
    description: 'Message role',
    example: 'user',
  }),
}).openapi('UIMessage');

export const WebSearchParametersSchema = z.object({
  autoParameters: z.boolean().optional().default(false),
  chunksPerSource: z.number().int().min(1).max(3).optional().default(2),
  country: z.string().length(2).optional(),
  days: z.number().int().positive().max(365).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  excludeDomains: z.array(z.string()).optional(),
  includeAnswer: z.union([z.boolean(), WebSearchAnswerModeSchema]).optional().default('advanced'),
  includeDomains: z.array(z.string()).optional(),
  includeFavicon: z.boolean().optional().default(true),
  includeImageDescriptions: z.boolean().optional().default(true),
  includeImages: z.boolean().optional().default(true),
  includeRawContent: z.union([z.boolean(), WebSearchRawContentFormatSchema]).optional().default('markdown'),
  maxResults: z.number().int().positive().min(1).max(3).optional().default(3),
  maxTokens: z.number().int().positive().optional(),
  query: z.string().min(1),
  searchDepth: WebSearchDepthSchema.optional().default('advanced'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeRange: WebSearchTimeRangeSchema.optional(),
  topic: WebSearchTopicSchema.optional(),
}).openapi('WebSearchParameters');

export type WebSearchParameters = z.infer<typeof WebSearchParametersSchema>;

export const WebSearchResultItemSchema = z.object({
  content: z.string(),
  contentType: WebSearchContentTypeSchema.optional(),
  domain: z.string().optional(),
  excerpt: z.string().optional(),
  fullContent: z.string().optional(),
  images: z.array(z.object({
    alt: z.string().optional(),
    description: z.string().optional(),
    url: z.string(),
  })).optional(),
  keyPoints: z.array(z.string()).optional(),
  metadata: z.object({
    author: z.string().optional(),
    description: z.string().optional(),
    faviconUrl: z.string().optional(),
    imageUrl: z.string().optional(),
    readingTime: z.number().optional(),
    wordCount: z.number().optional(),
  }).optional(),
  publishedDate: z.string().nullable().optional(),
  rawContent: z.string().optional(),
  score: z.number().min(0).max(1),
  title: z.string(),
  url: z.string().min(1),
}).openapi('WebSearchResultItem');

export type WebSearchResultItem = z.infer<typeof WebSearchResultItemSchema>;

export const WebSearchResultMetaSchema = z.object({
  cacheAge: z.number().optional(),
  cached: z.boolean().optional(),
  cacheHitRate: z.number().min(0).max(1).optional(),
  complexity: WebSearchComplexitySchema.optional(),
  error: z.boolean().optional(),
  limitReached: z.boolean().optional(),
  maxSearches: z.number().int().positive().optional(),
  message: z.string().optional(),
  remainingSearches: z.number().int().min(0).optional(),
  searchesUsed: z.number().int().min(0).optional(),
}).openapi('WebSearchResultMeta');

export type WebSearchResultMeta = z.infer<typeof WebSearchResultMetaSchema>;

export const WebSearchAutoParametersSchema = z.object({
  reasoning: z.string().optional(),
  searchDepth: WebSearchDepthSchema.optional(),
  timeRange: WebSearchTimeRangeSchema.optional(),
  topic: WebSearchTopicSchema.optional(),
}).openapi('WebSearchAutoParameters');

export type WebSearchAutoParameters = z.infer<typeof WebSearchAutoParametersSchema>;

export const WebSearchResultSchema = z.object({
  _meta: WebSearchResultMetaSchema.optional(),
  answer: z.string().nullable(),
  autoParameters: WebSearchAutoParametersSchema.optional(),
  images: z.array(z.object({
    description: z.string().optional(),
    url: z.string(),
  })).optional(),
  query: z.string(),
  requestId: z.string().optional(),
  responseTime: z.number(),
  results: z.array(WebSearchResultItemSchema),
}).openapi('WebSearchResult');

export type WebSearchResult = z.infer<typeof WebSearchResultSchema>;

export const GeneratedSearchQuerySchema = z.object({
  analysis: z.string().optional(),
  chunksPerSource: z.union([z.number(), z.string()]).optional(),
  complexity: z.string().optional().transform(val => val?.toLowerCase()).pipe(WebSearchComplexitySchema.optional()),
  includeImageDescriptions: z.boolean().optional(),
  includeImages: z.boolean().optional(),
  needsAnswer: z.union([z.boolean(), WebSearchAnswerModeSchema]).optional(),
  query: z.string(),
  rationale: z.string(),
  requiresFullContent: z.boolean().optional(),
  searchDepth: WebSearchDepthSchema,
  sourceCount: z.union([z.number(), z.string()]).optional(),
  timeRange: WebSearchTimeRangeSchema.optional(),
  topic: WebSearchTopicSchema.optional(),
}).openapi('GeneratedSearchQuery');

export type GeneratedSearchQuery = z.infer<typeof GeneratedSearchQuerySchema>;

export const MultiQueryGenerationSchema = z.object({
  analysisRationale: z.string(),
  queries: z.array(GeneratedSearchQuerySchema),
  totalQueries: z.union([z.number(), z.string()]),
}).openapi('MultiQueryGeneration');

export type MultiQueryGeneration = z.infer<typeof MultiQueryGenerationSchema>;

export const SearchContextOptionsSchema = z.object({
  currentRoundNumber: RoundNumberSchema.openapi({
    description: 'Current round number for determining context detail level (0-based: first round is 0)',
  }),
  includeFullResults: z.boolean().optional().default(true).openapi({
    description: 'Whether to include full results for current round',
  }),
}).openapi('SearchContextOptions');

export type SearchContextOptions = z.infer<typeof SearchContextOptionsSchema>;

export const ValidatedPreSearchDataSchema = z.object({
  failureCount: RoundNumberSchema,
  queries: z.array(z.object({
    index: RoundNumberSchema, // ✅ 0-BASED: Query index starts at 0
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
  })),
  results: z.array(z.object({
    answer: z.string().nullable(),
    query: z.string(),
    responseTime: z.number(),
    // ✅ FULL CONTENT SUPPORT: Use complete WebSearchResultItemSchema for all fields
    // This ensures fullContent, metadata, domain, etc. are available for participant exposure
    results: z.array(WebSearchResultItemSchema),
  })),
  successCount: RoundNumberSchema,
  summary: z.string(),
  totalResults: RoundNumberSchema,
  totalTime: z.number(),
}).openapi('ValidatedPreSearchData');

export type ValidatedPreSearchData = z.infer<typeof ValidatedPreSearchDataSchema>;

export const PreSearchRequestSchema = z.object({
  attachmentIds: z.array(z.string()).optional().openapi({
    description: 'Optional attachment IDs for query generation context',
    example: ['upload_123', 'upload_456'],
  }),
  fileContext: z.string().max(10000).optional().openapi({
    description: 'Optional file text content for query generation context',
    example: 'Contents of the uploaded PDF document...',
  }),
  userQuery: z.string().min(1).max(5000).openapi({
    description: 'User query for web search',
    example: 'What is the current Bitcoin price?',
  }),
}).openapi('PreSearchRequest');

export type PreSearchRequest = z.infer<typeof PreSearchRequestSchema>;

export const PreSearchDataPayloadSchema = z.object({
  failureCount: z.number(),
  queries: z.array(z.object({
    index: z.number(),
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    total: z.number(),
  })),
  results: z.array(z.object({
    answer: z.string().nullable(),
    index: z.number().optional(),
    query: z.string(),
    responseTime: z.number(),
    results: z.array(WebSearchResultItemSchema),
  })),
  successCount: z.number(),
  summary: z.string(),
  totalResults: z.number(),
  totalTime: z.number(),
}).openapi('PreSearchDataPayload');

export type PreSearchDataPayload = z.infer<typeof PreSearchDataPayloadSchema>;

export const PartialPreSearchResultItemSchema = z.object({
  content: z.string().optional(),
  excerpt: z.string().optional(),
  title: z.string(),
  url: z.string(),
}).openapi('PartialPreSearchResultItem');

export const PartialPreSearchDataSchema = z.object({
  queries: z.array(z.object({
    index: z.number(),
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    total: z.number(),
  })).optional(),
  results: z.array(z.object({
    answer: z.string().nullable(),
    index: z.number(),
    query: z.string(),
    responseTime: z.number(),
    results: z.array(PartialPreSearchResultItemSchema),
  })).optional(),
  summary: z.string().optional(),
  totalResults: z.number().optional(),
  totalTime: z.number().optional(),
}).openapi('PartialPreSearchData');

export type PartialPreSearchData = z.infer<typeof PartialPreSearchDataSchema>;

export const StoredPreSearchSchema = chatPreSearchSelectSchema
  .extend({
    completedAt: z.union([z.string(), z.date()]).nullable(),
    createdAt: z.union([z.string(), z.date()]),
    searchData: PreSearchDataPayloadSchema.nullable().optional(),
  })
  .openapi('StoredPreSearch');

export type StoredPreSearch = z.infer<typeof StoredPreSearchSchema>;

export const PreSearchResponseSchema = createApiResponseSchema(StoredPreSearchSchema).openapi('PreSearchResponse');

export type PreSearchResponse = z.infer<typeof PreSearchResponseSchema>;

const PreSearchListPayloadSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(StoredPreSearchSchema),
}).openapi('PreSearchListPayload');

export const PreSearchListResponseSchema = createApiResponseSchema(PreSearchListPayloadSchema).openapi('PreSearchListResponse');
export type PreSearchListResponse = z.infer<typeof PreSearchListResponseSchema>;

export const UserPresetModelRoleSchema = z.object({
  modelId: CoreSchemas.id().openapi({
    description: 'Model ID (e.g., anthropic/claude-sonnet-4.5)',
    example: 'anthropic/claude-sonnet-4.5',
  }),
  role: z.string().max(100).nullish().openapi({
    description: 'Optional role name for this model in the preset',
    example: 'The Ideator',
  }),
}).openapi('UserPresetModelRole');

export type UserPresetModelRole = z.infer<typeof UserPresetModelRoleSchema>;

export const UserPresetSchema = z.object({
  createdAt: z.number().int().nonnegative().openapi({
    description: 'Unix timestamp when preset was created',
    example: 1735132800000,
  }),
  id: CoreSchemas.id().openapi({
    description: 'Preset ID',
    example: 'user-preset-1234567890-abc',
  }),
  mode: ChatModeSchema.openapi({
    description: 'Conversation mode for this preset',
    example: ChatModes.BRAINSTORMING,
  }),
  modelRoles: z.array(UserPresetModelRoleSchema).openapi({
    description: 'Array of model-role pairs in this preset',
  }),
  name: z.string().min(1).max(100).openapi({
    description: 'Preset name',
    example: 'Product Strategy Team',
  }),
  updatedAt: z.number().int().nonnegative().openapi({
    description: 'Unix timestamp when preset was last updated',
    example: 1735132800000,
  }),
}).openapi('UserPreset');

export type UserPreset = z.infer<typeof UserPresetSchema>;

export const CreateUserPresetRequestSchema = z.object({
  mode: ChatModeSchema.openapi({
    description: 'Conversation mode for this preset',
    example: ChatModes.BRAINSTORMING,
  }),
  modelRoles: z.array(UserPresetModelRoleSchema).min(1).openapi({
    description: 'Array of model-role pairs (at least 1 required)',
  }),
  name: z.string().min(1).max(100).openapi({
    description: 'Preset name',
    example: 'Product Strategy Team',
  }),
}).openapi('CreateUserPresetRequest');

export type CreateUserPresetRequest = z.infer<typeof CreateUserPresetRequestSchema>;

export const UpdateUserPresetRequestSchema = z.object({
  mode: ChatModeSchema.optional().openapi({
    description: 'Conversation mode',
  }),
  modelRoles: z.array(UserPresetModelRoleSchema).min(1).optional().openapi({
    description: 'Array of model-role pairs',
  }),
  name: z.string().min(1).max(100).optional().openapi({
    description: 'Preset name',
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
  attachmentIds: z.array(z.string()).optional().openapi({
    description: 'Upload IDs',
    example: ['01HXYZ123ABC', '01HXYZ456DEF'],
  }),
  enableWebSearch: z.boolean().optional().openapi({
    description: 'Enable web search',
    example: true,
  }),
  id: z.string().min(1).openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  message: UIMessageSchema.openapi({
    description: 'Last message in AI SDK UIMessage format',
  }),
  mode: ChatModeSchema.optional().openapi({
    description: 'Conversation mode',
    example: ChatModes.BRAINSTORMING,
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
  // ✅ CRITICAL FIX: userMessageId allows frontend to pass the correct message ID
  // AI SDK's sendMessage creates messages with its own generated IDs (nanoid-style)
  // But the user message was already persisted via PATCH/POST with a backend ULID.
  // This field allows the backend to look up the correct pre-persisted message.
  userMessageId: z.string().optional().openapi({
    description: 'Backend-generated user message ID (ULID). If provided, backend uses this instead of message.id for DB lookup. Critical for multi-round chat where messages are pre-persisted via PATCH.',
    example: '01HXYZ123ABC',
  }),
}).openapi('StreamChatRequest');
// Note: Uses 'items' to match Responses.collection() standard format
const MessagesListPayloadSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(ChatMessageSchema),
}).openapi('MessagesListPayload');
export const MessagesListResponseSchema = createApiResponseSchema(MessagesListPayloadSchema).openapi('MessagesListResponse');
export type MessagesListResponse = z.infer<typeof MessagesListResponseSchema>;

export const CreateCustomRoleRequestSchema = z.object({
  description: z.string().max(500).nullable().optional().openapi({
    description: 'Optional description',
  }),
  metadata: DbCustomRoleMetadataSchema.nullable().optional().openapi({
    description: 'Optional metadata',
  }),
  name: z.string().min(1).max(100).openapi({
    description: 'Custom role name',
    example: 'The Innovator',
  }),
  systemPrompt: z.string().min(1).max(10000).openapi({
    description: 'System prompt for the role',
  }),
}).openapi('CreateCustomRoleRequest');

export const UpdateCustomRoleRequestSchema = z.object({
  description: z.string().max(500).nullable().optional().openapi({
    description: 'Optional description',
  }),
  metadata: DbCustomRoleMetadataSchema.nullable().optional().openapi({
    description: 'Optional metadata',
  }),
  name: z.string().min(1).max(100).optional().openapi({
    description: 'Custom role name',
  }),
  systemPrompt: z.string().min(1).max(10000).optional().openapi({
    description: 'System prompt for the role',
  }),
}).openapi('UpdateCustomRoleRequest');
const CustomRoleDetailPayloadSchema = z.object({
  customRole: ChatCustomRoleSchema,
}).openapi('CustomRoleDetailPayload');
export const CustomRoleListResponseSchema = createCursorPaginatedResponseSchema(ChatCustomRoleSchema).openapi('CustomRoleListResponse');
export const CustomRoleDetailResponseSchema = createApiResponseSchema(CustomRoleDetailPayloadSchema).openapi('CustomRoleDetailResponse');
const ChangelogListPayloadSchema = z.object({
  count: z.number().int().nonnegative(),
  items: z.array(ChatThreadChangelogSchema),
}).openapi('ChangelogListPayload');
export const ChangelogListResponseSchema = createApiResponseSchema(ChangelogListPayloadSchema).openapi('ChangelogListResponse');
export type ChangelogListResponse = z.infer<typeof ChangelogListResponseSchema>;
export const CreateChangelogParamsSchema = z.object({
  changeData: DbChangelogDataSchema,
  changeSummary: z.string().min(1).max(500),
  changeType: ChangelogTypeSchema,
  roundNumber: RoundNumberSchema,
  threadId: CoreSchemas.id(),
}).openapi('CreateChangelogParams');
export type CreateChangelogParams = z.infer<typeof CreateChangelogParamsSchema>;
export const ParticipantInfoSchema = chatParticipantSelectSchema
  .pick({
    id: true,
    modelId: true,
    priority: true,
    role: true,
  })
  .extend({
    modelName: z.string().optional().openapi({
      description: 'Human-readable model name (computed from model lookup)',
    }),
  })
  .openapi('ParticipantInfo');
export type ParticipantInfo = z.infer<typeof ParticipantInfoSchema>;
export const RoundtablePromptConfigSchema = z.object({
  allParticipants: z.array(ParticipantInfoSchema),
  currentParticipant: ParticipantInfoSchema,
  currentParticipantIndex: z.number().int().nonnegative(),
  customSystemPrompt: z.string().nullable().optional(),
  mode: ChatModeSchema,
}).openapi('RoundtablePromptConfig');
export type RoundtablePromptConfig = z.infer<typeof RoundtablePromptConfigSchema>;
export const RoundModeratorRequestSchema = z.object({
  participantMessageIds: z.array(CoreSchemas.id()).optional().openapi({
    description: 'Message IDs from participants (optional)',
    example: ['msg_abc123', 'msg_def456', 'msg_ghi789'],
  }),
}).openapi('RoundModeratorRequest');

export const ModeratorMetricsSchema = z.object({
  balance: z.coerce.number().min(0).max(100).describe('How balanced the perspectives were (0-100)'),
  clarity: z.coerce.number().min(0).max(100).describe('How clear the communication was (0-100)'),
  engagement: z.coerce.number().min(0).max(100).describe('How engaged the participants were (0-100)'),
  insight: z.coerce.number().min(0).max(100).describe('Quality of insights provided (0-100)'),
}).openapi('ModeratorMetrics');

export const ModeratorAIContentSchema = z.object({
  metrics: ModeratorMetricsSchema.describe('Ratings for engagement, insight, balance, and clarity (0-100 each)'),
  summary: z.string().describe('Comprehensive structured council moderator content in markdown format'),
}).openapi('ModeratorAIContent');

export type ModeratorPayload = z.infer<typeof ModeratorAIContentSchema>;

export const ModeratorDetailPayloadSchema = z.object({
  metrics: ModeratorMetricsSchema,
  mode: ChatModeSchema,
  roundNumber: RoundNumberSchema,
  summary: z.string().describe('Comprehensive structured council moderator content in markdown format'),
  userQuestion: z.string(),
}).openapi('ModeratorDetailPayload');

export const ModeratorResponseSchema = createApiResponseSchema(ModeratorDetailPayloadSchema).openapi('ModeratorResponse');

export const ParticipantResponseSchema = z.object({
  modelId: z.string().min(1).openapi({
    description: 'Model ID used by this participant',
    example: 'anthropic/claude-sonnet-4.5',
  }),
  modelName: z.string().openapi({
    description: 'Human-readable model name',
    example: 'Claude 3.5 Sonnet',
  }),
  participantIndex: z.number().int().nonnegative().openapi({
    description: 'Participant index (0-based)',
    example: 0,
  }),
  participantRole: z.string().openapi({
    description: 'Role/persona of the participant',
    example: 'The Ideator',
  }),
  responseContent: z.string().openapi({
    description: 'Full response content from this participant',
  }),
}).openapi('ParticipantResponse');

export type ParticipantResponse = z.infer<typeof ParticipantResponseSchema>;

export const ModeratorPromptConfigSchema = z.object({
  mode: ChatModeSchema.openapi({
    description: 'Chat mode determining council moderator style',
    example: ChatModes.DEBATING,
  }),
  participantResponses: z.array(ParticipantResponseSchema).min(1).openapi({
    description: 'Array of participant responses to moderate',
  }),
  roundNumber: RoundNumberSchema.openapi({
    description: 'Round number being moderated (0-based)',
    example: 0,
  }),
  userQuestion: z.string().min(1).openapi({
    description: 'Original user question for this round',
  }),
}).openapi('ModeratorPromptConfig');

export type ModeratorPromptConfig = z.infer<typeof ModeratorPromptConfigSchema>;

export const ModeratorProjectContextSchema = z.object({
  instructions: z.string().nullable().optional().openapi({
    description: 'Project instructions to incorporate in moderator synthesis',
  }),
  ragContext: z.string().optional().openapi({
    description: 'RAG context retrieved from project documents',
  }),
}).openapi('ModeratorProjectContext');

export type ModeratorProjectContext = z.infer<typeof ModeratorProjectContextSchema>;

export const ModeratorGenerationConfigSchema = ModeratorPromptConfigSchema.extend({
  env: z.custom<ApiEnv['Bindings']>().openapi({
    description: 'Cloudflare Workers environment bindings',
  }),
  executionCtx: z.custom<ExecutionContext>().optional().openapi({
    description: 'Cloudflare Workers execution context for waitUntil',
  }),
  messageId: z.string().openapi({
    description: 'Unique message ID for the moderator response',
  }),
  projectContext: ModeratorProjectContextSchema.optional().openapi({
    description: 'Project context for moderator synthesis',
  }),
  projectId: z.string().nullable().optional().openapi({
    description: 'Project ID if thread is linked to a project',
  }),
  sessionId: z.string().optional().openapi({
    description: 'Session ID for authentication',
  }),
  threadId: z.string().openapi({
    description: 'Thread ID being moderated',
  }),
  userId: z.string().openapi({
    description: 'User ID who owns the thread',
  }),
}).openapi('ModeratorGenerationConfig');

export type ModeratorGenerationConfig = z.infer<typeof ModeratorGenerationConfigSchema>;

export const CouncilModeratorSectionsSchema = z.object({
  areasOfAgreement: z.object({
    description: z.literal('Substantive alignment summary'),
    excludes: z.literal('trivial agreement'),
    includes: z.array(SharedAssumptionTypeSchema),
    required: z.literal(false),
  }).optional(),
  consensusStatus: z.object({
    allowedValues: z.array(ConsensusStatusSchema),
    description: z.literal('State consensus status once only'),
    required: z.literal(false),
  }).optional(),
  coreAssumptionsAndTensions: z.object({
    description: z.literal('Foundational assumptions and conflicts'),
    includes: z.array(CoreAssumptionFocusTypeSchema),
    required: z.literal(false),
  }).optional(),

  integratedAnalysis: z.object({
    constraints: z.object({
      mustNotIntroduce: z.literal('new ideas'),
      reflectDependencies: z.literal('when models extend or rebut each other'),
    }),
    description: z.literal('Brief synthesis clarifying overall debate structure'),
    required: z.literal(false),
  }).optional(),
  keyExchanges: z.object({
    constraints: z.object({
      includeOnly: z.literal('decision-relevant exchanges'),
      maxBullets: z.literal(3),
      maxWordsPerBullet: z.literal(18),
      noArrowNotation: z.literal(true),
      useNaturalProse: z.literal(true),
    }),
    description: z.literal('Substantive model-to-model challenges or extensions'),
    required: z.literal(false),
  }).optional(),
  keyUncertainties: z.object({
    constraints: z.object({
      omitIf: z.literal('none exist'),
    }),
    description: z.literal('Unresolved factors that would materially change conclusions'),
    required: z.literal(false),
  }).optional(),
  limitationsAndBlindSpots: z.object({
    description: z.literal('Perspectives or considerations not meaningfully explored'),
    importanceRanking: z.array(LimitationImportanceSchema),
    required: z.literal(false),
  }).optional(),
  participants: z.object({
    constraints: z.object({
      includePerspectives: z.literal('only if they affect interpretation'),
    }),
    description: z.literal('Number of LLMs and distinct perspectives'),
    required: z.literal(true),
  }),
  // Optional sections
  primaryPerspectives: z.object({
    description: z.literal('Main conceptual approaches that emerged'),
    perPerspective: z.object({
      coreClaim: z.literal('required'),
      primaryEmphasis: z.literal('required'),
      whatItDeprioritizes: z.literal('required'),
    }),
    required: z.literal(false),
  }).optional(),
  questionOverview: z.object({
    constraints: z.object({
      includeFraming: z.literal('only if it materially shaped the discussion'),
    }),
    description: z.literal('Succinct restatement of the question'),
    required: z.literal(true),
  }),
  // Required sections
  summaryConclusion: z.object({
    constraints: z.object({
      maxSentencesIfShared: z.literal(1),
      multipleSentencesOnlyIf: z.literal('conclusions are irreconcilable'),
      style: z.literal('no hedging, one sentence per conclusion'),
    }),
    description: z.literal('Minimum one-sentence conclusions representing the discussion'),
    required: z.literal(true),
  }),
  tradeOffsAndImplications: z.object({
    constraints: z.object({
      doNotResolve: z.literal('unless explicitly resolved by council'),
    }),
    description: z.literal('Unavoidable trade-offs revealed by discussion'),
    required: z.literal(false),
  }).optional(),
}).openapi('CouncilModeratorSections');

export type CouncilModeratorSections = z.infer<typeof CouncilModeratorSectionsSchema>;

export const ChatThreadCacheSchema = z.object({
  createdAt: z.union([z.string(), z.date()]).optional(),
  enableWebSearch: z.boolean().optional(),
  id: z.string(),
  isAiGeneratedTitle: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  lastMessageAt: z.union([z.string(), z.date()]).nullable().optional(),
  metadata: DbThreadMetadataSchema.nullable().optional(),
  mode: ChatModeSchema.optional(),
  previousSlug: z.string().nullable().optional(),
  slug: z.string().optional(),
  status: z.string().optional(),
  title: z.string().optional(),
  updatedAt: z.union([z.string(), z.date()]).optional(),
}).openapi('ChatThreadCache');

export type ChatThreadCache = z.infer<typeof ChatThreadCacheSchema>;

export const ChatSidebarItemSchema = z.object({
  createdAt: z.date(),
  id: z.string(),
  isActive: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  messages: z.array(z.never()),
  previousSlug: z.string().nullable().optional(),
  slug: z.string(),
  title: z.string(),
  updatedAt: z.date(),
}).openapi('ChatSidebarItem');

export type ChatSidebarItem = z.infer<typeof ChatSidebarItemSchema>;

export const ChatSidebarGroupSchema = z.object({
  chats: z.array(ChatSidebarItemSchema),
  label: z.string(),
}).openapi('ChatSidebarGroup');

export type ChatSidebarGroup = z.infer<typeof ChatSidebarGroupSchema>;

export const ThreadSidebarItemSchema = z.object({
  createdAt: z.coerce.date(),
  id: z.string(),
  isFavorite: z.boolean(),
  isPublic: z.boolean(),
  previousSlug: z.string().nullable(),
  slug: z.string(),
  title: z.string(),
  updatedAt: z.coerce.date(),
}).openapi('ThreadSidebarItem');

export type ThreadSidebarItem = z.infer<typeof ThreadSidebarItemSchema>;

export const ThreadSidebarListResponseSchema = createCursorPaginatedResponseSchema(ThreadSidebarItemSchema).openapi('ThreadSidebarListResponse');
export type ThreadSidebarListResponse = z.infer<typeof ThreadSidebarListResponseSchema>;

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
  modelId: z.string(),
  participantId: z.string().optional(),
  role: z.string().nullable().optional(),
  type: z.literal('participant'),
});
export type ParticipantChangeData = z.infer<typeof ParticipantChangeDataSchema>;

export const ParticipantRoleChangeDataSchema = BaseChangeDataSchema.extend({
  modelId: z.string(),
  newRole: z.string().nullable().optional(),
  oldRole: z.string().nullable().optional(),
  participantId: z.string().optional(),
  type: z.literal('participant_role'),
});
export type ParticipantRoleChangeData = z.infer<typeof ParticipantRoleChangeDataSchema>;

export const ModeChangeDataSchema = BaseChangeDataSchema.extend({
  newMode: z.string(),
  oldMode: z.string(),
  type: z.literal('mode_change'),
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

export const StoredModeratorDataSchema = z.object({
  completedAt: z.union([z.string(), z.date()]).nullable().openapi({
    description: 'Completion timestamp',
  }),
  createdAt: z.union([z.string(), z.date()]).openapi({
    description: 'Creation timestamp',
  }),
  errorMessage: z.string().nullable().openapi({
    description: 'Error message if moderator generation failed',
  }),
  id: CoreSchemas.id().openapi({
    description: 'Council moderator ID',
    example: '01HXYZ123ABC',
  }),
  mode: z.string().openapi({
    description: 'Chat mode',
    example: 'brainstorm',
  }),
  moderatorData: z.object({
    metrics: ModeratorMetricsSchema,
    text: z.string().describe('Council moderator text in markdown'),
  }).nullable().openapi({
    description: 'Council moderator AI-generated content and metrics',
  }),
  participantMessageIds: z.array(CoreSchemas.id()).openapi({
    description: 'Array of participant message IDs in this round',
  }),
  roundNumber: z.number().int().min(0).openapi({
    description: 'Round number (0-indexed)',
    example: 0,
  }),
  status: MessageStatusSchema,
  threadId: CoreSchemas.id().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
  }),
  userQuestion: z.string().openapi({
    description: 'User question for this round',
  }),
}).openapi('StoredModeratorData');

export type StoredModeratorData = z.infer<typeof StoredModeratorDataSchema>;

export const RoundFeedbackParamSchema = z.object({
  roundNumber: z.string().openapi({
    description: 'Round number (0-based)',
    example: '0',
  }),
  threadId: z.string().openapi({
    description: 'Thread ID',
    example: 'thread_abc123',
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
    createdAt: true,
    feedbackType: true,
    id: true,
    roundNumber: true,
    threadId: true,
    updatedAt: true,
    userId: true,
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
    feedbackType: true,
    roundNumber: true,
  })
  .openapi('RoundFeedbackData');

export type RoundFeedbackData = z.infer<typeof RoundFeedbackDataSchema>;

export const StreamStatusResponseSchema = createApiResponseSchema(StreamStateSchema).openapi('StreamStatusResponse');

export type StreamStatusResponse = z.infer<typeof StreamStatusResponseSchema>;

export const PreSearchPhaseStatusSchema = z.object({
  enabled: z.boolean().openapi({
    description: 'Whether web search is enabled for this thread',
    example: true,
  }),
  preSearchId: z.string().nullable().openapi({
    description: 'Database pre-search record ID',
    example: 'ps_abc123',
  }),
  status: MessageStatusSchema.nullable().openapi({
    description: 'Pre-search status (pending/streaming/complete/failed)',
    example: 'complete',
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active pre-search stream ID for resumption',
    example: 'presearch_thread_abc123_0_1234567890',
  }),
}).openapi('PreSearchPhaseStatus');

export type PreSearchPhaseStatus = z.infer<typeof PreSearchPhaseStatusSchema>;

export const ParticipantPhaseStatusSchema = z.object({
  allComplete: z.boolean().openapi({
    description: 'Whether all participants have finished (completed or failed)',
    example: false,
  }),
  currentParticipantIndex: RoundNumberSchema.nullable().openapi({
    description: 'Index of currently streaming participant',
    example: 1,
  }),
  hasActiveStream: z.boolean().openapi({
    description: 'Whether there is an active participant stream in KV',
    example: true,
  }),
  nextParticipantToTrigger: RoundNumberSchema.nullable().openapi({
    description: 'Index of next participant that needs to be triggered',
    example: 2,
  }),
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema).nullable().openapi({
    description: 'Status of each participant (keyed by index)',
    example: { 0: 'completed', 1: 'active', 2: 'active' },
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active participant stream ID (format: {threadId}_r{roundNumber}_p{participantIndex})',
    example: 'thread_abc123_r0_p1',
  }),
  totalParticipants: RoundNumberSchema.nullable().openapi({
    description: 'Total number of participants in the round',
    example: 3,
  }),
}).openapi('ParticipantPhaseStatus');

export type ParticipantPhaseStatus = z.infer<typeof ParticipantPhaseStatusSchema>;

export const ModeratorPhaseStatusSchema = z.object({
  moderatorMessageId: z.string().nullable().openapi({
    description: 'Database moderator message record ID',
    example: 'summary_abc123',
  }),
  status: MessageStatusSchema.nullable().openapi({
    description: 'Moderator status (pending/streaming/complete/failed)',
    example: 'streaming',
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active moderator stream ID for resumption',
    example: 'summary:thread_abc123:r0',
  }),
}).openapi('ModeratorPhaseStatus');

export type ModeratorPhaseStatus = z.infer<typeof ModeratorPhaseStatusSchema>;

export const ThreadStreamResumptionStateSchema = z.object({
  currentPhase: RoundPhaseSchema.openapi({
    description: 'Current phase of the round: idle, pre_search, participants, moderator, or complete',
    example: 'participants',
  }),
  hasActiveStream: z.boolean().openapi({
    description: 'Whether any stream is active',
    example: true,
  }),
  moderator: ModeratorPhaseStatusSchema.nullable().openapi({
    description: 'Moderator phase status',
  }),
  nextParticipantToTrigger: RoundNumberSchema.nullable().openapi({
    description: 'Next participant index',
    example: 2,
  }),
  participants: ParticipantPhaseStatusSchema.openapi({
    description: 'Participant streaming phase status',
  }),
  participantStatuses: z.record(z.string(), ParticipantStreamStatusSchema).nullable().openapi({
    description: 'Participant statuses',
    example: { 0: 'completed', 1: 'active', 2: 'active' },
  }),
  preSearch: PreSearchPhaseStatusSchema.nullable().openapi({
    description: 'Pre-search phase status',
  }),
  roundComplete: z.boolean().openapi({
    description: 'Whether the entire round is complete (all phases finished)',
    example: false,
  }),
  roundNumber: RoundNumberSchema.nullable().openapi({
    description: 'Current round number being processed (0-based)',
    example: 0,
  }),
  streamId: z.string().nullable().openapi({
    description: 'Active participant stream ID',
    example: 'thread_abc123_r0_p1',
  }),
  totalParticipants: RoundNumberSchema.nullable().openapi({
    description: 'Total participants',
    example: 3,
  }),
}).openapi('ThreadStreamResumptionState');

export type ThreadStreamResumptionState = z.infer<typeof ThreadStreamResumptionStateSchema>;

export const ThreadStreamResumptionStateResponseSchema = createApiResponseSchema(
  ThreadStreamResumptionStateSchema,
).openapi('ThreadStreamResumptionStateResponse');

export type ThreadStreamResumptionStateResponse = z.infer<typeof ThreadStreamResumptionStateResponseSchema>;

// ============================================================================
// ROUND STATUS SCHEMA (Queue Worker Internal API)
// ============================================================================

/**
 * Round status for queue worker orchestration
 * Used by GET /chat/threads/:threadId/rounds/:roundNumber/status
 */
export const RoundStatusSchema = z.object({
  attachmentIds: z.array(z.string()).optional().openapi({
    description: 'Attachment IDs for round',
    example: ['attachment_123'],
  }),
  canRecover: z.boolean().openapi({
    description: 'Whether recovery is allowed (not exceeded max attempts)',
    example: true,
  }),
  completedParticipants: z.number().int().nonnegative().openapi({
    description: 'Number of completed participants',
    example: 1,
  }),
  failedParticipants: z.number().int().nonnegative().openapi({
    description: 'Number of failed participants',
    example: 0,
  }),
  maxRecoveryAttempts: z.number().int().positive().openapi({
    description: 'Maximum allowed recovery attempts',
    example: 3,
  }),
  needsModerator: z.boolean().openapi({
    description: 'Whether moderator needs to be triggered',
    example: false,
  }),
  needsPreSearch: z.boolean().openapi({
    description: 'Whether pre-search needs to be triggered',
    example: false,
  }),
  nextParticipantIndex: z.number().int().nonnegative().nullable().openapi({
    description: 'Next participant index to trigger (null if all complete)',
    example: 1,
  }),
  phase: RoundExecutionPhaseSchema.openapi({
    description: 'Current execution phase',
    example: 'participants',
  }),
  recoveryAttempts: z.number().int().nonnegative().openapi({
    description: 'Number of recovery attempts made',
    example: 0,
  }),
  status: RoundExecutionStatusSchema.openapi({
    description: 'Round execution status',
    example: 'running',
  }),
  totalParticipants: z.number().int().nonnegative().openapi({
    description: 'Total participants in round',
    example: 3,
  }),
  userQuery: z.string().optional().openapi({
    description: 'User query for pre-search (if needed)',
    example: 'What are the best practices for React?',
  }),
}).openapi('RoundStatus');

export type RoundStatus = z.infer<typeof RoundStatusSchema>;

export const RoundStatusResponseSchema = createApiResponseSchema(
  RoundStatusSchema,
).openapi('RoundStatusResponse');

export type RoundStatusResponse = z.infer<typeof RoundStatusResponseSchema>;

export const PreSearchStartDataSchema = z.object({
  timestamp: z.number(),
  totalQueries: z.union([z.number(), z.string()]),
  type: PreSearchStreamingEventTypeSchema.extract(['pre_search_start']),
  userQuery: z.string(),
}).openapi('PreSearchStartData');

export type PreSearchStartData = z.infer<typeof PreSearchStartDataSchema>;

export const PreSearchQueryGeneratedDataSchema = z.object({
  index: RoundNumberSchema,
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  timestamp: z.number(),
  total: z.union([z.number(), z.string()]),
  type: PreSearchStreamingEventTypeSchema.extract(['pre_search_query_generated']),
}).openapi('PreSearchQueryGeneratedData');

export type PreSearchQueryGeneratedData = z.infer<typeof PreSearchQueryGeneratedDataSchema>;

export const PreSearchQueryDataSchema = z.object({
  index: RoundNumberSchema,
  query: z.string(),
  rationale: z.string(),
  searchDepth: WebSearchDepthSchema,
  timestamp: z.number(),
  total: z.union([z.number(), z.string()]),
  type: PreSearchStreamingEventTypeSchema.extract(['pre_search_query']),
}).openapi('PreSearchQueryData');

export type PreSearchQueryData = z.infer<typeof PreSearchQueryDataSchema>;

export const PreSearchResultDataSchema = z.object({
  answer: z.string().nullable(),
  index: RoundNumberSchema,
  query: z.string(),
  responseTime: z.number(),
  resultCount: RoundNumberSchema,
  timestamp: z.number(),
  type: PreSearchStreamingEventTypeSchema.extract(['pre_search_result']),
}).openapi('PreSearchResultData');

export type PreSearchResultData = z.infer<typeof PreSearchResultDataSchema>;

export const PreSearchCompleteDataSchema = z.object({
  failedSearches: RoundNumberSchema,
  successfulSearches: RoundNumberSchema,
  timestamp: z.number(),
  totalResults: RoundNumberSchema,
  totalSearches: RoundNumberSchema,
  type: PreSearchStreamingEventTypeSchema.extract(['pre_search_complete']),
}).openapi('PreSearchCompleteData');

export type PreSearchCompleteData = z.infer<typeof PreSearchCompleteDataSchema>;

export const PreSearchErrorDataSchema = z.object({
  error: z.string(),
  timestamp: z.number(),
  type: PreSearchStreamingEventTypeSchema.extract(['pre_search_error']),
}).openapi('PreSearchErrorData');

export type PreSearchErrorData = z.infer<typeof PreSearchErrorDataSchema>;

export const PreSearchStreamDataSchema = z.discriminatedUnion('type', [
  PreSearchStartDataSchema,
  PreSearchQueryGeneratedDataSchema,
  PreSearchQueryDataSchema,
  PreSearchResultDataSchema,
  PreSearchCompleteDataSchema,
  PreSearchErrorDataSchema,
]);

export type PreSearchStreamData = z.infer<typeof PreSearchStreamDataSchema>;

export const PreSearchQuerySchema = z.object({
  index: RoundNumberSchema,
  query: z.string(),
  rationale: z.string(),
  result: WebSearchResultSchema.optional(),
  searchDepth: WebSearchDepthSchema,
  status: PreSearchQueryStatusSchema,
  timestamp: z.number(),
  total: z.number().int().min(1),
}).openapi('PreSearchQuery');

export type PreSearchQuery = z.infer<typeof PreSearchQuerySchema>;

const BaseSSEEventDataSchema = z.object({
  timestamp: z.number(),
});

export const PreSearchStartEventSchema = z.object({
  data: BaseSSEEventDataSchema.extend({
    totalQueries: z.number(),
    userQuery: z.string(),
  }),
  event: z.literal('start'),
}).openapi('PreSearchStartEvent');

export type PreSearchStartEvent = z.infer<typeof PreSearchStartEventSchema>;

export const PreSearchQueryEventSchema = z.object({
  data: BaseSSEEventDataSchema.extend({
    fallback: z.boolean().optional(),
    index: z.number(),
    query: z.string(),
    rationale: z.string(),
    searchDepth: WebSearchDepthSchema,
    total: z.number(),
  }),
  event: z.literal('query'),
}).openapi('PreSearchQueryEvent');

export type PreSearchQueryEvent = z.infer<typeof PreSearchQueryEventSchema>;

export const PreSearchResultEventSchema = z.object({
  data: BaseSSEEventDataSchema.extend({
    answer: z.string().nullable(),
    error: z.string().optional(),
    index: z.number(),
    query: z.string(),
    responseTime: z.number(),
    resultCount: z.number(),
    results: z.array(z.object({
      content: z.string(),
      domain: z.string().optional(),
      excerpt: z.string().optional(),
      fullContent: z.string().optional(),
      publishedDate: z.string().nullable(),
      score: z.number(),
      title: z.string(),
      url: z.string(),
    })),
    status: QueryResultStatusSchema.optional(),
  }),
  event: z.literal('result'),
}).openapi('PreSearchResultEvent');

export type PreSearchResultEvent = z.infer<typeof PreSearchResultEventSchema>;

export const PreSearchAnswerChunkEventSchema = z.object({
  data: z.object({
    chunk: z.string(),
  }),
  event: z.literal('answer_chunk'),
}).openapi('PreSearchAnswerChunkEvent');

export type PreSearchAnswerChunkEvent = z.infer<typeof PreSearchAnswerChunkEventSchema>;

export const PreSearchAnswerCompleteEventSchema = z.object({
  data: z.object({
    answer: z.string(),
    generatedAt: z.string(),
    mode: WebSearchDepthSchema,
  }),
  event: z.literal('answer_complete'),
}).openapi('PreSearchAnswerCompleteEvent');

export type PreSearchAnswerCompleteEvent = z.infer<typeof PreSearchAnswerCompleteEventSchema>;

export const PreSearchAnswerErrorEventSchema = z.object({
  data: z.object({
    error: z.string(),
    message: z.string(),
  }),
  event: z.literal('answer_error'),
}).openapi('PreSearchAnswerErrorEvent');

export type PreSearchAnswerErrorEvent = z.infer<typeof PreSearchAnswerErrorEventSchema>;

export const PreSearchCompleteEventSchema = z.object({
  data: BaseSSEEventDataSchema.extend({
    failedSearches: z.number(),
    successfulSearches: z.number(),
    totalResults: z.number(),
    totalSearches: z.number(),
  }),
  event: z.literal('complete'),
}).openapi('PreSearchCompleteEvent');

export type PreSearchCompleteEvent = z.infer<typeof PreSearchCompleteEventSchema>;

export const PreSearchDoneEventSchema = z.object({
  data: z.object({
    analysis: z.string(),
    failureCount: z.number(),
    queries: z.array(z.object({
      index: z.number(),
      query: z.string(),
      rationale: z.string(),
      searchDepth: WebSearchDepthSchema,
      total: z.number(),
    })),
    results: z.array(z.object({
      answer: z.string().nullable(),
      query: z.string(),
      responseTime: z.number(),
      results: z.array(z.object({
        content: z.string(),
        domain: z.string().optional(),
        excerpt: z.string().optional(),
        fullContent: z.string().optional(),
        publishedDate: z.string().nullable(),
        score: z.number(),
        title: z.string(),
        url: z.string(),
      })),
    })),
    successCount: z.number(),
    totalResults: z.number(),
    totalTime: z.number(),
  }),
  event: z.literal('done'),
}).openapi('PreSearchDoneEvent');

export type PreSearchDoneEvent = z.infer<typeof PreSearchDoneEventSchema>;

export const PreSearchFailedEventSchema = z.object({
  data: z.object({
    error: z.string(),
    errorCategory: z.string().optional(),
    isTransient: z.boolean().optional(),
  }),
  event: z.literal('failed'),
}).openapi('PreSearchFailedEvent');

export type PreSearchFailedEvent = z.infer<typeof PreSearchFailedEventSchema>;

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

export function isAnswerChunkEvent(event: PreSearchSSEEvent): event is PreSearchAnswerChunkEvent {
  return event.event === 'answer_chunk';
}

export function isAnswerCompleteEvent(event: PreSearchSSEEvent): event is PreSearchAnswerCompleteEvent {
  return event.event === 'answer_complete';
}

export function isAnswerErrorEvent(event: PreSearchSSEEvent): event is PreSearchAnswerErrorEvent {
  return event.event === 'answer_error';
}

export function parsePreSearchEvent<T extends PreSearchSSEEvent>(
  messageEvent: MessageEvent,
  expectedType: T['event'],
): T['data'] | null {
  try {
    const parsed: unknown = JSON.parse(messageEvent.data);
    const result = PreSearchSSEEventSchema.safeParse({ data: parsed, event: expectedType });
    if (!result.success) {
      console.error(`Failed to validate ${expectedType} event data:`, result.error.message);
      return null;
    }
    return result.data.data as T['data'];
  } catch {
    console.error(`Failed to parse ${expectedType} event data`);
    return null;
  }
}

export const MessageWithParticipantSchema = chatMessageSelectSchema
  .extend({
    participant: ChatParticipantSchema.nullable(),
  })
  .openapi('MessageWithParticipant');

export type MessageWithParticipant = z.infer<typeof MessageWithParticipantSchema>;

export const WebSearchDisplayPropsSchema = z.object({
  answer: z.string().nullable().optional(),
  className: z.string().optional(),
  complexity: WebSearchComplexitySchema.optional(),
  meta: WebSearchResultMetaSchema.optional(),
  results: z.array(WebSearchResultItemSchema),
}).openapi('WebSearchDisplayProps');

export type WebSearchDisplayProps = z.infer<typeof WebSearchDisplayPropsSchema>;

export const WebSearchDisplayExtendedPropsSchema = WebSearchDisplayPropsSchema.extend({
  autoParameters: WebSearchAutoParametersSchema.optional(),
  isStreaming: z.boolean().optional(),
  query: z.string().optional(),
  requestId: z.string().optional(),
}).openapi('WebSearchDisplayExtendedProps');

export type WebSearchDisplayExtendedProps = z.infer<typeof WebSearchDisplayExtendedPropsSchema>;

export const WebSearchImageItemSchema = z.object({
  alt: z.string().optional(),
  domain: z.string().optional(),
  sourceUrl: z.string(),
  title: z.string(),
  url: z.string(),
}).openapi('WebSearchImageItem');

export type WebSearchImageItem = z.infer<typeof WebSearchImageItemSchema>;

export const WebSearchImageGalleryPropsSchema = z.object({
  className: z.string().optional(),
  results: z.array(WebSearchResultItemSchema),
}).openapi('WebSearchImageGalleryProps');

export type WebSearchImageGalleryProps = z.infer<typeof WebSearchImageGalleryPropsSchema>;

export const WebSearchResultItemPropsSchema = z.object({
  className: z.string().optional(),
  result: WebSearchResultItemSchema,
  showDivider: z.boolean().optional().default(true),
}).openapi('WebSearchResultItemProps');

export type WebSearchResultItemProps = z.infer<typeof WebSearchResultItemPropsSchema>;

// ============================================================================
// AUTO MODE PROMPT ANALYSIS
// ============================================================================

export const AnalyzePromptRequestSchema = z.object({
  hasDocumentFiles: z.boolean().optional().default(false).openapi({
    description: 'Whether document files (PDFs, DOC, etc.) are attached - restricts to models with supports_file',
    example: false,
  }),
  // ✅ GRANULAR: Separate image and document flags for proper capability filtering
  hasImageFiles: z.boolean().optional().default(false).openapi({
    description: 'Whether image files are attached - restricts to models with supports_vision',
    example: false,
  }),
  prompt: z.string().min(1).max(STRING_LIMITS.MESSAGE_MAX).openapi({
    description: 'User prompt to analyze for optimal configuration',
    example: 'What are the best practices for building a SaaS product?',
  }),
}).openapi('AnalyzePromptRequest');

export type AnalyzePromptRequest = z.infer<typeof AnalyzePromptRequestSchema>;

export const RecommendedParticipantSchema = z.object({
  modelId: z.string().openapi({
    description: 'Model ID from accessible models list',
    example: 'google/gemini-2.5-flash',
  }),
  role: z.string().nullable().openapi({
    description: 'Short role name (Ideator, Strategist, Analyst, Builder, Critic) or null',
    example: 'Analyst',
  }),
}).openapi('RecommendedParticipant');

export type RecommendedParticipant = z.infer<typeof RecommendedParticipantSchema>;

export const AnalyzePromptPayloadSchema = z.object({
  enableWebSearch: z.boolean().openapi({
    description: 'Whether web search should be enabled',
    example: false,
  }),
  mode: ChatModeSchema.openapi({
    description: 'Recommended chat mode',
    example: 'brainstorming',
  }),
  // Max value (12) matches MAX_PARTICIPANTS_LIMIT from product-logic.service.ts (pro tier's maxModels)
  participants: z.array(RecommendedParticipantSchema).min(1).max(12).openapi({
    description: 'Recommended model-role pairs for the prompt',
  }),
}).openapi('AnalyzePromptPayload');

export type AnalyzePromptPayload = z.infer<typeof AnalyzePromptPayloadSchema>;

export const AnalyzePromptResponseSchema = createApiResponseSchema(AnalyzePromptPayloadSchema).openapi('AnalyzePromptResponse');

export type AnalyzePromptResponse = z.infer<typeof AnalyzePromptResponseSchema>;

// ============================================================================
// SHARED RESPONSE SCHEMAS
// ============================================================================

export const DeletedResponseSchema = z.object({
  deleted: z.boolean().openapi({ example: true }),
}).openapi('DeletedResponse');

export type DeletedResponse = z.infer<typeof DeletedResponseSchema>;

export const ExistingModeratorMessageSchema = z.object({
  id: z.string(),
  metadata: DbModeratorMessageMetadataSchema,
  parts: DbMessagePartsSchema,
  role: z.string(),
  roundNumber: z.number(),
}).openapi('ExistingModeratorMessage');

export type ExistingModeratorMessage = z.infer<typeof ExistingModeratorMessageSchema>;

// ============================================================================
// MESSAGE ATTACHMENT SCHEMAS
// ============================================================================

export const MessageAttachmentSchema = z.object({
  displayOrder: z.number().int().nonnegative().openapi({
    description: 'Display order for attachment within the message',
  }),
  filename: z.string().openapi({
    description: 'Original filename of the uploaded file',
  }),
  fileSize: z.number().int().nonnegative().openapi({
    description: 'File size in bytes',
  }),
  messageId: z.string().openapi({
    description: 'ID of the message this attachment belongs to',
  }),
  mimeType: z.string().openapi({
    description: 'MIME type of the file',
  }),
  uploadId: z.string().openapi({
    description: 'ID of the underlying upload',
  }),
}).openapi('MessageAttachment');

export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

// ============================================================================
// STREAMING ANALYSIS SCHEMAS
// ============================================================================

export const PartialAnalysisConfigSchema = z.object({
  enableWebSearch: z.boolean().optional().openapi({
    description: 'Partial web search flag from streaming AI SDK response',
  }),
  mode: z.string().optional().openapi({
    description: 'Partial mode from streaming AI SDK response',
  }),
  participants: z.array(z.object({
    modelId: z.string().optional(),
    role: z.string().nullable().optional(),
  }).optional()).optional().openapi({
    description: 'Partial participant config from streaming AI SDK response',
  }),
}).openapi('PartialAnalysisConfig');

export type PartialAnalysisConfig = z.infer<typeof PartialAnalysisConfigSchema>;

// ============================================================================
// MEMORY EVENTS SCHEMAS
// ============================================================================

export const MemoryEventQuerySchema = z.object({
  roundNumber: z.coerce.number().int().min(1).openapi({
    description: 'Round number to check for memory events',
    example: 1,
  }),
}).openapi('MemoryEventQuery');

export const MemoryEventItemSchema = z.object({
  content: z.string().openapi({
    description: 'Memory content (truncated to 200 chars)',
  }),
  id: z.string().openapi({
    description: 'Memory ID',
  }),
  summary: z.string().openapi({
    description: 'Brief summary of the memory',
  }),
}).openapi('MemoryEventItem');

export const MemoryEventResponseSchema = z.object({
  createdAt: z.number().openapi({
    description: 'Unix timestamp when memories were created',
  }),
  memories: z.array(MemoryEventItemSchema).openapi({
    description: 'Created memories with summary and content',
  }),
  memoryIds: z.array(z.string()).openapi({
    description: 'IDs of created memories',
  }),
  projectId: z.string().openapi({
    description: 'Project ID the memories belong to',
  }),
}).nullable().openapi('MemoryEventResponse');

export type MemoryEventQuery = z.infer<typeof MemoryEventQuerySchema>;
export type MemoryEventItem = z.infer<typeof MemoryEventItemSchema>;
export type MemoryEventResponse = z.infer<typeof MemoryEventResponseSchema>;
