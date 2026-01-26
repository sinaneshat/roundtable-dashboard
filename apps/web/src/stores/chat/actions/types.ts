/**
 * Shared Types for Chat Store Actions
 */

import { UsageStatusSchema } from '@roundtable/shared';
import { z } from 'zod';

/** Generic API response wrapper - data field validated by specific schemas */
export const ApiResponseSchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  success: z.boolean(),
}).strict();

export type ApiResponse = z.infer<typeof ApiResponseSchema>;

const UsageCreditsSchema = z.object({
  available: z.number().nonnegative(),
  balance: z.number().nonnegative(),
  status: UsageStatusSchema.optional(),
}).strict();

const UsagePlanSchema = z.object({
  freeRoundUsed: z.boolean().optional(),
  hasActiveSubscription: z.boolean().optional(),
  monthlyCredits: z.number().int().nonnegative(),
  name: z.string().min(1),
  nextRefillAt: z.string().datetime().nullable(),
  pendingChange: z.object({
    effectiveDate: z.string().min(1),
    pendingTier: z.string().min(1),
  }).strict().nullable().optional(),
  type: z.string().min(1),
}).strict();

export const UsageStatsDataSchema = z.object({
  credits: UsageCreditsSchema,
  plan: UsagePlanSchema,
}).strict();

export type UsageStatsData = z.infer<typeof UsageStatsDataSchema>;

export function validateUsageStatsCache(data: unknown): UsageStatsData | null {
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    return null;
  }

  const usageData = UsageStatsDataSchema.safeParse(response.data.data);
  if (!usageData.success) {
    return null;
  }

  return usageData.data;
}

const UserCacheSchema = z.object({
  id: z.string().min(1).optional(),
  image: z.string().url().nullable().optional(),
  name: z.string().nullable().optional(),
}).strict();

/** Thread metadata schema - allows extensible key-value pairs */
const ThreadMetadataSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])).nullable().optional();

export const ChatThreadCacheSchema = z.object({
  createdAt: z.union([z.date(), z.string()]),
  enableWebSearch: z.boolean().optional(),
  id: z.string().min(1),
  isAiGeneratedTitle: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  lastMessageAt: z.union([z.date(), z.string()]).nullable().optional(),
  metadata: ThreadMetadataSchema,
  mode: z.string().min(1).optional(),
  previousSlug: z.string().min(1).nullable().optional(),
  projectId: z.string().min(1).nullable().optional(),
  slug: z.string().min(1),
  status: z.string().min(1).optional(),
  title: z.string(),
  updatedAt: z.union([z.date(), z.string()]),
  userId: z.string().min(1).optional(),
  version: z.number().int().nonnegative().optional(),
}).strict();

/** Participant settings schema - allows extensible configuration */
const ParticipantSettingsSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])).nullable().optional();

const ChatParticipantCacheCompatSchema = z.object({
  createdAt: z.union([z.date(), z.string()]),
  customRoleId: z.string().min(1).nullable().optional(),
  id: z.string().min(1),
  isEnabled: z.boolean().optional(),
  modelId: z.string().min(1),
  priority: z.number().int().nonnegative().optional(),
  role: z.string().min(1).nullable().optional(),
  settings: ParticipantSettingsSchema,
  threadId: z.string().min(1),
  updatedAt: z.union([z.date(), z.string()]),
}).strict();

/** Message part schema - supports text, file, reasoning parts */
const MessagePartCacheSchema = z.object({
  state: z.string().optional(),
  text: z.string().optional(),
  type: z.string().min(1),
}).catchall(z.unknown());

/** Message metadata schema - allows extensible metadata */
const MessageMetadataCacheSchema = z.record(z.string(), z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
])).optional();

const UIMessageCacheCompatSchema = z.object({
  content: z.string().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
  id: z.string().min(1),
  metadata: MessageMetadataCacheSchema,
  parts: z.array(MessagePartCacheSchema).optional(),
  role: z.string().min(1),
}).strict();

/** Changelog entry schema for cache validation */
const ChangelogEntryCacheSchema = z.object({
  changeData: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
  ])),
  changeSummary: z.string(),
  changeType: z.string().min(1),
  createdAt: z.union([z.date(), z.string()]),
  id: z.string().min(1),
  roundNumber: z.number().int().nonnegative().optional(),
  threadId: z.string().min(1),
  updatedAt: z.union([z.date(), z.string()]).optional(),
}).strict();

export const ThreadDetailPayloadCacheSchema = z.object({
  changelog: z.array(ChangelogEntryCacheSchema).optional(),
  messages: z.array(UIMessageCacheCompatSchema).optional(),
  participants: z.array(ChatParticipantCacheCompatSchema).optional(),
  thread: ChatThreadCacheSchema,
  user: UserCacheSchema.optional(),
}).strict();

export type ThreadDetailPayloadCache = z.infer<typeof ThreadDetailPayloadCacheSchema>;

export function validateThreadDetailPayloadCache(data: unknown): ThreadDetailPayloadCache | null {
  if (data === undefined || data === null) {
    return null;
  }

  const response = ApiResponseSchema.safeParse(data);
  if (!response.success || !response.data.success) {
    return null;
  }

  const threadData = ThreadDetailPayloadCacheSchema.safeParse(response.data.data);
  if (!threadData.success) {
    return null;
  }

  return threadData.data;
}

export const PaginatedPageCacheSchema = z.object({
  data: z
    .object({
      items: z.array(ChatThreadCacheSchema).optional(),
      pagination: z.object({
        nextCursor: z.string().nullable().optional(),
      }).strict().optional(),
    })
    .strict()
    .optional(),
  success: z.boolean(),
}).strict();

export type PaginatedPageCache = z.infer<typeof PaginatedPageCacheSchema>;

export const InfiniteQueryCacheSchema = z.object({
  pageParams: z.array(z.string().nullable().optional()).optional(),
  pages: z.array(PaginatedPageCacheSchema).min(1),
}).strict();

export type InfiniteQueryCache = z.infer<typeof InfiniteQueryCacheSchema>;

export function validateInfiniteQueryCache(data: unknown): InfiniteQueryCache | null {
  if (data === undefined || data === null) {
    return null;
  }

  const queryData = InfiniteQueryCacheSchema.safeParse(data);
  if (!queryData.success) {
    return null;
  }

  return queryData.data;
}

export const ThreadDetailCacheDataSchema = z.object({
  participants: z.array(ChatParticipantCacheCompatSchema).min(1),
}).strict();

export type ThreadDetailCacheData = z.infer<typeof ThreadDetailCacheDataSchema>;

export function validateThreadDetailCache(data: unknown): ThreadDetailCacheData | undefined {
  const result = ThreadDetailCacheDataSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

export const ThreadDetailResponseCacheSchema = z.object({
  data: ThreadDetailPayloadCacheSchema,
  success: z.boolean(),
}).strict();

export type ThreadDetailResponseCache = z.infer<typeof ThreadDetailResponseCacheSchema>;

export function validateThreadDetailResponseCache(data: unknown): ThreadDetailResponseCache | undefined {
  const result = ThreadDetailResponseCacheSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

export const ThreadsListCachePageSchema = z.object({
  data: z.object({
    items: z.array(ChatThreadCacheSchema),
  }).strict().optional(),
  success: z.boolean(),
}).strict();

export type ThreadsListCachePage = z.infer<typeof ThreadsListCachePageSchema>;

export function validateThreadsListPages(data: unknown): ThreadsListCachePage[] | undefined {
  if (!Array.isArray(data)) {
    return undefined;
  }

  const validated = data.map(page => ThreadsListCachePageSchema.safeParse(page));

  if (validated.some(result => !result.success)) {
    return undefined;
  }

  return validated
    .filter((result): result is z.ZodSafeParseSuccess<ThreadsListCachePage> => result.success)
    .map(result => result.data);
}

const ChangelogItemCacheSchema = z.object({
  changeData: z.record(z.string(), z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(z.unknown()),
    z.record(z.string(), z.unknown()),
  ])),
  changeSummary: z.string(),
  changeType: z.string().min(1),
  createdAt: z.union([z.date(), z.string()]),
  id: z.string().min(1),
  roundNumber: z.number().int().nonnegative().optional(),
  threadId: z.string().min(1),
  updatedAt: z.union([z.date(), z.string()]).optional(),
}).strict();

export const ChangelogListCacheSchema = z.object({
  data: z.object({
    items: z.array(ChangelogItemCacheSchema),
  }).strict().optional(),
  success: z.boolean(),
}).strict();

export type ChangelogListCache = z.infer<typeof ChangelogListCacheSchema>;

export type ChangelogItemCache = z.infer<typeof ChangelogItemCacheSchema>;

export function validateChangelogListCache(data: unknown): ChangelogListCache | null {
  if (data === undefined || data === null) {
    return null;
  }

  const result = ChangelogListCacheSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  return result.data;
}

// ============================================================================
// Thread Slug Status Cache Validation
// ============================================================================

export const ThreadSlugStatusPayloadSchema = z.object({
  isAiGeneratedTitle: z.boolean(),
  slug: z.string().min(1),
  title: z.string(),
}).strict();

export type ThreadSlugStatusPayload = z.infer<typeof ThreadSlugStatusPayloadSchema>;

export const ThreadSlugStatusResponseSchema = z.object({
  data: ThreadSlugStatusPayloadSchema,
  success: z.literal(true),
}).strict();

export type ThreadSlugStatusResponse = z.infer<typeof ThreadSlugStatusResponseSchema>;

/**
 * Validate and extract slug status data from query response
 * @returns Validated payload data or null if validation fails
 */
export function validateSlugStatusResponse(data: unknown): ThreadSlugStatusPayload | null {
  if (data === undefined || data === null) {
    return null;
  }

  const result = ThreadSlugStatusResponseSchema.safeParse(data);
  if (!result.success) {
    return null;
  }

  return result.data.data;
}
